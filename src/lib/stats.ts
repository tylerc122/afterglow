// Stats for the profile page. Two sources:
//  - Spotify's top artists/tracks (4 weeks, 6 months, a year), which are accurate
//    but only give rank, no play counts
//  - our own play log: every listen /recently-played reports (any device), saved
//    to IndexedDB. The API only ever shows the last 50, so the log is what lets
//    the clock, streaks and "on repeat" get better the longer the app is around.

import { create } from 'zustand'
import { api } from './api'
import { db } from './db'
import * as N from './normalize'
import type { Artist, Play, Track } from './types'
import { exportPlays } from './history'

export type Range = 'short_term' | 'medium_term' | 'long_term'
export const RANGES: { id: Range; label: string; long: string }[] = [
  { id: 'short_term', label: '4 weeks', long: 'the last 4 weeks' },
  { id: 'medium_term', label: '6 months', long: 'the last 6 months' },
  { id: 'long_term', label: 'A year', long: 'the last year' },
]

export type TopTrack = Track & { year: string }
type Top = { artists: Artist[]; tracks: TopTrack[]; at: number }

type Profile = { followers: number; following: number; product: string }

type StatsState = {
  top: Partial<Record<Range, Top>>
  plays: Play[]
  playsLoaded: boolean
  profile: Profile | null
}

export const useStats = create<StatsState>(() => ({ top: {}, plays: [], playsLoaded: false, profile: null }))
const set = useStats.setState
const get = useStats.getState

const FRESH = 30 * 60_000
const inflight = new Map<string, Promise<unknown>>()
const once = <T,>(key: string, fn: () => Promise<T>): Promise<T> => {
  if (!inflight.has(key)) inflight.set(key, fn().finally(() => inflight.delete(key)))
  return inflight.get(key) as Promise<T>
}

/** cached top lists come off disk instantly, then refresh if older than 30 min */
export async function loadTop(range: Range) {
  const have = get().top[range]
  if (!have) {
    const row = await db.meta.get(`top:${range}`)
    if (row?.value && !get().top[range]) set((s) => ({ top: { ...s.top, [range]: row.value } }))
  }
  const cur = get().top[range]
  if (cur && Date.now() - cur.at < FRESH) return
  return once(`top:${range}`, async () => {
    const [a, t] = await Promise.all([
      api<any>('/me/top/artists', { query: { time_range: range, limit: 50 } }),
      api<any>('/me/top/tracks', { query: { time_range: range, limit: 50 } }),
    ])
    const top: Top = {
      artists: (a?.items ?? []).map(N.artist),
      tracks: (t?.items ?? [])
        .map((x: any) => {
          const tr = N.track(x)
          return tr && { ...tr, year: (x.album?.release_date ?? '').slice(0, 4) }
        })
        .filter(Boolean),
      at: Date.now(),
    }
    set((s) => ({ top: { ...s.top, [range]: top } }))
    db.meta.put({ key: `top:${range}`, value: top })
  })
}

export function loadProfile() {
  return once('profile', async () => {
    const [me, fol] = await Promise.all([api<any>('/me'), api<any>('/me/following', { query: { type: 'artist', limit: 1 } })])
    set({ profile: { followers: me?.followers?.total ?? 0, following: fol?.artists?.total ?? 0, product: me?.product ?? '' } })
  })
}

// ---- the play log ----

async function loadPlays() {
  if (get().playsLoaded) return
  const plays = await db.plays.orderBy('at').reverse().toArray()
  set({ plays, playsLoaded: true })
}

let exportedOnce = false

/** pull anything new since the last play we saved */
export function syncPlays() {
  return once('plays', async () => {
    await loadPlays()
    // first sync of the session hands the whole log to the export folder (it skips dupes)
    if (!exportedOnce) {
      exportedOnce = true
      exportPlays(get().plays)
    }
    const newest = get().plays[0]?.at ?? 0
    const r = await api<any>('/me/player/recently-played', { query: { limit: 50, ...(newest ? { after: newest } : {}) } })
    const fresh: Play[] = []
    for (const it of r?.items ?? []) {
      const track = N.track(it.track)
      const at = Date.parse(it.played_at)
      if (!track || !at || at <= newest) continue
      fresh.push({ at, track, contextUri: it.context?.uri ?? null, year: (it.track.album?.release_date ?? '').slice(0, 4) })
    }
    if (!fresh.length) return
    await db.plays.bulkPut(fresh)
    exportPlays(fresh)
    const seen = new Set(get().plays.map((p) => p.at))
    const merged = [...fresh.filter((p) => !seen.has(p.at)), ...get().plays].sort((a, b) => b.at - a.at)
    set({ plays: merged })
  })
}

export function startPlayLog() {
  const tick = () => syncPlays().catch(() => {})
  setTimeout(tick, 4000)
  // 50 songs is 2-3 hours of listening, so every 20 min never misses any
  setInterval(tick, 20 * 60_000)
}

// ---- derived numbers ----

export type Clock = { hours: number[]; peak: number; persona: string; total: number }

export function listeningClock(plays: Play[]): Clock {
  const hours = new Array(24).fill(0)
  for (const p of plays) hours[new Date(p.at).getHours()]++
  return clockFrom(hours, plays.length)
}

/** hours can be play counts or listening time, only the shape matters */
export function clockFrom(hours: number[], total: number): Clock {
  const peak = hours.indexOf(Math.max(...hours))
  // where the bulk of it sits, in 4 broad parts of the day
  const sum = (from: number, to: number) => {
    let n = 0
    for (let h = from; h !== to; h = (h + 1) % 24) n += hours[h]
    return n
  }
  const parts = [
    { name: 'Early riser', n: sum(5, 11) },
    { name: 'Daytime listener', n: sum(11, 17) },
    { name: 'Evening listener', n: sum(17, 22) },
    { name: 'Night owl', n: sum(22, 5) },
  ].sort((a, b) => b.n - a.n)
  return { hours, peak, persona: parts[0].name, total }
}

export const hourLabel = (h: number) => (h === 0 ? '12am' : h < 12 ? `${h}am` : h === 12 ? '12pm' : `${h - 12}pm`)

export function decades(tracks: { year?: string }[]) {
  const years = tracks.map((t) => parseInt(t.year ?? '', 10)).filter((y) => y > 1900)
  const by = new Map<number, number>()
  for (const y of years) by.set(Math.floor(y / 10) * 10, (by.get(Math.floor(y / 10) * 10) ?? 0) + 1)
  const sorted = [...years].sort((a, b) => a - b)
  return {
    bars: [...by.entries()].sort((a, b) => a[0] - b[0]).map(([decade, n]) => ({ decade, n })),
    median: sorted.length ? sorted[Math.floor(sorted.length / 2)] : 0,
    oldest: sorted[0] ?? 0,
  }
}

/** rank change between a shorter window and the next longer one */
export function movement(id: string, rank: number, longer?: { id: string }[]) {
  if (!longer) return null
  const was = longer.findIndex((x) => x.id === id)
  if (was < 0) return { kind: 'new' as const }
  const d = was - rank
  return d === 0 ? { kind: 'same' as const } : { kind: d > 0 ? ('up' as const) : ('down' as const), by: Math.abs(d) }
}

/** most played songs in the log over the last two weeks */
export function onRepeat(plays: Play[], days = 14) {
  const since = Date.now() - days * 86_400_000
  const count = new Map<string, { track: Track; n: number; last: number }>()
  for (const p of plays) {
    if (p.at < since) break
    const c = count.get(p.track.id)
    if (c) c.n++
    else count.set(p.track.id, { track: p.track, n: 1, last: p.at })
  }
  return [...count.values()].filter((c) => c.n > 1).sort((a, b) => b.n - a.n || b.last - a.last)
}

/** how many days in a row (ending today or yesterday) have at least one play */
export function streak(plays: Play[]) {
  const days = new Set(plays.map((p) => new Date(p.at).toDateString()))
  const d = new Date()
  if (!days.has(d.toDateString())) d.setDate(d.getDate() - 1)
  let n = 0
  while (days.has(d.toDateString())) {
    n++
    d.setDate(d.getDate() - 1)
  }
  return n
}
