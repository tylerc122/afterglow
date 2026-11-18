// The signature: a slow field of light behind everything, colored by the art.
// Drawn on a tiny canvas (bilinear upscaling does the blur for free) at ~15fps,
// colors ease toward the new palette over a second and a half.

import { useEffect, useRef } from 'react'
import { currentPalette, useAmbient } from '../lib/ambient'
import { isActive, onActivity } from '../lib/focus'
import type { RGB } from '../lib/types'
import { useUI } from '../lib/ui'

const W = 72
const H = 46

/** `boost` brightens it (the now playing screen), `main` is the one behind the app */
export function Glow({ main = true, boost = 1, className = '' }: { main?: boolean; boost?: number; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    let cur: RGB[] = currentPalette().colors.map((c) => [...c] as RGB)
    let target = cur
    let intensity = useAmbient.getState().intensity
    let timer = 0
    let last = performance.now()
    // the blobs' own clock, only ticks while drawing, so a frozen glow picks up
    // where it left off instead of jumping
    let clock = 0

    const unsub = useAmbient.subscribe((s) => {
      target = currentPalette(s).colors
      wake()
    })

    // each blob drifts on its own slow lissajous path
    const blobs = [
      { x: 0.22, y: 0.3, r: 0.62, sx: 0.00011, sy: 0.00007, ph: 0 },
      { x: 0.78, y: 0.25, r: 0.55, sx: 0.00008, sy: 0.00012, ph: 2 },
      { x: 0.6, y: 0.85, r: 0.6, sx: 0.0001, sy: 0.00009, ph: 4 },
      { x: 0.15, y: 0.9, r: 0.45, sx: 0.00013, sy: 0.00006, ph: 1 },
    ]

    /** draws one frame, returns whether the colors are still easing somewhere */
    const draw = () => {
      const now = performance.now()
      const dt = Math.min(now - last, 100)
      last = now
      clock += dt
      const t = clock
      const k = 1 - Math.exp(-dt / 450)
      let moving = false
      cur = cur.map(
        (c, i) =>
          c.map((v, j) => {
            const d = target[i][j] - v
            if (Math.abs(d) > 0.5) moving = true
            return v + d * k
          }) as RGB,
      )
      const want = useAmbient.getState().intensity
      if (Math.abs(want - intensity) > 0.002) moving = true
      intensity += (want - intensity) * k

      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = '#08080a'
      ctx.fillRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'lighter'
      blobs.forEach((b, i) => {
        const x = (b.x + Math.sin(t * b.sx + b.ph) * 0.14) * W
        const y = (b.y + Math.cos(t * b.sy + b.ph) * 0.12) * H
        const r = b.r * W * (1 + Math.sin(t * 0.00015 + b.ph) * 0.06)
        const [cr, cg, cb] = cur[i]
        const a = Math.min(1, intensity * boost * (i === 0 ? 0.9 : 0.62))
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, `rgba(${cr | 0},${cg | 0},${cb | 0},${a})`)
        g.addColorStop(0.55, `rgba(${cr | 0},${cg | 0},${cb | 0},${a * 0.32})`)
        g.addColorStop(1, `rgba(${cr | 0},${cg | 0},${cb | 0},0)`)
        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H)
      })
      return moving
    }

    // ~15fps while you're looking (the drift is slow enough that more is wasted on the
    // blurs layered over it), and when the window's in the background it only runs
    // until a palette change finishes easing in, then stops
    const step = () => {
      timer = 0
      if (document.visibilityState !== 'visible') return
      // fully covered by the now playing screen, nothing to draw for, check back later
      if (main && useUI.getState().nowPlaying && document.querySelector('.np.open')?.getAnimations().length === 0) {
        last = performance.now()
        timer = window.setTimeout(step, 300)
        return
      }
      const moving = draw()
      if (isActive()) timer = window.setTimeout(step, 66)
      else if (moving) timer = window.setTimeout(step, 100)
    }
    function wake() {
      if (timer) return
      last = performance.now()
      timer = window.setTimeout(step, 0)
    }
    draw()
    wake()

    const offActivity = onActivity(wake)
    document.addEventListener('visibilitychange', wake)
    return () => {
      clearTimeout(timer)
      unsub()
      offActivity()
      document.removeEventListener('visibilitychange', wake)
    }
  }, [])

  return (
    <div className={`glow ${className}`} aria-hidden="true">
      <canvas ref={ref} width={W} height={H} />
      <div className="glow-vignette" />
      <div className="glow-grain" />
    </div>
  )
}
