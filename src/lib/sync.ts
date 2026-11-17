// Background sync. Cheap on every launch: one /me/playlists walk, then only
// re-pull playlists whose snapshot_id changed.

import { all, api, ApiError, rateLimited } from './api'
import * as N from './normalize'
import {
  isOwned,
  putItems,
  putPlaylist,
  putTracks,
  setLastSync,
  setMe,
  setPlaylists,
  setSync,
  useLibrary,
} from './library'
import type { ItemList, Me, Playlist, Track } from './types'
import { warmCovers } from './images'

let running: Promise<void> | null = null

export function syncNow(): Promise<void> {
  running ??= doSync().finally(() => (running = null))
  return running
}

async function doSync() {
  const first = useLibrary.getState().lastSync === 0
  setSync({ running: true, firstRun: first, playlistsDone: 0, playlistsTotal: 0, tracks: 0, error: undefined })
  try {
    const meRaw = await api('/me')
    const me: Me = {
      id: meRaw.id,
      name: meRaw.display_name ?? meRaw.id,
      image: N.images(meRaw.images).md,
      uri: meRaw.uri,
    }
    setMe(me)

    const raw = await all<any>('/me/playlists', 50)
    const prev = useLibrary.getState().playlists
    const list: Playlist[] = raw.filter(Boolean).map((p) => {
      const n = N.playlist(p)
      const old = prev[n.id]
      if (!old) return n
      const same = old.syncedSnapshot === n.snapshot
      return { ...n, total: same ? old.total : n.total, syncedSnapshot: old.syncedSnapshot, itemsUnavailable: old.itemsUnavailable }
    })
    setPlaylists(list)

    const stale = list.filter((p) => p.snapshot !== p.syncedSnapshot)
    // owned first, they're the ones that matter and the ones that'll work
    stale.sort((a, b) => Number(isOwned(b, me)) - Number(isOwned(a, me)))
    setSync({ playlistsTotal: stale.length + 1 })

    const buffer = new TrackBuffer()
    let done = 0
    await Promise.all([
      syncLiked(buffer).then(() => setSync({ playlistsDone: ++done })),
      ...stale.map((p) =>
        syncPlaylist(p, buffer).then(() => setSync({ playlistsDone: ++done })),
      ),
    ])
    buffer.flush()
    setLastSync(Date.now())
    warmCovers()
  } catch (e) {
    console.error('sync failed', e)
    setSync({ error: e instanceof Error ? e.message : String(e) })
  } finally {
    setSync({ running: false })
  }
}

/** Batches track writes so a big first sync doesn't copy the Map thousands of times */
class TrackBuffer {
  private pending: Track[] = []
  private timer: number | undefined
  count = 0
  add(ts: Track[]) {
    this.pending.push(...ts)
    this.count += ts.length
    setSync({ tracks: this.count })
    this.timer ??= window.setTimeout(() => this.flush(), 250)
  }
  flush() {
    clearTimeout(this.timer)
    this.timer = undefined
    putTracks(this.pending)
    this.pending = []
  }
}

async function fetchItems(id: string) {
  try {
    return await all<any>(`/playlists/${id}/items`, 100)
  } catch (e) {
    // apps grandfathered before the Feb 2026 rename might only have /tracks
    if (e instanceof ApiError && e.status === 404) return await all<any>(`/playlists/${id}/tracks`, 100)
    throw e
  }
}

async function syncPlaylist(p: Playlist, buffer: TrackBuffer) {
  try {
    const rows = await fetchItems(p.id)
    const ids: string[] = []
    const added: string[] = []
    const ts: Track[] = []
    for (const r of rows) {
      const t = N.track(r.item ?? r.track)
      if (!t) continue
      ts.push(t)
      ids.push(t.id)
      added.push(r.added_at ?? '')
    }
    buffer.add(ts)
    putItems({ id: p.id, ids, added })
    putPlaylist({ ...p, total: ids.length || p.total, syncedSnapshot: p.snapshot, itemsUnavailable: false })
  } catch (e) {
    if (e instanceof ApiError && (e.status === 403 || e.status === 404)) {
      putPlaylist({ ...p, syncedSnapshot: p.snapshot, itemsUnavailable: true })
    } else {
      console.warn('playlist sync failed', p.name, e)
    }
  }
}

async function syncLiked(buffer: TrackBuffer) {
  const prev = useLibrary.getState().items.liked
  const first = await api<any>('/me/tracks', { query: { limit: 50 } })
  const total: number = first.total

  // incremental: liked songs are newest first, so find where our copy starts
  if (prev && prev.ids.length) {
    const fresh: any[] = [...first.items]
    let next: string | null = first.next
    const anchor = prev.ids[0]
    let idx = fresh.findIndex((r) => r.track?.id === anchor)
    while (idx === -1 && next && fresh.length < total - prev.ids.length + 50) {
      const page = await api<any>(next)
      fresh.push(...page.items)
      next = page.next
      idx = fresh.findIndex((r) => r.track?.id === anchor)
    }
    if (idx !== -1 && idx + prev.ids.length === total) {
      if (idx === 0) return
      const head = fresh.slice(0, idx)
      const ts = head.map((r) => N.track(r.track)).filter(Boolean) as Track[]
      buffer.add(ts)
      putItems({
        id: 'liked',
        ids: [...ts.map((t) => t.id), ...prev.ids],
        added: [...head.map((r) => r.added_at), ...prev.added],
      })
      return
    }
  }

  const rows = await all<any>('/me/tracks', 50)
  const ts = rows.map((r) => N.track(r.track)).filter(Boolean) as Track[]
  buffer.add(ts)
  const list: ItemList = { id: 'liked', ids: ts.map((t) => t.id), added: rows.filter((r) => r.track?.id).map((r) => r.added_at) }
  putItems(list)
}

// ---- keep fresh while open ----

let lastFocusSync = 0
export function startBackgroundSync() {
  syncNow()
  setInterval(() => document.visibilityState === 'visible' && !rateLimited() && syncNow(), 5 * 60_000)
  window.addEventListener('focus', () => {
    if (Date.now() - lastFocusSync > 60_000 && !rateLimited()) {
      lastFocusSync = Date.now()
      syncNow()
    }
  })
}
