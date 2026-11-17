// Library edits. Memory first so the UI flips instantly, then the API, roll back on failure.

import { api } from './api'
import * as N from './normalize'
import { putAlbum, putArtist, putItems, putPlaylist, putTracks, useLibrary } from './library'
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
    toast(tracks.length > 1 ? `Added ${tracks.length.toLocaleString()} songs to ${p?.name ?? 'playlist'}` : `Added to ${p?.name ?? 'playlist'}`)
  } catch {
    putItems(prev)
    if (p) putPlaylist(p)
    toast('Couldn’t add to that playlist')
  }
}

export async function removeFromPlaylist(playlistId: string, index: number) {
  const s = useLibrary.getState()
  const p = s.playlists[playlistId]
  const prev = s.items[playlistId]
  if (!prev || !p) return
  const t = s.tracks.get(prev.ids[index])
  if (!t) return
  putItems({ id: playlistId, ids: prev.ids.filter((_, j) => j !== index), added: prev.added.filter((_, j) => j !== index) })
  putPlaylist({ ...p, total: Math.max(0, p.total - 1) })
  try {
    const r = await api<{ snapshot_id: string }>(`/playlists/${playlistId}/items`, {
      method: 'DELETE',
      body: { items: [{ uri: t.uri }], snapshot_id: p.snapshot },
    })
    if (r?.snapshot_id) putPlaylist({ ...useLibrary.getState().playlists[playlistId], snapshot: r.snapshot_id, syncedSnapshot: r.snapshot_id })
    toast(`Removed from ${p.name}`)
  } catch {
    putItems(prev)
    putPlaylist(p)
    toast('Couldn’t remove that')
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
