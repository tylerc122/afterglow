// Extended streaming history, from the Spotify export folder on disk.
//  - summary(): all-time numbers, cached until the zips change
//  - appendLive(): plays Afterglow sees, written in the export's own row shape to
//    .data/afterglow_live.ndjson, so the observatory app can pick up where the
//    export stops

const { app, BrowserWindow, ipcMain } = require('electron')
const { Worker } = require('node:worker_threads')
const fs = require('node:fs')
const os = require('node:os')
const path = require('node:path')

// Where the export zips live: $AFTERGLOW_HISTORY_DIR, else "historyDir" in
// config.json in the app's data folder, else ~/Spotify Data
function historyDir() {
  if (process.env.AFTERGLOW_HISTORY_DIR) return process.env.AFTERGLOW_HISTORY_DIR
  try {
    const c = JSON.parse(fs.readFileSync(path.join(app.getPath('userData'), 'config.json'), 'utf8'))
    if (c.historyDir) return c.historyDir.replace(/^~(?=$|\/)/, os.homedir())
  } catch {}
  return path.join(os.homedir(), 'Spotify Data')
}
const LIVE = () => path.join(historyDir(), '.data', 'afterglow_live.ndjson')
const CACHE = () => path.join(app.getPath('userData'), 'history-summary.json')

function zipKey(dir) {
  try {
    return fs
      .readdirSync(dir)
      .filter((f) => f.endsWith('.zip'))
      .sort()
      .map((f) => {
        const s = fs.statSync(path.join(dir, f))
        return `${f}:${s.size}:${Math.floor(s.mtimeMs)}`
      })
      .join('|')
  } catch {
    return null
  }
}

let building = null
function build(dir, key) {
  building ??= new Promise((resolve) => {
    const w = new Worker(path.join(__dirname, 'history-worker.cjs'), { workerData: { dir } })
    w.once('message', (m) => {
      if (m.ok) {
        const out = { key, builtAt: Date.now(), ...m.summary }
        try {
          fs.writeFileSync(CACHE(), JSON.stringify(out))
        } catch {}
        resolve(out)
      } else resolve({ error: m.error })
    })
    w.once('error', (e) => resolve({ error: String(e) }))
  }).finally(() => (building = null))
  return building
}

async function summary(force) {
  const dir = historyDir()
  const key = zipKey(dir)
  if (!key) return { missing: dir }
  if (!force) {
    try {
      const cached = JSON.parse(fs.readFileSync(CACHE(), 'utf8'))
      if (cached.key === key) return cached
    } catch {}
  }
  return build(dir, key)
}

function appendLive(rows) {
  const live = LIVE()
  if (!Array.isArray(rows) || !rows.length || !fs.existsSync(historyDir())) return 0
  fs.mkdirSync(path.dirname(live), { recursive: true })
  const have = new Set()
  try {
    for (const line of fs.readFileSync(live, 'utf8').split('\n')) if (line) have.add(JSON.parse(line).ts)
  } catch {}
  const fresh = rows.filter((r) => r && typeof r.ts === 'string' && r.spotify_track_uri && !have.has(r.ts))
  if (fresh.length) fs.appendFileSync(live, fresh.map((r) => JSON.stringify(r)).join('\n') + '\n')
  return fresh.length
}

/**
 * Drop a new export in the folder (or delete one) and the open window updates on
 * its own: wait for the copy to settle (same zips, same sizes, twice in a row),
 * rebuild, then tell the page. Watching costs nothing while nothing changes.
 */
function watchHistory() {
  const dir = historyDir()
  let known = zipKey(dir)
  let timer = null
  const settle = (last) => {
    clearTimeout(timer)
    timer = setTimeout(async () => {
      const key = zipKey(dir)
      if (key !== last) return settle(key) // still copying
      if (key === known) return
      known = key
      await summary(false)
      for (const w of BrowserWindow.getAllWindows()) w.webContents.send('history:changed')
    }, 2000)
  }
  try {
    fs.watch(dir, (_event, file) => {
      if (!file || file.endsWith('.zip')) settle(zipKey(dir))
    }).on('error', () => {})
  } catch {} // no folder yet, nothing to watch
}

function registerHistory() {
  ipcMain.handle('history:summary', (_e, force) => summary(force))
  ipcMain.handle('history:live', (_e, rows) => appendLive(rows))
  watchHistory()
}

module.exports = { registerHistory }
