import Dexie, { type Table } from 'dexie'
import type { Album, Artist, ItemList, Palette, Play, Playlist, Track } from './types'

class AfterglowDB extends Dexie {
  playlists!: Table<Playlist & { order: number }, string>
  items!: Table<ItemList, string>
  tracks!: Table<Track, string>
  albums!: Table<Album, string>
  artists!: Table<Artist, string>
  colors!: Table<{ url: string; palette: Palette }, string>
  meta!: Table<{ key: string; value: any }, string>
  plays!: Table<Play, number>

  constructor() {
    super('afterglow')
    this.version(1).stores({
      playlists: 'id',
      items: 'id',
      tracks: 'id',
      albums: 'id',
      artists: 'id',
      colors: 'url',
      meta: 'key',
    })
    // every play Spotify reports, kept forever so stats outgrow the API's 50-play window
    this.version(2).stores({ plays: 'at' })
  }
}

export const db = new AfterglowDB()
