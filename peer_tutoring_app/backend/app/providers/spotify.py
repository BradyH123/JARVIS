"""Spotify provider — fully implemented against the Web API.

Auth model: standard OAuth 2.0 Authorization Code flow.
Docs: https://developer.spotify.com/documentation/web-api
"""
from __future__ import annotations

import base64
import time
from typing import List, Optional
from urllib.parse import urlencode

import requests

from ..config import SpotifyConfig
from ..matching import best_match
from .base import MusicProvider, NotConfiguredError, Playlist, ProviderError, Track

AUTH_URL = "https://accounts.spotify.com/authorize"
TOKEN_URL = "https://accounts.spotify.com/api/token"
API = "https://api.spotify.com/v1"

SCOPES = [
    "playlist-read-private",
    "playlist-read-collaborative",
    "playlist-modify-private",
    "playlist-modify-public",
    "user-read-private",
]


class SpotifyProvider(MusicProvider):
    key = "spotify"
    name = "Spotify"

    @classmethod
    def is_configured(cls) -> bool:
        return SpotifyConfig.is_configured()

    # -- Auth -------------------------------------------------------------
    def build_auth_url(self, state: str) -> str:
        if not self.is_configured():
            raise NotConfiguredError("Spotify credentials are not set")
        params = {
            "client_id": SpotifyConfig.CLIENT_ID,
            "response_type": "code",
            "redirect_uri": SpotifyConfig.REDIRECT_URI,
            "scope": " ".join(SCOPES),
            "state": state,
        }
        return f"{AUTH_URL}?{urlencode(params)}"

    def _basic_auth_header(self) -> dict:
        raw = f"{SpotifyConfig.CLIENT_ID}:{SpotifyConfig.CLIENT_SECRET}".encode()
        return {"Authorization": "Basic " + base64.b64encode(raw).decode()}

    def exchange_code(self, code: str) -> dict:
        resp = requests.post(
            TOKEN_URL,
            data={
                "grant_type": "authorization_code",
                "code": code,
                "redirect_uri": SpotifyConfig.REDIRECT_URI,
            },
            headers=self._basic_auth_header(),
            timeout=15,
        )
        if not resp.ok:
            raise ProviderError(f"Spotify token exchange failed: {resp.text}")
        token = resp.json()
        token["expires_at"] = time.time() + token.get("expires_in", 3600)
        return token

    def _refresh(self, token: dict) -> dict:
        resp = requests.post(
            TOKEN_URL,
            data={
                "grant_type": "refresh_token",
                "refresh_token": token["refresh_token"],
            },
            headers=self._basic_auth_header(),
            timeout=15,
        )
        if not resp.ok:
            raise ProviderError(f"Spotify token refresh failed: {resp.text}")
        new_token = resp.json()
        token["access_token"] = new_token["access_token"]
        token["expires_at"] = time.time() + new_token.get("expires_in", 3600)
        if new_token.get("refresh_token"):
            token["refresh_token"] = new_token["refresh_token"]
        return token

    def _headers(self, token: dict) -> dict:
        if token.get("expires_at", 0) <= time.time() + 30 and token.get("refresh_token"):
            self._refresh(token)
        return {"Authorization": f"Bearer {token['access_token']}"}

    def _get(self, token: dict, url: str, params: dict | None = None) -> dict:
        resp = requests.get(url, headers=self._headers(token), params=params, timeout=20)
        if not resp.ok:
            raise ProviderError(f"Spotify GET {url} failed: {resp.text}")
        return resp.json()

    # -- Reading ----------------------------------------------------------
    def list_playlists(self, token: dict) -> List[Playlist]:
        playlists: List[Playlist] = []
        url = f"{API}/me/playlists"
        params = {"limit": 50}
        while url:
            data = self._get(token, url, params)
            for item in data.get("items", []):
                images = item.get("images") or []
                playlists.append(
                    Playlist(
                        id=item["id"],
                        name=item.get("name", "Untitled"),
                        track_count=(item.get("tracks") or {}).get("total", 0),
                        description=item.get("description", ""),
                        image_url=images[0]["url"] if images else "",
                    )
                )
            url = data.get("next")
            params = None  # `next` already includes query params
        return playlists

    def get_playlist_tracks(self, token: dict, playlist_id: str) -> List[Track]:
        tracks: List[Track] = []
        url = f"{API}/playlists/{playlist_id}/tracks"
        params = {"limit": 100}
        while url:
            data = self._get(token, url, params)
            for item in data.get("items", []):
                t = item.get("track")
                if not t or t.get("type") != "track":
                    continue
                tracks.append(
                    Track(
                        title=t.get("name", ""),
                        artists=[a["name"] for a in t.get("artists", [])],
                        album=(t.get("album") or {}).get("name", ""),
                        duration_ms=t.get("duration_ms", 0),
                        isrc=(t.get("external_ids") or {}).get("isrc", ""),
                        provider_id=t.get("uri", ""),
                    )
                )
            url = data.get("next")
            params = None
        return tracks

    # -- Writing ----------------------------------------------------------
    def search_track(self, token: dict, track: Track) -> Optional[str]:
        # An ISRC search is exact when available.
        if track.isrc:
            data = self._get(
                token, f"{API}/search",
                {"q": f"isrc:{track.isrc}", "type": "track", "limit": 5},
            )
            items = (data.get("tracks") or {}).get("items", [])
            if items:
                return items[0]["uri"]

        query = f"track:{track.title} artist:{track.artists[0] if track.artists else ''}".strip()
        data = self._get(token, f"{API}/search", {"q": query, "type": "track", "limit": 10})
        items = (data.get("tracks") or {}).get("items", [])
        candidates = [
            Track(
                title=i.get("name", ""),
                artists=[a["name"] for a in i.get("artists", [])],
                album=(i.get("album") or {}).get("name", ""),
                duration_ms=i.get("duration_ms", 0),
                isrc=(i.get("external_ids") or {}).get("isrc", ""),
                provider_id=i.get("uri", ""),
            )
            for i in items
        ]
        match = best_match(track, candidates)
        return match.provider_id if match else None

    def _me(self, token: dict) -> dict:
        return self._get(token, f"{API}/me")

    def create_playlist(self, token: dict, name: str, description: str = "") -> str:
        user_id = self._me(token)["id"]
        resp = requests.post(
            f"{API}/users/{user_id}/playlists",
            headers={**self._headers(token), "Content-Type": "application/json"},
            json={"name": name, "description": description, "public": False},
            timeout=20,
        )
        if not resp.ok:
            raise ProviderError(f"Spotify create playlist failed: {resp.text}")
        return resp.json()["id"]

    def add_tracks(self, token: dict, playlist_id: str, provider_ids: List[str]) -> None:
        # Spotify accepts up to 100 uris per request.
        for i in range(0, len(provider_ids), 100):
            chunk = provider_ids[i : i + 100]
            resp = requests.post(
                f"{API}/playlists/{playlist_id}/tracks",
                headers={**self._headers(token), "Content-Type": "application/json"},
                json={"uris": chunk},
                timeout=20,
            )
            if not resp.ok:
                raise ProviderError(f"Spotify add tracks failed: {resp.text}")
