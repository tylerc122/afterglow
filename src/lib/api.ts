import { getToken, refresh } from './auth'

const BASE = 'https://api.spotify.com/v1'

export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}

// small concurrency gate so a big first sync doesn't trip the rate limiter
const MAX_INFLIGHT = 4
let inflight = 0
const waiters: (() => void)[] = []
async function slot() {
  if (inflight < MAX_INFLIGHT) {
    inflight++
    return
  }
  await new Promise<void>((r) => waiters.push(r))
  inflight++
}
function release() {
  inflight--
  waiters.shift()?.()
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

export async function api<T = any>(
  path: string,
  init: { method?: string; body?: unknown; query?: Record<string, string | number | undefined> } = {},
): Promise<T> {
  const url = new URL(path.startsWith('http') ? path : BASE + path)
  for (const [k, v] of Object.entries(init.query ?? {})) if (v !== undefined) url.searchParams.set(k, String(v))

  await slot()
  try {
    for (let attempt = 0; ; attempt++) {
      const token = await getToken()
      const res = await fetch(url, {
        method: init.method ?? 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          ...(init.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      })
      if (res.status === 401 && attempt === 0) {
        await refresh()
        continue
      }
      if (res.status === 429 && attempt < 5) {
        const wait = Number(res.headers.get('Retry-After') ?? '1')
        await sleep((wait || 1) * 1000 + 100)
        continue
      }
      if (res.status >= 500 && attempt < 2) {
        await sleep(400 * (attempt + 1))
        continue
      }
      if (!res.ok) {
        let msg = res.statusText
        try {
          msg = (await res.json())?.error?.message ?? msg
        } catch {}
        throw new ApiError(res.status, msg)
      }
      if (res.status === 204) return undefined as T
      const text = await res.text()
      return (text ? JSON.parse(text) : undefined) as T
    }
  } finally {
    release()
  }
}

type Page<T> = { items: T[]; next: string | null; total: number }

/** Walk a paged endpoint. onPage lets callers show progress. */
export async function all<T>(path: string, limit: number, onPage?: (items: T[], total: number) => void) {
  const out: T[] = []
  let next: string | null = `${BASE}${path}${path.includes('?') ? '&' : '?'}limit=${limit}`
  while (next) {
    const page: Page<T> = await api<Page<T>>(next)
    out.push(...page.items)
    onPage?.(page.items, page.total)
    next = page.next
  }
  return out
}
