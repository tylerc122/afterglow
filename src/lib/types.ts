export type Images = { sm?: string; md?: string; lg?: string }

export type ArtistRef = { id: string; name: string }

export type Track = {
  id: string
  uri: string
  name: string
  artists: ArtistRef[]
  albumId: string
  albumName: string
  images: Images
  durationMs: number
  explicit: boolean
  trackNumber?: number
}

export type Playlist = {
  id: string
  uri: string
  name: string
  description: string
  images: Images
  ownerId: string
  ownerName: string
  collaborative: boolean
  total: number
  snapshot: string
  /** snapshot we last pulled items for */
  syncedSnapshot?: string
  /** Spotify won't give us the track list (followed playlist under dev mode rules) */
  itemsUnavailable?: boolean
}

/** Ordered track ids for a playlist, or for liked songs (id = 'liked') */
export type ItemList = { id: string; ids: string[]; added: string[] }

export type Album = {
  id: string
  uri: string
  name: string
  artists: ArtistRef[]
  images: Images
  releaseDate: string
  type: string
  trackIds: string[]
  total: number
}

export type Artist = {
  id: string
  uri: string
  name: string
  images: Images
  genres: string[]
  albums?: { id: string; name: string; images: Images; releaseDate: string; type: string; uri: string }[]
}

export type Me = { id: string; name: string; image?: string; uri: string }

export type RGB = [number, number, number]
export type Palette = { colors: RGB[]; accent: RGB }

/** one listen, from /me/player/recently-played (any device, songs played 30s+) */
export type Play = { at: number; track: Track; contextUri: string | null; year?: string }
