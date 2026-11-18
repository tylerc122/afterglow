// Progress that glides on compositor animations (lib/progress), with a slow timer
// for the time text. Drag anywhere to seek, it previews before committing.

import { useLayoutEffect, useRef, useState } from 'react'
import { isActive, onActivity } from '../lib/focus'
import { time } from '../lib/format'
import { positionNow, seek, usePlayer } from '../lib/player'
import { progressAnimator } from '../lib/progress'

export function Scrubber({ large }: { large?: boolean }) {
  const duration = usePlayer((s) => s.track?.durationMs ?? 0)
  const cur = useRef<HTMLSpanElement>(null)
  const bar = useRef<HTMLDivElement>(null)
  const fill = useRef<HTMLDivElement>(null)
  const run = useRef<HTMLDivElement>(null)
  const [drag, setDrag] = useState<number | null>(null)
  const dragRef = useRef<number | null>(null)
  const anim = useRef<ReturnType<typeof progressAnimator> | null>(null)
  const paint = useRef(() => {})

  useLayoutEffect(() => {
    const a = progressAnimator(() => {
      const W = bar.current?.offsetWidth ?? 0
      return [
        { el: fill.current, at: (p) => `scaleX(${p})`, span: W },
        { el: run.current, at: (p) => `translateX(${p * W}px)`, span: W },
      ]
    }, () => dragRef.current)
    anim.current = a

    let lastText = ''
    paint.current = () => {
      const t = time(dragRef.current ?? positionNow())
      if (t !== lastText && cur.current) {
        cur.current.textContent = t
        lastText = t
      }
    }
    let timer = 0
    const loop = () => {
      paint.current()
      timer = window.setTimeout(loop, isActive() ? 250 : 1000)
    }
    a.sync()
    loop()
    const off = onActivity(() => {
      clearTimeout(timer)
      a.sync()
      loop()
    })
    const ro = new ResizeObserver(() => a.sync())
    if (bar.current) ro.observe(bar.current)
    return () => {
      clearTimeout(timer)
      off()
      ro.disconnect()
      a.stop()
    }
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
    paint.current()
    anim.current?.sync()
    const move = (ev: PointerEvent) => {
      dragRef.current = posFromEvent(ev)
      paint.current()
      anim.current?.sync()
    }
    const up = () => {
      const ms = dragRef.current
      dragRef.current = null
      if (ms !== null) seek(ms)
      anim.current?.sync()
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
          <div className="scrub-fill" ref={fill} />
        </div>
        <div className="scrub-run" ref={run}>
          <div className="scrub-thumb" />
        </div>
      </div>
      <span className="scrub-time">{time(duration)}</span>
    </div>
  )
}
