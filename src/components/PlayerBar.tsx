// The player island. The song lights the bar as it plays: a rail of light along
// the top edge is the scrubber, and the bar fills with a wash of the song's color
// up to the playhead. Pausing dims it. Scroll anywhere on it for volume.

import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { setLiked } from '../lib/actions'
import { time } from '../lib/format'
import { isActive, onActivity } from '../lib/focus'
import { progressAnimator } from '../lib/progress'
import { useLibrary } from '../lib/library'
import {
  cycleRepeat,
  getDevices,
  getQueue,
  next,
  positionNow,
  prev,
  seek,
  setVolume,
  toggle,
  toggleShuffle,
  transferHere,
  transferTo,
  usePlayer,
  type Device,
  type NowTrack,
} from '../lib/player'
import { link } from '../lib/router'
import { togglePanel, toggleNowPlaying, useUI } from '../lib/ui'
import { Cover } from './Cover'
import { Icon } from './Icon'

export function PlayerBar() {
  const track = usePlayer((s) => s.track)
  const paused = usePlayer((s) => s.paused)
  const shuffle = usePlayer((s) => s.trueShuffle)
  const repeat = usePlayer((s) => s.repeat)
  const local = usePlayer((s) => s.local)
  const device = usePlayer((s) => s.activeDevice)
  const sdkStatus = usePlayer((s) => s.sdkStatus)
  const sdkError = usePlayer((s) => s.sdkError)
  const upNext = usePlayer((s) => s.nextUp[0])
  const liked = useLibrary((s) => (track ? s.liked.has(track.id) : false))
  const panel = useUI((s) => s.panel)
  const [hideErr, setHideErr] = useState(false)
  const pill = useRef<HTMLDivElement>(null)
  const timeEl = useRef<HTMLSpanElement>(null)
  const [volFlash, setVolFlash] = useState<number | null>(null)
  const flashTimer = useRef<number>()

  const elsewhere = !local && device && device.is_active

  // scroll anywhere on the island to change volume, the time readout briefly becomes a volume readout
  const onWheel = (e: React.WheelEvent) => {
    if ((e.target as HTMLElement).closest('.panel')) return
    const v = Math.max(0, Math.min(1, usePlayer.getState().volume - e.deltaY * 0.0015))
    setVolume(v)
    setVolFlash(v)
    clearTimeout(flashTimer.current)
    flashTimer.current = window.setTimeout(() => setVolFlash(null), 900)
  }

  return (
    <div className="dock">
      {(elsewhere || (sdkStatus === 'error' && !hideErr)) && (
        <div className="bar-note">
          {sdkStatus === 'error' && !elsewhere ? (
            <>
              <span>{sdkError}</span>
              <button className="bar-note-x" onClick={() => setHideErr(true)} aria-label="Dismiss">
                <Icon name="close" size={13} />
              </button>
            </>
          ) : (
            <>
              <Icon name="devices" size={15} />
              <span>
                Playing on <b>{device!.name}</b>
              </span>
              {sdkStatus === 'ready' && (
                <button className="bar-note-btn" onClick={() => transferHere()}>
                  Play here
                </button>
              )}
            </>
          )}
        </div>
      )}

      <div className={`pill ${paused ? 'paused' : 'playing'} ${track ? '' : 'empty'}`} ref={pill} onWheel={onWheel}>
        <div className="pill-wash" aria-hidden="true" />
        {track && <Rail pill={pill} timeEl={timeEl} />}

        <div className="pill-now">
          {track ? (
            <>
              <button key={track.id} className="pill-art fresh" onClick={() => toggleNowPlaying(true)} aria-label="Open now playing">
                <Cover images={track.images} size="md" />
                <span className="pill-art-hint">
                  <Icon name="expand" size={15} />
                </span>
              </button>
              <div className="pill-text">
                <a className="pill-title" href={`/album/${track.albumId}`} onClick={link(`/album/${track.albumId}`)}>
                  {track.name}
                </a>
                <div className="pill-artists">
                  {track.artists.map((a, i) => (
                    <span key={a.id + i}>
                      {i > 0 && ', '}
                      <a href={`/artist/${a.id}`} onClick={link(`/artist/${a.id}`)}>
                        {a.name}
                      </a>
                    </span>
                  ))}
                </div>
              </div>
              <button
                className={`icon-btn sm heart ${liked ? 'on' : ''}`}
                onClick={() => setLiked(track, !liked)}
                aria-label={liked ? 'Remove from Liked songs' : 'Save to Liked songs'}
              >
                <Icon name={liked ? 'heartFill' : 'heart'} size={17} />
              </button>
            </>
          ) : (
            <div className="pill-idle">Nothing playing. Pick something and the room changes color.</div>
          )}
        </div>

        <div className="pill-transport">
          <button className={`icon-btn sm toggle ${shuffle ? 'on' : ''}`} onClick={toggleShuffle} aria-label="Shuffle" title={shuffle ? 'Shuffle on' : 'Shuffle off'}>
            <Icon name="shuffle" size={17} />
          </button>
          <button className="icon-btn" onClick={prev} aria-label="Previous">
            <Icon name="prev" size={19} />
          </button>
          <button className="pill-play" onClick={toggle} aria-label={paused ? 'Play' : 'Pause'}>
            <Icon name={paused ? 'play' : 'pause'} size={19} />
          </button>
          <span className="peek-wrap">
            <button className="icon-btn" onClick={next} aria-label="Next">
              <Icon name="next" size={19} />
            </button>
            {upNext && (
              <span className="peek" aria-hidden="true">
                <Cover images={upNext.images} size="sm" className="peek-art" />
                <span className="peek-text">
                  <span className="kicker">Next</span>
                  <span className="peek-name">{upNext.name}</span>
                  <span className="peek-sub">{upNext.artists.map((a) => a.name).join(', ')}</span>
                </span>
              </span>
            )}
          </span>
          <button
            className={`icon-btn sm toggle ${repeat !== 'off' ? 'on' : ''}`}
            onClick={cycleRepeat}
            aria-label={`Repeat: ${repeat}`}
            title={repeat === 'off' ? 'Repeat off' : repeat === 'context' ? 'Repeat all' : 'Repeat one'}
          >
            <Icon name="repeat" size={17} />
            {repeat === 'track' && <span className="repeat-one">1</span>}
          </button>
        </div>

        <span className={`pill-time ${volFlash !== null ? 'vol' : ''}`}>
          {volFlash !== null ? (
            <span>
              <Icon name={volFlash === 0 ? 'mute' : 'volume'} size={13} /> {Math.round(volFlash * 100)}
            </span>
          ) : (
            <span ref={timeEl}>{track ? `${time(positionNow())} / ${time(track.durationMs)}` : ''}</span>
          )}
        </span>

        <div className="pill-tools">
          <button className={`icon-btn sm ${panel === 'queue' ? 'on' : ''}`} onClick={() => togglePanel('queue')} aria-label="Queue">
            <Icon name="queue" size={18} />
          </button>
          <button
            className={`icon-btn sm ${panel === 'devices' ? 'on' : ''} ${elsewhere ? 'remote' : ''}`}
            onClick={() => togglePanel('devices')}
            aria-label="Devices"
          >
            <Icon name="devices" size={18} />
          </button>
          <Volume />
          <button className="icon-btn sm" onClick={() => toggleNowPlaying(true)} aria-label="Now playing">
            <Icon name="expand" size={16} />
          </button>
        </div>

        {panel === 'queue' && <QueuePanel />}
        {panel === 'devices' && <DevicesPanel />}
      </div>
    </div>
  )
}

/**
 * The rail of light along the top edge. The rail, the playhead, the color wash and
 * the playing row's underline all ride compositor animations (see lib/progress), so
 * they glide at full frame rate without JS or repaints. A slow timer handles the
 * rest: the time text, and the --p bits that can't be transforms. Hover shows the
 * time under the cursor.
 */
function Rail({ pill, timeEl }: { pill: React.RefObject<HTMLDivElement>; timeEl: React.RefObject<HTMLSpanElement> }) {
  const rail = useRef<HTMLDivElement>(null)
  const run = useRef<HTMLSpanElement>(null)
  const fill = useRef<HTMLSpanElement>(null)
  const tip = useRef<HTMLSpanElement>(null)
  const drag = useRef<number | null>(null)
  const [dragging, setDragging] = useState(false)

  const paint = useRef(() => {})
  const anim = useRef<ReturnType<typeof progressAnimator> | null>(null)

  // layout effect so the animations are on before the first paint, no flash of a full bar
  useLayoutEffect(() => {
    let row: HTMLElement | null = null
    const a = progressAnimator(() => {
      const wash = pill.current?.querySelector('.pill-wash')
      const r = rail.current
      // where the rail sits inside the island, for the wash that runs edge to playhead
      const L = r?.offsetLeft ?? 0
      const W = r?.offsetWidth ?? 0
      const P = (wash as HTMLElement | null)?.offsetWidth || 1
      return [
        { el: fill.current, at: (p) => `scaleX(${p})`, span: W },
        { el: run.current, at: (p) => `translateX(${p * W}px)`, span: W },
        { el: wash, pseudo: '::before', at: (p) => `scaleX(${(L + p * W) / P})`, span: W },
        { el: wash, pseudo: '::after', at: (p) => `translateX(${L + p * W}px)`, span: W },
        { el: row, pseudo: '::after', at: (p) => `scaleX(${p})`, span: (row?.offsetWidth ?? 0) - 24 },
      ]
    }, () => drag.current)
    anim.current = a

    let timer = 0
    let lastText = ''
    let lastF = ''
    paint.current = () => {
      const s = usePlayer.getState()
      const d = s.track?.durationMs ?? 0
      const p = drag.current ?? positionNow()
      // what's left on --p: the wash edge fading in, the playing row's tint. 3 decimals
      // means a paused track writes nothing at all
      const f = (d ? Math.min(p / d, 1) : 0).toFixed(3)
      // the playing row in whatever list is open, it comes and goes as lists scroll
      const now = document.querySelector('.row.current') as HTMLElement | null
      if (now !== row) {
        row = now
        a.sync()
        lastF = ''
      }
      if (f !== lastF) {
        pill.current?.style.setProperty('--p', f)
        row?.style.setProperty('--p', f)
        lastF = f
      }
      const text = d ? `${time(p)} / ${time(d)}` : ''
      if (text !== lastText && timeEl.current) {
        timeEl.current.textContent = text
        lastText = text
      }
    }
    // just the time text and the --p leftovers, the animations run themselves
    const loop = () => {
      paint.current()
      timer = window.setTimeout(loop, isActive() ? 250 : 1000)
    }
    a.sync()
    loop()
    const off = onActivity(() => {
      clearTimeout(timer)
      a.sync()
      loop()
    })
    const ro = new ResizeObserver(() => a.sync())
    if (pill.current) ro.observe(pill.current)
    return () => {
      clearTimeout(timer)
      off()
      ro.disconnect()
      a.stop()
    }
  }, [pill, timeEl])

  const at = (clientX: number) => {
    const r = rail.current!.getBoundingClientRect()
    const f = Math.min(Math.max((clientX - r.left) / r.width, 0), 1)
    return { f, ms: f * (usePlayer.getState().track?.durationMs ?? 0) }
  }

  const onMove = (e: React.PointerEvent) => {
    const { f, ms } = at(e.clientX)
    rail.current?.style.setProperty('--hx', String(f))
    if (tip.current) tip.current.textContent = time(ms)
  }

  const onDown = (e: React.PointerEvent) => {
    drag.current = at(e.clientX).ms
    setDragging(true)
    paint.current()
    anim.current?.sync()
    const move = (ev: PointerEvent) => {
      drag.current = at(ev.clientX).ms
      paint.current()
      anim.current?.sync()
    }
    const up = () => {
      // let go before seeking, the seek's state change re-syncs the animations
      const ms = drag.current
      drag.current = null
      if (ms !== null) seek(ms)
      anim.current?.sync()
      setDragging(false)
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', up)
    }
    window.addEventListener('pointermove', move)
    window.addEventListener('pointerup', up)
  }

  return (
    <div className={`rail ${dragging ? 'dragging' : ''}`} ref={rail} onPointerMove={onMove} onPointerDown={onDown} aria-label="Seek" role="slider">
      <span className="rail-line">
        <span className="rail-fill" ref={fill} />
      </span>
      {/* the runner slides, the head inside it is free to scale on hover */}
      <span className="rail-run" ref={run}>
        <span className="rail-head" />
      </span>
      <span className="rail-tip" ref={tip} />
    </div>
  )
}

function Volume() {
  const volume = usePlayer((s) => s.volume)
  const [before, setBefore] = useState(0.7)
  const icon = volume === 0 ? 'mute' : volume < 0.5 ? 'volumeLow' : 'volume'
  return (
    <div className="vol">
      <button
        className="icon-btn sm"
        aria-label={volume === 0 ? 'Unmute' : 'Mute'}
        onClick={() => {
          if (volume > 0) {
            setBefore(volume)
            setVolume(0)
          } else setVolume(before || 0.7)
        }}
      >
        <Icon name={icon} size={18} />
      </button>
      <input
        className="vol-range"
        type="range"
        min={0}
        max={1}
        step={0.01}
        value={volume}
        style={{ ['--v' as any]: volume }}
        onChange={(e) => setVolume(Number(e.target.value))}
        aria-label="Volume"
      />
    </div>
  )
}

function QueuePanel() {
  const track = usePlayer((s) => s.track)
  const [queue, setQueue] = useState<NowTrack[] | null>(null)
  useEffect(() => {
    getQueue()
      .then(setQueue)
      .catch(() => setQueue([]))
  }, [track?.id])
  return (
    <div className="panel">
      <div className="panel-head">
        <span className="kicker">Up next</span>
      </div>
      <div className="panel-body">
        {queue === null && <div className="panel-empty">…</div>}
        {queue?.length === 0 && <div className="panel-empty">Nothing queued</div>}
        {queue?.slice(0, 30).map((t, i) => (
          <div className="mini-row" key={t.id + i}>
            <Cover images={t.images} size="sm" className="mini-art" />
            <div className="mini-text">
              <div className="mini-name">{t.name}</div>
              <div className="mini-sub">{t.artists.map((a) => a.name).join(', ')}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

function DevicesPanel() {
  const ours = usePlayer((s) => s.deviceId)
  const [devices, setDevices] = useState<Device[] | null>(null)
  useEffect(() => {
    getDevices()
      .then(setDevices)
      .catch(() => setDevices([]))
  }, [])
  const icon = (t: string) => (t === 'Smartphone' ? 'phone' : t === 'Speaker' ? 'speaker' : 'computer')
  return (
    <div className="panel panel-sm">
      <div className="panel-head">
        <span className="kicker">Play on</span>
      </div>
      <div className="panel-body">
        {devices === null && <div className="panel-empty">Looking around…</div>}
        {devices?.map((d) => (
          <button
            key={d.id}
            className={`device ${d.is_active ? 'active' : ''}`}
            onClick={async () => {
              await transferTo(d.id, true)
              togglePanel('devices')
            }}
          >
            <Icon name={icon(d.type)} size={20} />
            <span>
              {d.id === ours ? 'This app' : d.name}
              <small>{d.is_active ? 'Playing now' : d.type}</small>
            </span>
            {d.is_active && <Icon name="check" size={16} />}
          </button>
        ))}
      </div>
    </div>
  )
}
