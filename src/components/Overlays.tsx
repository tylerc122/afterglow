// Right-click menu, toasts, and the top bar. The small stuff around the edges.

import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { addToPlaylist, removeManyFromPlaylist, setLiked } from '../lib/actions'
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
  const panel = useRef<HTMLDivElement>(null)
  const addItem = useRef<HTMLButtonElement>(null)
  const flyout = useRef<HTMLDivElement>(null)
  const closeTimer = useRef<number>()
  const [sub, setSub] = useState(false)
  const [q, setQ] = useState('')
  const [pos, setPos] = useState({ x: 0, y: 0 })
  const [subPos, setSubPos] = useState({ x: 0, y: 0 })

  useEffect(() => {
    setSub(false)
    setQ('')
  }, [menu])

  // keep the menu on screen
  useLayoutEffect(() => {
    if (!menu || !panel.current) return
    const r = panel.current.getBoundingClientRect()
    setPos({
      x: Math.min(menu.x, window.innerWidth - r.width - 12),
      y: Math.min(menu.y, window.innerHeight - r.height - 12),
    })
  }, [menu])

  // the playlist flyout sits beside its row, flipping left if there's no room on the right
  useLayoutEffect(() => {
    if (!sub || !panel.current || !addItem.current || !flyout.current) return
    const m = panel.current.getBoundingClientRect()
    const it = addItem.current.getBoundingClientRect()
    const f = flyout.current.getBoundingClientRect()
    const right = m.right - 4
    setSubPos({
      x: right + f.width > window.innerWidth - 12 ? m.left - f.width + 4 : right,
      y: Math.max(12, Math.min(it.top - 6, window.innerHeight - f.height - 12)),
    })
  }, [sub, pos])

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

  useEffect(() => () => clearTimeout(closeTimer.current), [])

  const mine = useMemo(
    () => order.map((id) => playlists[id]).filter((p) => p && isOwned(p, me) && p.name.toLowerCase().includes(q.toLowerCase())),
    [order, playlists, me, q],
  )

  if (!menu) return null
  const t = menu.track
  const many = menu.tracks && menu.tracks.length > 1 ? menu.tracks : null
  const picked = many ?? [t]
  const act = (fn: () => void) => () => {
    closeMenu()
    fn()
  }

  // hover opens the flyout right away, leaving it for another row closes it after a beat
  // so cutting diagonally across to the flyout doesn't snap it shut
  const openSub = () => {
    clearTimeout(closeTimer.current)
    setSub(true)
  }
  const keepSub = () => clearTimeout(closeTimer.current)
  const dropSub = () => {
    clearTimeout(closeTimer.current)
    closeTimer.current = window.setTimeout(() => setSub(false), 220)
  }
  const item = { onMouseEnter: dropSub }

  const queueAll = async () => {
    try {
      for (const x of picked) await addToQueue(x.uri)
      toast(many ? `Added ${many.length} songs to queue` : 'Added to queue')
    } catch {
      toast('Nothing’s playing to queue onto')
    }
  }

  return (
    <div ref={ref} onContextMenu={(e) => e.preventDefault()}>
      <div className="menu" ref={panel} style={{ left: pos.x, top: pos.y }}>
        {many ? (
          <div className="menu-head">
            <div className="menu-stack">
              <Cover images={many[1].images} size="sm" className="menu-art" />
              <Cover images={t.images} size="sm" className="menu-art" />
            </div>
            <div>
              <div className="menu-title">{many.length.toLocaleString()} songs</div>
              <div className="menu-sub">
                {t.name} and {(many.length - 1).toLocaleString()} more
              </div>
            </div>
          </div>
        ) : (
          <div className="menu-head">
            <Cover images={t.images} size="sm" className="menu-art" />
            <div>
              <div className="menu-title">{t.name}</div>
              <div className="menu-sub">{t.artists.map((a) => a.name).join(', ')}</div>
            </div>
          </div>
        )}
        <button className="menu-item" {...item} onClick={act(() => playUris(picked.map((x) => x.uri)))}>
          <Icon name="play" size={16} /> {many ? 'Play these' : 'Play just this'}
        </button>
        <button className="menu-item" {...item} onClick={act(queueAll)}>
          <Icon name="queue" size={16} /> Add to queue
        </button>
        {!many && (
          <button className="menu-item" {...item} onClick={act(() => setLiked(t, !liked))}>
            <Icon name={liked ? 'heartFill' : 'heart'} size={16} /> {liked ? 'Remove from Liked songs' : 'Save to Liked songs'}
          </button>
        )}
        <button
          ref={addItem}
          className={`menu-item ${sub ? 'open' : ''}`}
          onMouseEnter={openSub}
          onClick={openSub}
        >
          <Icon name="plus" size={16} /> Add to playlist <span className="menu-arrow">›</span>
        </button>
        {!many && (
          <>
            <div className="menu-sep" />
            <button className="menu-item" {...item} onClick={act(() => go(`/album/${t.albumId}`))}>
              <Icon name="album" size={16} /> Go to album
            </button>
            {t.artists.slice(0, 2).map((a) => (
              <button key={a.id} className="menu-item" {...item} onClick={act(() => go(`/artist/${a.id}`))}>
                <Icon name="user" size={16} /> Go to {a.name}
              </button>
            ))}
            <button
              className="menu-item"
              {...item}
              onClick={act(() => navigator.clipboard.writeText(`https://open.spotify.com/track/${t.id}`).then(() => toast('Link copied')))}
            >
              <Icon name="link" size={16} /> Copy link
            </button>
          </>
        )}
        {menu.playlistId !== undefined && (
          <>
            <div className="menu-sep" />
            <button className="menu-item danger" {...item} onClick={act(() => removeManyFromPlaylist(menu.playlistId!, picked))}>
              <Icon name="trash" size={16} /> {many ? `Remove ${many.length.toLocaleString()} from this playlist` : 'Remove from this playlist'}
              <span className="menu-key">⌘⌫</span>
            </button>
          </>
        )}
      </div>
      {sub && (
        <div className="menu menu-flyout" ref={flyout} style={{ left: subPos.x, top: subPos.y }} onMouseEnter={keepSub}>
          <input className="menu-find" autoFocus placeholder="Find a playlist" value={q} onChange={(e) => setQ(e.target.value)} />
          <div className="menu-scroll">
            {mine.map((p) => (
              <button key={p.id} className="menu-item" onClick={act(() => addToPlaylist(p.id, picked))}>
                <Cover images={p.images} size="sm" className="menu-pl-art" /> {p.name}
              </button>
            ))}
            {!mine.length && <div className="menu-none">{q ? 'No playlists match' : 'No playlists of yours yet'}</div>}
          </div>
        </div>
      )}
    </div>
  )
}

export function Toasts() {
  const list = useToasts((s) => s.list)
  return (
    <div className="toasts" aria-live="polite">
      {list.map((t) => (
        <div key={t.id} className={`toast ${t.images || t.action ? 'rich' : ''}`} style={{ animationDuration: `${t.ms}ms` }}>
          {t.images && <Cover images={t.images} size="sm" className="toast-art" />}
          <span className="toast-text">{t.text}</span>
          {t.action && (
            <button className="toast-action" onClick={t.action.run}>
              {t.action.label}
            </button>
          )}
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
