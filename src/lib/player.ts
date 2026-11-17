// Playback. Our own Web Playback SDK device when we're the active device,
// otherwise we remote-control whatever device is playing via the Web API.

import { create } from 'zustand'
import { api } from './api'
import { getToken } from './auth'
import * as N from './normalize'
import { useLibrary } from './library'
import { toast } from './toast'
import { useUI } from './ui'
import type { Images } from './types'

export type NowTrack = {
  id: string
  uri: string
  name: string
  artists: { id: string; name: string }[]
  albumId: string
  albumName: string
  images: Images
  durationMs: number
}

export type Device = { id: string; name: string; type: string; is_active: boolean; volume_percent: number | null }

type PlayerState = {
  sdkStatus: 'loading' | 'ready' | 'error'
  sdkError?: string
  deviceId: string | null
  /** true when our in-browser device is the one playing */
  local: boolean
  activeDevice: Device | null
  track: NowTrack | null
  paused: boolean
  /** position at `stamp` */
  position: number
  stamp: number
  shuffle: boolean
  repeat: 'off' | 'context' | 'track'
  contextUri: string | null
  volume: number
  nextUp: NowTrack[]
  /** our own uniform shuffle, separate from Spotify's (which isn't actually random) */
  trueShuffle: boolean
  /** the playlist/album we're shuffling. Spotify only sees a list of uris, so it can't tell us */
  virtualContext: string | null
}

export const usePlayer = create<PlayerState>(() => ({
  sdkStatus: 'loading',
  deviceId: null,
  local: false,
  activeDevice: null,
  track: null,
  paused: true,
  position: 0,
  stamp: performance.now(),
  shuffle: false,
  repeat: 'off',
  contextUri: null,
  volume: loadVolume(),
  nextUp: [],
  trueShuffle: loadFlag('afterglow.shuffle'),
  virtualContext: null,
}))

/** what's playing, including contexts we're shuffling ourselves */
export const ctxOf = (s: PlayerState) => s.virtualContext ?? s.contextUri

const set = usePlayer.setState
const get = usePlayer.getState

function loadFlag(key: string) {
  try {
    return localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function loadVolume() {
  try {
    return Number(localStorage.getItem('afterglow.volume') ?? '0.7')
  } catch {
    return 0.7
  }
}

/** current position in ms, interpolated between state updates */
export function positionNow() {
  const s = get()
  if (!s.track) return 0
  const p = s.paused ? s.position : s.position + (performance.now() - s.stamp)
  return Math.min(Math.max(p, 0), s.track.durationMs)
}

let sdk: Spotify.Player | null = null
let pollTimer: number | undefined

export function initPlayer() {
  if (document.getElementById('spotify-sdk')) return
  window.onSpotifyWebPlaybackSDKReady = () => {
    sdk = new Spotify.Player({
      name: 'Afterglow',
      getOAuthToken: (cb) => void getToken().then(cb),
      volume: get().volume,
    })
    sdk.addListener('ready', ({ device_id }) => {
      set({ deviceId: device_id, sdkStatus: 'ready' })
      claimIfIdle(device_id)
    })
    sdk.addListener('not_ready', () => set({ local: false }))
    sdk.addListener('player_state_changed', (st) => {
      if (!st) {
        set({ local: false })
        startPolling()
        return
      }
      applySdkState(st)
    })
    // When Spotify refuses to stream to us (bad DRM signature), the SDK fails each
    // song and auto-advances, burning through the playlist. Two failures in a row: stop.
    let fails: number[] = []
    sdk.addListener('playback_error', (e) => {
      console.warn('playback error', e.message)
      const now = Date.now()
      fails = [...fails.filter((t) => now - t < 8000), now]
      if (fails.length >= 2) {
        fails = []
        sdk?.pause()
        set({
          sdkStatus: 'error',
          sdkError: 'Spotify won’t stream to this app (DRM signature), playing on another device instead',
        })
        // hand the same queue to another device so the music actually starts
        fallbackDevice().then((id) => {
          if (id) transferTo(id, true)
        })
      }
    })
    const fail = (msg: string) => ({ message }: { message: string }) =>
      set({ sdkStatus: 'error', sdkError: `${msg}: ${message}` })
    sdk.addListener('initialization_error', () =>
      set({ sdkStatus: 'error', sdkError: 'This window can’t play audio itself (no DRM), it’ll control your other devices instead' }),
    )
    sdk.addListener('authentication_error', fail('Spotify sign-in problem'))
    sdk.addListener('account_error', fail('Playback needs Spotify Premium'))
    sdk.addListener('autoplay_failed', () => console.warn('autoplay blocked, waiting for a click'))
    sdk.connect()
  }
  const s = document.createElement('script')
  s.id = 'spotify-sdk'
  s.src = 'https://sdk.scdn.co/spotify-player.js'
  s.async = true
  document.body.appendChild(s)
  refreshRemote()
  startPolling()
}

/**
 * If there's no session anywhere, quietly make this app the active device (paused).
 * A paused session on another device is left alone, so opening the laptop never
 * steals the desktop's queue, it just shows it.
 */
async function claimIfIdle(deviceId: string) {
  const st = await refreshRemote()
  if (!st) {
    try {
      await api('/me/player', { method: 'PUT', body: { device_ids: [deviceId], play: false } })
    } catch {}
  }
}

function fromSdkTrack(t: Spotify.Track): NowTrack {
  const albumId = t.album.uri.split(':').pop() ?? ''
  return {
    id: t.id ?? t.uri.split(':').pop() ?? '',
    uri: t.uri,
    name: t.name,
    artists: t.artists.map((a) => ({ id: a.uri.split(':').pop() ?? '', name: a.name })),
    albumId,
    albumName: t.album.name,
    images: N.images(t.album.images.map((i) => ({ url: i.url, width: i.width ?? null })) as any),
    durationMs: t.duration_ms,
  }
}

function applySdkState(st: Spotify.PlaybackState) {
  const cur = st.track_window.current_track
  set({
    local: true,
    track: cur ? fromSdkTrack(cur) : null,
    paused: st.paused,
    position: st.position,
    stamp: performance.now(),
    shuffle: st.shuffle,
    repeat: (['off', 'context', 'track'] as const)[st.repeat_mode] ?? 'off',
    contextUri: st.context?.uri ?? null,
    ...(isRealContext(st.context?.uri) ? { virtualContext: null } : {}),
    nextUp: st.track_window.next_tracks.map(fromSdkTrack),
    activeDevice: { id: get().deviceId ?? '', name: 'Afterglow', type: 'Computer', is_active: true, volume_percent: null },
  })
  updateMediaSession()
  continueShuffle()
}

/**
 * A plain list of uris (how our shuffle plays) still comes back from the SDK with
 * a placeholder context, so only a real playlist/album/artist/liked context means
 * someone started something else.
 */
const isRealContext = (uri?: string | null) => !!uri && /:(playlist|album|artist|collection|show):?/.test(uri)

async function refreshRemote() {
  try {
    const st = await api<any>('/me/player', { query: { additional_types: 'track' } })
    if (!st) {
      if (!get().local) set({ activeDevice: null })
      return null
    }
    if (st.device?.id && st.device.id === get().deviceId) return st
    if (st.device?.id && st.is_playing) rememberDevice(st.device.id)
    const t = N.track(st.item)
    set({
      local: false,
      activeDevice: st.device ?? null,
      track: t ?? null,
      paused: !st.is_playing,
      position: st.progress_ms ?? 0,
      stamp: performance.now(),
      shuffle: !!st.shuffle_state,
      repeat: st.repeat_state ?? 'off',
      contextUri: st.context?.uri ?? null,
      ...(isRealContext(st.context?.uri) ? { virtualContext: null } : {}),
    })
    updateMediaSession()
    continueShuffle()
    return st
  } catch {
    return null
  }
}

// Spotify's own apps get pushed changes over a private socket third-party apps can't
// reach, so we poll: every 4s while another device is playing, every 15s otherwise
// (that's how we notice your desktop picking up the session), and right away
// whenever the window comes back to the front.
let lastPoll = 0
function startPolling() {
  if (pollTimer) return
  pollTimer = window.setInterval(() => {
    if (document.visibilityState !== 'visible') return
    const gap = get().local ? 15_000 : 4_000
    if (performance.now() - lastPoll >= gap - 100) poll()
  }, 1000)
}
function poll() {
  lastPoll = performance.now()
  refreshRemote()
}
window.addEventListener('focus', () => performance.now() - lastPoll > 1500 && poll())
document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && poll())

// ---- actions ----

const wake = () => sdk?.activateElement?.()

/** Optimistic local update so the UI never waits on the network */
function optimistic(p: Partial<PlayerState>) {
  set({ ...p, position: positionNow(), stamp: performance.now() })
}

async function playBody(body: Record<string, unknown>) {
  wake()
  const { deviceId, local, activeDevice, sdkStatus } = get()
  const canPlayHere = sdkStatus === 'ready' && !!deviceId
  // clicking play in this app means play here, unless another device is mid-song.
  // If this app can't play (no DRM), use whatever device is around instead.
  let target: string | null = null
  if (canPlayHere && (local || !activeDevice?.is_active)) target = deviceId
  else if (!canPlayHere && !activeDevice?.is_active) {
    target = await fallbackDevice()
    if (!target) return
  }
  await api('/me/player/play', { method: 'PUT', query: { device_id: target ?? undefined }, body })
  if (!local) setTimeout(refreshRemote, 600)
}

/** Play a playlist/album/liked songs. With shuffle on, it's our own shuffle. */
export function playContext(contextUri: string, offsetUri?: string, positionMs?: number) {
  if (get().trueShuffle && contextTracks(contextUri)) return playShuffled(contextUri, offsetUri, positionMs)
  set({ virtualContext: null })
  shuffleRest = []
  return playBody({
    context_uri: contextUri,
    ...(offsetUri ? { offset: { uri: offsetUri } } : {}),
    ...(positionMs ? { position_ms: Math.round(positionMs) } : {}),
  })
}

/** Play a loose list of songs (search results, an artist's songs from your library) */
export function playUris(uris: string[], offset = 0) {
  set({ virtualContext: null })
  shuffleRest = []
  return playBody({ uris: uris.slice(0, CHUNK), offset: { position: Math.min(offset, CHUNK - 1) } })
}

// ---- a shuffle that's actually random ----
//
// Spotify's shuffle deliberately isn't uniform: it spreads artists out and
// leans on what you play a lot. This is a plain Fisher–Yates over the whole
// playlist using the OS's crypto randomness, then Spotify just gets the list.

/** Spotify's play endpoint chokes on huge uri lists, so long playlists go over in chunks */
const CHUNK = 250
let shuffleRest: string[] = []
let chunkLast: string | null = null
let chunkTimer: number | undefined

/** unbiased random int in [0, n), rejection sampling so there's no modulo bias */
function randInt(n: number) {
  const buf = new Uint32Array(1)
  const limit = Math.floor(0x100000000 / n) * n
  do crypto.getRandomValues(buf)
  while (buf[0] >= limit)
  return buf[0] % n
}

export function fisherYates<T>(input: T[]): T[] {
  const a = [...input]
  for (let i = a.length - 1; i > 0; i--) {
    const j = randInt(i + 1)
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

/** the songs in a context, if we have them locally */
function contextTracks(uri: string): string[] | null {
  const lib = useLibrary.getState()
  const id = uri.split(':').pop() ?? ''
  const ids = uri.endsWith(':collection')
    ? lib.items.liked?.ids
    : uri.includes(':playlist:')
      ? lib.items[id]?.ids
      : uri.includes(':album:')
        ? lib.albums[id]?.trackIds
        : undefined
  if (!ids?.length) return null
  return ids.map((t) => lib.tracks.get(t)?.uri).filter(Boolean) as string[]
}

export async function playShuffled(contextUri: string, firstUri?: string, positionMs?: number) {
  const uris = contextTracks(contextUri)
  // nothing local to shuffle (an artist, a followed playlist), let Spotify do it
  if (!uris) {
    await playBody({ context_uri: contextUri })
    return api('/me/player/shuffle', { method: 'PUT', query: { state: 'true' } }).catch(() => {})
  }
  let order = fisherYates(uris)
  if (firstUri) order = [firstUri, ...order.filter((u) => u !== firstUri)]
  setShuffle(true)
  set({ virtualContext: contextUri })
  shuffleRest = order.slice(CHUNK)
  chunkLast = order.slice(0, CHUNK).at(-1) ?? null
  await playBody({
    uris: order.slice(0, CHUNK),
    offset: { position: 0 },
    ...(positionMs ? { position_ms: Math.round(positionMs) } : {}),
  })
  // our order is the shuffle, so Spotify's own shuffle has to stay off or it reshuffles it
  api('/me/player/shuffle', { method: 'PUT', query: { state: 'false' } }).catch(() => {})
  set({ virtualContext: contextUri })
}

/** when the last song of a chunk is about to end, hand Spotify the next chunk */
function continueShuffle() {
  clearTimeout(chunkTimer)
  const s = get()
  if (!s.virtualContext || !shuffleRest.length || !s.track || s.paused || s.track.uri !== chunkLast) return
  const left = s.track.durationMs - positionNow()
  chunkTimer = window.setTimeout(() => {
    const next = shuffleRest.slice(0, CHUNK)
    shuffleRest = shuffleRest.slice(CHUNK)
    chunkLast = next.at(-1) ?? null
    const ctx = get().virtualContext
    playBody({ uris: next, offset: { position: 0 } }).then(() => set({ virtualContext: ctx }))
  }, Math.max(0, left - 400))
}

function setShuffle(on: boolean) {
  set({ trueShuffle: on })
  try {
    localStorage.setItem('afterglow.shuffle', on ? '1' : '0')
  } catch {}
}

export async function toggle() {
  wake()
  const s = get()
  if (!s.track) return
  optimistic({ paused: !s.paused })
  if (s.local && sdk) return sdk.togglePlay()
  await api(s.paused ? '/me/player/play' : '/me/player/pause', { method: 'PUT' }).catch(() => {})
}

export async function next() {
  wake()
  if (get().local && sdk) return sdk.nextTrack()
  await api('/me/player/next', { method: 'POST' }).catch(() => {})
  setTimeout(refreshRemote, 400)
}

export async function prev() {
  wake()
  if (positionNow() > 3000) return seek(0)
  if (get().local && sdk) return sdk.previousTrack()
  await api('/me/player/previous', { method: 'POST' }).catch(() => {})
  setTimeout(refreshRemote, 400)
}

export async function seek(ms: number) {
  const s = get()
  if (!s.track) return
  ms = Math.max(0, Math.min(ms, s.track.durationMs - 500))
  set({ position: ms, stamp: performance.now() })
  if (s.local && sdk) return sdk.seek(ms)
  await api('/me/player/seek', { method: 'PUT', query: { position_ms: Math.round(ms) } }).catch(() => {})
}

let volTimer: number | undefined
export function setVolume(v: number) {
  v = Math.max(0, Math.min(1, v))
  set({ volume: v })
  try {
    localStorage.setItem('afterglow.volume', String(v))
  } catch {}
  if (get().local && sdk) return void sdk.setVolume(v)
  clearTimeout(volTimer)
  volTimer = window.setTimeout(() => {
    api('/me/player/volume', { method: 'PUT', query: { volume_percent: Math.round(v * 100) } }).catch(() => {})
  }, 150)
}

/** Flip shuffle. If something's playing, reshuffle (or unshuffle) it without a hiccup. */
export async function toggleShuffle() {
  const s = get()
  const on = !s.trueShuffle
  setShuffle(on)
  const ctx = ctxOf(s)
  if (!ctx || !s.track) return
  const pos = positionNow()
  if (on && contextTracks(ctx)) return playShuffled(ctx, s.track.uri, pos)
  if (!on && s.virtualContext) {
    // back to playlist order, picking up from the same song at the same spot
    set({ virtualContext: null })
    shuffleRest = []
    return playBody({ context_uri: ctx, offset: { uri: s.track.uri }, position_ms: Math.round(pos) })
  }
  // a context we can't shuffle ourselves: fall back to Spotify's
  await api('/me/player/shuffle', { method: 'PUT', query: { state: String(on) } }).catch(() => {})
}

export async function cycleRepeat() {
  const order = ['off', 'context', 'track'] as const
  const nextMode = order[(order.indexOf(get().repeat) + 1) % 3]
  set({ repeat: nextMode })
  await api('/me/player/repeat', { method: 'PUT', query: { state: nextMode } }).catch(() => {})
}

export async function addToQueue(uri: string) {
  await api('/me/player/queue', { method: 'POST', query: { uri } })
}

export async function getQueue(): Promise<NowTrack[]> {
  const q = await api<any>('/me/player/queue')
  return (q?.queue ?? []).map((t: any) => N.track(t)).filter(Boolean)
}

export async function getDevices(): Promise<Device[]> {
  const r = await api<{ devices: Device[] }>('/me/player/devices')
  return r?.devices ?? []
}

export async function transferTo(id: string, play = true) {
  wake()
  if (id !== get().deviceId) rememberDevice(id)
  await api('/me/player', { method: 'PUT', body: { device_ids: [id], play } })
  setTimeout(refreshRemote, 800)
}

export function transferHere() {
  const id = get().deviceId
  if (id) return transferTo(id, !get().paused)
}

// ---- which other device to use when this one can't play ----

function rememberDevice(id: string) {
  try {
    localStorage.setItem('afterglow.lastDevice', id)
  } catch {}
}

/**
 * The device you last actually listened on, or the only other one around.
 * With several and no history we don't guess (it could blast music in another
 * room), we open the device picker instead.
 */
async function fallbackDevice(): Promise<string | null> {
  const others = (await getDevices().catch(() => [] as Device[])).filter((d) => d.id !== get().deviceId)
  let last: string | null = null
  try {
    last = localStorage.getItem('afterglow.lastDevice')
  } catch {}
  const pick = others.find((d) => d.id === last) ?? (others.length === 1 ? others[0] : null)
  if (pick) return pick.id
  if (others.length) {
    useUI.setState({ panel: 'devices' })
    toast('Pick where to play')
  }
  return null
}

// ---- OS media keys / now playing widget ----

function updateMediaSession() {
  if (!('mediaSession' in navigator)) return
  const { track, paused } = get()
  if (!track) return
  navigator.mediaSession.metadata = new MediaMetadata({
    title: track.name,
    artist: track.artists.map((a) => a.name).join(', '),
    album: track.albumName,
    artwork: [track.images.md, track.images.lg].filter(Boolean).map((src) => ({ src: src! })),
  })
  navigator.mediaSession.playbackState = paused ? 'paused' : 'playing'
}

if ('mediaSession' in navigator) {
  const ms = navigator.mediaSession
  ms.setActionHandler('play', () => get().paused && toggle())
  ms.setActionHandler('pause', () => !get().paused && toggle())
  ms.setActionHandler('nexttrack', () => next())
  ms.setActionHandler('previoustrack', () => prev())
}
