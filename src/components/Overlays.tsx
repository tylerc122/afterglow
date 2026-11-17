// Right-click menu, toasts, and the top bar. The small stuff around the edges.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { addToPlaylist, removeFromPlaylist, setLiked } from '../lib/actions'
import { isOwned, useLibrary } from '../lib/library'
import { addToQueue, playUris } from '../lib/player'
import { back, forward, go, link, useRouter } from '../lib/router'
import { toast, useToasts } from '../lib/toast'
import { closeMenu, useUI } from '../lib/ui'
import { Cover } from './Cover'
import { Icon } from './Icon'

export function ContextMenu() {
  const menu = useUI((s) => s.menu)
  const liked = useLibrary((s) => (menu ? s.liked.has(menu.track.id) : false))
  const order = useLibrary((s) => s.order)
  const playlists = useLibrary((s) => s.playlists)
  const me = useLibrary((s) => s.me)
  const ref = useRef<HTMLDivElement>(null)
  const [sub, setSub] = useState(false)
  const [q, setQ] = useState('')
  const [pos, setPos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    setSub(false)
    setQ('')
  }, [menu])

  // keep the menu on screen
  useLayoutEffect(() => {
    if (!menu || !ref.current) return
    const r = ref.current.getBoundingClientRect()
    setPos({
      x: Math.min(menu.x, window.innerWidth - r.width - 12),
      y: Math.min(menu.y, window.innerHeight - r.height - 12),
    })
  }, [menu, sub])

  useEffect(() => {
    if (!menu) return
    const close = (e: Event) => {
      if (ref.current && e.target instanceof Node && ref.current.contains(e.target)) return
      closeMenu()
    }
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && closeMenu()
    window.addEventListener('mousedown', close)
    window.addEventListener('keydown', esc)
    window.addEventListener('blur', closeMenu)
    return () => {
      window.removeEventListener('mousedown', close)
      window.removeEventListener('keydown', esc)
      window.removeEventListener('blur', closeMenu)
    }
  }, [menu])

  const mine = useMemo(
    () => order.map((id) => playlists[id]).filter((p) => p && isOwned(p, me) && p.name.toLowerCase().includes(q.toLowerCase())),
    [order, playlists, me, q],
  )

  if (!menu) return null
  const t = menu.track
  const act = (fn: () => void) => () => {
    closeMenu()
    fn()
  }

  return (
    <div className="menu" ref={ref} style={{ left: pos.x, top: pos.y }} onContextMenu={(e) => e.preventDefault()}>
      {!sub ? (
        <>
          <div className="menu-head">
            <Cover images={t.images} size="sm" className="menu-art" />
            <div>
              <div className="menu-title">{t.name}</div>
              <div className="menu-sub">{t.artists.map((a) => a.name).join(', ')}</div>
            </div>
          </div>
          <button className="menu-item" onClick={act(() => playUris([t.uri]))}>
            <Icon name="play" size={16} /> Play just this
          </button>
          <button className="menu-item" onClick={act(() => addToQueue(t.uri).then(() => toast('Added to queue')).catch(() => toast('Nothing’s playing to queue onto')))}>
            <Icon name="queue" size={16} /> Add to queue
          </button>
          <button className="menu-item" onClick={act(() => setLiked(t, !liked))}>
            <Icon name={liked ? 'heartFill' : 'heart'} size={16} /> {liked ? 'Remove from Liked songs' : 'Save to Liked songs'}
          </button>
          <button className="menu-item" onClick={() => setSub(true)}>
            <Icon name="plus" size={16} /> Add to playlist <span className="menu-arrow">›</span>
          </button>
          <div className="menu-sep" />
          <button className="menu-item" onClick={act(() => go(`/album/${t.albumId}`))}>
            <Icon name="album" size={16} /> Go to album
          </button>
          {t.artists.slice(0, 2).map((a) => (
            <button key={a.id} className="menu-item" onClick={act(() => go(`/artist/${a.id}`))}>
              <Icon name="user" size={16} /> Go to {a.name}
            </button>
          ))}
          <button
            className="menu-item"
            onClick={act(() => navigator.clipboard.writeText(`https://open.spotify.com/track/${t.id}`).then(() => toast('Link copied')))}
          >
            <Icon name="link" size={16} /> Copy link
          </button>
          {menu.playlistId !== undefined && menu.index !== undefined && (
            <>
              <div className="menu-sep" />
              <button className="menu-item danger" onClick={act(() => removeFromPlaylist(menu.playlistId!, menu.index!))}>
                <Icon name="trash" size={16} /> Remove from this playlist
              </button>
            </>
          )}
        </>
      ) : (
        <>
          <button className="menu-item back" onClick={() => setSub(false)}>
            <Icon name="back" size={16} /> Add to playlist
          </button>
          <input className="menu-find" autoFocus placeholder="Find a playlist" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="menu-scroll">
            {mine.map((p) => (
              <button key={p.id} className="menu-item" onClick={act(() => addToPlaylist(p.id, [t]))}>
                <Cover images={p.images} size="sm" className="menu-pl-art" /> {p.name}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

export function Toasts() {
  const list = useToasts((s) => s.list)
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className="toast">
          {t.text}
        </div>
      ))}
    </div>
  )
}

export function Topbar() {
  const title = useUI((s) => s.topTitle)
  const show = useUI((s) => s.showTopTitle)
  const depth = useRouter((s) => s.depth)
  const maxDepth = useRouter((s) => s.maxDepth)
  const me = useLibrary((s) => s.me)
  const syncing = useLibrary((s) => s.sync.running)
  const syncErr = useLibrary((s) => s.sync.error)

  return (
    <div className={`top ${show ? 'solid' : ''}`}>
      <div className="top-nav">
        <button className="round-btn" onClick={back} disabled={depth <= 0} aria-label="Back">
          <Icon name="back" size={18} />
        </button>
        <button className="round-btn" onClick={forward} disabled={depth >= maxDepth} aria-label="Forward">
          <Icon name="forward" size={18} />
        </button>
      </div>
      <div className={`top-title ${show ? 'in' : ''}`}>{title}</div>
      <div className="top-right">
        <span className={`sync-dot ${syncing ? 'on' : ''} ${syncErr ? 'err' : ''}`} title={syncErr ? `Sync failed: ${syncErr}` : syncing ? 'Syncing with Spotify' : 'Up to date'} />
        <a href="/you" onClick={link('/you')} className="avatar-link" aria-label="Your profile">
          {me?.image ? <img className="avatar" src={me.image} alt={me.name} crossOrigin="anonymous" /> : <span className="avatar">{me?.name?.[0] ?? '·'}</span>}
        </a>
      </div>
    </div>
  )
}
