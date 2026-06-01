# 🎧 Playlist Porter

Transfer a playlist from one mainstream music service to another — pick a source
(Spotify / Apple Music / SoundCloud), pick a playlist, pick a destination, and the
app recreates it there, matching each song by ISRC where possible and by
title/artist/duration otherwise.

It uses each service's **official API**. Your users never deal with API keys — they
just click **"Connect with Spotify"** and sign in normally. The only one-time setup
is registering free developer apps and pasting the keys into `backend/.env` (below).

```
peer_tutoring_app/
├── backend/                 Flask API
│   ├── app/
│   │   ├── app.py           routes (auth, playlists, transfer)
│   │   ├── transfer.py      provider-agnostic transfer engine
│   │   ├── matching.py      fuzzy song matching
│   │   ├── store.py         in-memory token store
│   │   ├── config.py        env-driven configuration
│   │   └── providers/       one module per service, behind a common interface
│   │       ├── base.py      the MusicProvider interface + Track/Playlist
│   │       ├── spotify.py   ✅ fully implemented
│   │       ├── apple_music.py
│   │       └── soundcloud.py
│   ├── wsgi.py
│   ├── requirements.txt
│   └── .env.example
└── frontend/                React (Create React App)
    └── src/{App.js, api.js, appleMusic.js, styles.css}
```

## Adding a new service

Subclass `MusicProvider`, implement the handful of methods, and register it in
`backend/app/providers/__init__.py`. Nothing else (UI, transfer engine, routes)
needs to change — they all speak the same interface.

## Running locally

### 1. Backend

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env        # then fill in credentials (see below)
python -m app.app           # serves http://localhost:5000
```

### 2. Frontend

```bash
cd frontend
npm install
npm start                   # serves http://localhost:3000
```

Open http://localhost:3000.

> Using Node 17+? `react-scripts@4` predates a change in OpenSSL, so prefix the
> command: `NODE_OPTIONS=--openssl-legacy-provider npm start` (same for `npm run
> build`).

## Getting credentials

| Service | Cost | Where | Notes |
|---|---|---|---|
| **Spotify** | Free | [developer.spotify.com/dashboard](https://developer.spotify.com/dashboard) | Add redirect URI `http://localhost:5000/api/auth/spotify/callback`. |
| **Apple Music** | $99/yr | [developer.apple.com](https://developer.apple.com/) → Keys → MusicKit | Gives a Key ID + `.p8` file; Team ID is under Membership. Auth happens in-browser via MusicKit. |
| **SoundCloud** | — | [developers.soundcloud.com](https://developers.soundcloud.com/) | ⚠️ SoundCloud currently keeps **new app registration closed**, so this provider only works if you already hold a client id/secret. |

Put them in `backend/.env` (copied from `.env.example`). Any service left blank
shows up as "Not set up" in the UI and is skipped — the rest still work.

## How matching works

For each source track the engine searches the destination catalogue and scores
results: an exact **ISRC** match wins outright; otherwise it blends normalised
title similarity (60%), artist similarity (30%), and a duration-proximity bonus.
Anything below the confidence threshold is reported back as "unmatched" so you can
add those few songs by hand. See `backend/app/matching.py`.

## Notes & limitations

- Tokens are kept in an in-memory store keyed by a session cookie — fine for local
  use and single-instance deployments. For production, back `store.py` with Redis.
- This moves *song lists*, not audio files. Nothing is downloaded; it only ever
  reads metadata and re-adds the same songs on the other service.
