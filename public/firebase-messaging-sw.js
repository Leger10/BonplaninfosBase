/* eslint-disable no-undef */
// Service worker Firebase Cloud Messaging (scope /firebase-messaging/).
// Configuration publique transmise par l'URL (?config=...) depuis l'application.
importScripts('https://www.gstatic.com/firebasejs/12.6.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/12.6.0/firebase-messaging-compat.js');

const DEFAULT_CONFIG = {
  apiKey: 'AIzaSyANugimJaN1t4JfQgniKdMPdFu7v2HumY8',
  authDomain: 'bonplaninfos-7e8f5.firebaseapp.com',
  projectId: 'bonplaninfos-7e8f5',
  storageBucket: 'bonplaninfos-7e8f5.firebasestorage.app',
  messagingSenderId: '503670420331',
  appId: '1:503670420331:web:e88dfd055f1e908abd122e',
};

function readConfig() {
  try {
    const raw = new URL(self.location.href).searchParams.get('config');
    if (!raw) return DEFAULT_CONFIG;
    const parsed = JSON.parse(raw);
    return { ...DEFAULT_CONFIG, ...(parsed && typeof parsed === 'object' ? parsed : {}) };
  } catch (e) {
    return DEFAULT_CONFIG;
  }
}

try {
  firebase.initializeApp(readConfig());
} catch (e) {
  console.error('[sw] init firebase', e);
}

let messaging = null;
try {
  messaging = firebase.messaging();
} catch (e) {
  console.error('[sw] messaging indisponible', e);
}

// Seules les URL internes sont ouvertes (pas de redirection externe).
function safeUrl(value, fallback = '/') {
  if (typeof value !== 'string') return fallback;
  const url = value.trim();
  if (!url || url.length > 500) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(url)) return fallback;
  if (url.startsWith('//') || url.startsWith('\\\\') || url.startsWith('/\\')) return fallback;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return fallback;
  if (!url.startsWith('/')) return fallback;
  return url;
}

if (messaging) {
  messaging.onBackgroundMessage((payload) => {
    const data = payload?.data || {};
    const notification = payload?.notification || {};
    const title = data.title || notification.title || 'BonPlan Infos';
    const body = data.body || notification.body || '';
    const url = safeUrl(data.url, '/notifications');
    const tag = data.tag || data.type || undefined;
    return self.registration.showNotification(title, {
      body,
      icon: '/icon-192.png',
      badge: '/badge-72x72.png',
      tag,
      data: { url },
      vibrate: [200, 100, 200],
      renotify: false,
    });
  });
}

self.addEventListener('install', () => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = safeUrl(event.notification?.data?.url, '/');
  event.waitUntil((async () => {
    const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
    for (const client of windows) {
      try {
        const target = new URL(client.url);
        if (target.origin !== self.location.origin) continue;
        await client.focus();
        if ('navigate' in client) {
          try {
            await client.navigate(url);
          } catch (e) {
            // Navigation refusee : le client reste focalise.
          }
        }
        return;
      } catch (e) {
        // Client illisible : on continue.
      }
    }
    if (self.clients.openWindow) {
      await self.clients.openWindow(url);
    }
  })());
});
