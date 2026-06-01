# Deploying Playlist Porter

The app has two halves that get hosted separately:

- **Frontend** (React) — a static site, deployed on **Netlify** (config:
  `netlify.toml` at the repo root).
- **Backend** (Flask) — a Python web service, deployed somewhere that runs
  `gunicorn` (e.g. **Render**, **Railway**, **Fly.io**).

They talk over HTTP, and the session cookie that keeps you "connected" to each
music service must survive that round-trip — which is the one detail worth
getting right (see [Connecting the two](#connecting-the-two)).

---

## 1. Backend (Flask) → Render / Railway / Fly

Start command (from the `peer_tutoring_app/backend` directory):

```bash
gunicorn wsgi:app
```

On Render, for example: New → Web Service → point at this repo, set **Root
Directory** to `peer_tutoring_app/backend`, **Build Command**
`pip install -r requirements.txt`, **Start Command** `gunicorn wsgi:app`.

Set these environment variables on the service:

| Variable | Value |
|---|---|
| `SECRET_KEY` | a long random string |
| `FRONTEND_URL` | your Netlify URL, e.g. `https://your-site.netlify.app` |
| `BACKEND_URL` | this service's URL, e.g. `https://your-backend.onrender.com` |
| `SESSION_COOKIE_SAMESITE` | `None` (only if frontend & backend are on different domains — see below) |
| `SESSION_COOKIE_SECURE` | `true` (required when `SameSite=None`) |
| `SPOTIFY_CLIENT_ID` / `SPOTIFY_CLIENT_SECRET` | from your Spotify app |
| `SPOTIFY_REDIRECT_URI` | `https://your-backend.onrender.com/api/auth/spotify/callback` |
| Apple / SoundCloud vars | as in `.env.example`, if used |

**Important — update OAuth redirect URIs.** In each provider's developer
dashboard, the redirect URI must now point at your *deployed* backend
(`https://your-backend.onrender.com/api/auth/<provider>/callback`), not
`localhost`. Spotify requires an exact match.

---

## 2. Frontend (React) → Netlify

`netlify.toml` already sets the base directory, Node version, OpenSSL flag, build
command and publish folder, so connecting the repo is enough. The only choice is
how the frontend reaches the backend.

### Connecting the two

**Option A — same-origin proxy (recommended).** Keep requests first-party so the
session cookie is never a cross-site cookie. In `netlify.toml`, uncomment the
`/api/*` redirect and set your backend URL:

```toml
[[redirects]]
  from = "/api/*"
  to = "https://your-backend.onrender.com/api/:splat"
  status = 200
  force = true
```

Leave `REACT_APP_API_URL = ""` (already the default in `netlify.toml`) so the app
calls `/api/...` on its own origin. With this option you can leave the backend's
`SESSION_COOKIE_SAMESITE` as the default `Lax`.

**Option B — direct cross-site calls.** Set `REACT_APP_API_URL` to your backend
URL (e.g. in the Netlify UI). Because the cookie is now sent cross-site, you
**must** set the backend's `SESSION_COOKIE_SAMESITE=None` and
`SESSION_COOKIE_SECURE=true`, and the backend's CORS origin (`FRONTEND_URL`) must
match your Netlify URL exactly. (CORS with credentials is already enabled.)

Option A avoids the cross-site cookie pitfalls entirely, so prefer it.

---

## 3. Smoke test after deploy

1. Open the Netlify URL → the three service cards render.
2. Configured services show **Available**; click **Connect Spotify** → you should
   land on Spotify's real login, then bounce back to the app as **Connected**.
3. Pick a source playlist, a destination, and run a transfer.

If "Connect" succeeds but the app still shows disconnected, the session cookie
isn't surviving — re-check the [Connecting the two](#connecting-the-two) cookie
settings.
