// When the song changes, a small tag slides up out of the island, right next to
// the cover, with the new title. It holds a few seconds (longer while you hover
// it) and tucks back in. Enough to notice, not enough to interrupt.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useLibrary } from '../lib/library'
import { ctxOf, usePlayer, type NowTrack } from '../lib/player'
import { useUI } from '../lib/ui'

const HOLD = 3600

export function SongMoment() {
  const [shown, setShown] = useState<NowTrack | null>(null)
  const [out, setOut] = useState(false)
  const last = useRef<string | null | undefined>(undefined)
  const timer = useRef<number>()
  const hovering = useRef(false)

  // the first song we see is just where you left off, not a change
  useEffect(
    () =>
      usePlayer.subscribe((s) => {
        const id = s.track?.id ?? null
        if (last.current === undefined) {
          last.current = id
          return
        }
        if (id === last.current) return
        last.current = id
        if (!s.track || useUI.getState().nowPlaying || document.visibilityState !== 'visible') return
        setOut(false)
        setShown(s.track)
        schedule(HOLD)
      }),
    [],
  )

  function schedule(ms: number) {
    clearTimeout(timer.current)
    timer.current = window.setTimeout(() => !hovering.current && setOut(true), ms)
  }
  useEffect(() => () => clearTimeout(timer.current), [])

  if (!shown) return null
  return (
    <Tag
      track={shown}
      out={out}
      onEnter={() => (hovering.current = true)}
      onLeave={() => {
        hovering.current = false
        schedule(1200)
      }}
      onGone={() => {
        setShown(null)
        setOut(false)
      }}
    />
  )
}

function Tag({ track, out, onEnter, onLeave, onGone }: { track: NowTrack; out: boolean; onEnter: () => void; onLeave: () => void; onGone: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  const contextUri = usePlayer(ctxOf)
  const playlists = useLibrary((s) => s.playlists)
  const ctxId = contextUri?.split(':').pop()
  const from = contextUri?.includes(':playlist:') && ctxId ? playlists[ctxId]?.name : contextUri?.endsWith(':collection') ? 'Liked songs' : null

  // sit just above the island, lined up with where the title starts
  useLayoutEffect(() => {
    const pill = document.querySelector('.pill')?.getBoundingClientRect()
    const el = ref.current
    if (!pill || !el) return
    el.style.left = `${pill.left + 120}px`
    el.style.bottom = `${window.innerHeight - pill.top + 16}px`
  }, [track.id])

  return (
    <div
      ref={ref}
      className={`song-tag ${out ? 'out' : ''}`}
      onMouseEnter={onEnter}
      onMouseLeave={onLeave}
      onAnimationEnd={(e) => e.animationName === 'tag-out' && onGone()}
    >
      <span className="song-tag-k">{from ? `Now playing · ${from}` : 'Now playing'}</span>
      <span className="song-tag-t" key={track.id}>
        <b>{track.name}</b>
        <span> · {track.artists.map((a) => a.name).join(', ')}</span>
      </span>
    </div>
  )
}
