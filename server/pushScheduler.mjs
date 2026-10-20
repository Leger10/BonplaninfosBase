// server/pushScheduler.mjs
// Orchestration des notifications push :
//   - rappels 24 h / 1 h avant un evenement, diffuses a TOUS les utilisateurs
//     actifs ayant un appareil abonne (audience "all") ;
//   - annonces de publication / report / annulation (audience "all") ;
//   - confirmations personnelles (billet, tombola, stand, vote).
//
// Les tables push_reminders / push_outbox servent de file persistante :
// deduplication par cle unique, verrouillage par worker, reessai avec backoff.
// Toutes les dates SQL utilisent UTC_TIMESTAMP() pour rester alignees sur le
// stockage Prisma (DATETIME converti en UTC).
import {
  ZERO_UUID,
  DEFAULT_TIMEZONE_OFFSET_MINUTES,
  MAX_ATTEMPTS,
  buildEventDedupeKey,
  buildEventMessage,
  buildPersonalDedupeKey,
  buildReminderDedupeKey,
  buildReminderMessage,
  computeReminderPlan,
  eventStartKey,
  isEventCancelled,
  isEventPublished,
  isSafeNotificationUrl,
  nextRetryDelayMs,
  shouldRetry,
} from './pushLogic.mjs';
import { isPushConfigured, sendBroadcast, sendToUser } from './push.mjs';

const WORKER_LOCK = Math.random().toString(36).slice(2, 12);
let workerTimer = null;
let schemaWarned = false;

function tzOffset() {
  const value = Number(process.env.PUSH_TIMEZONE_OFFSET_MINUTES);
  return Number.isFinite(value) ? value : DEFAULT_TIMEZONE_OFFSET_MINUTES;
}

function maxAttempts() {
  const value = Number(process.env.PUSH_MAX_ATTEMPTS);
  return Number.isFinite(value) && value > 0 ? Math.floor(value) : MAX_ATTEMPTS;
}

async function db() {
  const { getDb } = await import('./db.mjs');
  return getDb();
}

async function loadEvent(eventId) {
  if (!eventId) return null;
  const client = await db();
  const rows = await client.$queryRawUnsafe(
    `SELECT id, title, city, event_start_at, status, is_active, is_cancelled,
            organizer_id, cancellation_reason, cancelled_at
       FROM events WHERE id = ? LIMIT 1`,
    eventId,
  );
  return rows?.[0] || null;
}

async function cancelReminders(eventId) {
  if (!eventId) return 0;
  const client = await db();
  return client.$executeRawUnsafe(
    `UPDATE push_reminders
        SET status = 'cancelled', cancelled_at = UTC_TIMESTAMP(),
            locked_by = NULL, processing_at = NULL
      WHERE event_id = ? AND status IN ('pending', 'processing')`,
    eventId,
  );
}

async function upsertReminder({ eventId, userId, kind, scheduledAt, title, body, url, dedupeKey }) {
  const client = await db();
  return client.$executeRawUnsafe(
    `INSERT INTO push_reminders
       (event_id, user_id, audience, kind, scheduled_at, title, body, url, status, dedupe_key)
     VALUES (?, ?, 'all', ?, ?, ?, ?, ?, 'pending', ?)
     ON DUPLICATE KEY UPDATE
       scheduled_at = VALUES(scheduled_at),
       title = VALUES(title),
       body = VALUES(body),
       url = VALUES(url),
       status = IF(status = 'sent', 'sent', 'pending'),
       attempts = IF(status = 'sent', attempts, 0),
       last_error = IF(status = 'sent', last_error, NULL),
       cancelled_at = IF(status = 'sent', cancelled_at, NULL),
       locked_by = NULL,
       processing_at = NULL,
       updated_at = UTC_TIMESTAMP()`,
    eventId,
    userId || ZERO_UUID,
    kind,
    scheduledAt,
    title,
    body,
    url,
    dedupeKey,
  );
}

// Recree les rappels d'un evenement et annule ceux devenus obsoletes
// (changement d'heure, depublication, annulation).
export async function scheduleEventReminders(eventId, { event } = {}) {
  if (!eventId) return { scheduled: 0, cancelled: 0 };
  const row = event === undefined ? await loadEvent(eventId) : event;
  if (!row || !isEventPublished(row) || isEventCancelled(row)) {
    const cancelled = await cancelReminders(eventId);
    return { scheduled: 0, cancelled };
  }

  const offset = tzOffset();
  const plan = computeReminderPlan({
    eventStartAt: row.event_start_at,
    now: Date.now(),
    timezoneOffsetMinutes: offset,
  });
  const keys = [];
  for (const item of plan) {
    const message = buildReminderMessage(item.kind, {
      eventTitle: row.title,
      city: row.city,
      eventStartAt: row.event_start_at,
      timezoneOffsetMinutes: offset,
    });
    const dedupeKey = buildReminderDedupeKey({
      eventId,
      kind: item.kind,
      eventStartAt: row.event_start_at,
      timezoneOffsetMinutes: offset,
    });
    keys.push(dedupeKey);
    await upsertReminder({
      eventId,
      userId: row.organizer_id || ZERO_UUID,
      kind: item.kind,
      scheduledAt: item.scheduledAt,
      title: message.title,
      body: message.body,
      url: `/events/${eventId}`,
      dedupeKey,
    });
  }

  const client = await db();
  let cancelled = 0;
  if (keys.length) {
    const placeholders = keys.map(() => '?').join(', ');
    cancelled = await client.$executeRawUnsafe(
      `UPDATE push_reminders
          SET status = 'cancelled', cancelled_at = UTC_TIMESTAMP()
        WHERE event_id = ? AND audience = 'all'
          AND status IN ('pending', 'processing')
          AND dedupe_key NOT IN (${placeholders})`,
      eventId,
      ...keys,
    );
  } else {
    cancelled = await cancelReminders(eventId);
  }
  return { scheduled: plan.length, cancelled };
}

async function enqueueOutbox({ userId, audience = 'user', type, eventId = null, dedupeKey, title, body, url }) {
  const client = await db();
  return client.$executeRawUnsafe(
    `INSERT INTO push_outbox
       (user_id, audience, type, event_id, dedupe_key, title, body, url, status, next_attempt_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'pending', UTC_TIMESTAMP())
     ON DUPLICATE KEY UPDATE updated_at = updated_at`,
    userId || ZERO_UUID,
    audience,
    type,
    eventId,
    dedupeKey,
    title,
    body,
    isSafeNotificationUrl(url),
  );
}

// Annonce diffusee a toute la plateforme (publication, report, annulation).
export async function announceEvent(eventId, type, { event } = {}) {
  if (!eventId) return null;
  const row = event === undefined ? await loadEvent(eventId) : event;
  const offset = tzOffset();
  const message = buildEventMessage(type, {
    eventTitle: row?.title,
    city: row?.city,
    eventStartAt: row?.event_start_at,
    timezoneOffsetMinutes: offset,
  });
  const suffix = type === 'event_published'
    ? ''
    : eventStartKey(row?.event_start_at, offset);
  const dedupeKey = buildEventDedupeKey(type, eventId, suffix);
  await enqueueOutbox({
    userId: row?.organizer_id || ZERO_UUID,
    audience: 'all',
    type,
    eventId,
    dedupeKey,
    title: message.title,
    body: message.body,
    url: `/events/${eventId}`,
  });
  return { dedupeKey };
}

// Point d'entree apres une ecriture sur la table events.
// `before` = etat avant modification (null pour une creation).
export async function handleEventUpserted(eventId, before = null) {
  if (!eventId) return;
  const after = await loadEvent(eventId);
  if (!after) {
    await cancelReminders(eventId);
    return;
  }
  const wasPublished = isEventPublished(before);
  const wasCancelled = isEventCancelled(before);
  const nowPublished = isEventPublished(after);
  const nowCancelled = isEventCancelled(after);
  const startChanged = Boolean(
    before && eventStartKey(before.event_start_at, tzOffset()) !== eventStartKey(after.event_start_at, tzOffset()),
  );

  if (nowCancelled && !wasCancelled) {
    await cancelReminders(eventId);
    await announceEvent(eventId, 'event_cancelled', { event: after });
    return;
  }
  if (!nowPublished) {
    await cancelReminders(eventId);
    return;
  }
  if (!wasPublished) {
    await scheduleEventReminders(eventId, { event: after });
    await announceEvent(eventId, 'event_published', { event: after });
    return;
  }
  if (startChanged) {
    await cancelReminders(eventId);
    await scheduleEventReminders(eventId, { event: after });
    await announceEvent(eventId, 'event_rescheduled', { event: after });
    return;
  }
  await scheduleEventReminders(eventId, { event: after });
}

export async function handleEventDeleted(eventId) {
  await cancelReminders(eventId);
}

async function enqueuePersonal(type, eventId, userId, { ref = '' } = {}) {
  if (!userId) return null;
  const event = await loadEvent(eventId);
  const message = buildEventMessage(type, {
    eventTitle: event?.title,
    city: event?.city,
    eventStartAt: event?.event_start_at,
    timezoneOffsetMinutes: tzOffset(),
  });
  const base = buildPersonalDedupeKey(type, eventId, userId);
  const dedupeKey = ref ? `${base}:${String(ref).slice(0, 60)}` : base;
  await enqueueOutbox({
    userId,
    audience: 'user',
    type,
    eventId,
    dedupeKey,
    title: message.title,
    body: message.body,
    url: '/notifications',
  });
  return { dedupeKey };
}

export async function handleParticipantAdded(eventId, userId) {
  if (!eventId || !userId) return;
  const event = await loadEvent(eventId);
  if (!isEventPublished(event)) return;
  await enqueuePersonal('participation_confirmed', eventId, userId);
  // Les rappels sont globaux : on s'assure simplement qu'ils existent.
  await scheduleEventReminders(eventId, { event });
}

const RPC_EVENTS = {
  purchase_tickets_v2: { type: 'ticket_confirmed', eventId: (args) => args.p_event_id },
  purchase_raffle_tickets: { type: 'raffle_confirmed', eventId: (args) => args.p_raffle_event_id },
  rent_stand: { type: 'stand_confirmed', eventId: (args) => args.p_event_id },
  cast_contest_votes: { type: 'vote_confirmed', eventId: (args) => args.p_event_id },
  cast_votes: { type: 'vote_confirmed', eventId: (args) => args.p_event_id },
};

// Appele apres chaque RPC reussie. Ne doit jamais faire echouer la RPC.
export async function afterRpc(name, args, actor, result) {
  try {
    const config = RPC_EVENTS[name];
    if (!config) return;
    if (!result || result.error) return;
    const payload = result.data && typeof result.data === 'object' ? result.data : result;
    if (payload.success === false) return;
    const eventId = config.eventId(args || {});
    const userId = args?.p_user_id || actor?.id;
    if (!eventId || !userId) return;
    const ref = payload.transaction_id || payload.booking_code || payload.booking_number || payload.vote_id || '';
    await enqueuePersonal(config.type, eventId, userId, { ref });
    const event = await loadEvent(eventId);
    if (isEventPublished(event)) await scheduleEventReminders(eventId, { event });
  } catch (e) {
    console.error('[push] afterRpc', name, e?.message);
  }
}

// ---------------------------------------------------------------------------
// Worker
// ---------------------------------------------------------------------------

async function reclaimStale() {
  const client = await db();
  await client.$executeRawUnsafe(
    `UPDATE push_reminders
        SET status = 'pending', locked_by = NULL, processing_at = NULL
      WHERE status = 'processing'
        AND processing_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE)`,
  );
  await client.$executeRawUnsafe(
    `UPDATE push_outbox
        SET status = 'pending', locked_by = NULL, processing_at = NULL
      WHERE status = 'processing'
        AND processing_at < DATE_SUB(UTC_TIMESTAMP(), INTERVAL 15 MINUTE)`,
  );
}

async function claimReminders(limit) {
  const client = await db();
  const n = Math.max(1, Math.min(Number(limit) || 25, 200));
  await client.$executeRawUnsafe(
    `UPDATE push_reminders
        SET status = 'processing', locked_by = ?, processing_at = UTC_TIMESTAMP()
      WHERE status = 'pending' AND scheduled_at <= UTC_TIMESTAMP()
      ORDER BY scheduled_at ASC
      LIMIT ${n}`,
    WORKER_LOCK,
  );
  return client.$queryRawUnsafe(
    `SELECT * FROM push_reminders
      WHERE locked_by = ? AND status = 'processing'
      ORDER BY scheduled_at ASC`,
    WORKER_LOCK,
  );
}

async function claimOutbox(limit) {
  const client = await db();
  const n = Math.max(1, Math.min(Number(limit) || 25, 200));
  await client.$executeRawUnsafe(
    `UPDATE push_outbox
        SET status = 'processing', locked_by = ?, processing_at = UTC_TIMESTAMP()
      WHERE status = 'pending' AND next_attempt_at <= UTC_TIMESTAMP()
      ORDER BY next_attempt_at ASC
      LIMIT ${n}`,
    WORKER_LOCK,
  );
  return client.$queryRawUnsafe(
    `SELECT * FROM push_outbox
      WHERE locked_by = ? AND status = 'processing'
      ORDER BY next_attempt_at ASC`,
    WORKER_LOCK,
  );
}

function outcomeOf(result) {
  if (result?.sent > 0) return { status: 'sent' };
  const skip = result?.skipped;
  if (skip === 'no_devices' || skip === 'disabled_by_user' || skip === 'user_inactive' || skip === 'user_not_found') {
    return { status: 'skipped', reason: skip };
  }
  if (result?.failed > 0) return { status: 'retry', reason: `${result.failed} echec(s)` };
  return { status: 'skipped', reason: skip || 'aucun destinataire' };
}

async function finalizeReminder(row, outcome) {
  const client = await db();
  if (outcome.status === 'sent') {
    await client.$executeRawUnsafe(
      `UPDATE push_reminders
          SET status = 'sent', sent_at = UTC_TIMESTAMP(), locked_by = NULL,
              processing_at = NULL, last_error = NULL, updated_at = UTC_TIMESTAMP()
        WHERE id = ? AND locked_by = ?`,
      row.id,
      WORKER_LOCK,
    );
    return;
  }
  if (outcome.status === 'skipped') {
    await client.$executeRawUnsafe(
      `UPDATE push_reminders
          SET status = 'skipped', locked_by = NULL, processing_at = NULL,
              last_error = ?, updated_at = UTC_TIMESTAMP()
        WHERE id = ? AND locked_by = ?`,
      String(outcome.reason || '').slice(0, 500),
      row.id,
      WORKER_LOCK,
    );
    return;
  }
  const attempts = Number(row.attempts || 0) + 1;
  const retry = shouldRetry(attempts, maxAttempts());
  if (retry) {
    const next = new Date(Date.now() + nextRetryDelayMs(attempts));
    await client.$executeRawUnsafe(
      `UPDATE push_reminders
          SET status = 'pending', scheduled_at = ?, attempts = ?, last_error = ?,
              locked_by = NULL, processing_at = NULL, updated_at = UTC_TIMESTAMP()
        WHERE id = ? AND locked_by = ?`,
      next,
      attempts,
      String(outcome.reason || '').slice(0, 500),
      row.id,
      WORKER_LOCK,
    );
  } else {
    await client.$executeRawUnsafe(
      `UPDATE push_reminders
          SET status = 'failed', attempts = ?, last_error = ?,
              locked_by = NULL, processing_at = NULL, updated_at = UTC_TIMESTAMP()
        WHERE id = ? AND locked_by = ?`,
      attempts,
      String(outcome.reason || '').slice(0, 500),
      row.id,
      WORKER_LOCK,
    );
  }
}

async function finalizeOutbox(row, outcome) {
  const client = await db();
  if (outcome.status === 'sent') {
    await client.$executeRawUnsafe(
      `UPDATE push_outbox
          SET status = 'sent', sent_at = UTC_TIMESTAMP(), locked_by = NULL,
              processing_at = NULL, last_error = NULL, updated_at = UTC_TIMESTAMP()
        WHERE id = ? AND locked_by = ?`,
      row.id,
      WORKER_LOCK,
    );
    return;
  }
  if (outcome.status === 'skipped') {
    await client.$executeRawUnsafe(
      `UPDATE push_outbox
          SET status = 'skipped', locked_by = NULL, processing_at = NULL,
              last_error = ?, updated_at = UTC_TIMESTAMP()
        WHERE id = ? AND locked_by = ?`,
      String(outcome.reason || '').slice(0, 500),
      row.id,
      WORKER_LOCK,
    );
    return;
  }
  const attempts = Number(row.attempts || 0) + 1;
  const retry = shouldRetry(attempts, maxAttempts());
  if (retry) {
    const next = new Date(Date.now() + nextRetryDelayMs(attempts));
    await client.$executeRawUnsafe(
      `UPDATE push_outbox
          SET status = 'pending', next_attempt_at = ?, attempts = ?, last_error = ?,
              locked_by = NULL, processing_at = NULL, updated_at = UTC_TIMESTAMP()
        WHERE id = ? AND locked_by = ?`,
      next,
      attempts,
      String(outcome.reason || '').slice(0, 500),
      row.id,
      WORKER_LOCK,
    );
  } else {
    await client.$executeRawUnsafe(
      `UPDATE push_outbox
          SET status = 'failed', attempts = ?, last_error = ?,
              locked_by = NULL, processing_at = NULL, updated_at = UTC_TIMESTAMP()
        WHERE id = ? AND locked_by = ?`,
      attempts,
      String(outcome.reason || '').slice(0, 500),
      row.id,
      WORKER_LOCK,
    );
  }
}

async function processReminder(row) {
  const url = isSafeNotificationUrl(row.url, `/events/${row.event_id}`);
  const data = { type: 'reminder', kind: row.kind, eventId: row.event_id };
  try {
    const result = row.audience === 'all'
      ? await sendBroadcast({ title: row.title, bodyTemplate: row.body, url, data })
      : await sendToUser(row.user_id, { title: row.title, body: row.body, url, data });
    const outcome = outcomeOf(result);
    await finalizeReminder(row, outcome);
    return outcome.status;
  } catch (e) {
    await finalizeReminder(row, { status: 'retry', reason: e?.message || 'erreur envoi' });
    return 'retry';
  }
}

async function processOutbox(row) {
  const url = isSafeNotificationUrl(row.url, '/notifications');
  const data = { type: row.type, eventId: row.event_id || '' };
  const prefKey = row.type === 'event_published'
    ? 'new_events_notification'
    : row.type === 'event_promoted'
      ? 'promoted_events_notification'
      : null;
  try {
    const result = row.audience === 'all'
      ? await sendBroadcast({ title: row.title, bodyTemplate: row.body, url, data, prefKey })
      : await sendToUser(row.user_id, { title: row.title, body: row.body, url, data });
    const outcome = outcomeOf(result);
    await finalizeOutbox(row, outcome);
    return outcome.status;
  } catch (e) {
    await finalizeOutbox(row, { status: 'retry', reason: e?.message || 'erreur envoi' });
    return 'retry';
  }
}

// Verifie que la migration push a bien ete appliquee (tables + colonnes).
export async function checkPushSchema() {
  try {
    const client = await db();
    await client.$queryRawUnsafe('SELECT 1 FROM push_reminders LIMIT 1');
    await client.$queryRawUnsafe('SELECT 1 FROM push_outbox LIMIT 1');
    await client.$queryRawUnsafe('SELECT token_hash FROM user_push_tokens LIMIT 1');
    return { ready: true };
  } catch (e) {
    return { ready: false, error: e?.message?.split('\n')[0] || 'schema push incomplet' };
  }
}

export async function runPushWorkerOnce({ limit = 25 } = {}) {
  if (!isPushConfigured()) {
    return { ok: false, configured: false, reason: 'FIREBASE_SERVICE_ACCOUNT_JSON manquant' };
  }
  const schema = await checkPushSchema();
  if (!schema.ready) {
    return { ok: false, configured: true, reason: 'migration_required', error: schema.error };
  }
  await reclaimStale();
  const reminders = await claimReminders(limit);
  let remindersSent = 0;
  for (const row of reminders) {
    const status = await processReminder(row);
    if (status === 'sent') remindersSent += 1;
  }
  const outbox = await claimOutbox(limit);
  let outboxSent = 0;
  for (const row of outbox) {
    const status = await processOutbox(row);
    if (status === 'sent') outboxSent += 1;
  }
  return {
    ok: true,
    configured: true,
    reminders: { claimed: reminders.length, sent: remindersSent },
    outbox: { claimed: outbox.length, sent: outboxSent },
  };
}

export function startPushWorker() {
  if (process.env.PUSH_WORKER_ENABLED === 'false') {
    console.log('[push] worker desactive (PUSH_WORKER_ENABLED=false)');
    return null;
  }
  if (workerTimer) return workerTimer;
  const intervalSec = Math.max(15, Number(process.env.PUSH_WORKER_INTERVAL_SECONDS) || 60);
  const tick = async () => {
    try {
      const result = await runPushWorkerOnce({ limit: Number(process.env.PUSH_WORKER_BATCH) || 25 });
      if (result?.reason === 'migration_required') {
        if (!schemaWarned) {
          schemaWarned = true;
          console.error(
            '[push] MIGRATION REQUISE : executez migrations-prod/push-notifications.sql sur la base. Detail:',
            result.error,
          );
        }
        return;
      }
      if (result?.reminders?.claimed || result?.outbox?.claimed) {
        console.log(`[push] worker ${JSON.stringify(result)}`);
      }
    } catch (e) {
      console.error('[push] worker', e?.message?.split('\n')[0]);
    }
  };
  setTimeout(tick, 15_000).unref?.();
  workerTimer = setInterval(tick, intervalSec * 1000);
  workerTimer.unref?.();
  console.log(`[push] worker actif (${intervalSec}s)`);
  return workerTimer;
}

export function stopPushWorker() {
  if (workerTimer) clearInterval(workerTimer);
  workerTimer = null;
}

// Utilitaire pour l'admin : envoi immediat d'une annonce a tous.
export async function broadcastFromAdmin({ title, body, url = '/events' }) {
  const dedupeKey = `manual:${Date.now()}:${Math.random().toString(36).slice(2, 10)}`;
  await enqueueOutbox({
    userId: ZERO_UUID,
    audience: 'all',
    type: 'manual',
    dedupeKey,
    title,
    body,
    url,
  });
  return { dedupeKey };
}
