// Spotify took away artist top tracks, so this page leans on what's yours:
// the songs by this artist that live in your playlists, ranked by how many
// of your playlists they show up in. Then the discography.

import { useEffect, useMemo, useState } from 'react'
import { artistFresh, loadArtist } from '../lib/actions'
import { year } from '../lib/format'
import { prefetch } from '../lib/images'
import { useLibrary } from '../lib/library'
import { playContext, playUris } from '../lib/player'
import { link } from '../lib/router'
import type { Track } from '../lib/types'
import { Cover } from '../components/Cover'
import { Hero, useScroller } from '../components/Hero'
import { Icon } from '../components/Icon'
import { TrackList } from '../components/TrackList'
import { Missing, Skeleton } from './Collection'

export function ArtistView({ id }: { id: string }) {
  const artist = useLibrary((s) => s.artists[id])
  const items = useLibrary((s) => s.items)
  const tracks = useLibrary((s) => s.tracks)
  const scroller = useScroller()
  const [err, setErr] = useState(false)
  const [showAll, setShowAll] = useState(false)

  useEffect(() => {
    if (!artistFresh(id)) loadArtist(id).catch(() => !artist && setErr(true))
  }, [id, artist])

  const yours = useMemo(() => {
    const count = new Map<string, number>()
    for (const list of Object.values(items))
      for (const tid of new Set(list.ids)) {
        const t = tracks.get(tid)
        if (t?.artists.some((a) => a.id === id)) count.set(tid, (count.get(tid) ?? 0) + 1)
      }
    return [...count.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([tid]) => tracks.get(tid)!)
      .filter(Boolean)
  }, [items, tracks, id])

  if (err) return <Missing what="artist" />
  if (!artist) return <Skeleton />

  const shown = showAll ? yours : yours.slice(0, 8)
  const play = (t: Track, i: number) => playUris(shown.map((x) => x.uri), i)

  return (
    <div className="page">
      <Hero kicker="Artist" title={artist.name} images={artist.images} round>
        <div className="hero-stats">
          {artist.genres.slice(0, 3).map((g) => (
            <span key={g}>{g}</span>
          ))}
          {yours.length > 0 && <span>{yours.length} of their songs in your library</span>}
        </div>
      </Hero>

      <div className="actions">
        <button className="play-xl" onClick={() => playContext(artist.uri)} aria-label={`Play ${artist.name}`}>
          <Icon name="play" size={24} />
        </button>
      </div>

      {yours.length > 0 && (
        <section className="section">
          <h2 className="section-title">In your library</h2>
          <TrackList tracks={shown} variant="compact" onPlay={play} scroller={scroller} />
          {yours.length > 8 && (
            <button className="text-btn" onClick={() => setShowAll(!showAll)}>
              {showAll ? 'Show less' : `Show all ${yours.length}`}
            </button>
          )}
        </section>
      )}

      {!!artist.albums?.length && (
        <section className="section">
          <h2 className="section-title">Discography</h2>
          <div className="tiles">
            {artist.albums.map((a) => (
              <a key={a.id} className="tile" href={`/album/${a.id}`} onClick={link(`/album/${a.id}`)} onMouseEnter={() => prefetch(a.images.lg)}>
                <Cover images={a.images} size="md" className="tile-art" />
                <div className="tile-name">{a.name}</div>
                <div className="tile-sub">
                  {year(a.releaseDate)} · {a.type}
                </div>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  )
}
