// Authorization Code + PKCE, all in the browser, no backend.

const CLIENT_ID = import.meta.env.VITE_SPOTIFY_CLIENT_ID as string
const REDIRECT_URI =
  (import.meta.env.VITE_SPOTIFY_REDIRECT_URI as string) || `${location.origin}/callback`

const SCOPES = [
  'streaming',
  'user-read-email',
  'user-read-private',
  'user-read-playback-state',
  'user-modify-playback-state',
  'user-read-currently-playing',
  'playlist-read-private',
  'playlist-read-collaborative',
  'playlist-modify-public',
  'playlist-modify-private',
  'user-library-read',
  'user-library-modify',
  'user-read-recently-played',
  'user-top-read',
  'user-follow-read',
  'user-follow-modify',
].join(' ')

const KEY = 'afterglow.auth'
const VERIFIER_KEY = 'afterglow.pkce'

type Tokens = { access: string; refresh: string; expiresAt: number }

function load(): Tokens | null {
  try {
    const raw = localStorage.getItem(KEY)
    return raw ? (JSON.parse(raw) as Tokens) : null
  } catch {
    return null
  }
}

function save(t: Tokens) {
  try {
    localStorage.setItem(KEY, JSON.stringify(t))
  } catch {}
}

let tokens = load()
let refreshing: Promise<string> | null = null

export const isLoggedIn = () => !!tokens

function b64url(buf: ArrayBuffer | Uint8Array) {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf)
  let s = ''
  bytes.forEach((b) => (s += String.fromCharCode(b)))
  return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
}

export async function login() {
  const verifier = b64url(crypto.getRandomValues(new Uint8Array(64)))
  const challenge = b64url(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(verifier)))
  sessionStorage.setItem(VERIFIER_KEY, verifier)
  const params = new URLSearchParams({
    client_id: CLIENT_ID,
    response_type: 'code',
    redirect_uri: REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge: challenge,
    scope: SCOPES,
  })
  location.href = `https://accounts.spotify.com/authorize?${params}`
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch('https://accounts.spotify.com/api/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ client_id: CLIENT_ID, ...body }),
  })
  if (!res.ok) throw new Error(`token request failed: ${res.status}`)
  const j = await res.json()
  tokens = {
    access: j.access_token,
    refresh: j.refresh_token ?? tokens?.refresh,
    expiresAt: Date.now() + j.expires_in * 1000,
  }
  save(tokens)
  return tokens.access
}

/** Called on /callback. Returns true if we finished a login. */
export async function handleCallback(): Promise<boolean> {
  if (location.pathname !== '/callback') return false
  const code = new URLSearchParams(location.search).get('code')
  const verifier = sessionStorage.getItem(VERIFIER_KEY)
  history.replaceState(null, '', '/')
  if (!code || !verifier) return false
  await tokenRequest({ grant_type: 'authorization_code', code, redirect_uri: REDIRECT_URI, code_verifier: verifier })
  sessionStorage.removeItem(VERIFIER_KEY)
  return true
}

export async function refresh(): Promise<string> {
  if (!tokens) throw new Error('not logged in')
  refreshing ??= tokenRequest({ grant_type: 'refresh_token', refresh_token: tokens.refresh }).finally(() => {
    refreshing = null
  })
  return refreshing
}

/** A valid access token, refreshed a minute before it expires. */
export async function getToken(): Promise<string> {
  if (!tokens) throw new Error('not logged in')
  if (Date.now() > tokens.expiresAt - 60_000) return refresh()
  return tokens.access
}

export function logout() {
  tokens = null
  try {
    localStorage.removeItem(KEY)
  } catch {}
}
