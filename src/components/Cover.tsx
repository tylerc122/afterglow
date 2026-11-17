// Art that never pops in. The small image (already cached from the sidebar)
// paints on the first frame, the big one crossfades over it once decoded.
// If the big one was prefetched on hover, it's just there.

import { useState } from 'react'
import { isReady, markReady } from '../lib/images'
import type { Images } from '../lib/types'

type Props = {
  images: Images
  size: 'sm' | 'md' | 'lg'
  className?: string
  round?: boolean
  alt?: string
  fallback?: React.ReactNode
}

export function Cover({ images, size, className = '', round, alt = '', fallback }: Props) {
  const hi = images[size] ?? images.lg ?? images.md ?? images.sm
  const lo = size === 'sm' ? undefined : images.sm
  const [loadedUrl, setLoadedUrl] = useState<string | undefined>(() => (isReady(hi) ? hi : undefined))
  const loaded = !!hi && (loadedUrl === hi || isReady(hi))

  if (!hi) {
    return <div className={`cover cover-empty ${round ? 'round' : ''} ${className}`}>{fallback}</div>
  }

  return (
    <div className={`cover ${round ? 'round' : ''} ${className}`}>
      {lo && lo !== hi && !loaded && <img className="cover-lo" src={lo} alt="" crossOrigin="anonymous" draggable={false} />}
      <img
        key={hi}
        className={`cover-hi ${loaded ? 'in' : ''}`}
        src={hi}
        alt={alt}
        crossOrigin="anonymous"
        draggable={false}
        decoding="async"
        ref={(el) => {
          if (el?.complete && el.naturalWidth && !loaded) {
            markReady(hi)
            setLoadedUrl(hi)
          }
        }}
        onLoad={() => {
          markReady(hi)
          setLoadedUrl(hi)
        }}
      />
    </div>
  )
}

/** Liked songs gets its own made-up cover: a heart lit by the current accent */
export function LikedCover({ className = '' }: { className?: string }) {
  return (
    <div className={`cover liked-cover ${className}`}>
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 19.5s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.6-7.5 10-7.5 10Z" fill="currentColor" />
      </svg>
    </div>
  )
}
