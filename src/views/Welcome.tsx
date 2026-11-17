// The two screens you see before the app: sign in, and the one-time library pull.

import { useEffect, useState } from 'react'
import { login } from '../lib/auth'
import { useLibrary } from '../lib/library'
import { Glow } from '../components/Glow'
import { Cover } from '../components/Cover'
import { useAmbient } from '../lib/ambient'
import type { Palette } from '../lib/types'

// before you've signed in there's no music, so the room cycles through a few
// album-ish palettes on its own, like songs changing
const SCENES: Palette[] = [
  { colors: [[255, 122, 69], [232, 84, 140], [104, 76, 220], [40, 30, 70]], accent: [255, 150, 110] },
  { colors: [[44, 120, 255], [30, 200, 220], [90, 60, 200], [10, 30, 60]], accent: [120, 180, 255] },
  { colors: [[226, 64, 120], [255, 170, 90], [130, 40, 120], [50, 20, 40]], accent: [255, 120, 160] },
  { colors: [[60, 200, 140], [220, 220, 90], [30, 110, 120], [15, 40, 35]], accent: [130, 230, 170] },
]

export function Login() {
  useEffect(() => {
    let i = 0
    const t = setInterval(() => {
      i = (i + 1) % SCENES.length
      useAmbient.setState({ page: SCENES[i] })
    }, 3800)
    return () => {
      clearInterval(t)
      useAmbient.setState({ page: null })
    }
  }, [])

  return (
    <div className="welcome">
      <Glow />
      <div className="welcome-drag" />
      <div className="welcome-inner">
        <Sun />
        <h1 className="welcome-title">Afterglow</h1>
        <p className="welcome-line">Your Spotify, lit by whatever’s playing.</p>
        <button className="welcome-btn" onClick={login}>
          Connect Spotify
        </button>
        <p className="welcome-fine">Needs Premium. Everything stays on this computer.</p>
      </div>
    </div>
  )
}

/** the app icon's sun, in the room's current colors */
function Sun() {
  return (
    <svg className="welcome-sun" viewBox="0 0 120 92" aria-hidden="true">
      <defs>
        <linearGradient id="sun-g" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#fff" stopOpacity=".95" />
          <stop offset=".35" stopColor="var(--accent)" />
          <stop offset="1" stopColor="var(--tint)" />
        </linearGradient>
      </defs>
      <path d="M14 50 A46 46 0 0 1 106 50 Z" fill="url(#sun-g)" />
      <rect x="6" y="58" width="108" height="7" rx="3.5" fill="var(--accent)" opacity=".9" />
      <rect x="26" y="72" width="68" height="7" rx="3.5" fill="var(--tint)" opacity=".7" />
      <rect x="44" y="86" width="32" height="6" rx="3" fill="var(--tint)" opacity=".45" />
    </svg>
  )
}

/** First sync: watch your library arrive, covers fade in as each playlist lands */
export function FirstSync() {
  const sync = useLibrary((s) => s.sync)
  const order = useLibrary((s) => s.order)
  const playlists = useLibrary((s) => s.playlists)
  const [shown, setShown] = useState(0)

  // reveal covers one at a time so it reads as arriving, not dumping
  useEffect(() => {
    if (shown >= order.length) return
    const t = setTimeout(() => setShown((n) => n + 1), 40)
    return () => clearTimeout(t)
  }, [shown, order.length])

  const pct = sync.playlistsTotal ? sync.playlistsDone / sync.playlistsTotal : 0

  return (
    <div className="welcome sync">
      <Glow />
      <div className="welcome-drag" />
      <div className="sync-wall" aria-hidden="true">
        {order.slice(0, shown).map((id) => (
          <Cover key={id} images={playlists[id].images} size="sm" className="sync-cell" />
        ))}
      </div>
      <div className="welcome-inner">
        <h1 className="welcome-title small">Bringing your library over</h1>
        <p className="welcome-line mono">
          {order.length.toLocaleString()} playlists · {sync.tracks.toLocaleString()} songs
        </p>
        <div className="sync-bar">
          <div style={{ transform: `scaleX(${pct})` }} />
        </div>
        <p className="welcome-fine">Only happens once. After this, everything opens instantly.</p>
        {sync.error && <p className="welcome-err">Something went wrong: {sync.error}</p>}
      </div>
    </div>
  )
}
