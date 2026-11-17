import '@fontsource-variable/geist'
import '@fontsource-variable/geist-mono'
import './styles/tokens.css'
import './styles/app.css'

import { createRoot } from 'react-dom/client'
import { App } from './App'
import { handleCallback, isLoggedIn } from './lib/auth'
import { hydrate, useLibrary } from './lib/library'
import { initPlayer, usePlayer } from './lib/player'
import { startBackgroundSync } from './lib/sync'
import { startPlayLog } from './lib/stats'
import { Login } from './views/Welcome'
import { watchLikes } from './lib/burst'

// the desktop app has macOS window buttons over the top-left corner, CSS leaves room for them
if (navigator.userAgent.includes('Electron')) document.documentElement.classList.add('is-electron')

// handle for poking at state from devtools while developing
if (import.meta.env.DEV) (window as any).__ag = { usePlayer, useLibrary }

const root = createRoot(document.getElementById('root')!)

async function boot() {
  try {
    await handleCallback()
  } catch (e) {
    console.error('login failed', e)
  }

  if (!isLoggedIn()) {
    root.render(<Login />)
    return
  }

  // the whole library comes off disk before the first paint, so nothing ever "loads"
  await hydrate()
  watchLikes()
  root.render(<App />)
  initPlayer()
  startBackgroundSync()
  startPlayLog()
}

boot()
