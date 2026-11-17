// Progress that moves every frame without re-rendering React: a rAF loop writes
// straight to the DOM. Drag anywhere to seek, it previews before committing.

import { useEffect, useRef, useState } from 'react'
import { time } from '../lib/format'
import { positionNow, seek, usePlayer } from '../lib/player'

export function Scrubber({ large }: { large?: boolean }) {
  const duration = usePlayer((s) => s.track?.durationMs ?? 0)
  const cur = useRef<HTMLSpanElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const dragRef = useRef<number | null>(null)

  useEffect(() => {
    let raf = 0
    let lastText = ''
    const tick = () => {
      raf = requestAnimationFrame(tick)
      const d = usePlayer.getState().track?.durationMs ?? 0
      const p = dragRef.current ?? positionNow()
      const pct = d ? (p / d) * 100 : 0
      bar.current?.style.setProperty('--p', String(pct / 100))
      const t = time(p)
      if (t !== lastText && cur.current) {
        cur.current.textContent = t
        lastText = t
      }
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  const posFromEvent = (e: PointerEvent | React.PointerEvent) => {
    const r = bar.current!.getBoundingClientRect()
    return Math.min(Math.max((e.clientX - r.left) / r.width, 0), 1) * duration
  }

  const onDown = (e: React.PointerEvent) => {
    if (!duration) return
    const p = posFromEvent(e)
    dragRef.current = p
    setDrag(p)
    const move = (ev: PointerEvent) => {
      dragRef.current = posFromEvent(ev)
    }
    const up = () => {
      if (dragRef.current !== null) seek(dragRef.current)
      dragRef.current = null
      setDrag(null)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className={`scrub ${large ? 'large' : ''} ${drag !== null ? 'dragging' : ''}`}>
      <span className="scrub-time" ref={cur}>
        0:00
      </span>
      <div className="scrub-bar" ref={bar} onPointerDown={onDown}>
        <div className="scrub-track">
          <div className="scrub-fill" />
        </div>
        <div className="scrub-thumb" />
      </div>
      <span className="scrub-time">{time(duration)}</span>
    </div>
  )
}
