// The list every page is built on. Virtualized against the main scroller so a
// 5,000 song playlist scrolls like a 20 song one. Click selects, cmd/ctrl click
// toggles, shift click grabs a range, cmd/ctrl+A grabs everything, double click
// (or enter) plays, right click opens the menu for whatever's selected.

import { useVirtualizer } from '@tanstack/react-virtual'
import { memo, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { setLiked } from '../lib/actions'
import { ago, time } from '../lib/format'
import { useLibrary } from '../lib/library'
import { usePlayer } from '../lib/player'
import { link } from '../lib/router'
import type { Track } from '../lib/types'
import { openMenu, useUI } from '../lib/ui'
import { Cover } from './Cover'
import { Icon } from './Icon'
import { Eq } from './Sidebar'

export type Sort = { key: 'custom' | 'title' | 'artist' | 'album' | 'added' | 'duration'; dir: 1 | -1 }

type Props = {
  tracks: Track[]
  added?: string[]
  variant?: 'playlist' | 'album' | 'compact'
  filter?: string
  sort?: Sort
  onSort?: (s: Sort) => void
  /** play the row at original index i */
  onPlay: (t: Track, originalIndex: number) => void
  /** for edit actions in the context menu */
  playlistId?: string
  scroller: HTMLElement | null
}

const ROW = 56

export function TrackList({ tracks, added, variant = 'playlist', filter = '', sort, onSort, onPlay, playlistId, scroller }: Props) {
  const currentId = usePlayer((s) => s.track?.id)
  const currentUri = usePlayer((s) => s.track?.uri)
  const paused = usePlayer((s) => s.paused)
  const liked = useLibrary((s) => s.liked)
  // original indexes, plus the row shift-click ranges from and arrows move
  const [selected, setSelected] = useState<Set<number>>(() => new Set())
  const [anchor, setAnchor] = useState<number | null>(null)
  const listRef = useRef<HTMLDivElement>(null)
  const sentinel = useRef<HTMLDivElement>(null)
  const [stuck, setStuck] = useState(false)
  const [margin, setMargin] = useState(0)

  // the header only turns solid once it's actually stuck under the top bar
  useEffect(() => {
    const el = sentinel.current
    if (!el || !scroller) return
    const io = new IntersectionObserver(([e]) => setStuck(!e.isIntersecting && e.boundingClientRect.top < 120), {
      root: scroller,
      rootMargin: '-64px 0px 0px 0px',
    })
    io.observe(el)
    return () => io.disconnect()
  }, [scroller])

  // rows keep their original index so playback offsets and removal stay correct
  const rows = useMemo(() => {
    const q = filter.trim().toLowerCase()
    let r = tracks.map((t, i) => ({ t, i }))
    if (q)
      r = r.filter(
        ({ t }) =>
          t.name.toLowerCase().includes(q) ||
          t.albumName.toLowerCase().includes(q) ||
          t.artists.some((a) => a.name.toLowerCase().includes(q)),
      )
    if (sort && sort.key !== 'custom') {
      const k = sort.key
      const val = ({ t, i }: { t: Track; i: number }): string | number =>
        k === 'title' ? t.name.toLowerCase()
        : k === 'artist' ? (t.artists[0]?.name ?? '').toLowerCase()
        : k === 'album' ? t.albumName.toLowerCase()
        : k === 'added' ? added?.[i] ?? ''
        : t.durationMs
      r = [...r].sort((a, b) => (val(a) < val(b) ? -1 : val(a) > val(b) ? 1 : 0) * sort.dir)
    }
    return r
  }, [tracks, filter, sort, added])

  useLayoutEffect(() => {
    if (listRef.current && scroller) {
      const top = listRef.current.getBoundingClientRect().top - scroller.getBoundingClientRect().top + scroller.scrollTop
      setMargin(top)
    }
  }, [scroller, tracks.length])

  const v = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scroller,
    estimateSize: () => ROW,
    overscan: 14,
    scrollMargin: margin,
  })

  // a different playlist (or a new filter) starts with nothing selected
  useEffect(() => {
    setSelected(new Set())
    setAnchor(null)
  }, [tracks, filter])

  const select = (i: number, e: { metaKey: boolean; ctrlKey: boolean; shiftKey: boolean }) => {
    if (e.shiftKey && anchor !== null) {
      const a = rows.findIndex((r) => r.i === anchor)
      const b = rows.findIndex((r) => r.i === i)
      if (a >= 0 && b >= 0) {
        const range = rows.slice(Math.min(a, b), Math.max(a, b) + 1).map((r) => r.i)
        setSelected(e.metaKey || e.ctrlKey ? new Set([...selected, ...range]) : new Set(range))
        return
      }
    }
    if (e.metaKey || e.ctrlKey) {
      const next = new Set(selected)
      next.has(i) ? next.delete(i) : next.add(i)
      setSelected(next)
    } else setSelected(new Set([i]))
    setAnchor(i)
  }

  // cmd/ctrl+A selects everything showing, arrows move, enter plays, escape clears
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.target as HTMLElement).closest('input,textarea,[contenteditable]') || useUI.getState().menu) return
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'a') {
        if (!rows.length) return
        e.preventDefault()
        setSelected(new Set(rows.map((r) => r.i)))
        return
      }
      if (anchor === null && !selected.size) return
      if (e.key === 'Escape') return setSelected(new Set())
      const pos = rows.findIndex((r) => r.i === anchor)
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault()
        const np = Math.max(0, Math.min(rows.length - 1, pos + (e.key === 'ArrowDown' ? 1 : -1)))
        setSelected(new Set([rows[np].i]))
        setAnchor(rows[np].i)
        v.scrollToIndex(np, { align: 'auto' })
      } else if (e.key === 'Enter' && pos >= 0) {
        onPlay(rows[pos].t, rows[pos].i)
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [selected, anchor, rows, onPlay, v])

  const head = (key: Sort['key'], label: React.ReactNode, cls: string) => (
    <button
      className={`th ${cls} ${sort?.key === key && key !== 'custom' ? 'sorted' : ''}`}
      onClick={() => onSort?.(sort?.key === key ? (sort.dir === 1 ? { key, dir: -1 } : { key: 'custom', dir: 1 }) : { key, dir: 1 })}
      disabled={!onSort}
    >
      {label}
      {sort?.key === key && key !== 'custom' && <span className="th-dir">{sort.dir === 1 ? '↑' : '↓'}</span>}
    </button>
  )

  return (
    <div className={`tl tl-${variant}`} ref={listRef}>
      <div className="tl-sentinel" ref={sentinel} />
      {variant !== 'compact' && (
        <div className={`tl-head ${stuck ? 'stuck' : ''}`}>
          {head('custom', '#', 'c-idx')}
          {head('title', 'Title', 'c-title')}
          {variant === 'playlist' && head('album', 'Album', 'c-album')}
          {variant === 'playlist' && added && head('added', 'Added', 'c-added')}
          {head('duration', <Icon name="clock" size={15} />, 'c-dur')}
        </div>
      )}
      <div className="tl-body" style={{ height: v.getTotalSize() }}>
        {v.getVirtualItems().map((vi) => {
          const { t, i } = rows[vi.index]
          const isCur = t.id === currentId || t.uri === currentUri
          return (
            <Row
              key={vi.key}
              y={vi.start - margin}
              t={t}
              n={variant === 'album' ? t.trackNumber ?? i + 1 : vi.index + 1}
              added={added?.[i]}
              variant={variant}
              current={isCur}
              paused={paused}
              selected={selected.has(i)}
              liked={liked.has(t.id)}
              onSelect={(e) => select(i, e)}
              onPlay={() => onPlay(t, i)}
              onMenu={(e) => {
                e.preventDefault()
                // right clicking inside a multi-selection acts on all of it, in list order
                if (selected.has(i) && selected.size > 1) {
                  const picked = rows.filter((r) => selected.has(r.i)).map((r) => r.t)
                  openMenu({ x: e.clientX, y: e.clientY, track: t, tracks: picked })
                  return
                }
                setSelected(new Set([i]))
                setAnchor(i)
                openMenu({ x: e.clientX, y: e.clientY, track: t, playlistId, index: i })
              }}
            />
          )
        })}
      </div>
      {!rows.length && filter && <div className="tl-empty">No songs match “{filter}”</div>}
    </div>
  )
}

type RowProps = {
  y: number
  t: Track
  n: number
  added?: string
  variant: 'playlist' | 'album' | 'compact'
  current: boolean
  paused: boolean
  selected: boolean
  liked: boolean
  onSelect: (e: React.MouseEvent) => void
  onPlay: () => void
  onMenu: (e: React.MouseEvent) => void
}

const Row = memo(function Row({ y, t, n, added, variant, current, paused, selected, liked, onSelect, onPlay, onMenu }: RowProps) {
  return (
    <div
      className={`row ${current ? 'current' : ''} ${current && paused ? 'paused' : ''} ${selected ? 'selected' : ''}`}
      style={{ transform: `translateY(${y}px)` }}
      onClick={onSelect}
      onDoubleClick={onPlay}
      onContextMenu={onMenu}
    >
      <div className="c-idx">
        {current ? <Eq paused={paused} /> : <span className="row-n">{n}</span>}
        <button
          className="row-play"
          onClick={(e) => {
            e.stopPropagation()
            onPlay()
          }}
          aria-label={`Play ${t.name}`}
        >
          <Icon name="play" size={16} />
        </button>
      </div>
      <div className="c-title">
        {variant !== 'album' && <Cover images={t.images} size="sm" className="row-art" />}
        <div className="row-text">
          <div className="row-name">
            {t.name}
            {t.explicit && <span className="explicit">E</span>}
          </div>
          <div className="row-artists">
            {t.artists.map((a, j) => (
              <span key={a.id + j}>
                {j > 0 && ', '}
                <a href={`/artist/${a.id}`} onClick={link(`/artist/${a.id}`)}>
                  {a.name}
                </a>
              </span>
            ))}
          </div>
        </div>
      </div>
      {variant === 'playlist' && (
        <div className="c-album">
          <a href={`/album/${t.albumId}`} onClick={link(`/album/${t.albumId}`)}>
            {t.albumName}
          </a>
        </div>
      )}
      {variant === 'playlist' && added !== undefined && <div className="c-added">{ago(added)}</div>}
      <div className="c-dur">
        <button
          className={`row-heart ${liked ? 'on' : ''}`}
          onClick={(e) => {
            e.stopPropagation()
            setLiked(t, !liked)
          }}
          aria-label={liked ? 'Remove from Liked songs' : 'Save to Liked songs'}
        >
          <Icon name={liked ? 'heartFill' : 'heart'} size={16} />
        </button>
        <span>{time(t.durationMs)}</span>
        <button
          className="row-more"
          onClick={(e) => {
            e.stopPropagation()
            onMenu(e)
          }}
          aria-label="More"
        >
          <Icon name="more" size={16} />
        </button>
      </div>
    </div>
  )
})
