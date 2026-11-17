// Tiny history router. Routes are plain strings, views read from the in-memory
// library, so there's never anything to "load" on navigation.

import { create } from 'zustand'

export type Route =
  | { name: 'home' }
  | { name: 'liked' }
  | { name: 'playlist'; id: string }
  | { name: 'album'; id: string }
  | { name: 'artist'; id: string }
  | { name: 'profile' }

export function parse(path: string): Route {
  const [, a, b] = path.split('/')
  if (a === 'liked') return { name: 'liked' }
  if (a === 'you') return { name: 'profile' }
  if (a === 'playlist' && b) return { name: 'playlist', id: b }
  if (a === 'album' && b) return { name: 'album', id: b }
  if (a === 'artist' && b) return { name: 'artist', id: b }
  return { name: 'home' }
}

type RouterState = { path: string; route: Route; depth: number; maxDepth: number }

const initialDepth = (history.state?.depth as number) ?? 0

export const useRouter = create<RouterState>(() => ({
  path: location.pathname,
  route: parse(location.pathname),
  depth: initialDepth,
  maxDepth: initialDepth,
}))

const scrolls = new Map<string, number>()
let scroller: HTMLElement | null = null
export const setScroller = (el: HTMLElement | null) => (scroller = el)

function restoreScroll(path: string) {
  requestAnimationFrame(() => scroller?.scrollTo({ top: scrolls.get(path) ?? 0 }))
}

export function go(path: string) {
  const s = useRouter.getState()
  if (path === s.path) {
    scroller?.scrollTo({ top: 0, behavior: 'smooth' })
    return
  }
  scrolls.set(s.path, scroller?.scrollTop ?? 0)
  const depth = s.depth + 1
  history.pushState({ depth }, '', path)
  useRouter.setState({ path, route: parse(path), depth, maxDepth: depth })
  scrolls.delete(path)
  restoreScroll(path)
}

window.addEventListener('popstate', (e) => {
  const s = useRouter.getState()
  scrolls.set(s.path, scroller?.scrollTop ?? 0)
  const path = location.pathname
  useRouter.setState({ path, route: parse(path), depth: (e.state?.depth as number) ?? 0 })
  restoreScroll(path)
})

export const back = () => history.back()
export const forward = () => history.forward()

/** onClick handler for links that keeps cmd-click working */
export function link(path: string) {
  return (e: React.MouseEvent) => {
    if (e.metaKey || e.ctrlKey) return
    e.preventDefault()
    go(path)
  }
}
