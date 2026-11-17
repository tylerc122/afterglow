// Covers fly into the page. Clicking anything with a cover that opens a page
// remembers where that cover was; the page header then flies a copy of it from
// there to its own art, and shows the real art when it lands.

type Flight = { path: string; el: HTMLElement; rect: DOMRect; at: number }
let pending: Flight | null = null

/** installed once: catches clicks on links that contain a cover */
export function watchFlights() {
  document.addEventListener(
    'click',
    (e) => {
      if (e.metaKey || e.ctrlKey || e.button !== 0) return
      const a = (e.target as HTMLElement).closest?.('a[href]') as HTMLAnchorElement | null
      const cover = a?.querySelector('.cover, .liked-cover') as HTMLElement | null
      if (!a || !cover) return
      const path = new URL(a.href).pathname
      if (!/^\/(playlist|album|artist|liked)/.test(path)) return
      pending = { path, el: cover, rect: cover.getBoundingClientRect(), at: performance.now() }
    },
    true,
  )
}

/** call from the header with its art element right after it mounts */
export function land(art: HTMLElement | null) {
  const f = pending
  pending = null
  if (!art || !f || f.path !== location.pathname || performance.now() - f.at > 800) return
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  const from = f.rect
  const to = art.getBoundingClientRect()
  if (!from.width || !to.width) return
  // the page itself slides up 6px as it fades in, aim for where it ends up
  const toTop = to.top - 6
  const s = to.width / from.width

  const ghost = f.el.cloneNode(true) as HTMLElement
  const radius = getComputedStyle(art).borderRadius
  Object.assign(ghost.style, {
    position: 'fixed',
    left: `${from.left}px`,
    top: `${from.top}px`,
    width: `${from.width}px`,
    height: `${from.height}px`,
    margin: '0',
    zIndex: '30',
    transformOrigin: '0 0',
    pointerEvents: 'none',
    overflow: 'hidden',
  })
  document.body.appendChild(ghost)
  art.style.opacity = '0'
  const endRadius = radius.endsWith('%') ? radius : `${parseFloat(radius) / s}px`
  const anim = ghost.animate(
    [
      { transform: 'none', borderRadius: getComputedStyle(f.el).borderRadius, boxShadow: '0 0 0 rgba(0,0,0,0)' },
      {
        transform: `translate(${to.left - from.left}px, ${toTop - from.top}px) scale(${s})`,
        borderRadius: endRadius,
        boxShadow: `0 ${30 / s}px ${60 / s}px -${20 / s}px rgba(0,0,0,.6)`,
      },
    ],
    { duration: 460, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' },
  )
  const done = () => {
    art.style.opacity = ''
    ghost.remove()
  }
  anim.onfinish = done
  anim.oncancel = done
}
