// Pull a small palette out of album art. Runs on a 24px downscale so it's ~1ms,
// results are cached in memory + IndexedDB so each cover is only ever read once.

import { useEffect, useState } from 'react'
import { db } from './db'
import type { Palette, RGB } from './types'

export const DEFAULT_PALETTE: Palette = {
  colors: [
    [255, 122, 69],
    [232, 84, 140],
    [104, 76, 220],
    [40, 30, 70],
  ],
  accent: [255, 150, 110],
}

const mem = new Map<string, Palette>()
const inflight = new Map<string, Promise<Palette>>()
let dbLoaded: Promise<void> | null = null

function loadDb() {
  dbLoaded ??= db.colors.toArray().then((rows) => {
    for (const r of rows) mem.set(r.url, r.palette)
  })
  return dbLoaded
}
loadDb()

export const cachedPalette = (url?: string) => (url ? mem.get(url) : undefined)

export function getPalette(url?: string): Promise<Palette> {
  if (!url) return Promise.resolve(DEFAULT_PALETTE)
  const hit = mem.get(url)
  if (hit) return Promise.resolve(hit)
  let p = inflight.get(url)
  if (!p) {
    p = loadDb()
      .then(() => mem.get(url) ?? extract(url))
      .then((pal) => {
        if (!mem.has(url)) {
          mem.set(url, pal)
          db.colors.put({ url, palette: pal })
        }
        return pal
      })
      .catch(() => DEFAULT_PALETTE)
      .finally(() => inflight.delete(url))
    inflight.set(url, p)
  }
  return p
}

export function usePalette(url?: string): Palette {
  const [pal, setPal] = useState<Palette>(() => cachedPalette(url) ?? DEFAULT_PALETTE)
  useEffect(() => {
    let alive = true
    const hit = cachedPalette(url)
    if (hit) setPal(hit)
    else getPalette(url).then((p) => alive && setPal(p))
    return () => {
      alive = false
    }
  }, [url])
  return pal
}

// ---- extraction ----

const canvas = typeof document !== 'undefined' ? document.createElement('canvas') : null

function extract(url: string): Promise<Palette> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => {
      try {
        resolve(fromImage(img))
      } catch (e) {
        reject(e)
      }
    }
    img.onerror = reject
    img.src = url
  })
}

function fromImage(img: HTMLImageElement): Palette {
  const S = 24
  canvas!.width = S
  canvas!.height = S
  const ctx = canvas!.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, S, S)
  const data = ctx.getImageData(0, 0, S, S).data

  // bucket by coarse hue/sat/light so similar pixels pile up together
  const buckets = new Map<string, { n: number; r: number; g: number; b: number; s: number; l: number }>()
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i + 1], b = data[i + 2]
    const [h, s, l] = rgbToHsl(r, g, b)
    const key = s < 0.12 ? `g${Math.round(l * 4)}` : `${Math.round(h * 12) % 12}:${Math.round(s * 2)}:${Math.round(l * 3)}`
    const bk = buckets.get(key) ?? { n: 0, r: 0, g: 0, b: 0, s: 0, l: 0 }
    bk.n++, (bk.r += r), (bk.g += g), (bk.b += b), (bk.s += s), (bk.l += l)
    buckets.set(key, bk)
  }

  const cands = [...buckets.values()].map((b) => {
    const rgb: RGB = [b.r / b.n, b.g / b.n, b.b / b.n]
    const s = b.s / b.n
    const l = b.l / b.n
    // favor colorful, mid-light clusters, but let big flat areas still count
    const score = b.n * (0.25 + s * 1.6) * (1 - Math.abs(l - 0.5) * 0.9)
    return { rgb, s, l, score }
  })
  cands.sort((a, b) => b.score - a.score)

  const picked: RGB[] = []
  for (const c of cands) {
    if (picked.every((p) => dist(p, c.rgb) > 55)) picked.push(c.rgb)
    if (picked.length === 4) break
  }
  while (picked.length < 4) picked.push(picked[picked.length - 1] ?? DEFAULT_PALETTE.colors[picked.length])

  // glow colors need to read as light on a near-black room: lift dark ones, keep their hue
  const colors = picked.map((c) => tune(c, 0.5, 0.42, 0.62))
  const most = [...cands].sort((a, b) => b.s * b.score - a.s * a.score)[0]
  const accent = tune(most?.rgb ?? picked[0], 0.55, 0.66, 0.78)
  return { colors, accent }
}

function tune(rgb: RGB, minS: number, minL: number, maxL: number): RGB {
  let [h, s, l] = rgbToHsl(...rgb)
  if (s > 0.08) s = Math.max(s, minS)
  l = Math.min(Math.max(l, minL), maxL)
  return hslToRgb(h, s, l)
}

const dist = (a: RGB, b: RGB) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2])

export function rgbToHsl(r: number, g: number, b: number): [number, number, number] {
  r /= 255, g /= 255, b /= 255
  const max = Math.max(r, g, b), min = Math.min(r, g, b)
  const l = (max + min) / 2
  if (max === min) return [0, 0, l]
  const d = max - min
  const s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
  let h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return [h / 6, s, l]
}

export function hslToRgb(h: number, s: number, l: number): RGB {
  if (s === 0) return [l * 255, l * 255, l * 255]
  const q = l < 0.5 ? l * (1 + s) : l + s - l * s
  const p = 2 * l - q
  const f = (t: number) => {
    if (t < 0) t += 1
    if (t > 1) t -= 1
    if (t < 1 / 6) return p + (q - p) * 6 * t
    if (t < 1 / 2) return q
    if (t < 2 / 3) return p + (q - p) * (2 / 3 - t) * 6
    return p
  }
  return [f(h + 1 / 3) * 255, f(h) * 255, f(h - 1 / 3) * 255]
}

export const css = (c: RGB, a = 1) => `rgba(${c[0] | 0},${c[1] | 0},${c[2] | 0},${a})`
export const hueOf = (c: RGB) => rgbToHsl(...c)[0]
