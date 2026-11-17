// UI-only state: overlays, menus, the title that slides into the top bar.

import { create } from 'zustand'
import type { Track } from './types'

export type MenuState = {
  x: number
  y: number
  track: Track
  /** set when the track was opened from a playlist we can edit */
  playlistId?: string
  index?: number
} | null

type UI = {
  nowPlaying: boolean
  palette: boolean
  paletteQuery: string
  panel: 'queue' | 'devices' | null
  menu: MenuState
  topTitle: string
  showTopTitle: boolean
}

export const useUI = create<UI>(() => ({
  nowPlaying: false,
  palette: false,
  paletteQuery: '',
  panel: null,
  menu: null,
  topTitle: '',
  showTopTitle: false,
}))

export const openPalette = (q = '') => useUI.setState({ palette: true, paletteQuery: q, menu: null })
export const closePalette = () => useUI.setState({ palette: false })
export const toggleNowPlaying = (v?: boolean) =>
  useUI.setState((s) => ({ nowPlaying: v ?? !s.nowPlaying, panel: null, menu: null }))
export const togglePanel = (p: 'queue' | 'devices') => useUI.setState((s) => ({ panel: s.panel === p ? null : p }))
export const openMenu = (m: MenuState) => useUI.setState({ menu: m })
export const closeMenu = () => useUI.setState({ menu: null })
