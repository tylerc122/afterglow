// What the room is lit by. The current song wins; with nothing playing,
// whatever you're looking at lights the room instead.

import { create } from 'zustand'
import { DEFAULT_PALETTE, css } from './colors'
import type { Palette } from './types'

type Ambient = {
  track: Palette | null
  page: Palette | null
  /** 0..1, bumped up in the now playing view */
  intensity: number
}

export const useAmbient = create<Ambient>(() => ({ track: null, page: null, intensity: 0.72 }))

export const currentPalette = (s: Ambient = useAmbient.getState()) => s.track ?? s.page ?? DEFAULT_PALETTE

// push the accent into CSS so every component can just use var(--accent)
useAmbient.subscribe((s) => {
  const p = currentPalette(s)
  const root = document.documentElement.style
  root.setProperty('--accent', css(p.accent))
  root.setProperty('--tint', css(p.colors[0]))
})
