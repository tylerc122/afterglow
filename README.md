# Afterglow

A Spotify desktop client for the Mac that I built because the real one takes a second to load everything and I wanted it to look nicer. Whatever's playing lights the whole app in the colors of its cover, a slow glow behind everything that fades over when the song changes.

Unofficial, not affiliated with or endorsed by Spotify. You need Spotify Premium to play anything, and you sign in with your own account.

## What's in it

- **Instant.** Your whole library lives on disk and loads into memory before the first paint, so opening a playlist takes about 20ms, art included. It syncs with Spotify in the background.
- **The glow.** Album art colors light the room, the player bar fills with the song's color as it plays, and pausing turns the light down.
- **Actually random shuffle.** Fisher-Yates with `crypto.getRandomValues`, played as a plain list, so you skip Spotify's weighted shuffle. Double-click a playlist in the sidebar to shuffle it.
- **Your profile.** Top artists and songs over 4 weeks, 6 months and a year, with how they're moving, plus a listening clock, your eras, your colors and what you've had on repeat.
- **Ten years of history, if you've got it.** Request your Extended Streaming History from Spotify's privacy page, drop the zips in a folder, and the profile adds a "since 2016" view, hours per year, a weekday-by-hour heatmap, your longest streak, and the first time you played each artist.
- **Spotify Connect.** It shows up as a device, controls your other devices, and picks up what's playing on your desktop.
- ⌘K for everything, a full-screen now playing view, the queue, and the device picker.

## Performance

Both apps playing music with the window in the background, which is how I actually use them, sampled with `top` every 5 seconds for 5 minutes after a minute of warmup, on an Apple Silicon MacBook plugged in:

|                  | Afterglow | Spotify  |
| ---------------- | --------- | -------- |
| CPU, average     | 3.5%      | 7.0%     |
| CPU, median      | 3.5%      | 3.6%     |
| CPU, peak        | 5.0%      | 35.6%    |
| Energy impact    | 3.5       | 7.1      |
| RAM              | 371 MB    | 1,031 MB |

So about half the battery and a third of the memory. Most of the time they're doing about the same work, Spotify just keeps spiking and Afterglow never goes over 5%, and about a point and a half of Afterglow's number is Spotify's own DRM decoder, which any Spotify player pays for.

It didn't start out like this, the first version sat at ~80% CPU and grew to 3 GB over an afternoon. What fixed it:

- The glow drops to ~15fps while you're using the app and stops completely once the colors settle when the window's in the background.
- The progress bar is a compositor animation that steps once per screen pixel, so it moves smoothly but only actually changes a few times a second, since every change makes the GPU redo the blur behind the player bar.
- The little equalizer bars animate `transform` instead of `height`. Animating height repainted the playing row every frame and Chromium hung onto the paint memory, about 40 MB a minute while music was playing.

## Running it

It's an Electron app on [castlabs' Electron build](https://github.com/castlabs/electron-releases), which ships the Widevine DRM module Spotify's player needs (regular Electron doesn't have it).

1. **Make a Spotify app** at [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard). Add `http://127.0.0.1:5173/callback` as a redirect URI and check Web API and Web Playback SDK. New apps start in development mode, which only lets accounts you add under User Management sign in, so add yourself.
2. **Configure it.** Copy `.env.example` to `.env.local` and paste in your client ID.
3. **Install.** `npm install` (Node 20+).
4. **Get a VMP signature.** Spotify's license server refuses castlabs' development signature, so every song fails and skips until the app is signed for production. castlabs' EVS service does this for free:

   ```sh
   python3 -m venv .venv-evs
   .venv-evs/bin/pip install castlabs-evs
   .venv-evs/bin/evs-account signup
   ```

5. **Build.** `./scripts/package-mac.sh` builds `release/Afterglow.app`, VMP-signs it, and ad-hoc codesigns it. Open it, sign in, and wait for the first sync.

For development, run `npm run dev` and `npm run app:dev` side by side. The dev window controls your other devices fine, but it only plays audio itself once it's signed.

### Streaming history (optional)

Put the zips from Spotify's Extended Streaming History export in `~/Spotify Data`, or point the app somewhere else with `{"historyDir": "~/wherever"}` in `~/Library/Application Support/Afterglow/config.json` (or `AFTERGLOW_HISTORY_DIR`). All the zips in the folder are read and overlapping exports get de-duped, and dropping in a new export updates the stats in the open window a few seconds later, no restart. Plays the app sees after that are appended to `.data/afterglow_live.ndjson` in that folder, in the export's own format.

## Notes

- Everything stays on your Mac. The app only talks to Spotify, using a token stored locally.
- Spotify's February 2026 API changes cut a lot: no batch lookups, no artist top tracks, no algorithmic playlists (Discover Weekly, Daily Mixes), search capped at 10 results, and track lists only for playlists you own or collaborate on. The app works around what it can.
- The Web API doesn't push changes, so Connect sync polls: every 4 seconds while another device is playing, every 15 otherwise, and right away when you come back to the window.

## Stack

Vite, React 18, TypeScript, zustand, Dexie (IndexedDB), @tanstack/react-virtual, and Geist. Plain CSS with design tokens in `src/styles/tokens.css`.

## License

MIT
