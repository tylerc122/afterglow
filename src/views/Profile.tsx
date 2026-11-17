// You. Three sources, each labeled for what it is:
//  - Spotify's top lists (4 weeks, 6 months, a year): who you've been into
//  - your Extended Streaming History export, read off disk: ten years of exact
//    listening time, the real clock, your years, first listens
//  - the live play log: what's happened since, from any device

import { memo, useEffect, useMemo, useState } from 'react'
import { setLiked } from '../lib/actions'
import { useAmbient } from '../lib/ambient'
import { cachedPalette, css, getPalette, rgbToHsl } from '../lib/colors'
import { artistsText, longDuration, time } from '../lib/format'
import {
  artistAllTime,
  hoursText,
  loadHistory,
  resolveAll,
  resolveArtist,
  resolvedArtist,
  resolvedTrack,
  resolveTrack,
  useHistory,
  warmResolved,
  type History,
} from '../lib/history'
import { prefetch } from '../lib/images'
import { isOwned, useLibrary } from '../lib/library'
import { playContext, playUris, usePlayer } from '../lib/player'
import { link } from '../lib/router'
import {
  RANGES,
  clockFrom,
  decades,
  hourLabel,
  listeningClock,
  loadProfile,
  loadTop,
  movement,
  onRepeat,
  streak,
  syncPlays,
  useStats,
  type Clock,
  type Range,
  type TopTrack,
} from '../lib/stats'
import type { Artist, Play, Track } from '../lib/types'
import { useUI } from '../lib/ui'
import { Cover } from '../components/Cover'
import { Icon } from '../components/Icon'

type View = Range | 'all'
const RANGE_KEY = 'afterglow.profileRange'
const longer: Record<View, Range | null> = { short_term: 'medium_term', medium_term: 'long_term', long_term: null, all: null }
const fmtDate = (t: number, year = true) => new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric', ...(year ? { year: 'numeric' } : {}) })

export function Profile() {
  const me = useLibrary((s) => s.me)
  const order = useLibrary((s) => s.order)
  const playlists = useLibrary((s) => s.playlists)
  const likedCount = useLibrary((s) => s.items.liked?.ids.length ?? 0)
  const profile = useStats((s) => s.profile)
  const topAll = useStats((s) => s.top)
  const plays = useStats((s) => s.plays)
  const history = useHistory((s) => s.history)
  const [view, setViewState] = useState<View>(() => (localStorage.getItem(RANGE_KEY) as View) || 'short_term')
  const setView = (r: View) => {
    setViewState(r)
    try {
      localStorage.setItem(RANGE_KEY, r)
    } catch {}
  }

  useEffect(() => {
    useUI.setState({ topTitle: 'You', showTopTitle: false })
    loadProfile().catch(() => {})
    for (const r of RANGES) loadTop(r.id).catch(() => {})
    syncPlays().catch(() => {})
    loadHistory()
    return () => useAmbient.setState({ page: null })
  }, [])

  const allTime = useAllTime(view === 'all' ? history : null)
  const top = view === 'all' ? allTime : topAll[view]
  const next = longer[view] ? topAll[longer[view]!] : undefined
  const no1 = top?.artists[0]
  const effectiveView: View = view === 'all' && !history ? 'short_term' : view

  // the #1 artist lights the room
  useEffect(() => {
    if (!no1?.images.sm) return
    let alive = true
    getPalette(no1.images.sm).then((p) => alive && useAmbient.setState({ page: p }))
    return () => {
      alive = false
    }
  }, [no1?.images.sm])

  const made = order.filter((id) => playlists[id] && isOwned(playlists[id], me)).length

  // the clock: ten years of listening time when the export's here, plus anything live since
  const clock = useMemo<Clock>(() => {
    if (!history) return listeningClock(plays)
    const hours = [...history.hours]
    let extra = 0
    for (const p of plays)
      if (p.at > history.lastTs) {
        hours[new Date(p.at).getHours()] += p.track.durationMs
        extra++
      }
    return clockFrom(hours, history.rows + extra)
  }, [history, plays])
  const eras = useMemo(() => decades(top?.tracks ?? []), [top])

  return (
    <div className="page profile">
      <section className="pf-hero">
        <div className="pf-avatar">
          {me?.image ? <img src={me.image} alt="" crossOrigin="anonymous" /> : <span>{me?.name?.[0] ?? '·'}</span>}
        </div>
        <div className="pf-who">
          <div className="kicker">
            Profile{profile?.product === 'premium' ? ' · Premium' : ''}
            {history ? ` · Listening since ${new Date(history.firstTs).getFullYear()}` : ''}
          </div>
          <h1 className="display display-md">{me?.name ?? 'You'}</h1>
          <div className="hero-stats">
            {profile && <span>{profile.followers.toLocaleString()} followers</span>}
            {profile && <span>Following {profile.following.toLocaleString()} artists</span>}
            <span>{made} playlists</span>
            <span>{likedCount.toLocaleString()} liked songs</span>
          </div>
        </div>
      </section>

      <div className="pf-bar">
        <Lede view={effectiveView} artist={no1} median={eras.median} clock={clock.total >= 20 ? clock : null} history={history} />
        <div className="seg" role="tablist">
          {RANGES.map((r) => (
            <button key={r.id} role="tab" aria-selected={r.id === view} className={r.id === view ? 'on' : ''} onClick={() => setView(r.id)}>
              {r.label}
            </button>
          ))}
          {history && (
            <button role="tab" aria-selected={view === 'all'} className={view === 'all' ? 'on' : ''} onClick={() => setView('all')}>
              Since {new Date(history.firstTs).getFullYear()}
            </button>
          )}
        </div>
      </div>

      {!top ? (
        <div className="pf-loading">Reading your listening…</div>
      ) : (
        <>
          {no1 && <Spotlight artist={no1} tracks={top.tracks} view={effectiveView} longerArtists={next?.artists} history={history} />}

          {top.artists.length > 1 && (
            <section className="section">
              <h2 className="section-title">Top artists</h2>
              <div className="pf-artists">
                {top.artists.slice(1, 11).map((a, i) => (
                  <ArtistChip
                    key={a.id || a.name}
                    a={a}
                    rank={i + 1}
                    move={movement(a.id, i + 1, next?.artists)}
                    note={view === 'all' ? hoursText(allTime?.ms[a.name] ?? 0) : undefined}
                  />
                ))}
              </div>
            </section>
          )}

          <Chart
            tracks={top.tracks}
            longerTracks={next?.tracks}
            hasLonger={!!longer[view]}
            metric={view === 'all' ? (t) => `${(allTime?.plays[t.uri] ?? 0).toLocaleString()} plays` : undefined}
          />

          <div className="pf-grid">
            <ClockCard clock={clock} history={history} plays={plays} />
            {history && <WeekCard history={history} />}
            <ErasCard eras={eras} tracks={top.tracks} view={effectiveView} />
          </div>
        </>
      )}

      {history && <Years history={history} />}

      {top && <ColorStrip tracks={top.tracks} view={effectiveView} />}

      <LogSection plays={plays} shortTop={topAll.short_term?.tracks} />
    </div>
  )
}

const viewLong = (v: View, h: History | null) => (v === 'all' ? `since ${h ? new Date(h.firstTs).getFullYear() : 'the start'}` : RANGES.find((r) => r.id === v)!.long)

/** "Since 2016" as a top list: the export's ranking, with Spotify filling in the pictures */
function useAllTime(history: History | null) {
  const [, bump] = useState(0)
  useEffect(() => {
    if (!history) return
    let alive = true
    const tick = () => alive && bump((n) => n + 1)
    warmResolved().then(async () => {
      tick()
      await resolveAll(history.artists.slice(0, 11), resolveArtist, tick)
      await resolveAll(history.tracks.slice(0, 50), (t) => resolveTrack(t.uri), tick)
    })
    return () => {
      alive = false
    }
  }, [history])
  if (!history) return undefined

  const artists: Artist[] = history.artists.slice(0, 11).map(
    (a) => resolvedArtist(a.name) ?? { id: '', uri: '', name: a.name, images: {}, genres: [] },
  )
  const tracks: TopTrack[] = history.tracks.slice(0, 50).map(
    (t) =>
      resolvedTrack(t.uri) ?? {
        id: t.uri.split(':').pop()!,
        uri: t.uri,
        name: t.name,
        artists: [{ id: '', name: t.artist }],
        albumId: '',
        albumName: t.album,
        images: {},
        durationMs: 0,
        explicit: false,
        year: '',
      },
  )
  // keyed by the names Spotify gave back, so a lookup works on either list
  const ms: Record<string, number> = {}
  history.artists.slice(0, 11).forEach((a, i) => (ms[artists[i].name] = a.ms))
  const plays: Record<string, number> = {}
  for (const t of history.tracks) plays[t.uri] = t.plays
  return { artists, tracks, ms, plays, at: 0 }
}

/** one sentence, written from the numbers */
function Lede({ view, artist, median, clock, history }: { view: View; artist?: Artist; median: number; clock: Clock | null; history: History | null }) {
  if (!artist) return <p className="pf-lede" />
  if (view === 'all' && history) {
    const best = [...history.years].sort((a, b) => b.ms - a.ms)[0]
    return (
      <p className="pf-lede">
        Since {new Date(history.firstTs).getFullYear()} it’s been <b>{hoursText(history.ms).replace(' hr', ' hours')}</b>, more of it <b>{artist.name}</b> than anyone,
        and <b>{best.year}</b> was your biggest year.
      </p>
    )
  }
  const lead = { short_term: 'Lately it’s been', medium_term: 'The last six months have been', long_term: 'This past year has been', all: '' }[view]
  const when = clock && { 'Night owl': 'after dark', 'Evening listener': 'in the evenings', 'Daytime listener': 'during the day', 'Early riser': 'in the mornings' }[clock.persona]
  const now = new Date().getFullYear()
  const era = median ? (median >= now - 1 ? <>a lot of <b>new releases</b></> : <>songs from the <b>{Math.floor(median / 10) * 10}s</b></>) : null
  return (
    <p className="pf-lede">
      {lead} a lot of <b>{artist.name}</b>
      {when && (
        <>
          , mostly <b>{when}</b>
        </>
      )}
      {era && <>, and {era}</>}.
    </p>
  )
}

type Move = ReturnType<typeof movement>

function MoveBadge({ m }: { m: Move }) {
  if (!m) return null
  if (m.kind === 'new') return <span className="mv new">New</span>
  if (m.kind === 'same') return <span className="mv same">–</span>
  return (
    <span className={`mv ${m.kind}`}>
      {m.kind === 'up' ? '▲' : '▼'}
      {m.by}
    </span>
  )
}

function Spotlight({ artist, tracks, view, longerArtists, history }: { artist: Artist; tracks: TopTrack[]; view: View; longerArtists?: Artist[]; history: History | null }) {
  const theirs = tracks.filter((t) => t.artists.some((a) => (a.id && a.id === artist.id) || a.name === artist.name))
  const m = view === 'all' ? null : movement(artist.id, 0, longerArtists)
  const longerLabel = view === 'short_term' ? 'six months' : 'the year'
  const pal = cachedPalette(artist.images.sm)
  const was = m?.kind === 'up' ? `Up from #${m.by + 1} over ${longerLabel}` : m?.kind === 'new' ? `Not in your top 50 over ${longerLabel}` : m?.kind === 'same' ? `Also #1 over ${longerLabel}` : null
  const all = artistAllTime(history, artist.name)
  const path = artist.id ? `/artist/${artist.id}` : ''

  return (
    <section className="pf-spot" style={pal ? { ['--spot' as any]: css(pal.colors[0], 0.6) } : undefined}>
      <a className="pf-spot-art" href={path || undefined} onClick={path ? link(path) : undefined} onMouseEnter={() => prefetch(artist.images.lg)}>
        <Cover images={artist.images} size="lg" round />
      </a>
      <div className="pf-spot-info">
        <div className="pf-rank-big">1</div>
        <div className="kicker">Your top artist, {viewLong(view, history)}</div>
        <a className="pf-spot-name" href={path || undefined} onClick={path ? link(path) : undefined}>
          {artist.name}
        </a>
        <div className="pf-spot-facts">
          {theirs.length > 0 && (
            <span>
              <b>{theirs.length}</b> of your top {tracks.length} songs
            </span>
          )}
          {all && (
            <span>
              <b>{hoursText(all.ms)}</b> all-time
            </span>
          )}
          {all && <span>First played {fmtDate(all.first)}</span>}
          {was && <span>{was}</span>}
        </div>
        <div className="pf-spot-actions">
          {artist.uri && (
            <button className="play-xl" onClick={() => playContext(artist.uri)} aria-label={`Play ${artist.name}`}>
              <Icon name="play" size={22} />
            </button>
          )}
          {theirs.length > 1 && (
            <button className="pill-btn" onClick={() => playUris(theirs.map((t) => t.uri))}>
              Play your favorites
            </button>
          )}
        </div>
      </div>
    </section>
  )
}

const ArtistChip = memo(function ArtistChip({ a, rank, move, note }: { a: Artist; rank: number; move: Move; note?: string }) {
  const body = (
    <>
      <div className="pf-artist-art">
        <Cover images={a.images} size="md" round />
        <span className="pf-artist-rank">{rank + 1}</span>
      </div>
      <div className="pf-artist-name">{a.name}</div>
      {note ? <span className="mv same">{note}</span> : <MoveBadge m={move} />}
    </>
  )
  if (!a.id) return <div className="pf-artist">{body}</div>
  return (
    <a className="pf-artist" href={`/artist/${a.id}`} onClick={link(`/artist/${a.id}`)} onMouseEnter={() => prefetch(a.images.lg)}>
      {body}
    </a>
  )
})

function Chart({ tracks, longerTracks, hasLonger, metric }: { tracks: TopTrack[]; longerTracks?: TopTrack[]; hasLonger: boolean; metric?: (t: TopTrack) => string }) {
  const [all, setAll] = useState(false)
  const current = usePlayer((s) => s.track?.id)
  const shown = all ? tracks : tracks.slice(0, 10)
  const play = (i: number) => playUris(tracks.map((t) => t.uri), i)
  if (!tracks.length) return null
  return (
    <section className="section">
      <div className="section-row">
        <h2 className="section-title">Top songs</h2>
        {hasLonger && <span className="section-sub">Arrows compare to the next longer stretch</span>}
        {metric && <span className="section-sub">Ranked by time listened, from your streaming history</span>}
        <button className="pill-btn sm" onClick={() => play(0)}>
          <Icon name="play" size={14} /> Play all {tracks.length}
        </button>
      </div>
      <div className="chart">
        {shown.map((t, i) => (
          <div key={t.uri} className={`chart-row ${current === t.id ? 'now' : ''}`} onDoubleClick={() => play(i)}>
            <button className="chart-rank" onClick={() => play(i)} aria-label={`Play ${t.name}`}>
              <span>{i + 1}</span>
              <Icon name="play" size={14} />
            </button>
            <Cover images={t.images} size="sm" className="chart-art" />
            <div className="chart-text">
              <div className="chart-name">{t.name}</div>
              <div className="chart-sub">
                {t.artists.map((a, j) => (
                  <span key={a.id + j}>
                    {j > 0 && ', '}
                    {a.id ? (
                      <a href={`/artist/${a.id}`} onClick={link(`/artist/${a.id}`)}>
                        {a.name}
                      </a>
                    ) : (
                      a.name
                    )}
                  </span>
                ))}
              </div>
            </div>
            {t.albumId ? (
              <a className="chart-album" href={`/album/${t.albumId}`} onClick={link(`/album/${t.albumId}`)}>
                {t.albumName}
              </a>
            ) : (
              <span className="chart-album">{t.albumName}</span>
            )}
            <span className="chart-year">{t.year}</span>
            {metric ? <span className="mv same chart-metric">{metric(t)}</span> : <MoveBadge m={movement(t.id, i, longerTracks)} />}
            <span className="chart-dur">{t.durationMs ? time(t.durationMs) : ''}</span>
          </div>
        ))}
      </div>
      {tracks.length > 10 && (
        <button className="text-btn" onClick={() => setAll(!all)}>
          {all ? 'Show top 10' : `Show all ${tracks.length}`}
        </button>
      )}
    </section>
  )
}

/** 24 bars around a dial, midnight at the top */
function ClockCard({ clock, history, plays }: { clock: Clock; history: History | null; plays: Play[] }) {
  const max = Math.max(1, ...clock.hours)
  const since = history ? new Date(history.firstTs) : plays.length ? new Date(plays[plays.length - 1].at) : null
  const C = 120
  const r0 = 46
  const len = 56
  return (
    <section className="pf-card">
      <div className="kicker">When you listen</div>
      {clock.total >= 8 ? (
        <>
          <div className="pf-card-big">{clock.persona}</div>
          <div className="pf-card-sub">
            Busiest around <b>{hourLabel(clock.peak)}</b>
          </div>
        </>
      ) : (
        <div className="pf-card-sub">Still learning your hours, this fills in as you listen.</div>
      )}
      <svg className="pf-clock" viewBox="0 0 240 240" aria-hidden="true">
        <circle cx={C} cy={C} r={r0 - 6} className="pf-clock-face" />
        {clock.hours.map((n, h) => {
          const a = (h / 24) * Math.PI * 2 - Math.PI / 2
          const l = 3 + (n / max) * len
          return (
            <line
              key={h}
              x1={C + Math.cos(a) * r0}
              y1={C + Math.sin(a) * r0}
              x2={C + Math.cos(a) * (r0 + l)}
              y2={C + Math.sin(a) * (r0 + l)}
              className={`pf-clock-bar ${h === clock.peak && n ? 'peak' : ''}`}
              style={{ opacity: n ? 0.35 + (n / max) * 0.65 : 0.12 }}
            />
          )
        })}
        {[0, 6, 12, 18].map((h) => {
          const a = (h / 24) * Math.PI * 2 - Math.PI / 2
          return (
            <text key={h} x={C + Math.cos(a) * 26} y={C + Math.sin(a) * 26 + 3.5} className="pf-clock-label">
              {hourLabel(h)}
            </text>
          )
        })}
      </svg>
      <div className="pf-card-foot">
        {history ? `Listening time across ${clock.total.toLocaleString()} plays` : `${clock.total.toLocaleString()} plays`}
        {since ? ` since ${fmtDate(since.getTime())}` : ''}
      </div>
    </section>
  )
}

const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat']

/** day of week × hour of day, ten years deep */
function WeekCard({ history }: { history: History }) {
  // Monday first reads more like a week
  const rows = [1, 2, 3, 4, 5, 6, 0]
  const max = Math.max(...history.week.flat())
  const totals = history.week.map((r) => r.reduce((a, b) => a + b, 0))
  const bestDay = totals.indexOf(Math.max(...totals))
  const quiet = totals.indexOf(Math.min(...totals))
  return (
    <section className="pf-card">
      <div className="kicker">Your week</div>
      <div className="pf-card-big">{['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'][bestDay]}</div>
      <div className="pf-card-sub">
        are your biggest day, <b>{['Sundays', 'Mondays', 'Tuesdays', 'Wednesdays', 'Thursdays', 'Fridays', 'Saturdays'][quiet]}</b> your quietest
      </div>
      <div className="pf-heat">
        {rows.map((d) => (
          <div key={d} className="pf-heat-row">
            <span className="pf-heat-day">{DAYS[d][0]}</span>
            {history.week[d].map((v, h) => (
              <i key={h} style={{ opacity: 0.06 + Math.pow(v / max, 0.8) * 0.94 }} title={`${DAYS[d]} ${hourLabel(h)} · ${hoursText(v)}`} />
            ))}
          </div>
        ))}
        <div className="pf-heat-row pf-heat-axis">
          <span className="pf-heat-day" />
          {['12a', '', '', '', '', '', '6a', '', '', '', '', '', '12p', '', '', '', '', '', '6p', '', '', '', '', ''].map((l, i) => (
            <b key={i}>{l}</b>
          ))}
        </div>
      </div>
      <div className="pf-card-foot">Every hour you’ve listened since {new Date(history.firstTs).getFullYear()}</div>
    </section>
  )
}

function ErasCard({ eras, tracks, view }: { eras: ReturnType<typeof decades>; tracks: TopTrack[]; view: View }) {
  const max = Math.max(1, ...eras.bars.map((b) => b.n))
  const oldest = tracks.find((t) => parseInt(t.year, 10) === eras.oldest)
  if (!eras.bars.length) return null
  return (
    <section className="pf-card">
      <div className="kicker">Where your music’s from</div>
      {eras.median ? (
        <>
          <div className="pf-card-big">{eras.median}</div>
          <div className="pf-card-sub">is the middle of your top songs, {view === 'all' ? 'all-time' : RANGES.find((r) => r.id === view)!.long}</div>
        </>
      ) : null}
      <div className="pf-eras">
        {eras.bars.map((b) => (
          <div key={b.decade} className="pf-era">
            <div className="pf-era-n">{b.n}</div>
            <div className="pf-era-bar" style={{ height: `${(b.n / max) * 100}%` }} />
            <div className="pf-era-label">’{String(b.decade).slice(2)}s</div>
          </div>
        ))}
      </div>
      {oldest && (
        <div className="pf-card-foot">
          Oldest: <b>{oldest.name}</b>, {oldest.year}
        </div>
      )}
    </section>
  )
}

/** a column per year, how much you listened and who to */
function Years({ history }: { history: History }) {
  const max = Math.max(...history.years.map((y) => y.ms))
  const lastDay = fmtDate(history.lastTs)
  return (
    <section className="section">
      <div className="section-row">
        <h2 className="section-title">Your years</h2>
        <span className="section-sub">From your streaming history, through {lastDay}</span>
      </div>
      <div className="pf-nums">
        <Num v={hoursText(history.ms).replace(' hr', ' hours')} label={`${(history.ms / 8.64e7).toFixed(0)} full days of music`} />
        <Num v={history.plays.toLocaleString()} label="plays past 30 seconds" />
        <Num v={`${history.streak.days} days`} label={`longest streak, ${fmtDate(Date.parse(history.streak.from + 'T12:00'), false)} ’${history.streak.from.slice(2, 4)} to ${fmtDate(Date.parse(history.streak.to + 'T12:00'), false)} ’${history.streak.to.slice(2, 4)}`} />
        {history.skipRate != null && <Num v={`${Math.round(history.skipRate * 100)}%`} label="of songs skipped" />}
      </div>
      <div className="pf-years">
        {history.years.map((y) => (
          <div key={y.year} className="pf-year">
            <div className="pf-year-h">{hoursText(y.ms)}</div>
            <div className="pf-year-col">
              <div className="pf-year-bar" style={{ height: `${(y.ms / max) * 100}%` }} />
            </div>
            <div className="pf-year-y">{y.year}</div>
            <div className="pf-year-who">{y.artists[0]?.name}</div>
            {y.track && (
              <button className="pf-year-song" onClick={() => playUris([y.track!.uri])} title={`Play ${y.track.name}`}>
                {y.track.name}
              </button>
            )}
          </div>
        ))}
      </div>
      {history.firstSong && (
        <div className="pf-first">
          The first song in your history: <b>{history.firstSong.name}</b> by {history.firstSong.artist}, {fmtDate(history.firstSong.ts)}.
        </div>
      )}
    </section>
  )
}

/** the covers of your top songs, as one band of color */
function ColorStrip({ tracks, view }: { tracks: TopTrack[]; view: View }) {
  const [, bump] = useState(0)
  const key = tracks.map((t) => t.images.sm ?? '').join()
  useEffect(() => {
    let alive = true
    const todo = tracks.filter((t) => t.images.sm && !cachedPalette(t.images.sm))
    if (!todo.length) return
    Promise.all(todo.map((t) => getPalette(t.images.sm).catch(() => null))).then(() => alive && bump((n) => n + 1))
    return () => {
      alive = false
    }
  }, [key])

  // black and white covers would end the band in a long gray run, so they only
  // get in when there aren't enough colorful ones to fill it
  const all = tracks
    .map((t) => {
      const p = cachedPalette(t.images.sm)
      if (!p) return null
      // the most colorful of the cover's colors, not just the dominant one
      const c = [...p.colors].sort((a, b) => rgbToHsl(...b)[1] - rgbToHsl(...a)[1])[0]
      const [h, s] = rgbToHsl(...c)
      return { t, c, h, s }
    })
    .filter(Boolean) as { t: TopTrack; c: [number, number, number]; h: number; s: number }[]
  const colorful = all.filter((x) => x.s >= 0.15)
  const stripes = (colorful.length >= 12 ? colorful : all).sort((a, b) => a.h - b.h)

  if (stripes.length < 8) return null
  return (
    <section className="section">
      <div className="section-row">
        <h2 className="section-title">Your colors</h2>
        <span className="section-sub">The colors of your top {stripes.length} songs, {view === 'all' ? 'all-time' : RANGES.find((r) => r.id === view)!.long}, sorted by hue</span>
      </div>
      <div className="pf-colors">
        {stripes.map(({ t, c }) => (
          <button key={t.uri} className="pf-stripe" style={{ background: css(c) }} onClick={() => playUris([t.uri])} title={`${t.name} · ${artistsText(t.artists)}`}>
            <Cover images={t.images} size="sm" className="pf-stripe-art" />
          </button>
        ))}
      </div>
    </section>
  )
}

function LogSection({ plays, shortTop }: { plays: Play[]; shortTop?: TopTrack[] }) {
  const liked = useLibrary((s) => s.liked)
  const items = useLibrary((s) => s.items)
  const week = Date.now() - 7 * 86_400_000
  const thisWeek = plays.filter((p) => p.at >= week)
  const repeat = useMemo(() => onRepeat(plays).slice(0, 6), [plays])
  const days = streak(plays)

  // in your top songs this month but not liked and not in any playlist
  const unsaved = useMemo(() => {
    if (!shortTop) return []
    const saved = new Set<string>()
    for (const l of Object.values(items)) for (const id of l.ids) saved.add(id)
    return shortTop.filter((t) => !saved.has(t.id) && !liked.has(t.id)).slice(0, 6)
  }, [shortTop, items, liked])

  if (!plays.length && !unsaved.length) return null
  const firstDay = plays.length ? new Date(plays[plays.length - 1].at) : null
  const loggedDays = firstDay ? (Date.now() - firstDay.getTime()) / 86_400_000 : 0

  return (
    <>
      {plays.length > 0 && (
        <section className="section">
          <div className="section-row">
            <h2 className="section-title">The last 7 days</h2>
            {loggedDays < 7 && firstDay && (
              <span className="section-sub">Counting since {firstDay.toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}, when the live log starts</span>
            )}
          </div>
          <div className="pf-nums">
            <Num v={longDuration(thisWeek.reduce((n, p) => n + p.track.durationMs, 0))} label="listened" />
            <Num v={thisWeek.length.toLocaleString()} label="plays" />
            <Num v={new Set(thisWeek.map((p) => p.track.artists[0]?.id)).size.toLocaleString()} label="artists" />
            <Num v={`${days} ${days === 1 ? 'day' : 'days'}`} label="listening streak" />
          </div>
        </section>
      )}

      {(repeat.length > 0 || unsaved.length > 0) && (
        <div className="pf-grid">
          {repeat.length > 0 && (
            <section className="pf-card">
              <div className="kicker">On repeat</div>
              <div className="pf-card-sub">Most played in the last two weeks</div>
              <div className="pf-mini">
                {repeat.map(({ track, n }) => (
                  <MiniRow key={track.id} t={track} right={<span className="pf-times">×{n}</span>} />
                ))}
              </div>
            </section>
          )}
          {unsaved.length > 0 && (
            <section className="pf-card">
              <div className="kicker">Not saved yet</div>
              <div className="pf-card-sub">In your top songs lately, but not liked or in any playlist</div>
              <div className="pf-mini">
                {unsaved.map((t) => (
                  <MiniRow
                    key={t.id}
                    t={t}
                    right={
                      <button className="icon-btn" data-like onClick={() => setLiked(t, true)} aria-label={`Like ${t.name}`}>
                        <Icon name="heart" size={16} />
                      </button>
                    }
                  />
                ))}
              </div>
            </section>
          )}
        </div>
      )}

      {plays.length > 0 && (
        <section className="section">
          <h2 className="section-title">Recently played</h2>
          <div className="pf-recent">
            {plays.slice(0, 16).map((p) => (
              <MiniRow key={p.at} t={p.track} right={<span className="pf-when">{when(p.at)}</span>} />
            ))}
          </div>
        </section>
      )}
    </>
  )
}

function Num({ v, label }: { v: string; label: string }) {
  return (
    <div className="pf-num">
      <div className="pf-num-v">{v}</div>
      <div className="pf-num-l">{label}</div>
    </div>
  )
}

function MiniRow({ t, right }: { t: Track; right: React.ReactNode }) {
  const current = usePlayer((s) => s.track?.id === t.id)
  return (
    <div className={`pf-row ${current ? 'now' : ''}`} onDoubleClick={() => playUris([t.uri])}>
      <button className="pf-row-art" onClick={() => playUris([t.uri])} aria-label={`Play ${t.name}`}>
        <Cover images={t.images} size="sm" />
        <Icon name="play" size={14} />
      </button>
      <div className="pf-row-text">
        <div className="pf-row-name">{t.name}</div>
        <div className="pf-row-sub">{artistsText(t.artists)}</div>
      </div>
      {right}
    </div>
  )
}

function when(at: number) {
  const d = new Date(at)
  const t = d.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' }).toLowerCase().replace(' ', '')
  const today = new Date()
  const y = new Date()
  y.setDate(y.getDate() - 1)
  if (d.toDateString() === today.toDateString()) return t
  if (d.toDateString() === y.toDateString()) return `Yesterday ${t}`
  return d.toLocaleDateString(undefined, { weekday: 'short', month: 'short', day: 'numeric' })
}
