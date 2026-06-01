"""Playlist Porter — Flask API.

Endpoints (all under /api):
  GET  /providers                       list services + configured/connected status
  GET  /auth/<provider>/login           -> { auth_url } to open in the browser
  GET  /auth/<provider>/callback        OAuth redirect target; stores token, bounces to UI
  GET  /auth/apple/developer-token      MusicKit developer token (Apple is browser-auth)
  POST /auth/apple/connect              store the Music User Token from MusicKit
  POST /auth/<provider>/disconnect      forget a provider's token
  GET  /<provider>/playlists            the connected user's playlists
  GET  /<provider>/playlists/<id>/tracks
  POST /transfer                        run a transfer, return a match report
"""
from __future__ import annotations

import secrets

from flask import Flask, jsonify, redirect, request, session
from flask_cors import CORS

from . import config, store
from .providers import (
    NotConfiguredError,
    ProviderError,
    all_providers,
    get_provider,
)
from .providers.apple_music import AppleMusicProvider
from .transfer import transfer_playlist

app = Flask(__name__)
app.secret_key = config.SECRET_KEY
# Cross-site cookie so the React dev server (port 3000) keeps its session.
app.config.update(SESSION_COOKIE_SAMESITE="Lax", SESSION_COOKIE_HTTPONLY=True)
CORS(app, supports_credentials=True, origins=[config.FRONTEND_URL])


def _sid() -> str:
    """Stable per-browser id used to key the server-side token store."""
    if "sid" not in session:
        session["sid"] = secrets.token_urlsafe(24)
        session.permanent = True
    return session["sid"]


def _require_token(provider_key: str) -> dict:
    token = store.get_token(_sid(), provider_key)
    if token is None:
        raise ProviderError(f"Not connected to {provider_key}")
    return token


# -- Discovery ------------------------------------------------------------
@app.get("/api/providers")
def providers():
    connected = store.connected_providers(_sid())
    return jsonify(
        [
            {
                "key": p.key,
                "name": p.name,
                "configured": p.is_configured(),
                "connected": p.key in connected,
            }
            for p in all_providers()
        ]
    )


# -- Auth -----------------------------------------------------------------
@app.get("/api/auth/<provider_key>/login")
def login(provider_key):
    provider = get_provider(provider_key)
    state = secrets.token_urlsafe(16)
    session[f"oauth_state_{provider_key}"] = state
    return jsonify({"auth_url": provider.build_auth_url(state)})


@app.get("/api/auth/<provider_key>/callback")
def callback(provider_key):
    provider = get_provider(provider_key)
    error = request.args.get("error")
    if error:
        return redirect(f"{config.FRONTEND_URL}/?connected={provider_key}&error={error}")

    expected = session.pop(f"oauth_state_{provider_key}", None)
    if not expected or request.args.get("state") != expected:
        return redirect(f"{config.FRONTEND_URL}/?connected={provider_key}&error=state_mismatch")

    code = request.args.get("code", "")
    token = provider.exchange_code(code)
    store.save_token(_sid(), provider_key, token)
    return redirect(f"{config.FRONTEND_URL}/?connected={provider_key}")


# Apple Music authorises in the browser via MusicKit, so it has two extra routes.
@app.get("/api/auth/apple/developer-token")
def apple_developer_token():
    provider = get_provider("apple")
    assert isinstance(provider, AppleMusicProvider)
    return jsonify({"developer_token": provider.developer_token()})


@app.post("/api/auth/apple/connect")
def apple_connect():
    provider = get_provider("apple")
    assert isinstance(provider, AppleMusicProvider)
    music_user_token = (request.get_json(silent=True) or {}).get("music_user_token", "")
    if not music_user_token:
        return jsonify({"error": "music_user_token is required"}), 400
    store.save_token(_sid(), "apple", provider.token_from_music_user_token(music_user_token))
    return jsonify({"connected": True})


@app.post("/api/auth/<provider_key>/disconnect")
def disconnect(provider_key):
    get_provider(provider_key)  # validates the key exists
    store.remove_token(_sid(), provider_key)
    return jsonify({"connected": False})


# -- Reading --------------------------------------------------------------
@app.get("/api/<provider_key>/playlists")
def playlists(provider_key):
    provider = get_provider(provider_key)
    token = _require_token(provider_key)
    return jsonify([p.to_dict() for p in provider.list_playlists(token)])


@app.get("/api/<provider_key>/playlists/<playlist_id>/tracks")
def playlist_tracks(provider_key, playlist_id):
    provider = get_provider(provider_key)
    token = _require_token(provider_key)
    return jsonify([t.to_dict() for t in provider.get_playlist_tracks(token, playlist_id)])


# -- Transfer -------------------------------------------------------------
@app.post("/api/transfer")
def transfer():
    body = request.get_json(silent=True) or {}
    source_key = body.get("source")
    destination_key = body.get("destination")
    source_playlist_id = body.get("source_playlist_id")
    new_name = (body.get("new_playlist_name") or "").strip()

    if not all([source_key, destination_key, source_playlist_id]):
        return jsonify({"error": "source, destination and source_playlist_id are required"}), 400
    if source_key == destination_key:
        return jsonify({"error": "source and destination must differ"}), 400

    source = get_provider(source_key)
    destination = get_provider(destination_key)
    source_token = _require_token(source_key)
    destination_token = _require_token(destination_key)

    if not new_name:
        new_name = f"Imported from {source.name}"

    result = transfer_playlist(
        source, source_token, destination, destination_token, source_playlist_id, new_name
    )
    return jsonify(result)


# -- Errors ---------------------------------------------------------------
@app.errorhandler(NotConfiguredError)
def _not_configured(exc):
    return jsonify({"error": str(exc), "code": "not_configured"}), 400


@app.errorhandler(ProviderError)
def _provider_error(exc):
    return jsonify({"error": str(exc), "code": "provider_error"}), 502


@app.get("/api/health")
def health():
    return jsonify({"status": "ok"})


if __name__ == "__main__":
    app.run(debug=True, port=5000)
