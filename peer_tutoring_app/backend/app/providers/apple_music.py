"""Apple Music provider.

Auth model is different from the others:
  * The *developer token* is a JWT we sign server-side with your MusicKit key
    (ES256). It identifies your app to Apple.
  * The *Music User Token* identifies the listener and can ONLY be obtained in
    the browser via MusicKit JS (Apple does not offer a server redirect flow).

So the front end loads MusicKit with our developer token, the user authorises,
and the resulting Music User Token is posted back to us and stored. From then on
every request sends both tokens. Requires a paid Apple Developer account.

Docs: https://developer.apple.com/documentation/applemusicapi
"""
from __future__ import annotations

import time
from typing import List, Optional

import jwt
import requests

from ..config import AppleMusicConfig
from ..matching import best_match
from .base import MusicProvider, NotConfiguredError, Playlist, ProviderError, Track

API = "https://api.music.apple.com/v1"


class AppleMusicProvider(MusicProvider):
    key = "apple"
    name = "Apple Music"

    @classmethod
    def is_configured(cls) -> bool:
        return AppleMusicConfig.is_configured()

    # -- Tokens -----------------------------------------------------------
    def developer_token(self) -> str:
        """Sign a short-lived developer JWT for MusicKit / API calls."""
        if not self.is_configured():
            raise NotConfiguredError("Apple Music credentials are not set")
        now = int(time.time())
        payload = {"iss": AppleMusicConfig.TEAM_ID, "iat": now, "exp": now + 60 * 60 * 12}
        headers = {"kid": AppleMusicConfig.KEY_ID}
        return jwt.encode(
            payload, AppleMusicConfig.private_key(), algorithm="ES256", headers=headers
        )

    # Apple has no server-side authorize redirect; the browser handles consent.
    def build_auth_url(self, state: str) -> str:
        raise ProviderError(
            "Apple Music authorises in the browser via MusicKit, not a redirect URL"
        )

    def exchange_code(self, code: str) -> dict:
        raise ProviderError("Apple Music does not use an authorization code flow")

    def token_from_music_user_token(self, music_user_token: str) -> dict:
        return {"music_user_token": music_user_token, "storefront": ""}

    def _headers(self, token: dict) -> dict:
        return {
            "Authorization": f"Bearer {self.developer_token()}",
            "Music-User-Token": token["music_user_token"],
        }

    def _storefront(self, token: dict) -> str:
        if token.get("storefront"):
            return token["storefront"]
        resp = requests.get(f"{API}/me/storefront", headers=self._headers(token), timeout=20)
        if not resp.ok:
            raise ProviderError(f"Apple Music storefront lookup failed: {resp.text}")
        sf = resp.json()["data"][0]["id"]
        token["storefront"] = sf
        return sf

    def _get(self, token: dict, url: str, params: dict | None = None) -> dict:
        resp = requests.get(url, headers=self._headers(token), params=params, timeout=20)
        if not resp.ok:
            raise ProviderError(f"Apple Music GET {url} failed: {resp.text}")
        return resp.json()

    # -- Reading ----------------------------------------------------------
    def list_playlists(self, token: dict) -> List[Playlist]:
        playlists: List[Playlist] = []
        url = f"{API}/me/library/playlists?limit=100"
        while url:
            data = self._get(token, url)
            for item in data.get("data", []):
                attrs = item.get("attributes", {})
                playlists.append(
                    Playlist(
                        id=item["id"],
                        name=attrs.get("name", "Untitled"),
                        description=(attrs.get("description") or {}).get("standard", ""),
                    )
                )
            nxt = data.get("next")
            url = f"https://api.music.apple.com{nxt}" if nxt else None
        return playlists

    def get_playlist_tracks(self, token: dict, playlist_id: str) -> List[Track]:
        tracks: List[Track] = []
        url = f"{API}/me/library/playlists/{playlist_id}/tracks?limit=100"
        while url:
            data = self._get(token, url)
            for item in data.get("data", []):
                attrs = item.get("attributes", {})
                tracks.append(
                    Track(
                        title=attrs.get("name", ""),
                        artists=[attrs.get("artistName", "")] if attrs.get("artistName") else [],
                        album=attrs.get("albumName", ""),
                        duration_ms=attrs.get("durationInMillis", 0),
                        isrc=attrs.get("isrc", ""),
                        provider_id=item.get("id", ""),
                    )
                )
            nxt = data.get("next")
            url = f"https://api.music.apple.com{nxt}" if nxt else None
        return tracks

    # -- Writing ----------------------------------------------------------
    def search_track(self, token: dict, track: Track) -> Optional[str]:
        storefront = self._storefront(token)
        term = f"{track.title} {track.artists[0] if track.artists else ''}".strip()
        data = self._get(
            token,
            f"{API}/catalog/{storefront}/search",
            {"term": term, "types": "songs", "limit": 10},
        )
        songs = (data.get("results", {}).get("songs") or {}).get("data", [])
        candidates = []
        for s in songs:
            a = s.get("attributes", {})
            candidates.append(
                Track(
                    title=a.get("name", ""),
                    artists=[a.get("artistName", "")] if a.get("artistName") else [],
                    album=a.get("albumName", ""),
                    duration_ms=a.get("durationInMillis", 0),
                    isrc=a.get("isrc", ""),
                    provider_id=s.get("id", ""),  # catalog song id
                )
            )
        match = best_match(track, candidates)
        return match.provider_id if match else None

    def create_playlist(self, token: dict, name: str, description: str = "") -> str:
        resp = requests.post(
            f"{API}/me/library/playlists",
            headers={**self._headers(token), "Content-Type": "application/json"},
            json={"attributes": {"name": name, "description": description}},
            timeout=20,
        )
        if not resp.ok:
            raise ProviderError(f"Apple Music create playlist failed: {resp.text}")
        return resp.json()["data"][0]["id"]

    def add_tracks(self, token: dict, playlist_id: str, provider_ids: List[str]) -> None:
        data = [{"id": pid, "type": "songs"} for pid in provider_ids]
        for i in range(0, len(data), 100):
            chunk = data[i : i + 100]
            resp = requests.post(
                f"{API}/me/library/playlists/{playlist_id}/tracks",
                headers={**self._headers(token), "Content-Type": "application/json"},
                json={"data": chunk},
                timeout=20,
            )
            if not resp.ok:
                raise ProviderError(f"Apple Music add tracks failed: {resp.text}")
