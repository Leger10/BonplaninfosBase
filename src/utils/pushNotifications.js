// src/utils/pushNotifications.js
// Notifications push Web via Firebase Cloud Messaging (FCM).
// - la configuration Firebase "client" est publique (elle part dans le bundle) ;
// - le compte de service (cle privee) reste uniquement cote serveur ;
// - l'enregistrement du jeton passe par /api/push/register (session requise).
import { initializeApp, getApps } from 'firebase/app';
import {
  getMessaging,
  getToken,
  deleteToken,
  onMessage,
  isSupported as fcmIsSupported,
} from 'firebase/messaging';
import { supabase } from '@/lib/customSupabaseClient';
import { toast } from '@/components/ui/use-toast';

// Configuration PUBLIQUE du projet Firebase bonplaninfos-7e8f5.
// Surchargeable par les variables VITE_FIREBASE_* au build.
const PUBLIC_FIREBASE_CONFIG = {
  apiKey: 'AIzaSyANugimJaN1t4JfQgniKdMPdFu7v2HumY8',
  authDomain: 'bonplaninfos-7e8f5.firebaseapp.com',
  projectId: 'bonplaninfos-7e8f5',
  storageBucket: 'bonplaninfos-7e8f5.firebasestorage.app',
  messagingSenderId: '503670420331',
  appId: '1:503670420331:web:e88dfd055f1e908abd122e',
  measurementId: 'G-FLV5FJT48B',
  // Cle publique VAPID (non secrete). Surchargeable par VITE_FIREBASE_VAPID_KEY.
  vapidKey: 'BAHwYo5VME1pPaNkvlLG4R8lMoQyZ-gblT2vpRHxWmBTna0Fw8Qrv8pRaz1ZSkL1zZcer7F39DDB9mC4AZYROWE',
};

const env = (key, fallback) => {
  try {
    const value = import.meta.env?.[key];
    return value && String(value).trim() ? String(value).trim() : fallback;
  } catch (e) {
    return fallback;
  }
};

export const firebaseConfig = {
  apiKey: env('VITE_FIREBASE_API_KEY', PUBLIC_FIREBASE_CONFIG.apiKey),
  authDomain: env('VITE_FIREBASE_AUTH_DOMAIN', PUBLIC_FIREBASE_CONFIG.authDomain),
  projectId: env('VITE_FIREBASE_PROJECT_ID', PUBLIC_FIREBASE_CONFIG.projectId),
  storageBucket: env('VITE_FIREBASE_STORAGE_BUCKET', PUBLIC_FIREBASE_CONFIG.storageBucket),
  messagingSenderId: env('VITE_FIREBASE_MESSAGING_SENDER_ID', PUBLIC_FIREBASE_CONFIG.messagingSenderId),
  appId: env('VITE_FIREBASE_APP_ID', PUBLIC_FIREBASE_CONFIG.appId),
  measurementId: env('VITE_FIREBASE_MEASUREMENT_ID', PUBLIC_FIREBASE_CONFIG.measurementId),
};

// Le service worker recoit la config publique via l'URL (meme projet).
export const getPublicFirebaseConfig = () => ({
  apiKey: firebaseConfig.apiKey,
  authDomain: firebaseConfig.authDomain,
  projectId: firebaseConfig.projectId,
  storageBucket: firebaseConfig.storageBucket,
  messagingSenderId: firebaseConfig.messagingSenderId,
  appId: firebaseConfig.appId,
});

export const isFirebaseConfigured = () =>
  Boolean(firebaseConfig.apiKey && firebaseConfig.projectId && firebaseConfig.messagingSenderId && firebaseConfig.appId);

export const isPushSupported = () =>
  typeof window !== 'undefined' &&
  'serviceWorker' in navigator &&
  'Notification' in window &&
  'PushManager' in window;

export const getVapidPublicKey = () => {
  const fromEnv = import.meta.env.VITE_FIREBASE_VAPID_KEY;
  if (typeof fromEnv === 'string' && /^B[A-Za-z0-9_-]{80,}$/.test(fromEnv.trim())) {
    return fromEnv.trim();
  }
  return PUBLIC_FIREBASE_CONFIG.vapidKey;
};

let firebaseApp = null;
let messagingInstance = null;

async function getMessagingIfSupported() {
  if (!isPushSupported() || !isFirebaseConfigured()) return null;
  try {
    if (!(await fcmIsSupported())) return null;
  } catch (e) {
    return null;
  }
  if (!firebaseApp) {
    firebaseApp = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);
  }
  if (!messagingInstance) messagingInstance = getMessaging(firebaseApp);
  return messagingInstance;
}

async function getSessionToken() {
  try {
    const { data, error } = await supabase.auth.getSession();
    if (error) return null;
    return data?.session?.access_token || null;
  } catch (e) {
    return null;
  }
}

async function api(path, { method = 'GET', body } = {}) {
  const token = await getSessionToken();
  if (!token) throw new Error('Vous devez être connecté pour gérer les notifications.');
  const response = await fetch(path, {
    method,
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  let payload = null;
  try {
    payload = await response.json();
  } catch (e) {
    payload = null;
  }
  if (!response.ok) {
    const message = payload?.error?.message || `Erreur ${response.status}`;
    const error = new Error(message);
    error.code = payload?.error?.code;
    error.status = response.status;
    throw error;
  }
  return payload?.data ?? payload;
}

export const askNotificationPermission = async () => {
  try {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    const permission = await Notification.requestPermission();
    return permission === 'granted';
  } catch (e) {
    return false;
  }
};

function detectDeviceType() {
  if (typeof navigator === 'undefined') return 'web';
  return /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) ? 'mobile' : 'desktop';
}

// Enregistre le service worker dedie avec la config publique.
// Scope distinct pour ne pas remplacer le service worker PWA de /sw.js.
export async function registerMessagingServiceWorker() {
  const config = encodeURIComponent(JSON.stringify(getPublicFirebaseConfig()));
  const registration = await navigator.serviceWorker.register(
    `/firebase-messaging-sw.js?config=${config}`,
    { scope: '/firebase-messaging/' },
  );
  return registration;
}

async function registerTokenWithServer(token) {
  return api('/api/push/register', {
    method: 'POST',
    body: {
      token,
      platform: 'web',
      deviceType: detectDeviceType(),
      userAgent: navigator.userAgent,
    },
  });
}

export const subscribeToPushNotifications = async () => {
  if (!isPushSupported()) throw new Error('Notifications non supportées par ce navigateur.');
  if (!isFirebaseConfigured()) throw new Error('Configuration Firebase absente.');
  const vapidKey = getVapidPublicKey();
  if (!vapidKey) {
    throw new Error(
      'Clé VAPID manquante. Renseignez VITE_FIREBASE_VAPID_KEY (Console Firebase > Cloud Messaging > Certificats Web Push).',
    );
  }
  const granted = await askNotificationPermission();
  if (!granted) throw new Error('Permission refusée. Autorisez les notifications dans le navigateur.');

  const messaging = await getMessagingIfSupported();
  if (!messaging) throw new Error('FCM non supporté par ce navigateur.');

  const registration = await registerMessagingServiceWorker();
  const token = await getToken(messaging, {
    vapidKey,
    serviceWorkerRegistration: registration,
  });
  if (!token) throw new Error("Aucun jeton FCM n'a pu être obtenu.");
  await registerTokenWithServer(token);
  return token;
};

// Re-synchronise silencieusement l'appareil (permission deja accordee).
export const syncSubscription = async () => {
  if (!isPushSupported() || !isFirebaseConfigured()) return null;
  if (Notification.permission !== 'granted') return null;
  if (!getVapidPublicKey()) return null;
  try {
    const messaging = await getMessagingIfSupported();
    if (!messaging) return null;
    const registration = await registerMessagingServiceWorker();
    const token = await getToken(messaging, {
      vapidKey: getVapidPublicKey(),
      serviceWorkerRegistration: registration,
    });
    if (!token) return null;
    await registerTokenWithServer(token);
    return token;
  } catch (e) {
    console.warn('[push] synchronisation:', e?.message);
    return null;
  }
};

export const unsubscribeFromPushNotifications = async () => {
  if (!isPushSupported()) return false;
  try {
    const messaging = await getMessagingIfSupported();
    if (messaging) {
      try {
        await deleteToken(messaging);
      } catch (e) {
        // Le jeton peut deja etre absent : on continue la desactivation serveur.
      }
    }
    await api('/api/push/unregister', { method: 'POST', body: {} }).catch(() => null);
    toast({
      title: 'Notifications désactivées',
      description: "Cet appareil ne recevra plus d'alertes.",
    });
    return true;
  } catch (e) {
    console.error('[push] désactivation:', e);
    return false;
  }
};

export const sendTestNotification = async () => {
  try {
    const result = await api('/api/push/test', { method: 'POST', body: {} });
    toast({
      title: 'Test envoyé',
      description: result?.sent
        ? 'Une notification devrait apparaître sur cet appareil.'
        : 'Aucun appareil actif : activez les notifications.',
    });
    return Boolean(result?.sent);
  } catch (e) {
    toast({
      title: 'Test impossible',
      description: e?.message || "Échec de l'envoi.",
      variant: 'destructive',
    });
    return false;
  }
};

export const getPushStatus = async () => {
  try {
    return await api('/api/push/status');
  } catch (e) {
    return { active: 0, configured: false, projectId: null };
  }
};

// Notifications recues pendant que l'application est ouverte.
// Retourne une fonction de desabonnement (ou une promesse de celle-ci).
export const onForegroundMessage = async (callback) => {
  const messaging = await getMessagingIfSupported();
  if (!messaging || typeof callback !== 'function') return () => {};
  return onMessage(messaging, (payload) => {
    const data = payload?.data || {};
    const title = data.title || payload?.notification?.title || 'BonPlan Infos';
    const body = data.body || payload?.notification?.body || '';
    const url = data.url && data.url.startsWith('/') && !data.url.startsWith('//') ? data.url : '/notifications';
    try {
      callback({ title, body, url, data });
    } catch (e) {
      console.error('[push] callback message', e);
    }
  });
};

// Compat avec l'ancien code (Supabase/VAPID). Conserve pour ne rien casser.
const hashToken = async (token) => {
  const msgBuffer = new TextEncoder().encode(token);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
  return Array.from(new Uint8Array(hashBuffer))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
};

const arrayBufferToBase64 = (buffer) => {
  if (!buffer) return 'pending';
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i += 1) binary += String.fromCharCode(bytes[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
};

const urlBase64ToUint8Array = (base64String) => {
  const padding = '='.repeat((4 - (base64String.length % 4)) % 4);
  const base64 = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
  const rawData = window.atob(base64);
  const outputArray = new Uint8Array(rawData.length);
  for (let i = 0; i < rawData.length; i += 1) outputArray[i] = rawData.charCodeAt(i);
  return outputArray;
};

// Ancien nom utilise par PushNotificationManager : enregistre l'appareil.
const savePushTokenToSupabase = async () => {
  const token = await subscribeToPushNotifications();
  return { success: true, token };
};

const testSupabaseConnection = async () => {
  const status = await getPushStatus();
  return { success: Boolean(status?.configured), status };
};

export {
  hashToken,
  arrayBufferToBase64,
  urlBase64ToUint8Array,
  savePushTokenToSupabase,
  testSupabaseConnection,
};
