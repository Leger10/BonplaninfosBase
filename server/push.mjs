// server/push.mjs
// Envoi Firebase Cloud Messaging (FCM) cote serveur.
// - messages data-only : le service worker affiche la notification ;
// - diffusion a tous les appareils actifs (audience "all") avec prenom
//   personnalise par utilisateur ;
// - desactivation automatique des jetons invalides/expires.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  chunk,
  firstNameFrom,
  isSafeNotificationUrl,
  parseNotificationPrefs,
  renderBody,
  shouldSendPush,
} from './pushLogic.mjs';

export class PushNotConfiguredError extends Error {
  constructor(message = 'Notifications push non configurees') {
    super(message);
    this.name = 'PushNotConfiguredError';
    this.code = 'PUSH_NOT_CONFIGURED';
  }
}

let adminModule = null;
let messagingClient = null;
let initError = null;
let serviceAccount = null;
let accountLogged = false;

const PROJECT_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
// Emplacements acceptes sans configuration : la cle est deposee a la main sur
// le serveur (fichier .env versionne, donc ecrase a chaque deploiement).
const SERVICE_ACCOUNT_FALLBACKS = [
  'firebase-service-account.json',
  'private/firebase-service-account.json',
  'server/firebase-service-account.json',
];

function serviceAccountCandidates() {
  const found = [];
  for (const rel of SERVICE_ACCOUNT_FALLBACKS) {
    found.push(path.resolve(process.cwd(), rel), path.resolve(PROJECT_ROOT, rel));
  }
  return [...new Set(found)];
}

function readServiceAccount(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function parseServiceAccount() {
  if (serviceAccount) return serviceAccount;
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (rawJson && rawJson.trim()) {
    const text = rawJson.trim();
    try {
      serviceAccount = text.startsWith('{') ? JSON.parse(text) : JSON.parse(Buffer.from(text, 'base64').toString('utf8'));
    } catch (e) {
      throw new PushNotConfiguredError('FIREBASE_SERVICE_ACCOUNT_JSON invalide (JSON attendu)');
    }
    if (!accountLogged) {
      accountLogged = true;
      console.log('[push] compte de service charge : variable FIREBASE_SERVICE_ACCOUNT_JSON');
    }
    return serviceAccount;
  }
  const errors = [];
  let loaded = null;
  let usedPath = null;
  if (filePath && filePath.trim()) {
    try {
      usedPath = path.resolve(filePath.trim());
      loaded = readServiceAccount(usedPath);
    } catch (e) {
      errors.push(`${filePath.trim()} : ${e.message}`);
      usedPath = null;
    }
  }
  if (!loaded) {
    for (const candidate of serviceAccountCandidates()) {
      if (!fs.existsSync(candidate)) continue;
      try {
        loaded = readServiceAccount(candidate);
        usedPath = candidate;
        break;
      } catch (e) {
        errors.push(`${candidate} : ${e.message}`);
      }
    }
  }
  if (loaded) {
    serviceAccount = loaded;
    if (!accountLogged) {
      accountLogged = true;
      console.log(`[push] compte de service charge : ${usedPath}`);
    }
    return serviceAccount;
  }
  if (errors.length) {
    throw new PushNotConfiguredError(
      `Compte de service Firebase introuvable : ${errors.join(' ; ')}`
      + ` | emplacements verifies : ${serviceAccountCandidates().join(', ')}`
      + ' | deposez firebase-service-account.json dans le dossier qui contient package.json.',
    );
  }
  return null;
}

export function isPushConfigured() {
  const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
  if (rawJson && rawJson.trim()) return true;
  const filePath = process.env.FIREBASE_SERVICE_ACCOUNT_PATH;
  if (filePath && filePath.trim()) return true;
  return serviceAccountCandidates().some((candidate) => fs.existsSync(candidate));
}

export function getPushProjectId() {
  try {
    const account = parseServiceAccount();
    return account?.project_id || null;
  } catch (e) {
    return null;
  }
}

async function getMessagingClient() {
  if (messagingClient) return messagingClient;
  if (initError) throw initError;
  try {
    if (!isPushConfigured()) {
      throw new PushNotConfiguredError(
        'Notifications push non configurees : deposez firebase-service-account.json a la racine '
          + 'du projet, ou definez FIREBASE_SERVICE_ACCOUNT_JSON / FIREBASE_SERVICE_ACCOUNT_PATH.',
      );
    }
    if (!adminModule) adminModule = (await import('firebase-admin')).default;
    const admin = adminModule;
    const account = parseServiceAccount();
    if (!account) throw new PushNotConfiguredError('Compte de service Firebase introuvable');
    if (!admin.apps.length) {
      admin.initializeApp({ credential: admin.credential.cert(account) });
    }
    messagingClient = admin.messaging();
    return messagingClient;
  } catch (e) {
    // Erreurs de configuration : on ne les fige pas, pour que le depot de la
    // cle sur le serveur soit pris en compte sans redemarrage.
    if (!(e instanceof PushNotConfiguredError)) initError = e;
    throw e;
  }
}

function buildFcmMessage(token, { title, body, url, data }) {
  const safeUrl = isSafeNotificationUrl(url);
  const payload = {
    title: String(title || 'BonPlan Infos'),
    body: String(body || ''),
    url: safeUrl,
  };
  if (data && typeof data === 'object') {
    for (const [key, value] of Object.entries(data)) {
      if (value === undefined || value === null) continue;
      payload[key] = typeof value === 'string' ? value : JSON.stringify(value);
    }
  }
  return {
    token,
    data: payload,
    webpush: {
      headers: { Urgency: 'high', TTL: '86400' },
      fcmOptions: { link: safeUrl },
    },
    android: { priority: 'high', ttl: 86_400_000 },
  };
}

const INVALID_TOKEN_CODES = new Set([
  'messaging/registration-token-not-registered',
  'messaging/invalid-registration-token',
  'messaging/invalid-argument',
  'messaging/mismatched-credential',
]);

async function deactivateTokens(tokens) {
  if (!tokens || !tokens.length) return 0;
  const { getDb } = await import('./db.mjs');
  const db = getDb();
  const unique = [...new Set(tokens)];
  let updated = 0;
  for (const batch of chunk(unique, 200)) {
    const placeholders = batch.map(() => '?').join(', ');
    try {
      updated += await db.$executeRawUnsafe(
        `UPDATE user_push_tokens SET is_active = 0, updated_at = NOW() WHERE fcm_token IN (${placeholders})`,
        ...batch,
      );
    } catch (e) {
      console.error('[push] desactivation jetons:', e?.message);
    }
  }
  return updated;
}

async function sendMessages(messages) {
  if (!messages.length) return { sent: 0, failed: 0, invalid: 0 };
  const messaging = await getMessagingClient();
  let sent = 0;
  let failed = 0;
  const invalidTokens = [];
  for (const batch of chunk(messages, 500)) {
    let result;
    try {
      result = await messaging.sendEach(batch);
    } catch (e) {
      failed += batch.length;
      console.error('[push] sendEach:', e?.message);
      continue;
    }
    sent += result.successCount || 0;
    failed += result.failureCount || 0;
    (result.responses || []).forEach((response, index) => {
      if (response.success) return;
      const code = response.error?.code || '';
      if (INVALID_TOKEN_CODES.has(code)) invalidTokens.push(batch[index].token);
    });
  }
  const invalid = await deactivateTokens(invalidTokens);
  return { sent, failed, invalid };
}

async function loadUser(userId) {
  const { getDb } = await import('./db.mjs');
  const rows = await getDb().$queryRawUnsafe(
    `SELECT id, full_name, is_active, deleted_at, notification_settings
       FROM profiles WHERE id = ? LIMIT 1`,
    userId,
  );
  return rows?.[0] || null;
}

async function loadUserTokens(userId) {
  const { getDb } = await import('./db.mjs');
  return getDb().$queryRawUnsafe(
    `SELECT fcm_token FROM user_push_tokens
      WHERE user_id = ? AND is_active = 1
        AND fcm_token IS NOT NULL AND fcm_token <> ''`,
    userId,
  );
}

// Notification personnelle (confirmation, test, message cible).
export async function sendToUser(userId, { title, body, url = '/notifications', data = {} } = {}) {
  if (!userId) return { ok: false, sent: 0, failed: 0, invalid: 0, skipped: 'no_user' };
  const user = await loadUser(userId);
  if (!user) return { ok: false, sent: 0, failed: 0, invalid: 0, skipped: 'user_not_found' };
  if (user.is_active === false || user.deleted_at) {
    return { ok: true, sent: 0, failed: 0, invalid: 0, skipped: 'user_inactive' };
  }
  const prefs = parseNotificationPrefs(user.notification_settings);
  if (!shouldSendPush(prefs)) {
    return { ok: true, sent: 0, failed: 0, invalid: 0, skipped: 'disabled_by_user' };
  }
  const tokens = await loadUserTokens(userId);
  if (!tokens.length) return { ok: true, sent: 0, failed: 0, invalid: 0, skipped: 'no_devices' };
  const firstName = firstNameFrom(user.full_name);
  const rendered = renderBody(body, firstName);
  const messages = tokens.map((row) => buildFcmMessage(row.fcm_token, { title, body: rendered, url, data }));
  const result = await sendMessages(messages);
  return { ok: result.sent > 0 || result.failed === 0, ...result, recipients: messages.length };
}

// Diffusion a tous les utilisateurs actifs ayant un appareil abonne.
// Le corps est un modele : {{prenom}} est remplace pour chaque destinataire.
export async function sendBroadcast({
  title,
  bodyTemplate,
  url = '/events',
  data = {},
  maxRecipients,
  prefKey = null,
} = {}) {
  const cap = Math.min(
    Math.max(1, Number(maxRecipients || process.env.PUSH_MAX_RECIPIENTS || 50_000)),
    200_000,
  );
  const { getDb } = await import('./db.mjs');
  const db = getDb();
  const batchSize = 500;
  let lastId = '';
  let sent = 0;
  let failed = 0;
  let invalid = 0;
  let skipped = 0;
  let scanned = 0;

  while (scanned < cap) {
    // Curseur ecrit dans le SQL (et non lie) : MySQL refuse parfois la
    // liaison de parametres sur LIMIT, ce qui faisait echouer la diffusion.
    // lastId est un identifiant lu en base, valide avant injection.
    const afterId = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
      String(lastId),
    )
      ? String(lastId)
      : '';
    const limit = Math.max(1, Math.min(Math.floor(Number(batchSize)) || 500, 5000));
    const rows = await db.$queryRawUnsafe(
      `SELECT t.id, t.fcm_token, p.full_name, p.notification_settings, p.is_active, p.deleted_at
         FROM user_push_tokens t
         LEFT JOIN profiles p ON p.id = t.user_id
        WHERE t.is_active = 1
          AND t.fcm_token IS NOT NULL AND t.fcm_token <> ''
          AND t.id > '${afterId}'
        ORDER BY t.id ASC
        LIMIT ${limit}`,
    );
    if (!rows?.length) break;

    const messages = [];
    for (const row of rows) {
      scanned += 1;
      if (row.is_active === false || row.deleted_at) {
        skipped += 1;
        continue;
      }
      const prefs = parseNotificationPrefs(row.notification_settings);
      if (!shouldSendPush(prefs) || (prefKey && prefs[prefKey] === false)) {
        skipped += 1;
        continue;
      }
      const firstName = firstNameFrom(row.full_name);
      messages.push(
        buildFcmMessage(row.fcm_token, {
          title,
          body: renderBody(bodyTemplate, firstName),
          url,
          data,
        }),
      );
      if (scanned >= cap) break;
    }

    if (messages.length) {
      const result = await sendMessages(messages);
      sent += result.sent;
      failed += result.failed;
      invalid += result.invalid;
    }

    lastId = rows[rows.length - 1].id;
    if (rows.length < batchSize) break;
  }

  return { ok: sent > 0 || failed === 0, sent, failed, invalid, skipped, scanned };
}

export async function sendTestToUser(userId) {
  return sendToUser(userId, {
    title: 'Notifications activées',
    body: 'Bonjour {{prenom}}, vous recevrez désormais les annonces et rappels de BonPlan Infos.',
    url: '/notifications',
    data: { type: 'test' },
  });
}
