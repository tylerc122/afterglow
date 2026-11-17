// One consistent icon set: 24 grid, 1.7 stroke, round caps. Filled only where
// a filled shape reads better at small sizes (play, pause, heart when liked).

const paths: Record<string, JSX.Element> = {
  play: <path d="M8 5.5v13a.8.8 0 0 0 1.2.7l10.4-6.5a.8.8 0 0 0 0-1.4L9.2 4.8A.8.8 0 0 0 8 5.5Z" fill="currentColor" stroke="none" />,
  pause: (
    <g fill="currentColor" stroke="none">
      <rect x="6.5" y="5" width="3.8" height="14" rx="1.1" />
      <rect x="13.7" y="5" width="3.8" height="14" rx="1.1" />
    </g>
  ),
  next: (
    <g>
      <path d="M6 6.2v11.6a.7.7 0 0 0 1.1.6l8.2-5.8a.7.7 0 0 0 0-1.2L7.1 5.6a.7.7 0 0 0-1.1.6Z" fill="currentColor" stroke="none" />
      <path d="M18 5.5v13" />
    </g>
  ),
  prev: (
    <g>
      <path d="M18 6.2v11.6a.7.7 0 0 1-1.1.6l-8.2-5.8a.7.7 0 0 1 0-1.2l8.2-5.8a.7.7 0 0 1 1.1.6Z" fill="currentColor" stroke="none" />
      <path d="M6 5.5v13" />
    </g>
  ),
  shuffle: <path d="M3.5 7h3.2c2 0 3.1 1 4.2 2.6l2.2 3.3c1 1.6 2.2 2.6 4.2 2.6h3.2M17.5 13l3 2.5-3 2.5M3.5 17h3.2c1.4 0 2.4-.5 3.2-1.4M13.3 8.4c.8-.9 1.8-1.4 3.2-1.4h3.9M17.5 4.5l3 2.5-3 2.5" />,
  repeat: <path d="M4 11.5V10a3 3 0 0 1 3-3h12.5M16.5 4l3 3-3 3M20 12.5V14a3 3 0 0 1-3 3H4.5M7.5 20l-3-3 3-3" />,
  heart: <path d="M12 19.5s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.6-7.5 10-7.5 10Z" />,
  heartFill: <path d="M12 19.5s-7.5-4.4-7.5-10A4.2 4.2 0 0 1 12 7a4.2 4.2 0 0 1 7.5 2.5c0 5.6-7.5 10-7.5 10Z" fill="currentColor" />,
  queue: <path d="M4 6.5h11M4 11.5h11M4 16.5h6.5M17.5 14v6.5M14.5 17.2h6" />,
  devices: (
    <g>
      <rect x="3" y="5" width="12.5" height="9.5" rx="1.6" />
      <path d="M6.5 18.5h5.5" />
      <rect x="17.5" y="8" width="4" height="10.5" rx="1.2" />
    </g>
  ),
  volume: <path d="M4.5 9.5h2.8L11.5 6v12l-4.2-3.5H4.5Zm10.3-1.3a5 5 0 0 1 0 7.6M17.4 5.6a8.6 8.6 0 0 1 0 12.8" />,
  volumeLow: <path d="M4.5 9.5h2.8L11.5 6v12l-4.2-3.5H4.5Zm10.3-1.3a5 5 0 0 1 0 7.6" />,
  mute: <path d="M4.5 9.5h2.8L11.5 6v12l-4.2-3.5H4.5Zm11-.5 5 6m0-6-5 6" />,
  expand: <path d="M14.5 4.5h5v5M9.5 19.5h-5v-5M19.5 4.5 13.5 10.5M4.5 19.5l6-6" />,
  collapse: <path d="M19.5 9.5h-5v-5M4.5 14.5h5v5M14.5 9.5l6-6M9.5 14.5l-6 6" />,
  search: <path d="M10.8 17.6a6.8 6.8 0 1 0 0-13.6 6.8 6.8 0 0 0 0 13.6ZM16 15.9l4 4" />,
  home: <path d="M4.5 10.2 12 4.5l7.5 5.7V19a.8.8 0 0 1-.8.8H15v-5.3a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v5.3H5.3a.8.8 0 0 1-.8-.8Z" />,
  back: <path d="M14.5 6 8.5 12l6 6" />,
  forward: <path d="M9.5 6l6 6-6 6" />,
  more: (
    <g fill="currentColor" stroke="none">
      <circle cx="6" cy="12" r="1.6" />
      <circle cx="12" cy="12" r="1.6" />
      <circle cx="18" cy="12" r="1.6" />
    </g>
  ),
  plus: <path d="M12 5v14M5 12h14" />,
  close: <path d="M6.5 6.5l11 11m0-11-11 11" />,
  check: <path d="m5 12.5 4.5 4.5L19 7.5" />,
  clock: <path d="M12 20a8 8 0 1 0 0-16 8 8 0 0 0 0 16Zm0-12v4.3l2.8 1.7" />,
  album: (
    <g>
      <circle cx="12" cy="12" r="8" />
      <circle cx="12" cy="12" r="2.2" />
    </g>
  ),
  user: <path d="M12 12a3.8 3.8 0 1 0 0-7.6 3.8 3.8 0 0 0 0 7.6Zm-7 7.5c.8-3.2 3.6-5 7-5s6.2 1.8 7 5" />,
  link: <path d="M10 14a4 4 0 0 0 5.7 0l3-3A4 4 0 0 0 13 5.3l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3A4 4 0 0 0 11 18.7l1-1" />,
  trash: <path d="M5 7h14M10 7V5h4v2M7 7l.8 12h8.4L17 7" />,
  list: <path d="M8.5 7h11M8.5 12h11M8.5 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01" />,
  sparkle: <path d="M12 4c.5 3.6 2.4 5.5 6 6-3.6.5-5.5 2.4-6 6-.5-3.6-2.4-5.5-6-6 3.6-.5 5.5-2.4 6-6Z" />,
  computer: (
    <g>
      <rect x="3.5" y="5" width="17" height="11" rx="1.6" />
      <path d="M8.5 19.5h7" />
    </g>
  ),
  phone: (
    <g>
      <rect x="7" y="3.5" width="10" height="17" rx="2.2" />
      <path d="M11 17.5h2" />
    </g>
  ),
  speaker: (
    <g>
      <rect x="6" y="3.5" width="12" height="17" rx="2.2" />
      <circle cx="12" cy="14" r="3" />
      <path d="M12 7.5h.01" />
    </g>
  ),
}

export type IconName = keyof typeof paths

export function Icon({ name, size = 20, className }: { name: IconName | string; size?: number; className?: string }) {
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}
