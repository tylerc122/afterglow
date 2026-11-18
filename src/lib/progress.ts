// Smooth progress bars for nearly free. Every moving part of a progress bar is a
// transform that's linear in the playhead, so on each play/pause/seek/track change we
// hand the compositor one animation from here to the end of the song and it moves the
// thing on its own: no JS per frame, no repaints.
//
// The animations step once per screen pixel instead of every frame. A playhead only
// crawls a few pixels a second, and every frame the pill changes the GPU redoes its
// backdrop blur, so a 120fps glide cost ~25% GPU to draw sub-pixel moves nobody sees.

import { positionNow, usePlayer } from './player'

export type Part = {
  el: Element | null | undefined
  /** e.g. '::before', for animating a pseudo element */
  pseudo?: string
  /** the transform at fraction `p` of the song, must be linear in p */
  at: (p: number) => string
  /** how many css px this part moves over the whole song, for the per-pixel steps */
  span: number
}

export function progressAnimator(parts: () => Part[], drag: () => number | null = () => null) {
  let anims: Animation[] = []

  /** rebuild the animations from where the song is right now */
  const sync = () => {
    anims.forEach((a) => a.cancel())
    anims = []
    const s = usePlayer.getState()
    const d = s.track?.durationMs ?? 0
    const dragged = drag()
    const pos = dragged ?? positionNow()
    const p = d ? Math.min(pos / d, 1) : 0
    const running = !!d && !s.paused && dragged === null && p < 1
    for (const part of parts()) {
      if (!part.el) continue
      const steps = Math.max(1, Math.ceil(part.span * (1 - p) * devicePixelRatio))
      const a = part.el.animate([{ transform: part.at(p) }, { transform: part.at(running ? 1 : p) }], {
        duration: running ? d - pos : 1,
        easing: `steps(${steps}, jump-end)`,
        fill: 'forwards',
        pseudoElement: part.pseudo,
      })
      if (!running) a.pause()
      anims.push(a)
    }
  }

  const unsub = usePlayer.subscribe((s, prev) => {
    if (s.paused !== prev.paused || s.track?.id !== prev.track?.id || s.position !== prev.position || s.stamp !== prev.stamp) sync()
  })

  return {
    sync,
    stop() {
      unsub()
      anims.forEach((a) => a.cancel())
    },
  }
}
