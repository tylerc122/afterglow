import { create } from 'zustand'
import type { Images } from './types'

type Toast = {
  id: number
  text: string
  /** a toast with the same key replaces the old one (so "Adding…" turns into "Added") */
  key?: string
  images?: Images
  action?: { label: string; run: () => void }
  ms: number
}
export const useToasts = create<{ list: Toast[] }>(() => ({ list: [] }))

let n = 0
const timers = new Map<number, number>()
export function toast(text: string, o: { key?: string; images?: Images; action?: Toast['action']; ms?: number } = {}) {
  const id = ++n
  const ms = o.ms ?? 2600
  useToasts.setState((s) => {
    const old = o.key ? s.list.filter((t) => t.key === o.key) : []
    for (const t of old) clearTimeout(timers.get(t.id))
    return { list: [...s.list.filter((t) => !old.includes(t)).slice(-2), { id, text, ms, ...o }] }
  })
  timers.set(
    id,
    window.setTimeout(() => {
      timers.delete(id)
      useToasts.setState((s) => ({ list: s.list.filter((t) => t.id !== id) }))
    }, ms),
  )
}
