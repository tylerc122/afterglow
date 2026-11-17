// ⌘K. Searches your library instantly while you type, Spotify's results
// stream in underneath, and every action in the app is one enter away.

import { useEffect, useMemo, useRef, useState } from 'react'
import { setLiked } from '../lib/actions'
import { api } from '../lib/api'
import { prefetch } from '../lib/images'
import { useLibrary } from '../lib/library'
import * as N from '../lib/normalize'
import { next, playContext, playUris, prev, toggle, toggleShuffle, transferHere, usePlayer } from '../lib/player'
import { go } from '../lib/router'
import type { Images, Track } from '../lib/types'
import { closePalette, toggleNowPlaying, useUI } from '../lib/ui'
import { Cover, LikedCover } from './Cover'
import { Icon } from './Icon'

type Item = {
  key: string
  group: string
  title: string
  sub?: string
  images?: Images
  icon?: string
  liked?: boolean
  round?: boolean
  run: () => void
  hover?: () => void
}

export function CommandPalette() {
  const open = useUI((s) => s.palette)
  if (!open) return null
  return <Palette />
}

function score(hay: string, q: string) {
  const h = hay.toLowerCase()
  const i = h.indexOf(q)
  if (i === -1) return 0
  return (i === 0 ? 3 : h[i - 1] === ' ' ? 2 : 1) + q.length / h.length
}

function Palette() {
  const initial = useUI.getState().paletteQuery
  const [q, setQ] = useState(initial)
  const [sel, setSel] = useState(0)
  const [remote, setRemote] = useState<Item[]>([])
  const input = useRef<HTMLInputElement>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const { order, playlists, tracks, items } = useLibrary.getState()

  useEffect(() => input.current?.focus(), [])

  const actions: Item[] = useMemo(() => {
    const p = usePlayer.getState()
    const a: Item[] = [
      { key: 'a:toggle', group: 'Actions', title: p.paused ? 'Play' : 'Pause', icon: p.paused ? 'play' : 'pause', run: toggle },
      { key: 'a:next', group: 'Actions', title: 'Next song', icon: 'next', run: next },
      { key: 'a:prev', group: 'Actions', title: 'Previous song', icon: 'prev', run: prev },
      { key: 'a:shuffle', group: 'Actions', title: p.trueShuffle ? 'Turn shuffle off' : 'Turn shuffle on', icon: 'shuffle', run: toggleShuffle },
      { key: 'a:np', group: 'Actions', title: 'Open now playing', icon: 'expand', run: () => toggleNowPlaying(true) },
      { key: 'a:here', group: 'Actions', title: 'Play on this computer', icon: 'computer', run: () => transferHere() },
      { key: 'a:home', group: 'Actions', title: 'Go home', icon: 'home', run: () => go('/') },
      { key: 'a:liked', group: 'Actions', title: 'Go to Liked songs', icon: 'heart', run: () => go('/liked') },
    ]
    if (p.track) {
      const t = p.track
      const liked = useLibrary.getState().liked.has(t.id)
      a.splice(1, 0, {
        key: 'a:like',
        group: 'Actions',
        title: liked ? 'Remove current song from Liked' : 'Like current song',
        sub: t.name,
        icon: liked ? 'heartFill' : 'heart',
        run: () => setLiked(t, !liked),
      })
    }
    return a
  }, [])

  // which playlist does each track live in, so playing it keeps its context
  const homeOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const id of order) for (const tid of items[id]?.ids ?? []) if (!m.has(tid)) m.set(tid, playlists[id].uri)
    return m
  }, [])

  const local: Item[] = useMemo(() => {
    const query = q.trim().toLowerCase()
    if (!query) {
      return [
        ...actions.slice(0, 5),
        ...order.slice(0, 6).map((id) => plItem(id)),
      ]
    }
    const pls = order
      .map((id) => ({ id, s: score(playlists[id].name, query) }))
      .filter((x) => x.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 5)
      .map((x) => plItem(x.id))
    const ts: { t: Track; s: number }[] = []
    for (const t of tracks.values()) {
      const s = Math.max(score(t.name, query) * 1.2, ...t.artists.map((a) => score(a.name, query)), score(t.albumName, query) * 0.7)
      if (s > 0) ts.push({ t, s })
    }
    ts.sort((a, b) => b.s - a.s)
    // the same song often lives in the library twice (album version, single, deluxe)
    const seen = new Set<string>()
    const unique = ts.filter(({ t }) => {
      const k = `${t.name.toLowerCase()}|${t.artists[0]?.name.toLowerCase()}`
      if (seen.has(k)) return false
      seen.add(k)
      return true
    })
    const songItems = unique.slice(0, 7).map(({ t }) => trackItem(t, 'In your library', homeOf.get(t.id)))
    const acts = actions.filter((a) => score(a.title, query) > 0).slice(0, 3)
    const liked = score('liked songs', query) > 0 ? [likedItem()] : []
    return [...liked, ...pls, ...songItems, ...acts]
  }, [q])

  function plItem(id: string): Item {
    const p = playlists[id]
    return {
      key: 'p:' + id,
      group: 'Playlists',
      title: p.name,
      sub: `${p.total} songs`,
      images: p.images,
      run: () => go(`/playlist/${id}`),
      hover: () => prefetch(p.images.lg),
    }
  }
  function likedItem(): Item {
    return { key: 'liked', group: 'Playlists', title: 'Liked songs', liked: true, run: () => go('/liked') }
  }
  function trackItem(t: Track, group: string, ctx?: string): Item {
    return {
      key: `t:${group}:${t.id}`,
      group,
      title: t.name,
      sub: t.artists.map((a) => a.name).join(', '),
      images: t.images,
      run: () => (ctx ? playContext(ctx, t.uri) : playUris([t.uri])),
    }
  }

  // Spotify search, debounced, 10 per type is all dev mode gives us now
  useEffect(() => {
    const query = q.trim()
    if (query.length < 2) {
      setRemote([])
      return
    }
    const ctl = { dead: false }
    const timer = setTimeout(async () => {
      try {
        const r = await api<any>('/search', { query: { q: query, type: 'track,album,artist', limit: 5 } })
        if (ctl.dead) return
        const out: Item[] = []
        for (const a of r.artists?.items ?? [])
          out.push({ key: 'ra:' + a.id, group: 'On Spotify', title: a.name, sub: 'Artist', images: N.images(a.images), round: true, run: () => go(`/artist/${a.id}`) })
        for (const t of r.tracks?.items ?? []) {
          const tr = N.track(t)
          if (tr) out.push(trackItem(tr, 'On Spotify'))
        }
        for (const a of r.albums?.items ?? [])
          out.push({ key: 'rl:' + a.id, group: 'On Spotify', title: a.name, sub: `Album · ${(a.artists ?? []).map((x: any) => x.name).join(', ')}`, images: N.images(a.images), run: () => go(`/album/${a.id}`) })
        // artists first, then the best track, then albums, then the rest
        setRemote([...out.filter((x) => x.round).slice(0, 2), ...out.filter((x) => !x.round)].slice(0, 9))
      } catch {}
    }, 220)
    return () => {
      ctl.dead = true
      clearTimeout(timer)
    }
  }, [q])

  const all = [...local, ...remote]
  useEffect(() => setSel(0), [q])
  useEffect(() => {
    listRef.current?.querySelector('.pal-item.sel')?.scrollIntoView({ block: 'nearest' })
  }, [sel])

  const run = (it?: Item) => {
    if (!it) return
    closePalette()
    it.run()
  }

  const onKey = (e: React.KeyboardEvent) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault()
      setSel((s) => Math.min(all.length - 1, s + 1))
    } else if (e.key === 'ArrowUp') {
      e.preventDefault()
      setSel((s) => Math.max(0, s - 1))
    } else if (e.key === 'Enter') {
      e.preventDefault()
      run(all[sel])
    } else if (e.key === 'Escape') {
      closePalette()
    }
  }

  let lastGroup = ''
  return (
    <div className="pal-scrim" onMouseDown={closePalette}>
      <div className="pal" onMouseDown={(e) => e.stopPropagation()}>
        <div className="pal-input">
          <Icon name="search" size={20} />
          <input
            ref={input}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={onKey}
            placeholder="Songs, playlists, artists, or something to do"
            spellCheck={false}
          />
          <kbd>esc</kbd>
        </div>
        <div className="pal-list" ref={listRef}>
          {all.map((it, i) => {
            const header = it.group !== lastGroup ? it.group : null
            lastGroup = it.group
            return (
              <div key={it.key}>
                {header && <div className="pal-group">{header}</div>}
                <button
                  className={`pal-item ${i === sel ? 'sel' : ''}`}
                  onMouseMove={() => {
                    if (sel !== i) setSel(i)
                    it.hover?.()
                  }}
                  onClick={() => run(it)}
                >
                  {it.liked ? (
                    <LikedCover className="pal-art" />
                  ) : it.images ? (
                    <Cover images={it.images} size="sm" round={it.round} className="pal-art" />
                  ) : (
                    <span className="pal-icon">
                      <Icon name={it.icon ?? 'sparkle'} size={17} />
                    </span>
                  )}
                  <span className="pal-text">
                    <span className="pal-title">{it.title}</span>
                    {it.sub && <span className="pal-sub">{it.sub}</span>}
                  </span>
                  {i === sel && <span className="pal-enter">↵</span>}
                </button>
              </div>
            )
          })}
          {!all.length && <div className="pal-empty">Nothing yet…</div>}
        </div>
      </div>
    </div>
  )
}
