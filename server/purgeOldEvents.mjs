import { randomUUID } from 'node:crypto';
import { getDb } from './db.mjs';

const CUTOFF_SQL = 'DATE_SUB(NOW(), INTERVAL 1 MONTH)';
// Les organisateurs sont prévenus 3 semaines après la fin (soit ~1 semaine
// avant la purge effective à 1 mois) : la purge supprimait auparavant les
// événements sans jamais notifier personne.
const WARN_SQL = 'DATE_SUB(NOW(), INTERVAL 3 WEEK)';
const CHILD_TABLES = [
  'candidates',
  'candidate_performances',
  'comments',
  'event_bookmarks',
  'event_comments',
  'event_community_verifications',
  'event_disputes',
  'event_geocoding_results',
  'event_notifications',
  'event_participations',
  'event_reactions',
  'event_settings',
  'event_shares',
  'event_validation_status',
  'event_views',
  'live_rankings',
  'participant_votes',
  'promo_codes',
  'raffles',
  'stand_events',
  'trigger_debug_logs',
  'user_contract_acceptances',
  'verification_sessions',
  'votes',
  'voting_sessions',
];

const endedExpr = 'COALESCE(event_end_at, event_start_at, end_date, created_at)';

export async function purgeOldEvents({ dryRun = false } = {}) {
  const db = getDb();

  // 1. Avertir les organisateurs dont l'événement sera purgé sous peu.
  const warnedEvents = await warnUpcomingPurge(db, dryRun);

  const targets = await db.$queryRawUnsafe(
    `SELECT id, title, ${endedExpr} AS ended_at
     FROM events
     WHERE ${endedExpr} < ${CUTOFF_SQL}
     ORDER BY ended_at`,
  );

  const ids = targets.map((t) => String(t.id));
  const inPh = ids.map(() => '?').join(',');
  const childCounts = {};
  const missingTables = [];

  if (!dryRun && ids.length) {
    for (const t of CHILD_TABLES) {
      try {
        childCounts[t] = await db.$executeRawUnsafe(`DELETE FROM ${t} WHERE event_id IN (${inPh})`, ...ids);
      } catch (e) {
        missingTables.push(t);
      }
    }
    try {
      await db.$executeRawUnsafe(`DELETE FROM events WHERE id IN (${inPh})`, ...ids);
    } catch (e) {
      throw new Error(`Echec purge events: ${e?.message?.split('\n')[0]}`);
    }
  } else if (ids.length) {
    for (const t of CHILD_TABLES) {
      try {
        const r = await db.$queryRawUnsafe(
          `SELECT COUNT(*) AS n FROM ${t} WHERE event_id IN (${inPh})`,
          ...ids,
        );
        childCounts[t] = Number(r?.[0]?.n || 0);
      } catch (e) {
        missingTables.push(t);
      }
    }
  }

  return {
    dryRun,
    purgedEvents: dryRun ? 0 : ids.length,
    candidateCount: targets.length,
    warnedEvents,
    eventIds: ids,
    events: targets.map((t) => ({ id: String(t.id), title: t.title, ended_at: t.ended_at })),
    byChildTable: childCounts,
    missingTables,
  };
}

// Notifie une seule fois chaque organisateur dont l'événement est dans la
// fenêtre 3 semaines → 1 mois (bientôt purgé). La déduplication se fait via la
// ligne notifications déjà écrite (type 'event_purge_warning' + event_id), ce
// qui évite d'ajouter une colonne à la table events.
async function warnUpcomingPurge(db, dryRun) {
  let warned = 0;
  try {
    const upcoming = await db.$queryRawUnsafe(
      `SELECT id, title, organizer_id, ${endedExpr} AS ended_at
       FROM events
       WHERE organizer_id IS NOT NULL
         AND ${endedExpr} < ${WARN_SQL}
         AND ${endedExpr} >= ${CUTOFF_SQL}
       ORDER BY ended_at`,
    );
    for (const ev of upcoming) {
      const eventId = String(ev.id);
      const organizerId = String(ev.organizer_id);
      if (dryRun) {
        warned++;
        continue;
      }
      const already = await db.$queryRawUnsafe(
        "SELECT id FROM notifications WHERE user_id = ? AND type = 'event_purge_warning' AND data LIKE ? LIMIT 1",
        organizerId,
        `%"event_id":"${eventId}"%`,
      );
      if (already && already.length) continue;
      await db.$executeRawUnsafe(
        "INSERT INTO notifications (id, user_id, title, message, type, data, is_read, created_at) VALUES (?, ?, ?, ?, 'event_purge_warning', ?, 0, NOW())",
        randomUUID(),
        organizerId,
        'Votre evenement sera bientot archive',
        `Votre evenement « ${ev.title} » s'est termine il y a plus de 3 semaines. Il sera automatiquement archive puis supprime un mois apres sa fin. Sauvegardez vos informations si necessaire.`,
        JSON.stringify({ event_id: eventId, ended_at: ev.ended_at }),
      );
      warned++;
    }
  } catch (e) {
    console.warn('[purge] avertissement organisateurs ignore:', e?.message?.split('\n')[0]);
  }
  return warned;
}