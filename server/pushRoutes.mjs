// server/pushRoutes.mjs
// Routes HTTP des notifications push.
//   POST /api/push/register    enregistre le jeton FCM de l'appareil
//   POST /api/push/unregister  desactive un jeton (ou tous ceux du compte)
//   GET  /api/push/status      etat des abonnements de l'utilisateur
//   POST /api/push/test        notification de test personnelle (limitee)
//   POST /api/push/broadcast   annonce a tous (administration uniquement)
//   ALL  /api/cron/push        traitement de la file (secret de cron)
import express from 'express';
import crypto from 'node:crypto';
import { resolveActor, isAdmin } from './session.mjs';
import { hashToken, normalizeToken, isSafeNotificationUrl } from './pushLogic.mjs';
import { getPushProjectId, isPushConfigured, sendTestToUser } from './push.mjs';
import { broadcastFromAdmin, checkPushSchema, runPushWorkerOnce } from './pushScheduler.mjs';

export const pushRouter = express.Router();
export const cronRouter = express.Router();

function fail(res, status, message, code) {
  return res.status(status).json({ data: null, error: { message, code, details: null, hint: null } });
}

function ok(res, data) {
  return res.json({ data, error: null });
}

async function requireUser(req, res, next) {
  const actor = await resolveActor(req).catch(() => null);
  if (!actor) return fail(res, 401, 'Authentification requise', 'not_authenticated');
  if (actor.source !== 'user') {
    return fail(res, 403, 'Session utilisateur requise', 'user_session_required');
  }
  req.actor = actor;
  return next();
}

async function getDbSafe() {
  const { getDb } = await import('./db.mjs');
  return getDb();
}

async function activeTokenCount(userId) {
  const db = await getDbSafe();
  const rows = await db.$queryRawUnsafe(
    `SELECT COUNT(*) AS n FROM user_push_tokens WHERE user_id = ? AND is_active = 1`,
    userId,
  );
  return Number(rows?.[0]?.n || 0);
}

// Profondeur de la file d'envoi, pour localiser la panne : une file qui
// grossit sans jamais passer en 'sent' signale un worker ou FCM inactifs.
async function queueDepth() {
  const db = await getDbSafe();
  const [outbox, reminders, tokens, lastFailure] = await Promise.all([
    db.$queryRawUnsafe(
      `SELECT status, COUNT(*) AS n FROM push_outbox GROUP BY status`,
    ).catch(() => []),
    db.$queryRawUnsafe(
      `SELECT status, COUNT(*) AS n FROM push_reminders GROUP BY status`,
    ).catch(() => []),
    db.$queryRawUnsafe(
      `SELECT COUNT(*) AS n FROM user_push_tokens WHERE is_active = 1`,
    ).catch(() => [{ n: 0 }]),
    db.$queryRawUnsafe(
      `SELECT status, last_error, COUNT(*) AS n
         FROM push_outbox
        WHERE status IN ('failed', 'skipped', 'retry')
        GROUP BY status, last_error
        ORDER BY n DESC
        LIMIT 5`,
    ).catch(() => []),
  ]);
  const toMap = (rows) =>
    Object.fromEntries((rows || []).map((r) => [String(r.status), Number(r.n) || 0]));
  return {
    outbox: toMap(outbox),
    reminders: toMap(reminders),
    activeTokens: Number(tokens?.[0]?.n || 0),
    lastFailures: (lastFailure || []).map((r) => ({
      status: String(r.status),
      reason: String(r.last_error || '').slice(0, 200),
      count: Number(r.n) || 0,
    })),
  };
}

// Limiteur en memoire (suffisant face a un abus simple ; le worker et FCM
// restent les garde-fous principaux).
const rateBuckets = new Map();
function rateLimit(key, max, windowMs) {
  const now = Date.now();
  const entry = rateBuckets.get(key);
  if (!entry || entry.reset <= now) {
    rateBuckets.set(key, { count: 1, reset: now + windowMs });
    return true;
  }
  if (entry.count >= max) return false;
  entry.count += 1;
  return true;
}

pushRouter.post('/register', requireUser, async (req, res) => {
  try {
    const token = normalizeToken(req.body?.token);
    if (!token) return fail(res, 400, 'Jeton FCM invalide', 'invalid_token');
    const platform = String(req.body?.platform || 'web').slice(0, 20);
    const deviceType = String(req.body?.deviceType || req.body?.device_type || 'web').slice(0, 32);
    const userAgent = String(req.body?.userAgent || req.headers['user-agent'] || '').slice(0, 255);
    const tokenHash = hashToken(token);
    const userId = req.actor.id;

    const db = await getDbSafe();
    // Un appareil partage change de proprietaire : on desactive l'ancien lien.
    await db.$executeRawUnsafe(
      `UPDATE user_push_tokens SET is_active = 0, updated_at = UTC_TIMESTAMP()
        WHERE token_hash = ? AND user_id <> ? AND is_active = 1`,
      tokenHash,
      userId,
    );
    await db.$executeRawUnsafe(
      `INSERT INTO user_push_tokens
         (id, user_id, fcm_token, token_hash, device_type, platform, user_agent,
          is_active, created_at, updated_at, last_used_at)
       VALUES (UUID(), ?, ?, ?, ?, ?, ?, 1, UTC_TIMESTAMP(), UTC_TIMESTAMP(), UTC_TIMESTAMP())
       ON DUPLICATE KEY UPDATE
         user_id = VALUES(user_id),
         fcm_token = VALUES(fcm_token),
         device_type = VALUES(device_type),
         platform = VALUES(platform),
         user_agent = VALUES(user_agent),
         is_active = 1,
         updated_at = UTC_TIMESTAMP(),
         last_used_at = UTC_TIMESTAMP()`,
      userId,
      token,
      tokenHash,
      deviceType,
      platform,
      userAgent,
    );
    // Plafond d'appareils par compte : on conserve les 10 plus recents.
    await db.$executeRawUnsafe(
      `UPDATE user_push_tokens
          SET is_active = 0, updated_at = UTC_TIMESTAMP()
        WHERE user_id = ? AND is_active = 1
          AND id NOT IN (
            SELECT id FROM (
              SELECT id FROM user_push_tokens
               WHERE user_id = ? AND is_active = 1
               ORDER BY updated_at DESC, created_at DESC
               LIMIT 10
            ) AS keep_tokens
          )`,
      userId,
      userId,
    );
    const active = await activeTokenCount(userId);
    return ok(res, { active, platform });
  } catch (e) {
    console.error('[push/register]', e?.message);
    return fail(res, 500, "Impossible d'enregistrer l'appareil", 'register_failed');
  }
});

pushRouter.post('/unregister', requireUser, async (req, res) => {
  try {
    const db = await getDbSafe();
    const userId = req.actor.id;
    const token = normalizeToken(req.body?.token);
    if (token) {
      await db.$executeRawUnsafe(
        `UPDATE user_push_tokens SET is_active = 0, updated_at = UTC_TIMESTAMP()
          WHERE token_hash = ? AND user_id = ?`,
        hashToken(token),
        userId,
      );
    } else {
      await db.$executeRawUnsafe(
        `UPDATE user_push_tokens SET is_active = 0, updated_at = UTC_TIMESTAMP()
          WHERE user_id = ? AND is_active = 1`,
        userId,
      );
    }
    return ok(res, { active: await activeTokenCount(userId) });
  } catch (e) {
    console.error('[push/unregister]', e?.message);
    return fail(res, 500, "Impossible de désactiver l'appareil", 'unregister_failed');
  }
});

pushRouter.get('/status', requireUser, async (req, res) => {
  try {
    const active = await activeTokenCount(req.actor.id);
    const schema = await checkPushSchema().catch(() => ({ ready: false, error: 'indisponible' }));
    return ok(res, {
      active,
      configured: isPushConfigured(),
      projectId: getPushProjectId(),
      schema,
      queue: await queueDepth().catch(() => null),
      workerEnabled: process.env.PUSH_WORKER_ENABLED !== 'false',
    });
  } catch (e) {
    console.error('[push/status]', e?.message);
    return fail(res, 500, 'Statut indisponible', 'status_failed');
  }
});

pushRouter.post('/test', requireUser, async (req, res) => {
  try {
    if (!isPushConfigured()) {
      return fail(res, 503, 'Notifications push non configurées sur le serveur', 'push_not_configured');
    }
    if (!rateLimit(`test:${req.actor.id}`, 1, 60_000)) {
      return fail(res, 429, 'Patientez une minute avant un nouveau test', 'rate_limited');
    }
    const result = await sendTestToUser(req.actor.id);
    if (result?.skipped === 'no_devices') {
      return fail(res, 409, 'Aucun appareil actif : activez d’abord les notifications', 'no_devices');
    }
    return ok(res, {
      sent: result.sent,
      failed: result.failed,
      skipped: result.skipped || null,
    });
  } catch (e) {
    console.error('[push/test]', e?.message);
    if (e?.code === 'PUSH_NOT_CONFIGURED') {
      return fail(res, 503, 'Notifications push non configurées sur le serveur', 'push_not_configured');
    }
    return fail(res, 500, "Échec de l'envoi de test", 'test_failed');
  }
});

pushRouter.post('/broadcast', async (req, res) => {
  try {
    const actor = await resolveActor(req).catch(() => null);
    if (!actor) return fail(res, 401, 'Authentification requise', 'not_authenticated');
    if (!isAdmin(actor)) return fail(res, 403, 'Droits insuffisants', 'forbidden');
    if (!rateLimit(`broadcast:${actor.id || actor.source}`, 5, 60 * 60_000)) {
      return fail(res, 429, 'Trop de diffusions : réessayez dans une heure', 'rate_limited');
    }
    const title = String(req.body?.title || '').trim();
    const body = String(req.body?.body || '').trim();
    const url = isSafeNotificationUrl(req.body?.url, '/events');
    if (title.length < 1 || title.length > 120) {
      return fail(res, 400, 'Titre requis (1 à 120 caractères)', 'invalid_title');
    }
    if (body.length < 1 || body.length > 500) {
      return fail(res, 400, 'Message requis (1 à 500 caractères)', 'invalid_body');
    }
    if (!isPushConfigured()) {
      return fail(res, 503, 'Notifications push non configurées sur le serveur', 'push_not_configured');
    }
    const queued = await broadcastFromAdmin({ title, body, url });
    if (req.body?.sendNow === true) {
      const run = await runPushWorkerOnce({ limit: 25 });
      return ok(res, { queued: true, ...queued, worker: run });
    }
    return ok(res, { queued: true, ...queued });
  } catch (e) {
    console.error('[push/broadcast]', e?.message);
    return fail(res, 500, 'Diffusion impossible', 'broadcast_failed');
  }
});

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function requireCronSecret(req, res, next) {
  const expected = process.env.PUSH_CRON_SECRET;
  if (!expected) {
    return fail(res, 503, 'PUSH_CRON_SECRET non configuré', 'cron_not_configured');
  }
  const headerKey = req.headers['x-cron-key'];
  const auth = String(req.headers.authorization || '');
  const bearer = auth.toLowerCase().startsWith('bearer ') ? auth.slice(7).trim() : '';
  const provided = typeof headerKey === 'string' && headerKey ? headerKey : bearer;
  if (!provided || !safeEqual(provided, expected)) {
    return fail(res, 401, 'Secret de cron invalide', 'forbidden');
  }
  return next();
}

async function cronHandler(req, res) {
  try {
    const limit = Number(req.query.limit || req.body?.limit || 25);
    const result = await runPushWorkerOnce({ limit });
    if (!result.configured) {
      return fail(res, 503, 'Notifications push non configurées sur le serveur', 'push_not_configured');
    }
    if (result.reason === 'migration_required') {
      return fail(
        res,
        503,
        'Migration push non appliquée : exécutez migrations-prod/push-notifications.sql',
        'migration_required',
      );
    }
    return res.json({ ok: true, ...result });
  } catch (e) {
    console.error('[cron/push]', e?.message);
    return fail(res, 500, 'Traitement de la file impossible', 'cron_failed');
  }
}

cronRouter.all('/push', requireCronSecret, cronHandler);
