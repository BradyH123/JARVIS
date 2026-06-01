"""Provider registry — the single place that knows every supported service."""
from .apple_music import AppleMusicProvider
from .base import MusicProvider, NotConfiguredError, Playlist, ProviderError, Track
from .soundcloud import SoundCloudProvider
from .spotify import SpotifyProvider

# Instantiated once and shared; providers are stateless (tokens are passed in).
_PROVIDERS = {
    p.key: p
    for p in (SpotifyProvider(), AppleMusicProvider(), SoundCloudProvider())
}


def get_provider(key: str) -> MusicProvider:
    provider = _PROVIDERS.get(key)
    if provider is None:
        raise ProviderError(f"Unknown provider '{key}'")
    return provider


def all_providers():
    return list(_PROVIDERS.values())


__all__ = [
    "MusicProvider",
    "Playlist",
    "Track",
    "ProviderError",
    "NotConfiguredError",
    "get_provider",
    "all_providers",
]
