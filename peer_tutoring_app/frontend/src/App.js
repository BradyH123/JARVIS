import { useEffect, useState, useCallback } from 'react';
import { api } from './api';
import { connectAppleMusic } from './appleMusic';

const ACCENT = {
  spotify: '#1DB954',
  apple: '#FA243C',
  soundcloud: '#FF5500',
};

export default function App() {
  const [providers, setProviders] = useState([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  const refresh = useCallback(async () => {
    try {
      setProviders(await api.getProviders());
    } catch (e) {
      setError(e.message);
    }
  }, []);

  useEffect(() => {
    refresh();
    // After an OAuth redirect the URL looks like /?connected=spotify[&error=..]
    const params = new URLSearchParams(window.location.search);
    if (params.get('error')) setError(`Connection failed: ${params.get('error')}`);
    if (params.get('connected') || params.get('error')) {
      window.history.replaceState({}, '', window.location.pathname);
    }
  }, [refresh]);

  const connect = async (provider) => {
    setError('');
    setBusy(provider.key);
    try {
      if (provider.key === 'apple') {
        await connectAppleMusic();
        await refresh();
      } else {
        // Full-page redirect keeps the session cookie; we come back to /?connected=
        const { auth_url } = await api.loginUrl(provider.key);
        window.location.href = auth_url;
      }
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy('');
    }
  };

  const disconnect = async (provider) => {
    setError('');
    try {
      await api.disconnect(provider.key);
      await refresh();
    } catch (e) {
      setError(e.message);
    }
  };

  const connected = providers.filter((p) => p.connected);

  return (
    <div className="page">
      <header className="hero">
        <h1>🎧 Playlist Porter</h1>
        <p>Move a playlist from one music service to another in a couple of clicks.</p>
      </header>

      {error && <div className="banner error">{error}</div>}

      <section className="card">
        <h2>1. Connect your services</h2>
        <div className="providers">
          {providers.map((p) => (
            <div className="provider" key={p.key} style={{ borderTopColor: ACCENT[p.key] }}>
              <div className="provider-head">
                <span className="provider-name">{p.name}</span>
                {p.connected ? (
                  <span className="pill ok">Connected</span>
                ) : !p.configured ? (
                  <span className="pill muted">Not set up</span>
                ) : (
                  <span className="pill">Available</span>
                )}
              </div>
              {!p.configured ? (
                <p className="hint">
                  Add this service's credentials to the backend <code>.env</code> to enable it.
                </p>
              ) : p.connected ? (
                <button className="btn ghost" onClick={() => disconnect(p)}>
                  Disconnect
                </button>
              ) : (
                <button
                  className="btn"
                  style={{ background: ACCENT[p.key] }}
                  disabled={busy === p.key}
                  onClick={() => connect(p)}
                >
                  {busy === p.key ? 'Connecting…' : `Connect ${p.name}`}
                </button>
              )}
            </div>
          ))}
        </div>
      </section>

      <TransferPanel providers={connected} onError={setError} />

      <footer className="foot">
        Built with the official service APIs. Your login stays between you and the music
        service — Playlist Porter only ever sees a temporary access token.
      </footer>
    </div>
  );
}

function TransferPanel({ providers, onError }) {
  const [source, setSource] = useState('');
  const [destination, setDestination] = useState('');
  const [playlists, setPlaylists] = useState([]);
  const [playlistId, setPlaylistId] = useState('');
  const [name, setName] = useState('');
  const [loadingPlaylists, setLoadingPlaylists] = useState(false);
  const [running, setRunning] = useState(false);
  const [result, setResult] = useState(null);

  // Load the chosen source's playlists whenever it changes.
  useEffect(() => {
    setPlaylists([]);
    setPlaylistId('');
    if (!source) return;
    setLoadingPlaylists(true);
    api
      .getPlaylists(source)
      .then(setPlaylists)
      .catch((e) => onError(e.message))
      .finally(() => setLoadingPlaylists(false));
  }, [source, onError]);

  const canTransfer = source && destination && source !== destination && playlistId && !running;

  const run = async () => {
    setRunning(true);
    setResult(null);
    onError('');
    try {
      const selected = playlists.find((p) => p.id === playlistId);
      const res = await api.transfer({
        source,
        destination,
        source_playlist_id: playlistId,
        new_playlist_name: name || (selected ? selected.name : ''),
      });
      setResult(res);
    } catch (e) {
      onError(e.message);
    } finally {
      setRunning(false);
    }
  };

  if (providers.length < 2) {
    return (
      <section className="card muted-card">
        <h2>2. Transfer a playlist</h2>
        <p className="hint">Connect at least two services above to start transferring.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>2. Transfer a playlist</h2>
      <div className="grid">
        <label>
          From
          <select value={source} onChange={(e) => setSource(e.target.value)}>
            <option value="">Choose source…</option>
            {providers.map((p) => (
              <option key={p.key} value={p.key}>{p.name}</option>
            ))}
          </select>
        </label>

        <label>
          Playlist
          <select
            value={playlistId}
            onChange={(e) => setPlaylistId(e.target.value)}
            disabled={!source || loadingPlaylists}
          >
            <option value="">
              {loadingPlaylists ? 'Loading…' : 'Choose playlist…'}
            </option>
            {playlists.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name}{p.track_count ? ` (${p.track_count})` : ''}
              </option>
            ))}
          </select>
        </label>

        <label>
          To
          <select value={destination} onChange={(e) => setDestination(e.target.value)}>
            <option value="">Choose destination…</option>
            {providers
              .filter((p) => p.key !== source)
              .map((p) => (
                <option key={p.key} value={p.key}>{p.name}</option>
              ))}
          </select>
        </label>

        <label>
          New playlist name
          <input
            type="text"
            placeholder="(defaults to the original name)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </label>
      </div>

      <button className="btn big" disabled={!canTransfer} onClick={run}>
        {running ? 'Transferring…' : 'Transfer playlist →'}
      </button>

      {result && <TransferResult result={result} />}
    </section>
  );
}

function TransferResult({ result }) {
  const pct = Math.round((result.match_rate || 0) * 100);
  return (
    <div className="result">
      <div className="banner ok">
        ✅ Created <strong>{result.new_playlist_name}</strong> on {result.destination} —
        matched <strong>{result.matched_count}</strong> of {result.total} tracks ({pct}%).
      </div>

      {result.unmatched_count > 0 && (
        <details className="unmatched">
          <summary>
            {result.unmatched_count} track{result.unmatched_count === 1 ? '' : 's'} couldn’t be
            matched — you can add these by hand
          </summary>
          <ul>
            {result.unmatched.map((t, i) => (
              <li key={i}>
                <strong>{t.title}</strong>
                {t.artist ? ` — ${t.artist}` : ''}
                {t.error ? <span className="err"> ({t.error})</span> : ''}
              </li>
            ))}
          </ul>
        </details>
      )}
    </div>
  );
}
