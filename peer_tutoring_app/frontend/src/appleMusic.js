// Apple Music can only be authorised in the browser via MusicKit JS. This helper
// loads MusicKit, configures it with a developer token from our backend, prompts
// the user to sign in, and returns the resulting Music User Token.
import { api } from './api';

const MUSICKIT_SRC = 'https://js-cdn.music.apple.com/musickit/v3/musickit.js';

function loadMusicKitScript() {
  return new Promise((resolve, reject) => {
    if (window.MusicKit) return resolve();
    const existing = document.querySelector(`script[src="${MUSICKIT_SRC}"]`);
    if (existing) {
      existing.addEventListener('load', () => resolve());
      existing.addEventListener('error', reject);
      return;
    }
    const script = document.createElement('script');
    script.src = MUSICKIT_SRC;
    script.async = true;
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () =>
      reject(new Error('Failed to load Apple MusicKit'))
    );
    document.head.appendChild(script);
  });
}

export async function connectAppleMusic() {
  const { developer_token: developerToken } = await api.appleDeveloperToken();
  await loadMusicKitScript();

  await window.MusicKit.configure({
    developerToken,
    app: { name: 'Playlist Porter', build: '1.0.0' },
  });

  const music = window.MusicKit.getInstance();
  const musicUserToken = await music.authorize(); // opens Apple's sign-in popup
  await api.appleConnect(musicUserToken);
}
