"""Fuzzy track matching used when a destination has no ISRC to match on.

Cross-service transfer is mostly a search problem: take a track from the source,
search the destination's catalog, and decide whether any result is "the same
song". ISRC equality is exact; everything else is scored heuristically here.
"""
from __future__ import annotations

import re
from difflib import SequenceMatcher
from typing import List, Optional

from .models import Track

# Noise we strip before comparing titles: "(feat. X)", "- Remastered 2011", etc.
_PAREN = re.compile(r"[\(\[].*?[\)\]]")
_FEAT = re.compile(r"\b(feat\.?|featuring|ft\.?)\b.*", re.IGNORECASE)
_SUFFIX = re.compile(r"\s*-\s*(remaster(ed)?|.*version|.*edit|live|mono|stereo).*$", re.IGNORECASE)
_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def normalize(text: str) -> str:
    text = (text or "").lower()
    text = _FEAT.sub("", text)
    text = _PAREN.sub("", text)
    text = _SUFFIX.sub("", text)
    text = _NON_ALNUM.sub(" ", text)
    return text.strip()


def _ratio(a: str, b: str) -> float:
    if not a or not b:
        return 0.0
    return SequenceMatcher(None, a, b).ratio()


def score(target: Track, candidate: Track) -> float:
    """Return a 0..1 confidence that ``candidate`` is the same song as ``target``.

    An exact ISRC match short-circuits to a perfect score. Otherwise we blend
    title similarity (most important), artist similarity, and a small bonus when
    the durations are within ~3 seconds of each other.
    """
    if target.isrc and candidate.isrc and target.isrc.upper() == candidate.isrc.upper():
        return 1.0

    title = _ratio(normalize(target.title), normalize(candidate.title))
    artist = _ratio(normalize(target.artist), normalize(candidate.artist))

    duration_bonus = 0.0
    if target.duration_ms and candidate.duration_ms:
        if abs(target.duration_ms - candidate.duration_ms) <= 3000:
            duration_bonus = 0.1

    return min(1.0, 0.6 * title + 0.3 * artist + duration_bonus)


def best_match(target: Track, candidates: List[Track], threshold: float = 0.6) -> Optional[Track]:
    """Pick the highest-scoring candidate at or above ``threshold``, else None."""
    best: Optional[Track] = None
    best_score = threshold
    for candidate in candidates:
        s = score(target, candidate)
        if s >= best_score:
            best_score = s
            best = candidate
    return best
