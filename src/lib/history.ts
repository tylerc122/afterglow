// Ten years of listening, from Spotify's Extended Streaming History export.
// The desktop app's main process reads the zips (see electron/history.cjs) and
// hands back a summary. In a plain browser there's no history, and every
// section that needs it just doesn't show.

import { create } from 'zustand'
import { api } from './api'
import { db } from './db'
import * as N from './normalize'
import type { Artist, Play, Track } from './types'

export type HArtist = { name: string; ms: number; plays: number; first: number; last: number; peakYear?: number; topUri?: string }
export type HTrack = { uri: string; name: string; artist: string; album: string; ms: number; plays: number; first: number }
export type HYear = { year: number; ms: number; plays: number; artists: { name: string; ms: number }[]; track: HTrack | null }

export type History = {
  firstTs: number
  lastTs: number
  rows: number
  ms: number
  plays: number
  skipRate: number | null
  activeDays: number
  hours: number[]
  week: number[][]
  streak: { days: number; from: string; to: string }
  bestDay: { date: string; ms: number }
  firstSong?: { name: string; artist: string; ts: number }
  years: HYear[]
  artists: HArtist[]
  tracks: HTrack[]
  artistIndex: Record<string, [number, number, number]>
  trackIndex: Record<string, [number, number, number]>
}

type Bridge = {
  historySummary: (force?: boolean) => Promise<(History & { key: string }) | { missing: string } | { error: string }>
  appendLive: (rows: object[]) => Promise<number>
}
const bridge = (window as any).afterglow as Bridge | undefined

type HistoryState = { history: History | null; status: 'idle' | 'loading' | 'ready' | 'missing' | 'none' }
export const useHistory = create<HistoryState>(() => ({ history: null, status: bridge ? 'idle' : 'none' }))

export function loadHistory() {
  const s = useHistory.getState()
  if (!bridge || s.status !== 'idle') return
  useHistory.setState({ status: 'loading' })
  bridge
    .historySummary()
    .then((r) => {
      if ('missing' in r || 'error' in r) useHistory.setState({ status: 'missing' })
      else useHistory.setState({ history: r, status: 'ready' })
    })
    .catch(() => useHistory.setState({ status: 'missing' }))
}

/** same normalizing the export reader uses, so names match across the two */
export const normName = (s: string) =>
  s
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

export const artistAllTime = (h: History | null, name: string) => {
  const v = h?.artistIndex[normName(name)]
  return v ? { first: v[0], ms: v[1], plays: v[2] } : null
}
export const trackAllTime = (h: History | null, uri: string) => {
  const v = h?.trackIndex[uri]
  return v ? { first: v[0], plays: v[1], ms: v[2] } : null
}

export const hoursText = (ms: number) => {
  const h = ms / 3.6e6
  return h >= 10 ? `${Math.round(h).toLocaleString()} hr` : h >= 1 ? `${h.toFixed(1)} hr` : `${Math.round(ms / 60000)} min`
}

// ---- live plays out to the export folder ----

const exportTs = (at: number) => new Date(at).toISOString().replace(/\.\d+Z$/, 'Z')

/** a play from /recently-played, in the shape of an export row (ms_played is the song length, an estimate) */
function toExportRow(p: Play) {
  return {
    ts: exportTs(p.at),
    platform: 'afterglow (recently played)',
    ms_played: p.track.durationMs,
    conn_country: null,
    master_metadata_track_name: p.track.name,
    master_metadata_album_artist_name: p.track.artists[0]?.name ?? null,
    master_metadata_album_album_name: p.track.albumName,
    spotify_track_uri: p.track.uri,
    reason_start: null,
    reason_end: null,
    shuffle: null,
    skipped: null,
    offline: null,
    incognito_mode: false,
    afterglow_estimated_ms: true,
  }
}

export function exportPlays(plays: Play[]) {
  if (!bridge || !plays.length) return
  bridge.appendLive(plays.map(toExportRow)).catch(() => {})
}

// ---- turning export names back into Spotify things with pictures ----
// The export only has names and track uris. One /tracks call per song gives the
// art and the artist id, one /artists call gives the photo. Cached for good.

type Resolved = { tracks: Record<string, Track & { year: string }>; artists: Record<string, Artist> }
let resolved: Resolved | null = null
const loading = new Map<string, Promise<unknown>>()

async function cache() {
  if (!resolved) resolved = ((await db.meta.get('resolved'))?.value as Resolved) ?? { tracks: {}, artists: {} }
  return resolved
}
let saveTimer: number | undefined
const save = () => {
  clearTimeout(saveTimer)
  saveTimer = window.setTimeout(() => resolved && db.meta.put({ key: 'resolved', value: resolved }), 500)
}

export async function resolveTrack(uri: string): Promise<(Track & { year: string }) | null> {
  const c = await cache()
  if (c.tracks[uri]) return c.tracks[uri]
  const id = uri.split(':').pop()!
  if (!loading.has(uri))
    loading.set(
      uri,
      api<any>(`/tracks/${id}`)
        .then((raw) => {
          const t = N.track(raw)
          if (t) {
            c.tracks[uri] = { ...t, year: (raw.album?.release_date ?? '').slice(0, 4), artists: t.artists }
            save()
          }
        })
        .catch(() => {}),
    )
  await loading.get(uri)
  return c.tracks[uri] ?? null
}

/** an export artist (just a name) → the real artist, found through one of their songs */
export async function resolveArtist(a: HArtist): Promise<Artist | null> {
  const c = await cache()
  const key = normName(a.name)
  if (c.artists[key]) return c.artists[key]
  if (!a.topUri) return null
  const t = await resolveTrack(a.topUri)
  const ref = t?.artists.find((x) => normName(x.name) === key) ?? t?.artists[0]
  if (!ref?.id) return null
  const k = `artist:${ref.id}`
  if (!loading.has(k))
    loading.set(
      k,
      api<any>(`/artists/${ref.id}`)
        .then((raw) => {
          c.artists[key] = N.artist(raw)
          save()
        })
        .catch(() => {}),
    )
  await loading.get(k)
  return c.artists[key] ?? null
}

/** resolve a list a few at a time, calling back as each lands so the page fills in */
export async function resolveAll<T, R>(list: T[], fn: (x: T) => Promise<R>, onEach: () => void) {
  let i = 0
  const lane = async () => {
    while (i < list.length) {
      const x = list[i++]
      await fn(x)
      onEach()
    }
  }
  await Promise.all([lane(), lane(), lane()])
}

export const resolvedTrack = (uri: string) => resolved?.tracks[uri]
export const resolvedArtist = (name: string) => resolved?.artists[normName(name)]
export const warmResolved = () => cache()
