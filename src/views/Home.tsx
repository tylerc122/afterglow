// Home. No algorithmic shelves (Spotify took those away anyway). Instead:
// a greeting, the places you were just in, and the spectrum, every playlist
// you've made laid out by the color of its cover.

import { memo, useEffect, useState } from 'react'
import { api } from '../lib/api'
import { useAmbient } from '../lib/ambient'
import { cachedPalette, css, getPalette, rgbToHsl } from '../lib/colors'
import { greeting } from '../lib/format'
import { prefetch } from '../lib/images'
import { isOwned, useLibrary } from '../lib/library'
import { playContext, usePlayer } from '../lib/player'
import { go, link } from '../lib/router'
import type { Images, Playlist } from '../lib/types'
import { useUI } from '../lib/ui'
import { Cover, LikedCover } from '../components/Cover'
import { Icon } from '../components/Icon'

type Recent = { uri: string; kind: 'playlist' | 'album' | 'artist' | 'collection'; id: string; name: string; images: Images; sub?: string }

const RECENT_KEY = 'afterglow.recent'
function loadRecent(): Recent[] {
  try {
    return JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]')
  } catch {
    return []
  }
}

export function Home() {
  const me = useLibrary((s) => s.me)
  const order = useLibrary((s) => s.order)
  const playlists = useLibrary((s) => s.playlists)
  const track = usePlayer((s) => s.track)
  const [recent, setRecent] = useState<Recent[]>(loadRecent)

  useEffect(() => {
    useUI.setState({ topTitle: '', showTopTitle: false })
    useAmbient.setState({ page: null })
  }, [])

  useEffect(() => {
    api<any>('/me/player/recently-played', { query: { limit: 50 } })
      .then((r) => {
        const seen = new Set<string>()
        const out: Recent[] = []
        const pls = useLibrary.getState().playlists
        for (const it of r?.items ?? []) {
          const ctx = it.context
          if (!ctx?.uri || seen.has(ctx.uri)) continue
          seen.add(ctx.uri)
          const id = ctx.uri.split(':').pop()
          if (ctx.type === 'playlist' && pls[id]) {
            out.push({ uri: ctx.uri, kind: 'playlist', id, name: pls[id].name, images: pls[id].images, sub: `Playlist · ${pls[id].total} songs` })
          } else if (ctx.type === 'album') {
            const a = it.track.album
            out.push({ uri: ctx.uri, kind: 'album', id: a.id, name: a.name, images: imgs(a.images), sub: `Album · ${a.artists?.[0]?.name ?? ''}` })
          } else if (ctx.type === 'collection') {
            out.push({ uri: ctx.uri, kind: 'collection', id: 'liked', name: 'Liked songs', images: {}, sub: 'Collection' })
          }
          if (out.length === 6) break
        }
        setRecent(out)
        try {
          localStorage.setItem(RECENT_KEY, JSON.stringify(out))
        } catch {}
      })
      .catch(() => {})
  }, [])

  const tiles: Recent[] = recent.length
    ? recent
    : order.slice(0, 6).map((id) => ({ uri: playlists[id].uri, kind: 'playlist', id, name: playlists[id].name, images: playlists[id].images, sub: `Playlist · ${playlists[id].total} songs` }))

  const first = me?.name.split(' ')[0]
  const today = new Date().toLocaleDateString(undefined, { weekday: 'long', month: 'long', day: 'numeric' })

  return (
    <div className="page home">
      <section className="home-hero">
        <div className="kicker">{today}</div>
        <h1 className="display display-lg">
          {greeting()}
          {first ? <span className="home-name">, {first}</span> : null}
        </h1>
        <p className="home-line">
          {track ? (
            <>
              The room’s lit by <b>{track.name}</b>.
            </>
          ) : (
            'Play something and the room takes its color.'
          )}
        </p>
      </section>

      {tiles.length > 0 && (
        <section className="section">
          <h2 className="section-title">Jump back in</h2>
          <div className="jump">
            {tiles.map((t) => (
              <JumpTile key={t.uri} t={t} />
            ))}
          </div>
        </section>
      )}

      <Spectrum playlists={order.map((id) => playlists[id]).filter((p) => p && isOwned(p, me) && p.images.sm)} />
    </div>
  )
}

function imgs(list: { url: string; width: number }[]): Images {
  const s = [...(list ?? [])].sort((a, b) => a.width - b.width)
  return { sm: s[0]?.url, md: s[1]?.url ?? s[0]?.url, lg: s[s.length - 1]?.url }
}

function JumpTile({ t }: { t: Recent }) {
  const path = t.kind === 'collection' ? '/liked' : `/${t.kind}/${t.id}`
  const pal = cachedPalette(t.images.sm)
  return (
    <a
      className="jump-tile"
      href={path}
      onClick={link(path)}
      onMouseEnter={() => {
        prefetch(t.images.lg)
        getPalette(t.images.sm)
      }}
      style={pal ? { ['--tile' as any]: css(pal.colors[0], 0.5) } : undefined}
    >
      {t.kind === 'collection' ? <LikedCover className="jump-art" /> : <Cover images={t.images} size="md" className="jump-art" />}
      <span className="jump-text">
        <span className="jump-name">{t.name}</span>
        {t.sub && <span className="jump-sub">{t.sub}</span>}
      </span>
      <button
        className="jump-play"
        onClick={(e) => {
          e.preventDefault()
          e.stopPropagation()
          playContext(t.uri)
        }}
        aria-label={`Play ${t.name}`}
      >
        <Icon name="play" size={18} />
      </button>
    </a>
  )
}

/** every playlist, sorted around the color wheel */
function Spectrum({ playlists }: { playlists: Playlist[] }) {
  const [, bump] = useState(0)

  // read colors for any covers we haven't seen yet, a few per idle tick
  useEffect(() => {
    let alive = true
    const todo = playlists.filter((p) => !cachedPalette(p.images.sm))
    if (!todo.length) return
    let i = 0
    const step = async () => {
      const batch = todo.slice(i, i + 8)
      i += 8
      await Promise.all(batch.map((p) => getPalette(p.images.sm)))
      if (!alive) return
      bump((n) => n + 1)
      if (i < todo.length) setTimeout(step, 30)
    }
    step()
    return () => {
      alive = false
    }
  }, [playlists.length])

  // cheap enough to redo every render, and it has to re-sort as colors arrive
  const sorted = (() => {
    const withColor = playlists.map((p) => {
      const pal = cachedPalette(p.images.sm)
      const [h, s, l] = pal ? rgbToHsl(...pal.colors[0]) : [0, 0, 0]
      return { p, h, s, l, has: !!pal }
    })
    const colorful = withColor.filter((x) => x.has && x.s > 0.18).sort((a, b) => a.h - b.h)
    const muted = withColor.filter((x) => x.has && x.s <= 0.18).sort((a, b) => b.l - a.l)
    const unknown = withColor.filter((x) => !x.has)
    return [...colorful, ...muted, ...unknown].map((x) => x.p)
  })()

  if (playlists.length < 4) return null
  return (
    <section className="section">
      <div className="section-row">
        <h2 className="section-title">Your spectrum</h2>
        <span className="section-sub">Everything you’ve made, sorted by the color of its cover</span>
      </div>
      <div className="spectrum">
        {sorted.map((p) => (
          <SpectrumCell key={p.id} p={p} />
        ))}
      </div>
    </section>
  )
}

const SpectrumCell = memo(function SpectrumCell({ p }: { p: Playlist }) {
  return (
    <a
      className="spec"
      href={`/playlist/${p.id}`}
      onClick={(e) => {
        e.preventDefault()
        go(`/playlist/${p.id}`)
      }}
      onMouseEnter={() => prefetch(p.images.lg)}
      title={p.name}
    >
      <Cover images={p.images} size="md" className="spec-art" />
      <span className="spec-name">{p.name}</span>
    </a>
  )
})
