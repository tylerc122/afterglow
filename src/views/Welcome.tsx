// The two screens you see before the app: sign in, and the one-time library pull.

import { useEffect, useState } from 'react'
import { login } from '../lib/auth'
import { useLibrary } from '../lib/library'
import { Glow } from '../components/Glow'
import { Cover } from '../components/Cover'

export function Login() {
  return (
    <div className="welcome">
      <Glow />
      <div className="welcome-drag" />
      <div className="welcome-inner">
        <span className="welcome-orb" />
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
