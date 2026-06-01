// Thin wrapper around the backend API. Every call sends the session cookie
// (credentials: 'include') so the server can find this browser's stored tokens.

const BASE = process.env.REACT_APP_API_URL || 'http://localhost:5000';

async function request(path, options = {}) {
  const res = await fetch(`${BASE}/api${path}`, {
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.error || `Request failed (${res.status})`);
  }
  return data;
}

export const api = {
  getProviders: () => request('/providers'),

  loginUrl: (provider) => request(`/auth/${provider}/login`),
  disconnect: (provider) =>
    request(`/auth/${provider}/disconnect`, { method: 'POST' }),

  appleDeveloperToken: () => request('/auth/apple/developer-token'),
  appleConnect: (musicUserToken) =>
    request('/auth/apple/connect', {
      method: 'POST',
      body: JSON.stringify({ music_user_token: musicUserToken }),
    }),

  getPlaylists: (provider) => request(`/${provider}/playlists`),

  transfer: (payload) =>
    request('/transfer', { method: 'POST', body: JSON.stringify(payload) }),
};

export { BASE };
