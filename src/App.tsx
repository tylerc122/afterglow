import { useEffect, useState } from 'react'
import { useAmbient } from './lib/ambient'
import { getPalette } from './lib/colors'
import { useLibrary } from './lib/library'
import { next, prev, seek, positionNow, toggle, usePlayer, setVolume } from './lib/player'
import { back, forward, setScroller, useRouter } from './lib/router'
import { setLiked } from './lib/actions'
import { openPalette, toggleNowPlaying, useUI } from './lib/ui'
import { Glow } from './components/Glow'
import { Sidebar } from './components/Sidebar'
import { PlayerBar } from './components/PlayerBar'
import { NowPlaying } from './components/NowPlaying'
import { SongMoment } from './components/SongMoment'
import { CommandPalette } from './components/CommandPalette'
import { ContextMenu, Toasts, Topbar } from './components/Overlays'
import { ScrollerCtx } from './components/Hero'
import { Home } from './views/Home'
import { AlbumView, LikedView, PlaylistView } from './views/Collection'
import { ArtistView } from './views/ArtistView'
import { FirstSync } from './views/Welcome'
import { Profile } from './views/Profile'

export function App() {
  const route = useRouter((s) => s.route)
  const path = useRouter((s) => s.path)
  const firstRun = useLibrary((s) => s.lastSync === 0 && s.sync.firstRun)
  const [scroller, setEl] = useState<HTMLElement | null>(null)

  useTrackLight()
  useShortcuts()

  if (firstRun) return <FirstSync />

  return (
    <ScrollerCtx.Provider value={scroller}>
      <div className="app">
        <Glow />
        <Sidebar />
        <main
          className="main"
          ref={(el) => {
            setScroller(el)
            if (el !== scroller) setEl(el)
          }}
        >
          <Topbar />
          <div className="view" key={path}>
            {route.name === 'home' && <Home />}
            {route.name === 'liked' && <LikedView />}
            {route.name === 'playlist' && <PlaylistView id={route.id} />}
            {route.name === 'album' && <AlbumView id={route.id} />}
            {route.name === 'artist' && <ArtistView id={route.id} />}
            {route.name === 'profile' && <Profile />}
          </div>
        </main>
        <SongMoment />
        <PlayerBar />
        <NowPlaying />
        <CommandPalette />
        <ContextMenu />
        <Toasts />
      </div>
    </ScrollerCtx.Provider>
  )
}

/** the current song's art lights the room */
function useTrackLight() {
  const art = usePlayer((s) => s.track?.images.sm)
  useEffect(() => {
    if (!art) {
      useAmbient.setState({ track: null })
      return
    }
    let alive = true
    getPalette(art).then((p) => alive && useAmbient.setState({ track: p }))
    return () => {
      alive = false
    }
  }, [art])
}

function useShortcuts() {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const typing = (e.target as HTMLElement).closest('input, textarea, [contenteditable]')
      const mod = e.metaKey || e.ctrlKey
      if (mod && e.key.toLowerCase() === 'k') {
        e.preventDefault()
        useUI.getState().palette ? useUI.setState({ palette: false }) : openPalette()
        return
      }
      if (mod && e.key === '[') return back()
      if (mod && e.key === ']') return forward()
      if (e.key === 'Escape') {
        const ui = useUI.getState()
        if (ui.menu) return useUI.setState({ menu: null })
        if (ui.panel) return useUI.setState({ panel: null })
        if (ui.nowPlaying) return toggleNowPlaying(false)
      }
      if (typing || mod) return
      if (e.key === ' ') {
        e.preventDefault()
        toggle()
      } else if (e.key === 'ArrowRight' && e.shiftKey) next()
      else if (e.key === 'ArrowLeft' && e.shiftKey) prev()
      else if (e.key === 'ArrowRight' && !useUI.getState().menu) seek(positionNow() + 10_000)
      else if (e.key === 'ArrowLeft' && !useUI.getState().menu) seek(positionNow() - 10_000)
      else if (e.key === 'l') {
        const t = usePlayer.getState().track
        if (t) setLiked(t, !useLibrary.getState().liked.has(t.id))
      } else if (e.key === 'f') toggleNowPlaying()
      else if (e.key === '/') {
        e.preventDefault()
        openPalette()
      } else if (e.key === 'ArrowUp' && e.altKey) setVolume(usePlayer.getState().volume + 0.05)
      else if (e.key === 'ArrowDown' && e.altKey) setVolume(usePlayer.getState().volume - 0.05)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])
}
