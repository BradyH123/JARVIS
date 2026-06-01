"""The common interface every music service must implement.

A "provider" knows how to do four things on behalf of a connected user:

  1. run an OAuth-style connection flow,
  2. list the user's playlists,
  3. read the tracks of one playlist, and
  4. create a new playlist and add tracks to it (searching its own catalog).

The transfer engine in :mod:`app.transfer` only ever talks to this interface,
so the source and destination services are completely interchangeable.

The data types (:class:`Track`, :class:`Playlist`) and errors live in
:mod:`app.models` and are re-exported here for convenience.
"""
from __future__ import annotations

from typing import List, Optional

from ..models import NotConfiguredError, Playlist, ProviderError, Track

__all__ = [
    "MusicProvider",
    "Track",
    "Playlist",
    "ProviderError",
    "NotConfiguredError",
]


class MusicProvider:
    """Base class. Subclasses implement the abstract methods below.

    ``key`` is the stable identifier used in URLs and the token store;
    ``name`` is the human-readable label shown in the UI.
    """

    key: str = ""
    name: str = ""

    @classmethod
    def is_configured(cls) -> bool:
        """True when the necessary credentials are present in the environment."""
        raise NotImplementedError

    # -- Auth -------------------------------------------------------------
    def build_auth_url(self, state: str) -> str:
        """Return the URL the user's browser should visit to grant access."""
        raise NotImplementedError

    def exchange_code(self, code: str) -> dict:
        """Trade an OAuth ``code`` for a token dict to persist in the store."""
        raise NotImplementedError

    # -- Reading ----------------------------------------------------------
    def list_playlists(self, token: dict) -> List[Playlist]:
        raise NotImplementedError

    def get_playlist_tracks(self, token: dict, playlist_id: str) -> List[Track]:
        raise NotImplementedError

    # -- Writing ----------------------------------------------------------
    def search_track(self, token: dict, track: Track) -> Optional[str]:
        """Find ``track`` in this service's catalog; return its native id or None."""
        raise NotImplementedError

    def create_playlist(self, token: dict, name: str, description: str = "") -> str:
        """Create an empty playlist and return its id."""
        raise NotImplementedError

    def add_tracks(self, token: dict, playlist_id: str, provider_ids: List[str]) -> None:
        raise NotImplementedError
