import type { Album, Artist, Images, Playlist, Track } from './types'

type SpImage = { url: string; width?: number | null; height?: number | null }

export function images(list?: SpImage[] | null): Images {
  if (!list?.length) return {}
  // unsized images (custom playlist uploads) are usually large
  const sized = [...list].sort((a, b) => (a.width ?? 640) - (b.width ?? 640))
  const sm = sized[0].url
  const lg = sized[sized.length - 1].url
  const md = (sized.find((i) => (i.width ?? 640) >= 280) ?? sized[sized.length - 1]).url
  return { sm, md, lg }
}

export function track(t: any, album?: { id: string; name: string; images: Images }): Track | null {
  if (!t || !t.id || t.type === 'episode') return null
  return {
    id: t.id,
    uri: t.uri,
    name: t.name,
    artists: (t.artists ?? []).map((a: any) => ({ id: a.id, name: a.name })),
    albumId: album?.id ?? t.album?.id ?? '',
    albumName: album?.name ?? t.album?.name ?? '',
    images: album?.images ?? images(t.album?.images),
    durationMs: t.duration_ms ?? 0,
    explicit: !!t.explicit,
    trackNumber: t.track_number,
  }
}

export function playlist(p: any): Playlist {
  // the Feb 2026 API renamed `tracks` to `items` on playlist objects, handle both
  const total = p.items?.total ?? p.tracks?.total ?? 0
  return {
    id: p.id,
    uri: p.uri,
    name: p.name,
    description: cleanDescription(p.description ?? ''),
    images: images(p.images),
    ownerId: p.owner?.id ?? '',
    ownerName: p.owner?.display_name ?? p.owner?.id ?? '',
    collaborative: !!p.collaborative,
    total,
    snapshot: p.snapshot_id ?? '',
  }
}

export function album(a: any): Album {
  const imgs = images(a.images)
  return {
    id: a.id,
    uri: a.uri,
    name: a.name,
    artists: (a.artists ?? []).map((x: any) => ({ id: x.id, name: x.name })),
    images: imgs,
    releaseDate: a.release_date ?? '',
    type: a.album_type ?? 'album',
    trackIds: [],
    total: a.total_tracks ?? 0,
  }
}

export function artist(a: any): Artist {
  return {
    id: a.id,
    uri: a.uri,
    name: a.name,
    images: images(a.images),
    genres: a.genres ?? [],
  }
}

/** Spotify descriptions are HTML-escaped and sometimes contain links */
export function cleanDescription(s: string) {
  const el = document.createElement('textarea')
  el.innerHTML = s.replace(/<[^>]+>/g, '')
  return el.value.trim()
}
