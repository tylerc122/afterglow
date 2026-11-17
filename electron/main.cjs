// Afterglow as a real Mac app. Uses castlabs' Electron build, which ships
// Widevine, the DRM module Spotify's player needs (stock Electron and Tauri don't).

const { app, BrowserWindow, components, shell } = require('electron')
const http = require('node:http')
const fs = require('node:fs')
const path = require('node:path')
const { registerHistory } = require('./history.cjs')

// Spotify only accepts the redirect URI we registered, so the app has to live
// at exactly this origin, packaged or not.
const HOST = '127.0.0.1'
const PORT = 5173
const ORIGIN = `http://${HOST}:${PORT}`
const DEV = process.env.AFTERGLOW_DEV === '1'
const DIST = path.join(__dirname, '..', 'dist')

const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript',
  '.css': 'text/css',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.webmanifest': 'application/manifest+json',
  '.png': 'image/png',
  '.json': 'application/json',
}

/** tiny static server for the built app, every unknown path falls back to index.html */
function serve() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url, ORIGIN)
      let file = path.normalize(path.join(DIST, decodeURIComponent(url.pathname)))
      if (!file.startsWith(DIST) || !fs.existsSync(file) || fs.statSync(file).isDirectory()) {
        file = path.join(DIST, 'index.html')
      }
      const type = TYPES[path.extname(file)] ?? 'application/octet-stream'
      const immutable = file.includes(`${path.sep}assets${path.sep}`)
      res.writeHead(200, {
        'Content-Type': type,
        'Cache-Control': immutable ? 'public, max-age=31536000, immutable' : 'no-cache',
      })
      fs.createReadStream(file).pipe(res)
    })
    // if the port's taken (vite dev server running), just use whatever's there
    server.once('error', () => resolve(null))
    server.listen(PORT, HOST, () => resolve(server))
  })
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1440,
    height: 920,
    minWidth: 880,
    minHeight: 600,
    show: false,
    backgroundColor: '#08080a',
    titleBarStyle: 'hiddenInset',
    trafficLightPosition: { x: 18, y: 18 },
    title: 'Afterglow',
    webPreferences: {
      contextIsolation: true,
      sandbox: true,
      preload: path.join(__dirname, 'preload.cjs'),
      backgroundThrottling: false,
    },
  })

  win.once('ready-to-show', () => win.show())

  // links that leave the app (copied Spotify links etc.) open in the real browser,
  // but the Spotify sign-in page stays in-window so the redirect comes back here
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url)
    return { action: 'deny' }
  })
  win.webContents.on('will-navigate', (e, url) => {
    const { origin } = new URL(url)
    if (origin !== ORIGIN && origin !== 'https://accounts.spotify.com') {
      e.preventDefault()
      shell.openExternal(url)
    }
  })

  win.loadURL(ORIGIN)
  return win
}

if (!app.requestSingleInstanceLock()) app.quit()

app.on('second-instance', () => {
  const [win] = BrowserWindow.getAllWindows()
  if (win) {
    if (win.isMinimized()) win.restore()
    win.focus()
  }
})

app.whenReady().then(async () => {
  registerHistory()
  if (!DEV) await serve()
  const win = createWindow()
  // Widevine is cached after the first launch and ready almost instantly. On the
  // very first launch Chromium takes ~60s to fetch it, so the window opens right
  // away and reloads once it lands, which lets the Spotify player start up.
  const started = Date.now()
  try {
    await components.whenReady()
    console.log('widevine:', JSON.stringify(components.status()))
    // (only on our own pages, never in the middle of the Spotify sign-in)
    if (Date.now() - started > 2500 && !win.isDestroyed() && win.webContents.getURL().startsWith(ORIGIN)) {
      win.webContents.reload()
    }
  } catch (e) {
    console.error('widevine failed to load', e)
  }
})

app.on('activate', () => {
  if (!BrowserWindow.getAllWindows().length) createWindow()
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
