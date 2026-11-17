// Page header. Big art, bigger title, and a wash of the art's own color.
// When it scrolls out of view the title slides into the top bar.

import { createContext, useContext, useEffect, useRef } from 'react'
import { css, usePalette } from '../lib/colors'
import type { Images } from '../lib/types'
import { useUI } from '../lib/ui'
import { useAmbient } from '../lib/ambient'
import { Cover, LikedCover } from './Cover'

export const ScrollerCtx = createContext<HTMLElement | null>(null)
export const useScroller = () => useContext(ScrollerCtx)

type Props = {
  kicker: string
  title: string
  images?: Images
  liked?: boolean
  round?: boolean
  children?: React.ReactNode
}

export function Hero({ kicker, title, images, liked, round, children }: Props) {
  const pal = usePalette(images?.sm)
  const ref = useRef<HTMLElement>(null)
  const scroller = useScroller()

  // this page's art lights the room when nothing is playing
  useEffect(() => {
    useAmbient.setState({ page: images?.sm ? pal : null })
  }, [pal, images?.sm])
  useEffect(() => () => useAmbient.setState({ page: null }), [])

  useEffect(() => {
    useUI.setState({ topTitle: title, showTopTitle: false })
    const el = ref.current
    if (!el || !scroller) return
    const io = new IntersectionObserver(
      ([e]) => useUI.setState({ showTopTitle: !e.isIntersecting }),
      { root: scroller, rootMargin: '-72px 0px 0px 0px', threshold: 0 },
    )
    const titleEl = el.querySelector('.display')
    if (titleEl) io.observe(titleEl)
    return () => {
      io.disconnect()
      useUI.setState({ showTopTitle: false })
    }
  }, [title, scroller])

  // long names get a smaller size so they don't wrap into a wall
  const len = title.length
  const size = len > 40 ? 'xs' : len > 26 ? 'sm' : len > 14 ? 'md' : len > 3 ? 'lg' : 'glyph'

  return (
    <header className="hero" ref={ref} style={{ ['--wash' as any]: css(pal.colors[0], 0.55), ['--wash2' as any]: css(pal.colors[1], 0.3) }}>
      <div className="hero-wash" />
      {liked ? (
        <LikedCover className="hero-art" />
      ) : (
        <Cover images={images ?? {}} size="lg" round={round} className="hero-art" />
      )}
      <div className="hero-meta">
        <div className="kicker">{kicker}</div>
        <h1 className={`display display-${size}`}>{title}</h1>
        {children}
      </div>
    </header>
  )
}
