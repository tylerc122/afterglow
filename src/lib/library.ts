// The whole library lives in memory, hydrated from IndexedDB before first paint.
// Every view reads synchronously from here, which is what makes navigation instant.
// The network only ever writes into this store (and IndexedDB) in the background.

import { create } from 'zustand'
import { db } from './db'
import type { Album, Artist, ItemList, Me, Playlist, Track } from './types'

export type SyncState = {
  running: boolean
  firstRun: boolean
  playlistsDone: number
  playlistsTotal: number
  tracks: number
  error?: string
}

type LibraryState = {
  hydrated: boolean
  me: Me | null
  order: string[]
  playlists: Record<string, Playlist>
  items: Record<string, ItemList>
  tracks: Map<string, Track>
  liked: Set<string>
  albums: Record<string, Album>
  artists: Record<string, Artist>
  lastSync: number
  sync: SyncState
}

export const useLibrary = create<LibraryState>(() => ({
  hydrated: false,
  me: null,
  order: [],
  playlists: {},
  items: {},
  tracks: new Map(),
  liked: new Set(),
  albums: {},
  artists: {},
  lastSync: 0,
  sync: { running: false, firstRun: false, playlistsDone: 0, playlistsTotal: 0, tracks: 0 },
}))

const set = useLibrary.setState
const get = useLibrary.getState

export async function hydrate() {
  const [pls, items, tracks, albums, artists, meta] = await Promise.all([
    db.playlists.toArray(),
    db.items.toArray(),
    db.tracks.toArray(),
    db.albums.toArray(),
    db.artists.toArray(),
    db.meta.toArray(),
  ])
  const m = Object.fromEntries(meta.map((x) => [x.key, x.value]))
  pls.sort((a, b) => a.order - b.order)
  const itemMap = Object.fromEntries(items.map((i) => [i.id, i]))
  set({
    hydrated: true,
    me: m.me ?? null,
    lastSync: m.lastSync ?? 0,
    order: pls.map((p) => p.id),
    playlists: Object.fromEntries(pls.map((p) => [p.id, p])),
    items: itemMap,
    tracks: new Map(tracks.map((t) => [t.id, t])),
    liked: new Set(itemMap.liked?.ids ?? []),
    albums: Object.fromEntries(albums.map((a) => [a.id, a])),
    artists: Object.fromEntries(artists.map((a) => [a.id, a])),
  })
}

// ---- writes (memory first, then IndexedDB) ----

export function putTracks(list: Track[]) {
  if (!list.length) return
  const tracks = new Map(get().tracks)
  for (const t of list) tracks.set(t.id, t)
  set({ tracks })
  db.tracks.bulkPut(list)
}

export function putItems(list: ItemList) {
  set((s) => ({
    items: { ...s.items, [list.id]: list },
    ...(list.id === 'liked' ? { liked: new Set(list.ids) } : {}),
  }))
  db.items.put(list)
}

export function putPlaylist(p: Playlist) {
  set((s) => ({ playlists: { ...s.playlists, [p.id]: p } }))
  db.playlists.put({ ...p, order: get().order.indexOf(p.id) })
}

export function setPlaylists(list: Playlist[]) {
  const order = list.map((p) => p.id)
  const keep = new Set(order)
  const removed = get().order.filter((id) => !keep.has(id))
  set({ order, playlists: Object.fromEntries(list.map((p) => [p.id, p])) })
  db.playlists.bulkPut(list.map((p, i) => ({ ...p, order: i })))
  if (removed.length) {
    db.playlists.bulkDelete(removed)
    db.items.bulkDelete(removed)
  }
}

export function putAlbum(a: Album) {
  set((s) => ({ albums: { ...s.albums, [a.id]: a } }))
  db.albums.put(a)
}

export function putArtist(a: Artist) {
  set((s) => ({ artists: { ...s.artists, [a.id]: a } }))
  db.artists.put(a)
}

export function setMe(me: Me) {
  set({ me })
  db.meta.put({ key: 'me', value: me })
}

export function setLastSync(t: number) {
  set({ lastSync: t })
  db.meta.put({ key: 'lastSync', value: t })
}

export function setSync(p: Partial<SyncState>) {
  set((s) => ({ sync: { ...s.sync, ...p } }))
}

export async function clearLibrary() {
  await Promise.all(db.tables.map((t) => t.clear()))
}

// ---- selectors ----

export const isOwned = (p: Playlist, me: Me | null) => p.collaborative || (!!me && p.ownerId === me.id)

export function tracksFor(list?: ItemList): Track[] {
  if (!list) return []
  const { tracks } = get()
  const out: Track[] = []
  for (const id of list.ids) {
    const t = tracks.get(id)
    if (t) out.push(t)
  }
  return out
}
