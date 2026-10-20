// server/pushLogic.mjs
// Logique pure (sans acces base ni reseau) des notifications push :
// planification des rappels, cles de deduplication, messages, validation
// d'URL et politique de reessai. Testee par tests/pushLogic.test.mjs.
import { createHash } from 'node:crypto';

export const ZERO_UUID = '00000000-0000-0000-0000-000000000000';
export const DEFAULT_TIMEZONE_OFFSET_MINUTES = 0;
export const MAX_ATTEMPTS = 5;

// Creneaux de rappel : 24 h et 1 h avant le debut de l'evenement.
export const DEFAULT_REMINDER_KINDS = [
  { kind: '24h', leadMs: 24 * 60 * 60 * 1000 },
  { kind: '1h', leadMs: 60 * 60 * 1000 },
];

const LOCAL_DATE_RE = /^\d{4}-\d{2}-\d{2}([ T]\d{2}:\d{2}(:\d{2})?)?$/;
const HAS_ZONE_RE = /(?:Z|[+-]\d{2}:?\d{2})$/i;

// Date MySQL (DATETIME sans fuseau) interpretee comme heure locale du site.
// Prisma renvoie un Date dont les composants UTC sont l'heure murale stockee :
// l'instant reel = heure murale - decalage (minutes a l'est de UTC).
export function parseEventInstant(value, timezoneOffsetMinutes = DEFAULT_TIMEZONE_OFFSET_MINUTES) {
  if (value === null || value === undefined || value === '') return NaN;
  const offset = Number.isFinite(Number(timezoneOffsetMinutes)) ? Number(timezoneOffsetMinutes) : 0;
  if (value instanceof Date) {
    const ms = value.getTime();
    return Number.isNaN(ms) ? NaN : ms - offset * 60_000;
  }
  const raw = String(value).trim();
  if (!raw) return NaN;
  if (LOCAL_DATE_RE.test(raw) && !HAS_ZONE_RE.test(raw)) {
    const normalized = raw.replace(' ', 'T');
    const withSeconds = normalized.length === 16 ? `${normalized}:00` : normalized;
    const ms = Date.parse(`${withSeconds}Z`);
    return Number.isNaN(ms) ? NaN : ms - offset * 60_000;
  }
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? NaN : ms;
}

// ISO stable utilise dans les cles de deduplication (independant du format
// source : Date Prisma, chaine MySQL ou ISO).
export function eventStartKey(value, timezoneOffsetMinutes = DEFAULT_TIMEZONE_OFFSET_MINUTES) {
  const ms = parseEventInstant(value, timezoneOffsetMinutes);
  return Number.isNaN(ms) ? 'na' : new Date(ms).toISOString();
}

// Rappels a creer : uniquement ceux dont l'heure est encore future.
export function computeReminderPlan({
  eventStartAt,
  now = Date.now(),
  timezoneOffsetMinutes = DEFAULT_TIMEZONE_OFFSET_MINUTES,
  kinds = DEFAULT_REMINDER_KINDS,
}) {
  const start = parseEventInstant(eventStartAt, timezoneOffsetMinutes);
  if (Number.isNaN(start)) return [];
  const nowMs = now instanceof Date ? now.getTime() : Number(now);
  if (!Number.isFinite(nowMs)) return [];
  const plan = [];
  for (const item of kinds) {
    if (!item || !item.kind || !Number.isFinite(Number(item.leadMs))) continue;
    const scheduled = start - Number(item.leadMs);
    if (scheduled > nowMs) {
      plan.push({ kind: String(item.kind), scheduledAt: new Date(scheduled) });
    }
  }
  return plan.sort((a, b) => a.scheduledAt.getTime() - b.scheduledAt.getTime());
}

export function buildReminderDedupeKey({ eventId, kind, eventStartAt, timezoneOffsetMinutes }) {
  return `evt:${eventId}:all:rem:${kind}:${eventStartKey(eventStartAt, timezoneOffsetMinutes)}`;
}

export function buildEventDedupeKey(type, eventId, suffix = '') {
  const tail = suffix ? `:${suffix}` : '';
  return `event:${type}:${eventId}${tail}`;
}

export function buildPersonalDedupeKey(type, eventId, userId) {
  return `user:${type}:${eventId || 'na'}:${userId}`;
}

export function formatEventTime(
  value,
  timezoneOffsetMinutes = DEFAULT_TIMEZONE_OFFSET_MINUTES,
  locale = 'fr-FR',
) {
  const ms = parseEventInstant(value, timezoneOffsetMinutes);
  if (Number.isNaN(ms)) return '';
  const offset = Number(timezoneOffsetMinutes) || 0;
  const wallClock = new Date(ms + offset * 60_000);
  try {
    return new Intl.DateTimeFormat(locale, {
      weekday: 'long',
      day: 'numeric',
      month: 'long',
      hour: '2-digit',
      minute: '2-digit',
      timeZone: 'UTC',
    }).format(wallClock);
  } catch (e) {
    return wallClock.toISOString().slice(0, 16).replace('T', ' ');
  }
}

function citySuffix(city) {
  const c = String(city || '').trim();
  return c ? ` à ${c}` : '';
}

export function buildReminderMessage(kind, {
  eventTitle,
  city,
  eventStartAt,
  timezoneOffsetMinutes = DEFAULT_TIMEZONE_OFFSET_MINUTES,
} = {}) {
  const title = String(eventTitle || 'votre événement').trim();
  const when = formatEventTime(eventStartAt, timezoneOffsetMinutes);
  const place = citySuffix(city);
  const at = when ? ` (${when})` : '';
  if (kind === '1h') {
    return {
      title: `C'est bientôt : ${title}`,
      body: `Bonjour {{prenom}}, l'événement « ${title} »${place} commence dans 1 heure${at}. Pensez à votre billet.`,
    };
  }
  return {
    title: `Rappel : ${title}`,
    body: `Bonjour {{prenom}}, l'événement « ${title} »${place} commence dans 24 heures${at}.`,
  };
}

export function buildEventMessage(type, {
  eventTitle,
  city,
  eventStartAt,
  timezoneOffsetMinutes = DEFAULT_TIMEZONE_OFFSET_MINUTES,
} = {}) {
  const title = String(eventTitle || 'votre événement').trim();
  const when = formatEventTime(eventStartAt, timezoneOffsetMinutes);
  const place = citySuffix(city);
  const at = when ? ` le ${when}` : '';
  switch (type) {
    case 'event_published':
      return {
        title: `Nouvel événement : ${title}`,
        body: `Bonjour {{prenom}}, un nouvel événement « ${title} »${place} vient d'être publié${at}. Réservez votre place dès maintenant.`,
      };
    case 'event_rescheduled':
      return {
        title: `Événement reporté : ${title}`,
        body: `Bonjour {{prenom}}, l'événement « ${title} »${place} est reporté${at}. Consultez la nouvelle date sur la plateforme.`,
      };
    case 'event_cancelled':
      return {
        title: `Événement annulé : ${title}`,
        body: `Bonjour {{prenom}}, l'événement « ${title} »${place} a été annulé. Consultez votre espace pour les modalités.`,
      };
    case 'ticket_confirmed':
      return {
        title: 'Billet confirmé',
        body: `Bonjour {{prenom}}, votre billet pour « ${title} »${at} est confirmé. Retrouvez-le dans votre espace.`,
      };
    case 'raffle_confirmed':
      return {
        title: 'Tickets de tombola confirmés',
        body: `Bonjour {{prenom}}, vos tickets pour « ${title} » sont enregistrés. Bonne chance !`,
      };
    case 'stand_confirmed':
      return {
        title: 'Stand réservé',
        body: `Bonjour {{prenom}}, votre stand pour « ${title} »${at} est confirmé. Consultez les détails dans votre espace.`,
      };
    case 'vote_confirmed':
      return {
        title: 'Vote enregistré',
        body: `Bonjour {{prenom}}, votre vote pour « ${title} » a bien été pris en compte.`,
      };
    case 'participation_confirmed':
      return {
        title: 'Participation confirmée',
        body: `Bonjour {{prenom}}, votre participation à « ${title} »${at} est confirmée.`,
      };
    case 'test':
      return {
        title: 'Notifications activées',
        body: 'Bonjour {{prenom}}, vous recevrez désormais les annonces et rappels de BonPlan Infos.',
      };
    default:
      return {
        title: `BonPlan Infos : ${title}`,
        body: `Bonjour {{prenom}}, une information concerne « ${title} ».`,
      };
  }
}

// Seules les URL internes sont acceptees : pas de javascript:, data:, //evil.
export function isSafeNotificationUrl(value, fallback = '/') {
  if (typeof value !== 'string') return fallback;
  const url = value.trim();
  if (!url) return fallback;
  if (url.length > 500) return fallback;
  if (/[\u0000-\u001f\u007f]/.test(url)) return fallback;
  if (url.startsWith('//') || url.startsWith('\\\\') || url.startsWith('/\\')) return fallback;
  if (/^[a-zA-Z][a-zA-Z0-9+.-]*:/.test(url)) return fallback;
  if (!url.startsWith('/')) return fallback;
  return url;
}

const DEFAULT_PREFS = {
  push_notifications_enabled: true,
  new_events_notification: true,
  promoted_events_notification: true,
  nearby_events_notification: true,
};

export function parseNotificationPrefs(raw) {
  let parsed = {};
  if (raw && typeof raw === 'object') {
    parsed = raw;
  } else if (typeof raw === 'string' && raw.trim()) {
    try {
      const value = JSON.parse(raw);
      parsed = value && typeof value === 'object' ? value : {};
    } catch (e) {
      parsed = {};
    }
  }
  const prefs = { ...DEFAULT_PREFS };
  for (const key of Object.keys(DEFAULT_PREFS)) {
    if (typeof parsed[key] === 'boolean') prefs[key] = parsed[key];
  }
  return prefs;
}

export function shouldSendPush(prefs) {
  return !prefs || prefs.push_notifications_enabled !== false;
}

export function firstNameFrom(fullName) {
  const value = String(fullName || '').trim();
  if (!value) return '';
  return value.split(/\s+/)[0].slice(0, 40);
}

// Remplace le placeholder par le prenom (ou une formule neutre).
export function renderBody(template, firstName) {
  const name = String(firstName || '').trim() || 'cher membre';
  return String(template || '').replace(/\{\{\s*prenom\s*\}\}/gi, name);
}

export function nextRetryDelayMs(attempts, { baseMs = 60_000, maxMs = 30 * 60_000 } = {}) {
  const n = Math.max(1, Math.floor(Number(attempts) || 1));
  const delay = baseMs * 2 ** Math.min(n - 1, 10);
  return Math.min(delay, maxMs);
}

export function shouldRetry(attempts, maxAttempts = MAX_ATTEMPTS) {
  return Math.max(0, Math.floor(Number(attempts) || 0)) < maxAttempts;
}

export function hashToken(token) {
  return createHash('sha256').update(String(token)).digest('hex');
}

export function normalizeToken(token) {
  if (typeof token !== 'string') return '';
  const value = token.trim();
  if (value.length < 20 || value.length > 4096) return '';
  if (/\s/.test(value)) return '';
  return value;
}

export function chunk(items, size) {
  const out = [];
  const n = Math.max(1, Math.floor(Number(size) || 1));
  for (let i = 0; i < items.length; i += n) out.push(items.slice(i, i + n));
  return out;
}

const UNPUBLISHED_STATUSES = new Set([
  'draft',
  'cancelled',
  'canceled',
  'archived',
  'rejected',
  'pending',
  'completed',
]);

export function isEventPublished(event) {
  if (!event) return false;
  if (event.is_active === false) return false;
  if (event.is_cancelled === true) return false;
  const status = String(event.status || '').trim().toLowerCase();
  if (UNPUBLISHED_STATUSES.has(status)) return false;
  return true;
}

export function isEventCancelled(event) {
  if (!event) return false;
  if (event.is_cancelled === true) return true;
  const status = String(event.status || '').trim().toLowerCase();
  return status === 'cancelled' || status === 'canceled';
}
