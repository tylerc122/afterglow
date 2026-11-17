// Minimal types for the Web Playback SDK (only what we use)

interface Window {
  onSpotifyWebPlaybackSDKReady: () => void
}

declare namespace Spotify {
  interface Image {
    url: string
    height?: number | null
    width?: number | null
  }
  interface Track {
    id: string | null
    uri: string
    name: string
    duration_ms: number
    artists: { name: string; uri: string }[]
    album: { name: string; uri: string; images: Image[] }
  }
  interface PlaybackState {
    context: { uri: string | null }
    paused: boolean
    position: number
    duration: number
    shuffle: boolean
    repeat_mode: 0 | 1 | 2
    track_window: { current_track: Track | null; next_tracks: Track[]; previous_tracks: Track[] }
  }
  interface Error {
    message: string
  }
  class Player {
    constructor(opts: { name: string; getOAuthToken: (cb: (t: string) => void) => void; volume?: number })
    connect(): Promise<boolean>
    disconnect(): void
    addListener(e: 'ready' | 'not_ready', cb: (d: { device_id: string }) => void): void
    addListener(e: 'player_state_changed', cb: (s: PlaybackState | null) => void): void
    addListener(
      e: 'initialization_error' | 'authentication_error' | 'account_error' | 'playback_error',
      cb: (e: Error) => void,
    ): void
    addListener(e: 'autoplay_failed', cb: () => void): void
    togglePlay(): Promise<void>
    pause(): Promise<void>
    nextTrack(): Promise<void>
    previousTrack(): Promise<void>
    seek(ms: number): Promise<void>
    setVolume(v: number): Promise<void>
    activateElement(): Promise<void>
  }
}
