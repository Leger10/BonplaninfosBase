import test from 'node:test';
import assert from 'node:assert/strict';
import {
  computeReminderPlan,
  parseEventInstant,
  eventStartKey,
  buildReminderDedupeKey,
  buildEventDedupeKey,
  buildPersonalDedupeKey,
  buildReminderMessage,
  buildEventMessage,
  formatEventTime,
  isSafeNotificationUrl,
  parseNotificationPrefs,
  shouldSendPush,
  firstNameFrom,
  renderBody,
  nextRetryDelayMs,
  shouldRetry,
  hashToken,
  normalizeToken,
  chunk,
  isEventPublished,
  isEventCancelled,
  DEFAULT_REMINDER_KINDS,
} from '../server/pushLogic.mjs';

const START = '2026-11-25 20:00:00';

test('planifie 24 h (J-1) et 6 h locale le jour J', () => {
  const now = Date.parse('2026-11-20T10:00:00Z');
  const plan = computeReminderPlan({ eventStartAt: START, now, timezoneOffsetMinutes: 0 });
  assert.equal(plan.length, 2);
  assert.deepEqual(plan.map((p) => p.kind), ['24h', 'jourJ']);
  assert.equal(plan[0].scheduledAt.toISOString(), '2026-11-24T20:00:00.000Z');
  assert.equal(plan[1].scheduledAt.toISOString(), '2026-11-25T06:00:00.000Z');
});

test('ignore les rappels deja passes', () => {
  const now = Date.parse('2026-11-25T03:00:00Z');
  const plan = computeReminderPlan({ eventStartAt: START, now, timezoneOffsetMinutes: 0 });
  assert.deepEqual(plan.map((p) => p.kind), ['jourJ']);
  assert.equal(plan[0].scheduledAt.toISOString(), '2026-11-25T06:00:00.000Z');
});

test('jour J avant 6 h : rappel remonte juste avant le debut', () => {
  const now = Date.parse('2026-11-20T10:00:00Z');
  const plan = computeReminderPlan({
    eventStartAt: '2026-11-25 05:00:00',
    now,
    timezoneOffsetMinutes: 0,
  });
  assert.deepEqual(plan.map((p) => p.kind), ['24h', 'jourJ']);
  assert.equal(plan[1].scheduledAt.toISOString(), '2026-11-25T04:00:00.000Z');
});

test('jour J suit l\'heure locale et pas UTC', () => {
  const now = Date.parse('2026-11-20T10:00:00Z');
  const plan = computeReminderPlan({ eventStartAt: START, now, timezoneOffsetMinutes: 60 });
  const jourJ = plan.find((p) => p.kind === 'jourJ');
  assert.equal(jourJ.scheduledAt.toISOString(), '2026-11-25T05:00:00.000Z');
});

test('ignore un evenement commence', () => {
  const now = Date.parse('2026-11-26T00:00:00Z');
  assert.deepEqual(computeReminderPlan({ eventStartAt: START, now }), []);
});

test('accepte Date, chaine MySQL et ISO de facon equivalente (UTC+0)', () => {
  const asDate = parseEventInstant(new Date('2026-11-25T20:00:00.000Z'), 0);
  const asSql = parseEventInstant('2026-11-25 20:00:00', 0);
  const asIso = parseEventInstant('2026-11-25T20:00:00Z', 0);
  assert.equal(asDate, asSql);
  assert.equal(asSql, asIso);
});

test('applique le decalage horaire (UTC+1)', () => {
  const instant = parseEventInstant('2026-11-25 20:00:00', 60);
  assert.equal(new Date(instant).toISOString(), '2026-11-25T19:00:00.000Z');
});

test('la cle de deduplication est stable entre formats', () => {
  const a = eventStartKey('2026-11-25 20:00:00', 0);
  const b = eventStartKey(new Date('2026-11-25T20:00:00.000Z'), 0);
  assert.equal(a, b);
  const k1 = buildReminderDedupeKey({ eventId: 'evt-1', kind: '24h', eventStartAt: START });
  const k2 = buildReminderDedupeKey({
    eventId: 'evt-1',
    kind: '24h',
    eventStartAt: new Date('2026-11-25T20:00:00.000Z'),
  });
  assert.equal(k1, k2);
  assert.match(k1, /^evt:evt-1:all:rem:24h:/);
});

test('les cles evenement et personnelle sont distinctes', () => {
  assert.equal(buildEventDedupeKey('published', 'e1'), 'event:published:e1');
  assert.equal(buildEventDedupeKey('rescheduled', 'e1', '2026'), 'event:rescheduled:e1:2026');
  assert.equal(buildPersonalDedupeKey('ticket_confirmed', 'e1', 'u1'), 'user:ticket_confirmed:e1:u1');
});

test('formate la date en francais', () => {
  const formatted = formatEventTime(START, 0);
  assert.match(formatted, /novembre/);
  assert.match(formatted, /20:00/);
});

test('messages de rappel personnalises', () => {
  const m24 = buildReminderMessage('24h', {
    eventTitle: 'Concert',
    city: 'Abidjan',
    eventStartAt: START,
  });
  assert.equal(m24.title, 'Rappel : Concert');
  assert.match(m24.body, /\{\{prenom\}\}/);
  assert.match(m24.body, /Abidjan/);
  assert.match(m24.body, /24 heures/);
  const m1 = buildReminderMessage('1h', { eventTitle: 'Concert', eventStartAt: START });
  assert.match(m1.title, /bientôt/);
  assert.match(m1.body, /1 heure/);
  const mJ = buildReminderMessage('jourJ', {
    eventTitle: 'Concert',
    city: 'Abidjan',
    eventStartAt: START,
  });
  assert.equal(mJ.title, "Aujourd'hui : Concert");
  assert.match(mJ.body, /commence aujourd'hui/);
  assert.match(mJ.body, /\{\{prenom\}\}/);
});

test('messages evenement', () => {
  const published = buildEventMessage('event_published', {
    eventTitle: 'Concert',
    city: 'Abidjan',
    eventStartAt: START,
  });
  assert.match(published.title, /Nouvel événement/);
  assert.match(published.body, /publié/);
  const cancelled = buildEventMessage('event_cancelled', { eventTitle: 'Concert' });
  assert.match(cancelled.title, /annulé/);
  const ticket = buildEventMessage('ticket_confirmed', { eventTitle: 'Concert' });
  assert.match(ticket.title, /Billet confirmé/);
});

test('renderBody remplace le placeholder', () => {
  assert.equal(renderBody('Bonjour {{prenom}} !', 'Awa'), 'Bonjour Awa !');
  assert.equal(renderBody('Bonjour {{ prenom }} !', ''), 'Bonjour cher membre !');
  assert.equal(renderBody('Sans placeholder', 'Awa'), 'Sans placeholder');
});

test('firstNameFrom extrait le premier prenom', () => {
  assert.equal(firstNameFrom('Awa Diop'), 'Awa');
  assert.equal(firstNameFrom('  '), '');
  assert.equal(firstNameFrom(null), '');
});

test('URL de notification : seules les voies internes sont sures', () => {
  assert.equal(isSafeNotificationUrl('/events/abc'), '/events/abc');
  assert.equal(isSafeNotificationUrl('  /notifications  '), '/notifications');
  assert.equal(isSafeNotificationUrl('https://evil.example'), '/');
  assert.equal(isSafeNotificationUrl('javascript:alert(1)'), '/');
  assert.equal(isSafeNotificationUrl('//evil.example/x'), '/');
  assert.equal(isSafeNotificationUrl('data:text/html,x'), '/');
  assert.equal(isSafeNotificationUrl('events'), '/');
  assert.equal(isSafeNotificationUrl(''), '/');
  assert.equal(isSafeNotificationUrl(null), '/');
  assert.equal(isSafeNotificationUrl('/x'.repeat(600)), '/');
});

test('lecture des preferences de notification', () => {
  const defaults = parseNotificationPrefs(null);
  assert.equal(defaults.push_notifications_enabled, true);
  const parsed = parseNotificationPrefs('{"push_notifications_enabled":false,"new_events_notification":false}');
  assert.equal(parsed.push_notifications_enabled, false);
  assert.equal(parsed.new_events_notification, false);
  assert.equal(parsed.promoted_events_notification, true);
  const invalid = parseNotificationPrefs('{not json');
  assert.equal(invalid.push_notifications_enabled, true);
  assert.equal(shouldSendPush(parsed), false);
  assert.equal(shouldSendPush(defaults), true);
});

test('politique de reessai avec backoff', () => {
  assert.equal(nextRetryDelayMs(1), 60_000);
  assert.equal(nextRetryDelayMs(2), 120_000);
  assert.equal(nextRetryDelayMs(3), 240_000);
  assert.equal(nextRetryDelayMs(99), 30 * 60_000);
  assert.equal(shouldRetry(0), true);
  assert.equal(shouldRetry(4), true);
  assert.equal(shouldRetry(5), false);
});

test('hash et normalisation du jeton', () => {
  assert.equal(hashToken('abc'), hashToken('abc'));
  assert.match(hashToken('abc'), /^[0-9a-f]{64}$/);
  assert.notEqual(hashToken('abc'), hashToken('abd'));
  assert.equal(normalizeToken('  a'.repeat(10)), '');
  assert.equal(normalizeToken('x'.repeat(30)), 'x'.repeat(30));
  assert.equal(normalizeToken('x'.repeat(10)), '');
  assert.equal(normalizeToken(null), '');
});

test('decoupage en lots', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
  assert.deepEqual(chunk([], 3), []);
});

test('etat de publication et annulation', () => {
  assert.equal(isEventPublished({ status: 'active', is_active: true }), true);
  assert.equal(isEventPublished({ status: 'published', is_active: true }), true);
  assert.equal(isEventPublished({ status: 'draft', is_active: true }), false);
  assert.equal(isEventPublished({ status: 'active', is_active: false }), false);
  assert.equal(isEventPublished({ status: 'active', is_cancelled: true }), false);
  assert.equal(isEventPublished(null), false);
  assert.equal(isEventCancelled({ is_cancelled: true }), true);
  assert.equal(isEventCancelled({ status: 'cancelled' }), true);
  assert.equal(isEventCancelled({ status: 'active' }), false);
});

test('les creneaux par defaut sont J-1 puis jour J a 6 h', () => {
  assert.deepEqual(DEFAULT_REMINDER_KINDS, [
    { kind: '24h', leadMs: 24 * 60 * 60 * 1000 },
    { kind: 'jourJ', atLocalHour: 6 },
  ]);
});

test('message de credit de pieces', () => {
  const credit = buildEventMessage('coins_credited', { amount: 500, reason: 'Code promo' });
  assert.equal(credit.title, 'Pièces créditées');
  assert.match(credit.body, /500 pièce/);
  assert.match(credit.body, /Code promo/);
  assert.match(credit.body, /\{\{prenom\}\}/);
  const singular = buildEventMessage('coins_credited', { amount: 1 });
  assert.match(singular.body, /1 pièce /);
  const zero = buildEventMessage('coins_credited', { amount: 0 });
  assert.match(zero.body, /0 pièce /);
});
