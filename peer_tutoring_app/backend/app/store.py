"""Server-side token storage, keyed by an opaque per-browser session id.

OAuth tokens are too big (and too sensitive) to keep in a signed cookie, so the
cookie only holds a random ``sid`` and the actual tokens live here. This is an
in-memory dict, which is perfect for local development and single-instance
deployments. For multi-instance production, swap this module's body for Redis or
a database — the public functions are the only contract the rest of the app uses.
"""
from __future__ import annotations

import threading
from typing import Dict, Optional

_lock = threading.Lock()
# sid -> { provider_key -> token_dict }
_tokens: Dict[str, Dict[str, dict]] = {}


def save_token(sid: str, provider: str, token: dict) -> None:
    with _lock:
        _tokens.setdefault(sid, {})[provider] = token


def get_token(sid: str, provider: str) -> Optional[dict]:
    with _lock:
        return _tokens.get(sid, {}).get(provider)


def remove_token(sid: str, provider: str) -> None:
    with _lock:
        _tokens.get(sid, {}).pop(provider, None)


def connected_providers(sid: str) -> set:
    with _lock:
        return set(_tokens.get(sid, {}).keys())
