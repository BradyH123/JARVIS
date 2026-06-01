"""The transfer engine: read from a source provider, recreate on a destination.

This is deliberately provider-agnostic — it only speaks the ``MusicProvider``
interface, so any source can transfer to any destination.
"""
from __future__ import annotations

from typing import List

from .providers import MusicProvider, Track


def transfer_playlist(
    source: MusicProvider,
    source_token: dict,
    destination: MusicProvider,
    destination_token: dict,
    source_playlist_id: str,
    new_playlist_name: str,
) -> dict:
    """Copy a playlist across services and return a detailed result report.

    For every source track we search the destination catalogue; matches are added
    to a freshly created playlist, and misses are reported back so the user knows
    exactly what didn't carry over (and can add those few by hand).
    """
    source_tracks: List[Track] = source.get_playlist_tracks(source_token, source_playlist_id)

    matched_ids: List[str] = []
    matched: List[dict] = []
    unmatched: List[dict] = []

    for track in source_tracks:
        try:
            dest_id = destination.search_track(destination_token, track)
        except Exception as exc:  # one bad lookup shouldn't abort the whole job
            dest_id = None
            track_info = track.to_dict()
            track_info["error"] = str(exc)
            unmatched.append(track_info)
            continue

        if dest_id:
            matched_ids.append(dest_id)
            matched.append(track.to_dict())
        else:
            unmatched.append(track.to_dict())

    description = f"Transferred from {source.name} by Playlist Porter."
    new_playlist_id = destination.create_playlist(
        destination_token, new_playlist_name, description
    )
    if matched_ids:
        destination.add_tracks(destination_token, new_playlist_id, matched_ids)

    total = len(source_tracks)
    return {
        "source": source.name,
        "destination": destination.name,
        "new_playlist_id": new_playlist_id,
        "new_playlist_name": new_playlist_name,
        "total": total,
        "matched_count": len(matched),
        "unmatched_count": len(unmatched),
        "match_rate": round(len(matched) / total, 3) if total else 0.0,
        "matched": matched,
        "unmatched": unmatched,
    }
