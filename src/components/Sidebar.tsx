import { memo, useMemo, useState } from 'react'
import { prefetch } from '../lib/images'
import { isOwned, useLibrary } from '../lib/library'
import { ctxOf, playShuffled, usePlayer } from '../lib/player'
import { link, useRouter } from '../lib/router'
import { openPalette } from '../lib/ui'
import { Cover, LikedCover } from './Cover'
import { Icon } from './Icon'

export function Sidebar() {
  const route = useRouter((s) => s.route)
  const order = useLibrary((s) => s.order)
  const playlists = useLibrary((s) => s.playlists)
  const me = useLibrary((s) => s.me)
  const items = useLibrary((s) => s.items)
  const likedCount = items.liked?.ids.length ?? 0
  const contextUri = usePlayer(ctxOf)
  const paused = usePlayer((s) => s.paused)
  const [filter, setFilter] = useState('')
  const [mine, setMine] = useState(false)

  const list = useMemo(() => {
    const q = filter.trim().toLowerCase()
    return order
      .map((id) => playlists[id])
      .filter((p) => p && (!q || p.name.toLowerCase().includes(q)) && (!mine || isOwned(p, me)))
  }, [order, playlists, filter, mine, me])

  const activeId = route.name === 'playlist' ? route.id : null
  const likedPlaying = !!contextUri?.endsWith(':collection')

  return (
    <aside className="side">
      <div className="side-drag" />

      <nav className="side-nav">
        <a href="/" onClick={link('/')} className={`nav-item ${route.name === 'home' ? 'active' : ''}`}>
          <Icon name="home" size={19} />
          Home
        </a>
        <button className="nav-item" onClick={() => openPalette()}>
          <Icon name="search" size={19} />
          Search
          <kbd>⌘K</kbd>
        </button>
        <a href="/you" onClick={link('/you')} className={`nav-item ${route.name === 'profile' ? 'active' : ''}`}>
          {me?.image ? <img className="nav-avatar" src={me.image} alt="" crossOrigin="anonymous" /> : <Icon name="user" size={19} />}
          You
        </a>
      </nav>

      <div className="side-head">
        <span className="kicker">Library</span>
        <div className="side-chips">
          <button className={`chip ${!mine ? 'on' : ''}`} onClick={() => setMine(false)}>
            All
          </button>
          <button className={`chip ${mine ? 'on' : ''}`} onClick={() => setMine(true)}>
            Made by me
          </button>
        </div>
        <input className="side-filter" placeholder="Filter playlists" value={filter} onChange={(e) => setFilter(e.target.value)} spellCheck={false} />
      </div>

      <div className="side-list">
        {!filter && (
          <a
            href="/liked"
            onClick={link('/liked')}
            onDoubleClick={() => me && playShuffled(`${me.uri}:collection`)}
            title="Double-click to shuffle"
            className={`lib-row ${route.name === 'liked' ? 'active' : ''}`}
          >
            <LikedCover className="lib-art" />
            <div className="lib-text">
              <div className="lib-name">Liked songs</div>
              <div className="lib-sub">{likedCount.toLocaleString()} songs</div>
            </div>
            {likedPlaying && <Eq paused={paused} />}
          </a>
        )}
        {list.map((p) => (
          <Row
            key={p.id}
            id={p.id}
            uri={p.uri}
            name={p.name}
            sub={isOwned(p, me) ? `${(items[p.id]?.ids.length ?? p.total).toLocaleString()} songs` : `by ${p.ownerName}`}
            images={p.images}
            active={p.id === activeId}
            playing={contextUri === p.uri}
            paused={paused}
          />
        ))}
        {!list.length && filter && <div className="side-empty">Nothing called “{filter}”</div>}
      </div>
    </aside>
  )
}

const Row = memo(function Row(p: {
  id: string
  uri: string
  name: string
  sub: string
  images: { sm?: string; lg?: string }
  active: boolean
  playing: boolean
  paused: boolean
}) {
  return (
    <a
      href={`/playlist/${p.id}`}
      onClick={link(`/playlist/${p.id}`)}
      onMouseEnter={() => prefetch(p.images.lg)}
      onDoubleClick={() => playShuffled(p.uri)}
      title="Double-click to shuffle"
      className={`lib-row ${p.active ? 'active' : ''} ${p.playing ? 'playing' : ''}`}
    >
      <Cover images={p.images} size="sm" className="lib-art" />
      <div className="lib-text">
        <div className="lib-name">{p.name}</div>
        <div className="lib-sub">{p.sub}</div>
      </div>
      {p.playing && <Eq paused={p.paused} />}
    </a>
  )
})

/** three bars, the universal "this is playing" mark */
export function Eq({ paused }: { paused: boolean }) {
  return (
    <span className={`eq ${paused ? 'paused' : ''}`} aria-label={paused ? 'Paused' : 'Playing'}>
      <i />
      <i />
      <i />
    </span>
  )
}
