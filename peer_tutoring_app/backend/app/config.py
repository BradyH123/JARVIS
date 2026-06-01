"""Central configuration loaded from environment variables.

Nothing secret is hard-coded. Copy ``.env.example`` to ``.env`` and fill in the
credentials for whichever providers you want to enable. A provider that is
missing its credentials is reported as "not configured" by the API and the UI
disables its Connect button — the rest of the app keeps working.
"""
import os

from dotenv import load_dotenv

load_dotenv()


def _get(name, default=""):
    return os.environ.get(name, default).strip()


# Where the React app lives — used for OAuth redirects back into the UI and CORS.
FRONTEND_URL = _get("FRONTEND_URL", "http://localhost:3000")

# Public base URL of *this* backend. OAuth providers redirect the browser here.
BACKEND_URL = _get("BACKEND_URL", "http://localhost:5000")

# Signs the Flask session cookie. Override in production.
SECRET_KEY = _get("SECRET_KEY", "dev-only-change-me")

# Session cookie policy. For local dev the defaults (Lax / not-Secure) are fine.
# When the frontend and backend are on *different* domains in production, the
# browser only sends the cookie cross-site if it is SameSite=None AND Secure, so
# set SESSION_COOKIE_SAMESITE=None and SESSION_COOKIE_SECURE=true there.
SESSION_COOKIE_SAMESITE = _get("SESSION_COOKIE_SAMESITE", "Lax")
SESSION_COOKIE_SECURE = _get("SESSION_COOKIE_SECURE", "false").lower() in ("1", "true", "yes")


class SpotifyConfig:
    CLIENT_ID = _get("SPOTIFY_CLIENT_ID")
    CLIENT_SECRET = _get("SPOTIFY_CLIENT_SECRET")
    # Must exactly match a Redirect URI registered in your Spotify dashboard.
    REDIRECT_URI = _get("SPOTIFY_REDIRECT_URI", f"{BACKEND_URL}/api/auth/spotify/callback")

    @classmethod
    def is_configured(cls):
        return bool(cls.CLIENT_ID and cls.CLIENT_SECRET)


class AppleMusicConfig:
    # From your Apple Developer account (MusicKit identifier + key).
    TEAM_ID = _get("APPLE_TEAM_ID")
    KEY_ID = _get("APPLE_KEY_ID")
    # The contents of the .p8 private key, or a path to the file.
    PRIVATE_KEY = _get("APPLE_PRIVATE_KEY")
    PRIVATE_KEY_PATH = _get("APPLE_PRIVATE_KEY_PATH")

    @classmethod
    def private_key(cls):
        if cls.PRIVATE_KEY:
            # Allow \n-escaped single-line keys from env files.
            return cls.PRIVATE_KEY.replace("\\n", "\n")
        if cls.PRIVATE_KEY_PATH and os.path.exists(cls.PRIVATE_KEY_PATH):
            with open(cls.PRIVATE_KEY_PATH, "r", encoding="utf-8") as fh:
                return fh.read()
        return ""

    @classmethod
    def is_configured(cls):
        return bool(cls.TEAM_ID and cls.KEY_ID and cls.private_key())


class SoundCloudConfig:
    CLIENT_ID = _get("SOUNDCLOUD_CLIENT_ID")
    CLIENT_SECRET = _get("SOUNDCLOUD_CLIENT_SECRET")
    REDIRECT_URI = _get(
        "SOUNDCLOUD_REDIRECT_URI", f"{BACKEND_URL}/api/auth/soundcloud/callback"
    )

    @classmethod
    def is_configured(cls):
        return bool(cls.CLIENT_ID and cls.CLIENT_SECRET)
