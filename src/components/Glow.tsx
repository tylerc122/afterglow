// The signature: a slow field of light behind everything, colored by the art.
// Drawn on a tiny canvas (bilinear upscaling does the blur for free) at ~30fps,
// colors ease toward the new palette over a second and a half.

import { useEffect, useRef } from 'react'
import { currentPalette, useAmbient } from '../lib/ambient'
import type { RGB } from '../lib/types'
import { useUI } from '../lib/ui'

const W = 72
const H = 46

export function Glow() {
  const ref = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = ref.current!
    const ctx = canvas.getContext('2d')!
    let cur: RGB[] = currentPalette().colors.map((c) => [...c] as RGB)
    let target = cur
    let intensity = useAmbient.getState().intensity
    let raf = 0
    let last = 0

    const unsub = useAmbient.subscribe((s) => {
      target = currentPalette(s).colors
    })

    // each blob drifts on its own slow lissajous path
    const blobs = [
      { x: 0.22, y: 0.3, r: 0.62, sx: 0.00011, sy: 0.00007, ph: 0 },
      { x: 0.78, y: 0.25, r: 0.55, sx: 0.00008, sy: 0.00012, ph: 2 },
      { x: 0.6, y: 0.85, r: 0.6, sx: 0.0001, sy: 0.00009, ph: 4 },
      { x: 0.15, y: 0.9, r: 0.45, sx: 0.00013, sy: 0.00006, ph: 1 },
    ]

    const frame = (t: number) => {
      raf = requestAnimationFrame(frame)
      if (t - last < 33) return
      // fully covered by the now playing screen, nothing to draw for
      if (useUI.getState().nowPlaying && document.querySelector('.np.open')?.getAnimations().length === 0) return
      const dt = Math.min(t - last, 100)
      last = t
      const k = 1 - Math.exp(-dt / 450)
      cur = cur.map((c, i) => c.map((v, j) => v + (target[i][j] - v) * k) as RGB)
      intensity += (useAmbient.getState().intensity - intensity) * k

      ctx.globalCompositeOperation = 'source-over'
      ctx.fillStyle = '#08080a'
      ctx.fillRect(0, 0, W, H)
      ctx.globalCompositeOperation = 'lighter'
      blobs.forEach((b, i) => {
        const x = (b.x + Math.sin(t * b.sx + b.ph) * 0.14) * W
        const y = (b.y + Math.cos(t * b.sy + b.ph) * 0.12) * H
        const r = b.r * W * (1 + Math.sin(t * 0.00015 + b.ph) * 0.06)
        const [cr, cg, cb] = cur[i]
        const a = intensity * (i === 0 ? 0.9 : 0.62)
        const g = ctx.createRadialGradient(x, y, 0, x, y, r)
        g.addColorStop(0, `rgba(${cr | 0},${cg | 0},${cb | 0},${a})`)
        g.addColorStop(0.55, `rgba(${cr | 0},${cg | 0},${cb | 0},${a * 0.32})`)
        g.addColorStop(1, `rgba(${cr | 0},${cg | 0},${cb | 0},0)`)
        ctx.fillStyle = g
        ctx.fillRect(0, 0, W, H)
      })
    }
    raf = requestAnimationFrame(frame)

    const vis = () => {
      cancelAnimationFrame(raf)
      if (document.visibilityState === 'visible') raf = requestAnimationFrame(frame)
    }
    document.addEventListener('visibilitychange', vis)
    return () => {
      cancelAnimationFrame(raf)
      unsub()
      document.removeEventListener('visibilitychange', vis)
    }
  }, [])

  return (
    <div className="glow" aria-hidden="true">
      <canvas ref={ref} width={W} height={H} />
      <div className="glow-vignette" />
      <div className="glow-grain" />
    </div>
  )
}
