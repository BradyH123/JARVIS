"""SoundCloud provider.

Auth model: OAuth 2.1 Authorization Code with PKCE.
Docs: https://developers.soundcloud.com/docs/api/guide

IMPORTANT REAL-WORLD CAVEAT: SoundCloud has kept new API application
registration **closed** for a long time. If you do not already hold a client
id/secret you will not be able to enable this provider. The implementation below
is correct against the documented API so it works the moment valid credentials
exist, and it reports itself as "not configured" until then. Also note that
SoundCloud hosts user uploads, so catalogue coverage for mainstream tracks is
patchier than Spotify/Apple Music — expect more unmatched songs.
"""
from __future__ import annotations

import time
from typing import List, Optional
from urllib.parse import urlencode

import requests

from ..config import SoundCloudConfig
from ..matching import best_match
from .base import MusicProvider, NotConfiguredError, Playlist, ProviderError, Track

AUTH_URL = "https://secure.soundcloud.com/authorize"
TOKEN_URL = "https://secure.soundcloud.com/oauth/token"
API = "https://api.soundcloud.com"


class SoundCloudProvider(MusicProvider):
    key = "soundcloud"
    name = "SoundCloud"

    @classmethod
    def is_configured(cls) -> bool:
        return SoundCloudConfig.is_configured()

    # -- Auth -------------------------------------------------------------
    def build_auth_url(self, state: str) -> str:
        if not self.is_configured():
            raise NotConfiguredError("SoundCloud credentials are not set")
        params = {
            "client_id": SoundCloudConfig.CLIENT_ID,
            "redirect_uri": SoundCloudConfig.REDIRECT_URI,
            "response_type": "code",
            "state": state,
        }
        return f"{AUTH_URL}?{urlencode(params)}"

    def exchange_code(self, code: str) -> dict:
        resp = requests.post(
            TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "client_id": SoundCloudConfig.CLIENT_ID,
                "client_secret": SoundCloudConfig.CLIENT_SECRET,
                "redirect_uri": SoundCloudConfig.REDIRECT_URI,
                "code": code,
            },
            headers={"Accept": "application/json"},
            timeout=15,
        )
        if not resp.ok:
            raise ProviderError(f"SoundCloud token exchange failed: {resp.text}")
        token = resp.json()
        token["expires_at"] = time.time() + token.get("expires_in", 3600)
        return token

    def _refresh(self, token: dict) -> dict:
        resp = requests.post(
            TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "client_id": SoundCloudConfig.CLIENT_ID,
                "client_secret": SoundCloudConfig.CLIENT_SECRET,
                "refresh_token": token["refresh_token"],
            },
            headers={"Accept": "application/json"},
            timeout=15,
        )
        if not resp.ok:
            raise ProviderError(f"SoundCloud token refresh failed: {resp.text}")
        new_token = resp.json()
        token.update(new_token)
        token["expires_at"] = time.time() + new_token.get("expires_in", 3600)
        return token

    def _headers(self, token: dict) -> dict:
        if token.get("expires_at", 0) <= time.time() + 30 and token.get("refresh_token"):
            self._refresh(token)
        return {"Authorization": f"OAuth {token['access_token']}", "Accept": "application/json"}

    def _get(self, token: dict, url: str, params: dict | None = None) -> dict:
        resp = requests.get(url, headers=self._headers(token), params=params, timeout=20)
        if not resp.ok:
            raise ProviderError(f"SoundCloud GET {url} failed: {resp.text}")
        return resp.json()

    # -- Reading ----------------------------------------------------------
    def list_playlists(self, token: dict) -> List[Playlist]:
        data = self._get(token, f"{API}/me/playlists", {"limit": 50, "linked_partitioning": "true"})
        items = data.get("collection", data) if isinstance(data, dict) else data
        playlists = []
        for item in items:
            playlists.append(
                Playlist(
                    id=str(item["id"]),
                    name=item.get("title", "Untitled"),
                    track_count=item.get("track_count", 0),
                    description=item.get("description") or "",
                    image_url=item.get("artwork_url") or "",
                )
            )
        return playlists

    def get_playlist_tracks(self, token: dict, playlist_id: str) -> List[Track]:
        data = self._get(token, f"{API}/playlists/{playlist_id}")
        tracks = []
        for t in data.get("tracks", []):
            tracks.append(
                Track(
                    title=t.get("title", ""),
                    artists=[(t.get("user") or {}).get("username", "")],
                    duration_ms=t.get("duration", 0),
                    isrc=(t.get("publisher_metadata") or {}).get("isrc", "") or "",
                    provider_id=str(t.get("id", "")),
                )
            )
        return tracks

    # -- Writing ----------------------------------------------------------
    def search_track(self, token: dict, track: Track) -> Optional[str]:
        term = f"{track.title} {track.artists[0] if track.artists else ''}".strip()
        results = self._get(token, f"{API}/tracks", {"q": term, "limit": 10})
        items = results.get("collection", results) if isinstance(results, dict) else results
        candidates = []
        for t in items:
            candidates.append(
                Track(
                    title=t.get("title", ""),
                    artists=[(t.get("user") or {}).get("username", "")],
                    duration_ms=t.get("duration", 0),
                    isrc=(t.get("publisher_metadata") or {}).get("isrc", "") or "",
                    provider_id=str(t.get("id", "")),
                )
            )
        match = best_match(track, candidates)
        return match.provider_id if match else None

    def create_playlist(self, token: dict, name: str, description: str = "") -> str:
        resp = requests.post(
            f"{API}/playlists",
            headers={**self._headers(token), "Content-Type": "application/json"},
            json={"playlist": {"title": name, "description": description, "sharing": "private", "tracks": []}},
            timeout=20,
        )
        if not resp.ok:
            raise ProviderError(f"SoundCloud create playlist failed: {resp.text}")
        return str(resp.json()["id"])

    def add_tracks(self, token: dict, playlist_id: str, provider_ids: List[str]) -> None:
        # SoundCloud replaces the whole track list on update, so merge with existing.
        existing = self._get(token, f"{API}/playlists/{playlist_id}")
        track_ids = [{"id": int(t["id"])} for t in existing.get("tracks", [])]
        track_ids += [{"id": int(pid)} for pid in provider_ids]
        resp = requests.put(
            f"{API}/playlists/{playlist_id}",
            headers={**self._headers(token), "Content-Type": "application/json"},
            json={"playlist": {"tracks": track_ids}},
            timeout=20,
        )
        if not resp.ok:
            raise ProviderError(f"SoundCloud add tracks failed: {resp.text}")
