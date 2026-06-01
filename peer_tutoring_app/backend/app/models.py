"""Shared, dependency-free data types.

These live in their own module so that both :mod:`app.matching` and the provider
classes can use them without importing each other (which would be circular).
"""
from __future__ import annotations

from dataclasses import asdict, dataclass, field
from typing import List


@dataclass
class Track:
    """A single song, normalised across services.

    ``isrc`` (International Standard Recording Code) is the gold standard for
    matching the *same* recording across services. When present we trust it; the
    title/artist/duration fields are the fallback for fuzzy matching.
    """

    title: str
    artists: List[str] = field(default_factory=list)
    album: str = ""
    duration_ms: int = 0
    isrc: str = ""
    # The provider-native id/uri, used when adding to a destination playlist.
    provider_id: str = ""

    @property
    def artist(self) -> str:
        return ", ".join(self.artists)

    def to_dict(self) -> dict:
        data = asdict(self)
        data["artist"] = self.artist
        return data


@dataclass
class Playlist:
    id: str
    name: str
    track_count: int = 0
    description: str = ""
    image_url: str = ""

    def to_dict(self) -> dict:
        return asdict(self)


class ProviderError(Exception):
    """Raised for any provider-level failure (auth, network, API error)."""


class NotConfiguredError(ProviderError):
    """Raised when a provider is used without its credentials being set."""
