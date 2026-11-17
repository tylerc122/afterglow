import { create } from 'zustand'

type Toast = { id: number; text: string }
export const useToasts = create<{ list: Toast[] }>(() => ({ list: [] }))

let n = 0
export function toast(text: string) {
  const id = ++n
  useToasts.setState((s) => ({ list: [...s.list.slice(-2), { id, text }] }))
  setTimeout(() => useToasts.setState((s) => ({ list: s.list.filter((t) => t.id !== id) })), 2600)
}
