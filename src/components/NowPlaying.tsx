// The full screen moment. The cover flies up from the player bar (FLIP), the
// room's light turns up. The art holds still.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { setLiked } from '../lib/actions'
import { useAmbient } from '../lib/ambient'
import { css, usePalette } from '../lib/colors'
import { useLibrary } from '../lib/library'
import { ctxOf, cycleRepeat, next, prev, toggle, toggleShuffle, usePlayer } from '../lib/player'
import { go } from '../lib/router'
import { toggleNowPlaying, useUI } from '../lib/ui'
import { Cover } from './Cover'
import { Icon } from './Icon'
import { Scrubber } from './Scrubber'
import { Glow } from './Glow'

export function NowPlaying() {
  const open = useUI((s) => s.nowPlaying)
  const [mounted, setMounted] = useState(open)

  useEffect(() => {
    if (open) setMounted(true)
    useAmbient.setState({ intensity: open ? 1 : 0.72 })
  }, [open])

  if (!mounted) return null
  return <Stage open={open} onClosed={() => setMounted(false)} />
}

function Stage({ open, onClosed }: { open: boolean; onClosed: () => void }) {
  const track = usePlayer((s) => s.track)
  const paused = usePlayer((s) => s.paused)
  const shuffle = usePlayer((s) => s.trueShuffle)
  const repeat = usePlayer((s) => s.repeat)
  const nextUp = usePlayer((s) => s.nextUp)
  const contextUri = usePlayer(ctxOf)
  const playlists = useLibrary((s) => s.playlists)
  const liked = useLibrary((s) => (track ? s.liked.has(track.id) : false))
  const pal = usePalette(track?.images.sm)
  const art = useRef<HTMLDivElement>(null)
  const root = useRef<HTMLDivElement>(null)

  // FLIP: start the big cover where the little one is, then let it fly
  useLayoutEffect(() => {
    const from = document.querySelector('.pill-art')?.getBoundingClientRect()
    const el = art.current
    if (!el) return
    if (open) {
      if (from) {
        const to = el.getBoundingClientRect()
        const s = from.width / to.width
        el.animate(
          [
            { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${s})`, borderRadius: '24px' },
            { transform: 'none', borderRadius: '14px' },
          ],
          { duration: 520, easing: 'cubic-bezier(.2,.8,.2,1)' },
        )
      }
      root.current?.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'ease-out' })
    } else {
      const anim = root.current?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 200, easing: 'ease-in', fill: 'forwards' })
      if (from) {
        const to = el.getBoundingClientRect()
        el.animate(
          [{ transform: 'none' }, { transform: `translate(${from.left - to.left}px, ${from.top - to.top}px) scale(${from.width / to.width})` }],
          { duration: 220, easing: 'cubic-bezier(.4,0,.6,1)', fill: 'forwards' },
        )
      }
      if (anim) anim.onfinish = onClosed
      else onClosed()
    }
  }, [open])

  const ctxId = contextUri?.split(':').pop()
  const ctxName = contextUri?.includes(':playlist:') && ctxId ? playlists[ctxId]?.name : contextUri?.endsWith(':collection') ? 'Liked songs' : null

  return (
    <div
      className={`np ${open ? 'open' : 'closing'}`}
      ref={root}
      style={{ ['--np1' as any]: css(pal.colors[0], 0.55), ['--np2' as any]: css(pal.colors[1], 0.4) }}
    >
      <Glow main={false} className="np-glow" />
      <div className="np-drag" />
      <button className="np-close icon-btn" onClick={() => toggleNowPlaying(false)} aria-label="Close now playing">
        <Icon name="collapse" size={18} />
      </button>

      <div className="np-stage">
        <div className="np-art" ref={art}>
          {track && <Cover images={track.images} size="lg" />}
          <div className="np-sheen" />
        </div>

        <div className="np-info">
          {ctxName && <div className="kicker">From {ctxName}</div>}
          <h1 className="np-title">{track?.name ?? 'Nothing playing'}</h1>
          <div className="np-artist">
            {track?.artists.map((a, i) => (
              <span key={a.id + i}>
                {i > 0 && ', '}
                <button
                  className="link-btn"
                  onClick={() => {
                    toggleNowPlaying(false)
                    go(`/artist/${a.id}`)
                  }}
                >
                  {a.name}
                </button>
              </span>
            ))}
            {track && (
              <>
                <span className="dot">·</span>
                <button
                  className="link-btn muted"
                  onClick={() => {
                    toggleNowPlaying(false)
                    go(`/album/${track.albumId}`)
                  }}
                >
                  {track.albumName}
                </button>
              </>
            )}
          </div>

          <Scrubber large />

          <div className="np-controls">
            <button className={`icon-btn toggle ${shuffle ? 'on' : ''}`} onClick={toggleShuffle} aria-label="Shuffle">
              <Icon name="shuffle" size={22} />
            </button>
            <button className="icon-btn lg" onClick={prev} aria-label="Previous">
              <Icon name="prev" size={28} />
            </button>
            <button className="play-xl np-play" onClick={toggle} aria-label={paused ? 'Play' : 'Pause'}>
              <Icon name={paused ? 'play' : 'pause'} size={30} />
            </button>
            <button className="icon-btn lg" onClick={next} aria-label="Next">
              <Icon name="next" size={28} />
            </button>
            <button className={`icon-btn toggle ${repeat !== 'off' ? 'on' : ''}`} onClick={cycleRepeat} aria-label="Repeat">
              <Icon name="repeat" size={22} />
              {repeat === 'track' && <span className="repeat-one">1</span>}
            </button>
          </div>
          {track && (
            <button className={`np-like ${liked ? 'on' : ''}`} onClick={() => setLiked(track, !liked)}>
              <Icon name={liked ? 'heartFill' : 'heart'} size={17} />
              {liked ? 'In Liked songs' : 'Save to Liked songs'}
            </button>
          )}
        </div>
      </div>

      {nextUp.length > 0 && (
        <aside className="np-next">
          <div className="kicker">Up next</div>
          {nextUp.slice(0, 2).map((t, i) => (
            <div className="mini-row" key={t.uri + i}>
              <Cover images={t.images} size="sm" className="mini-art" />
              <div className="mini-text">
                <div className="mini-name">{t.name}</div>
                <div className="mini-sub">{t.artists.map((a) => a.name).join(', ')}</div>
              </div>
            </div>
          ))}
        </aside>
      )}
    </div>
  )
}
