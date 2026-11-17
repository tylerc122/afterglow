// Library edits. Memory first so the UI flips instantly, then the API, roll back on failure.

import { api } from './api'
import * as N from './normalize'
import { putAlbum, putArtist, putItems, putPlaylist, putTracks, useLibrary } from './library'
import { go } from './router'
import { toast } from './toast'
import type { Album, Artist, Track } from './types'

export async function setLiked(track: Pick<Track, 'id' | 'uri'> & Partial<Track>, liked: boolean) {
  const s = useLibrary.getState()
  const prev = s.items.liked ?? { id: 'liked', ids: [], added: [] }
  if (liked) {
    if (track.name) putTracks([track as Track])
    putItems({ id: 'liked', ids: [track.id, ...prev.ids], added: [new Date().toISOString(), ...prev.added] })
  } else {
    const i = prev.ids.indexOf(track.id)
    if (i === -1) return
    putItems({ id: 'liked', ids: prev.ids.filter((_, j) => j !== i), added: prev.added.filter((_, j) => j !== i) })
  }
  try {
    await api('/me/library', { method: liked ? 'PUT' : 'DELETE', query: { uris: track.uri } })
  } catch {
    putItems(prev)
    toast('Couldn’t update Liked songs')
  }
}

export async function addToPlaylist(playlistId: string, tracks: Track[]) {
  const s = useLibrary.getState()
  const p = s.playlists[playlistId]
  const prev = s.items[playlistId] ?? { id: playlistId, ids: [], added: [] }
  const now = new Date().toISOString()
  const what = tracks.length > 1 ? `${tracks.length.toLocaleString()} songs` : `“${tracks[0]?.name}”`
  const where = p?.name ?? 'playlist'
  const key = `add-${playlistId}-${Date.now()}`
  // say something right away, a big batch can take a few seconds to land
  if (tracks.length > 100) toast(`Adding ${what} to ${where}…`, { key, images: p?.images, ms: 30_000 })
  putTracks(tracks)
  putItems({ id: playlistId, ids: [...prev.ids, ...tracks.map((t) => t.id)], added: [...prev.added, ...tracks.map(() => now)] })
  if (p) putPlaylist({ ...p, total: p.total + tracks.length })
  try {
    // spotify takes 100 uris per request, so a big select-all goes in batches
    let r: { snapshot_id: string } | undefined
    for (let i = 0; i < tracks.length; i += 100) {
      r = await api<{ snapshot_id: string }>(`/playlists/${playlistId}/items`, {
        method: 'POST',
        body: { uris: tracks.slice(i, i + 100).map((t) => t.uri) },
      })
    }
    if (p && r?.snapshot_id) putPlaylist({ ...useLibrary.getState().playlists[playlistId], snapshot: r.snapshot_id, syncedSnapshot: r.snapshot_id })
    toast(`Added ${what} to ${where}`, {
      key,
      images: p?.images,
      ms: 4500,
      action: { label: 'View', run: () => go(`/playlist/${playlistId}`) },
    })
  } catch {
    putItems(prev)
    if (p) putPlaylist(p)
    toast(`Couldn’t add ${what} to ${where}`, { key, ms: 4500 })
  }
}

/**
 * Remove a bunch of songs at once. Spotify deletes by uri, which takes out every copy
 * of that song in the playlist, so we do the same locally to match. The toast's undo
 * puts them back where they were (as new adds, so their added dates reset).
 */
export async function removeManyFromPlaylist(playlistId: string, tracks: Track[]) {
  const s = useLibrary.getState()
  const p = s.playlists[playlistId]
  const prev = s.items[playlistId]
  if (!prev || !p || !tracks.length) return
  const gone = new Set(tracks.map((t) => t.id))
  const uris = [...new Set(tracks.map((t) => t.uri))]
  const keep = prev.ids.map((id, i) => i).filter((i) => !gone.has(prev.ids[i]))
  const removed = prev.ids.length - keep.length
  putItems({ id: playlistId, ids: keep.map((i) => prev.ids[i]), added: keep.map((i) => prev.added[i]) })
  putPlaylist({ ...p, total: Math.max(0, p.total - removed) })
  const what = removed > 1 ? `${removed.toLocaleString()} songs` : `“${tracks[0].name}”`
  try {
    // no snapshot_id: with one, Spotify checks the request against that exact version
    // and errors if ours is even slightly stale. By uri it doesn't need it.
    let snapshot = p.snapshot
    for (let i = 0; i < uris.length; i += 100) {
      const r = await api<{ snapshot_id: string }>(`/playlists/${playlistId}/items`, {
        method: 'DELETE',
        body: { items: uris.slice(i, i + 100).map((uri) => ({ uri })) },
      })
      if (r?.snapshot_id) snapshot = r.snapshot_id
    }
    putPlaylist({ ...useLibrary.getState().playlists[playlistId], snapshot, syncedSnapshot: snapshot })
    toast(`Removed ${what} from ${p.name}`, {
      images: p.images,
      ms: 6000,
      action: { label: 'Undo', run: () => restore(playlistId, prev.ids, gone) },
    })
  } catch (e) {
    console.error('remove failed', e)
    putItems(prev)
    putPlaylist(p)
    toast(`Couldn’t remove ${what}${e instanceof Error && e.message ? ` (${e.message})` : ''}`, { ms: 6000 })
  }
}

/** put removed songs back at their old spots, one insert per run of neighbours */
async function restore(playlistId: string, oldIds: string[], gone: Set<string>) {
  const s = useLibrary.getState()
  const p = s.playlists[playlistId]
  const cur = s.items[playlistId]
  if (!p || !cur) return
  const runs: { at: number; ids: string[] }[] = []
  oldIds.forEach((id, i) => {
    if (!gone.has(id)) return
    const last = runs[runs.length - 1]
    if (last && last.at + last.ids.length === i) last.ids.push(id)
    else runs.push({ at: i, ids: [id] })
  })
  // going front to back, each run's old index is right once the earlier runs are back in
  const ids = [...cur.ids]
  const added = [...cur.added]
  const now = new Date().toISOString()
  for (const r of runs) {
    ids.splice(r.at, 0, ...r.ids)
    added.splice(r.at, 0, ...r.ids.map(() => now))
  }
  const count = runs.reduce((n, r) => n + r.ids.length, 0)
  putItems({ id: playlistId, ids, added })
  putPlaylist({ ...p, total: p.total + count })
  try {
    let snapshot = p.snapshot
    for (const r of runs) {
      for (let i = 0; i < r.ids.length; i += 100) {
        const uris = r.ids.slice(i, i + 100).map((id) => s.tracks.get(id)?.uri ?? `spotify:track:${id}`)
        const res = await api<{ snapshot_id: string }>(`/playlists/${playlistId}/items`, {
          method: 'POST',
          body: { uris, position: r.at + i },
        })
        if (res?.snapshot_id) snapshot = res.snapshot_id
      }
    }
    putPlaylist({ ...useLibrary.getState().playlists[playlistId], snapshot, syncedSnapshot: snapshot })
    toast(`Put ${count > 1 ? `${count.toLocaleString()} songs` : 'it'} back`)
  } catch {
    putItems(cur)
    putPlaylist(p)
    toast('Couldn’t undo that, the songs are still removed')
  }
}

// ---- albums / artists, fetched on visit then cached forever ----

const loading = new Map<string, Promise<unknown>>()
function once<T>(key: string, fn: () => Promise<T>): Promise<T> {
  let p = loading.get(key) as Promise<T> | undefined
  if (!p) {
    p = fn().finally(() => loading.delete(key))
    loading.set(key, p)
  }
  return p
}

export function loadAlbum(id: string): Promise<Album> {
  return once(`album:${id}`, async () => {
    const raw = await api<any>(`/albums/${id}`)
    const a = N.album(raw)
    const rows: any[] = [...(raw.tracks?.items ?? [])]
    let nextUrl: string | null = raw.tracks?.next ?? null
    while (nextUrl) {
      const page = await api<any>(nextUrl)
      rows.push(...page.items)
      nextUrl = page.next
    }
    const ts = rows.map((t) => N.track(t, { id: a.id, name: a.name, images: a.images })).filter(Boolean) as Track[]
    putTracks(ts)
    const full = { ...a, trackIds: ts.map((t) => t.id) }
    putAlbum(full)
    return full
  })
}

const artistsFetched = new Set<string>()
/** true once we've refreshed this artist during this session */
export const artistFresh = (id: string) => artistsFetched.has(id)

// dev mode caps this endpoint at 10 per page now, so walk a few pages
async function artistAlbums(id: string) {
  const out: any[] = []
  let next: string | null = null
  let first = true
  while ((first || next) && out.length < 60) {
    const page: any = first
      ? await api<any>(`/artists/${id}/albums`, { query: { include_groups: 'album,single', limit: 10 } })
      : await api<any>(next!)
    first = false
    out.push(...(page?.items ?? []))
    next = page?.next ?? null
  }
  return out
}

export function loadArtist(id: string): Promise<Artist> {
  return once(`artist:${id}`, async () => {
    artistsFetched.add(id)
    const [raw, albums] = await Promise.all([api<any>(`/artists/${id}`), artistAlbums(id).catch(() => [])])
    const a: Artist = {
      ...N.artist(raw),
      albums: albums.map((x: any) => ({
        id: x.id,
        uri: x.uri,
        name: x.name,
        images: N.images(x.images),
        releaseDate: x.release_date ?? '',
        type: x.album_type ?? 'album',
      })),
    }
    putArtist(a)
    return a
  })
}
