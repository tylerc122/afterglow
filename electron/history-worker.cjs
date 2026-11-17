// Reads Spotify's Extended Streaming History exports (the zips you request from
// spotify.com/account/privacy) and boils ~250k rows down to a small summary the
// profile page can draw from. Runs on a worker thread so the window never stalls.
// Every zip in the folder is read, overlapping exports are de-duplicated, so a
// new export can just be dropped next to the old ones.

const { workerData, parentPort } = require('node:worker_threads')
const { execFileSync } = require('node:child_process')
const fs = require('node:fs')
const path = require('node:path')

const { dir } = workerData
const STREAM_MS = 30_000 // Spotify counts a play as a "stream" past 30 seconds

const norm = (s) =>
  (s || '')
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()

function readRows() {
  const zips = fs.readdirSync(dir).filter((f) => f.endsWith('.zip'))
  const seen = new Set()
  const rows = []
  for (const zip of zips) {
    const full = path.join(dir, zip)
    let names
    try {
      names = execFileSync('unzip', ['-Z1', full], { encoding: 'utf8', maxBuffer: 16 << 20 }).split('\n')
    } catch {
      continue
    }
    for (const name of names.filter((n) => /Streaming_History_Audio_.*\.json$/.test(n))) {
      const raw = execFileSync('unzip', ['-p', full, name], { maxBuffer: 256 << 20 })
      for (const r of JSON.parse(raw.toString('utf8'))) {
        if (!r.spotify_track_uri || r.incognito_mode) continue
        const k = r.ts + r.spotify_track_uri + r.ms_played
        if (seen.has(k)) continue
        seen.add(k)
        rows.push(r)
      }
    }
  }
  rows.sort((a, b) => (a.ts < b.ts ? -1 : a.ts > b.ts ? 1 : 0))
  return rows
}

function summarize(rows) {
  const hours = new Array(24).fill(0)
  const week = Array.from({ length: 7 }, () => new Array(24).fill(0))
  const years = new Map()
  const artists = new Map()
  const tracks = new Map()
  const days = new Map()
  let ms = 0
  let plays = 0
  let skips = 0
  let skipKnown = 0

  for (const r of rows) {
    const t = Date.parse(r.ts)
    const d = new Date(t)
    const m = r.ms_played || 0
    const stream = m >= STREAM_MS
    const artist = r.master_metadata_album_artist_name || 'Unknown artist'
    const uri = r.spotify_track_uri
    ms += m
    if (stream) plays++
    if (typeof r.skipped === 'boolean') {
      skipKnown++
      if (r.skipped) skips++
    }
    hours[d.getHours()] += m
    week[d.getDay()][d.getHours()] += m
    const day = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
    days.set(day, (days.get(day) || 0) + m)

    const y = d.getFullYear()
    let Y = years.get(y)
    if (!Y) years.set(y, (Y = { ms: 0, plays: 0, artists: new Map(), tracks: new Map() }))
    Y.ms += m
    if (stream) Y.plays++
    Y.artists.set(artist, (Y.artists.get(artist) || 0) + m)
    Y.tracks.set(uri, (Y.tracks.get(uri) || 0) + m)

    const ak = norm(artist)
    let A = artists.get(ak)
    if (!A) artists.set(ak, (A = { name: artist, ms: 0, plays: 0, first: t, last: t, years: new Map(), tracks: new Map() }))
    A.ms += m
    if (stream) A.plays++
    A.last = t
    A.years.set(y, (A.years.get(y) || 0) + m)
    A.tracks.set(uri, (A.tracks.get(uri) || 0) + m)

    let T = tracks.get(uri)
    if (!T)
      tracks.set(
        uri,
        (T = { uri, name: r.master_metadata_track_name || 'Unknown track', artist, album: r.master_metadata_album_album_name || '', ms: 0, plays: 0, first: t, last: t }),
      )
    T.ms += m
    if (stream) T.plays++
    T.last = t
  }

  const top = (map, n) => [...map.entries()].sort((a, b) => b[1] - a[1]).slice(0, n)
  const trackOut = (T) => ({ uri: T.uri, name: T.name, artist: T.artist, album: T.album, ms: T.ms, plays: T.plays, first: T.first })

  // longest run of consecutive days with any listening
  const dayList = [...days.keys()].sort()
  let streak = { days: 0, from: '', to: '' }
  let run = 0
  let from = ''
  for (let i = 0; i < dayList.length; i++) {
    const prev = i && new Date(dayList[i - 1] + 'T12:00')
    const cur = new Date(dayList[i] + 'T12:00')
    if (prev && Math.round((cur - prev) / 86_400_000) === 1) run++
    else {
      run = 1
      from = dayList[i]
    }
    if (run > streak.days) streak = { days: run, from, to: dayList[i] }
  }
  const [bestDay, bestMs] = top(days, 1)[0] || ['', 0]

  const artistList = [...artists.values()].sort((a, b) => b.ms - a.ms)
  const trackList = [...tracks.values()].sort((a, b) => b.ms - a.ms)
  const first = rows[0]

  return {
    firstTs: rows.length ? Date.parse(rows[0].ts) : 0,
    lastTs: rows.length ? Date.parse(rows[rows.length - 1].ts) : 0,
    rows: rows.length,
    ms,
    plays,
    skipRate: skipKnown ? skips / skipKnown : null,
    activeDays: days.size,
    hours,
    week,
    streak,
    bestDay: { date: bestDay, ms: bestMs },
    firstSong: first && { name: first.master_metadata_track_name, artist: first.master_metadata_album_artist_name, ts: Date.parse(first.ts) },
    years: [...years.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([year, Y]) => ({
        year,
        ms: Y.ms,
        plays: Y.plays,
        artists: top(Y.artists, 3).map(([name, ms]) => ({ name, ms })),
        track: (() => {
          const [uri] = top(Y.tracks, 1)[0] || []
          return uri ? trackOut(tracks.get(uri)) : null
        })(),
      })),
    artists: artistList.slice(0, 100).map((A) => ({
      name: A.name,
      ms: A.ms,
      plays: A.plays,
      first: A.first,
      last: A.last,
      peakYear: top(A.years, 1)[0]?.[0],
      // a track uri lets the app look up the artist's id and photo
      topUri: top(A.tracks, 1)[0]?.[0],
    })),
    tracks: trackList.slice(0, 100).map(trackOut),
    // lookups for anything the app shows from Spotify's live top lists
    artistIndex: Object.fromEntries(artistList.filter((A) => A.ms >= 10 * 60_000).map((A) => [norm(A.name), [A.first, A.ms, A.plays]])),
    trackIndex: Object.fromEntries(trackList.filter((T) => T.plays >= 3).map((T) => [T.uri, [T.first, T.plays, T.ms]])),
  }
}

try {
  parentPort.postMessage({ ok: true, summary: summarize(readRows()) })
} catch (e) {
  parentPort.postMessage({ ok: false, error: String(e?.message || e) })
}
