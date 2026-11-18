// Whether anyone's actually looking at the window. When it's unfocused or hidden,
// the purely decorative stuff (the glow, the rail, the little looping animations)
// slows down or stops, so the app idles near zero instead of redrawing blurs forever.
// Sets `html.idle` for CSS too.

const listeners = new Set<() => void>()

export const isActive = () => document.visibilityState === 'visible' && document.hasFocus()

let last = isActive()
document.documentElement.classList.toggle('idle', !last)

const check = () => {
  const now = isActive()
  if (now === last) return
  last = now
  document.documentElement.classList.toggle('idle', !now)
  listeners.forEach((f) => f())
}
window.addEventListener('focus', check)
window.addEventListener('blur', check)
document.addEventListener('visibilitychange', check)

/** called whenever the window goes active or idle, returns an unsubscribe */
export function onActivity(fn: () => void) {
  listeners.add(fn)
  return () => void listeners.delete(fn)
}
