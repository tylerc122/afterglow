// Liking a song sends a little burst of the song's color out of the heart.
// One capture listener covers every like button in the app.

const LIKE = '.heart, .row-heart, .np-like, [data-like]'

export function watchLikes() {
  document.addEventListener(
    'click',
    (e) => {
      const btn = (e.target as HTMLElement).closest?.(LIKE) as HTMLElement | null
      // only on the way to liked, unliking stays quiet
      if (!btn || btn.classList.contains('on')) return
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
      burst(btn)
    },
    true,
  )
}

function burst(el: HTMLElement) {
  const r = el.getBoundingClientRect()
  const x = r.left + r.width / 2
  const y = r.top + r.height / 2
  const color = getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || '#ff9a6e'
  const layer = document.createElement('div')
  Object.assign(layer.style, { position: 'fixed', left: `${x}px`, top: `${y}px`, width: '0', height: '0', zIndex: '60', pointerEvents: 'none' })
  document.body.appendChild(layer)

  const ring = document.createElement('i')
  Object.assign(ring.style, {
    position: 'absolute',
    left: '-14px',
    top: '-14px',
    width: '28px',
    height: '28px',
    borderRadius: '50%',
    border: `2px solid ${color}`,
  })
  layer.appendChild(ring)
  ring.animate([{ transform: 'scale(.3)', opacity: 0.9 }, { transform: 'scale(1.5)', opacity: 0 }], { duration: 420, easing: 'cubic-bezier(.2,.8,.2,1)', fill: 'forwards' })

  const n = 9
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2 + Math.random() * 0.4
    const d = 18 + Math.random() * 10
    const size = 3 + Math.random() * 2.5
    const dot = document.createElement('i')
    Object.assign(dot.style, {
      position: 'absolute',
      left: `${-size / 2}px`,
      top: `${-size / 2}px`,
      width: `${size}px`,
      height: `${size}px`,
      borderRadius: '50%',
      background: i % 3 === 0 ? '#fff' : color,
      boxShadow: `0 0 6px ${color}`,
    })
    layer.appendChild(dot)
    dot.animate(
      [
        { transform: 'translate(0,0) scale(1)', opacity: 1 },
        { transform: `translate(${Math.cos(a) * d}px, ${Math.sin(a) * d}px) scale(.4)`, opacity: 0 },
      ],
      { duration: 520 + Math.random() * 160, easing: 'cubic-bezier(.15,.7,.3,1)', fill: 'forwards' },
    )
  }
  setTimeout(() => layer.remove(), 800)
}
