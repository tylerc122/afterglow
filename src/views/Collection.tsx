// Playlist, Liked songs and Album pages. All three read straight from the
// in-memory library, so they render complete on the first frame.

import { useCallback, useEffect, useMemo, useState } from 'react'
import { loadAlbum } from '../lib/actions'
import { longDuration, year } from '../lib/format'
import { isOwned, tracksFor, useLibrary } from '../lib/library'
import { ctxOf, playContext, playShuffled, playUris, toggle, toggleShuffle, usePlayer } from '../lib/player'
import { link } from '../lib/router'
import type { Track } from '../lib/types'
import { Hero, useScroller } from '../components/Hero'
import { Icon } from '../components/Icon'
import { TrackList, type Sort } from '../components/TrackList'

export function PlaylistView({ id }: { id: string }) {
  const p = useLibrary((s) => s.playlists[id])
  const list = useLibrary((s) => s.items[id])
  const tracksMap = useLibrary((s) => s.tracks)
  const me = useLibrary((s) => s.me)
  const tracks = useMemo(() => tracksFor(list), [list, tracksMap])

  if (!p) return <Missing what="playlist" />
  const owned = isOwned(p, me)
  const total = tracks.reduce((a, t) => a + t.durationMs, 0)

  return (
    <Body
      contextUri={p.uri}
      tracks={tracks}
      added={list?.added}
      playlistId={owned ? p.id : undefined}
      unavailable={p.itemsUnavailable}
      hero={
        <Hero kicker={p.collaborative ? 'Collaborative playlist' : 'Playlist'} title={p.name} images={p.images}>
          {p.description && <p className="hero-desc">{p.description}</p>}
          <div className="hero-stats">
            <span>{owned ? (me?.id === p.ownerId ? 'You' : p.ownerName) : p.ownerName}</span>
            <span>{(tracks.length || p.total).toLocaleString()} songs</span>
            {total > 0 && <span>{longDuration(total)}</span>}
          </div>
        </Hero>
      }
    />
  )
}

export function LikedView() {
  const list = useLibrary((s) => s.items.liked)
  const tracksMap = useLibrary((s) => s.tracks)
  const me = useLibrary((s) => s.me)
  const tracks = useMemo(() => tracksFor(list), [list, tracksMap])
  const total = tracks.reduce((a, t) => a + t.durationMs, 0)
  return (
    <Body
      contextUri={me ? `${me.uri}:collection` : null}
      tracks={tracks}
      added={list?.added}
      hero={
        <Hero kicker="Collection" title="Liked songs" liked>
          <div className="hero-stats">
            <span>{tracks.length.toLocaleString()} songs</span>
            {total > 0 && <span>{longDuration(total)}</span>}
          </div>
        </Hero>
      }
    />
  )
}

export function AlbumView({ id }: { id: string }) {
  const album = useLibrary((s) => s.albums[id])
  const tracksMap = useLibrary((s) => s.tracks)
  const [err, setErr] = useState(false)
  useEffect(() => {
    if (!album) loadAlbum(id).catch(() => setErr(true))
  }, [id, album])
  const tracks = useMemo(
    () => (album ? (album.trackIds.map((t) => tracksMap.get(t)).filter(Boolean) as Track[]) : []),
    [album, tracksMap],
  )
  if (err) return <Missing what="album" />
  if (!album) return <Skeleton />
  const total = tracks.reduce((a, t) => a + t.durationMs, 0)
  return (
    <Body
      contextUri={album.uri}
      tracks={tracks}
      variant="album"
      hero={
        <Hero kicker={album.type === 'single' ? 'Single' : album.type === 'compilation' ? 'Compilation' : 'Album'} title={album.name} images={album.images}>
          <div className="hero-stats">
            <span>
              {album.artists.map((a, i) => (
                <span key={a.id}>
                  {i > 0 && ', '}
                  <a href={`/artist/${a.id}`} onClick={link(`/artist/${a.id}`)}>
                    {a.name}
                  </a>
                </span>
              ))}
            </span>
            <span>{year(album.releaseDate)}</span>
            <span>{tracks.length} songs</span>
            {total > 0 && <span>{longDuration(total)}</span>}
          </div>
        </Hero>
      }
    />
  )
}

function Body({
  hero,
  tracks,
  added,
  contextUri,
  playlistId,
  variant = 'playlist',
  unavailable,
}: {
  hero: React.ReactNode
  tracks: Track[]
  added?: string[]
  contextUri: string | null
  playlistId?: string
  variant?: 'playlist' | 'album'
  unavailable?: boolean
}) {
  const scroller = useScroller()
  const playingHere = usePlayer((s) => !!contextUri && ctxOf(s) === contextUri)
  const paused = usePlayer((s) => s.paused)
  const shuffle = usePlayer((s) => s.trueShuffle)
  const [filter, setFilter] = useState('')
  const [sort, setSort] = useState<Sort>({ key: 'custom', dir: 1 })

  const onPlay = useCallback(
    (t: Track, i: number) => {
      if (contextUri) playContext(contextUri, t.uri)
      else playUris(tracks.map((x) => x.uri), i)
    },
    [contextUri, tracks],
  )

  const playAll = () => {
    if (playingHere) return toggle()
    if (contextUri) playContext(contextUri)
    else playUris(tracks.map((t) => t.uri))
  }

  return (
    <div className="page">
      {hero}
      <div className="actions">
        <button className="play-xl" onClick={playAll} aria-label={playingHere && !paused ? 'Pause' : 'Play'}>
          <Icon name={playingHere && !paused ? 'pause' : 'play'} size={24} />
        </button>
        <button
          className={`icon-btn lg toggle ${shuffle ? 'on' : ''}`}
          onClick={() => (playingHere || !contextUri ? toggleShuffle() : playShuffled(contextUri))}
          aria-label={playingHere ? 'Shuffle' : 'Shuffle play'}
          title={playingHere ? (shuffle ? 'Shuffle off' : 'Shuffle on') : 'Shuffle play'}
        >
          <Icon name="shuffle" size={22} />
        </button>
        <div className="actions-spacer" />
        {tracks.length > 12 && (
          <label className="find">
            <Icon name="search" size={16} />
            <input placeholder="Find in list" value={filter} onChange={(e) => setFilter(e.target.value)} spellCheck={false} />
            {filter && (
              <button onClick={() => setFilter('')} aria-label="Clear">
                <Icon name="close" size={14} />
              </button>
            )}
          </label>
        )}
      </div>
      {unavailable && !tracks.length ? (
        <div className="notice">
          <p>Spotify doesn’t share the song list for playlists you don’t own anymore.</p>
          <p className="muted">It still plays fine, hit play and the player will show what’s on.</p>
        </div>
      ) : (
        <TrackList
          tracks={tracks}
          added={added}
          variant={variant}
          filter={filter}
          sort={sort}
          onSort={variant === 'playlist' ? setSort : undefined}
          onPlay={onPlay}
          playlistId={playlistId}
          scroller={scroller}
        />
      )}
    </div>
  )
}

export function Missing({ what }: { what: string }) {
  return (
    <div className="page">
      <div className="notice big">
        <p>Couldn’t find that {what}.</p>
        <a href="/" onClick={link('/')}>
          Back home
        </a>
      </div>
    </div>
  )
}

export function Skeleton() {
  return (
    <div className="page">
      <header className="hero skeleton">
        <div className="hero-art cover" />
        <div className="hero-meta">
          <div className="sk sk-kicker" />
          <div className="sk sk-title" />
          <div className="sk sk-line" />
        </div>
      </header>
    </div>
  )
}
