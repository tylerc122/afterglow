// Images are the thing that makes a click feel instant or not.
// We keep a set of URLs we know are decoded, prefetch on hover, and warm
// every playlist cover into the HTTP cache while the app is idle.

import { useLibrary } from './library'

const ready = new Set<string>()
const pending = new Map<string, Promise<void>>()

export const isReady = (url?: string) => !!url && ready.has(url)

export function prefetch(url?: string): Promise<void> {
  if (!url) return Promise.resolve()
  if (ready.has(url)) return Promise.resolve()
  let p = pending.get(url)
  if (!p) {
    const img = new Image()
    // every <img> in the app is crossorigin too, so this lands in the same cache entry
    // the color extractor and the visible covers use
    img.crossOrigin = 'anonymous'
    img.decoding = 'async'
    img.src = url
    p = img
      .decode()
      .then(() => void ready.add(url))
      .catch(() => {})
      .finally(() => pending.delete(url))
    pending.set(url, p)
  }
  return p
}

export function markReady(url?: string) {
  if (url) ready.add(url)
}

const idle = (fn: () => void) =>
  'requestIdleCallback' in window ? requestIdleCallback(fn, { timeout: 2000 }) : setTimeout(fn, 50)

/** Pull every playlist's header-size cover into the browser cache, a few at a time when idle */
export function warmCovers() {
  const { order, playlists } = useLibrary.getState()
  const urls = order.flatMap((id) => [playlists[id]?.images.sm, playlists[id]?.images.lg]).filter(Boolean) as string[]
  let i = 0
  const step = () => {
    const batch = urls.slice(i, i + 6)
    i += 6
    if (!batch.length) return
    Promise.all(batch.map(prefetch)).then(() => idle(step))
  }
  idle(step)
}
