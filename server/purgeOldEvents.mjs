import { getDb } from './db.mjs';

const CUTOFF_SQL = 'DATE_SUB(NOW(), INTERVAL 1 MONTH)';
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
    eventIds: ids,
    events: targets.map((t) => ({ id: String(t.id), title: t.title, ended_at: t.ended_at })),
    byChildTable: childCounts,
    missingTables,
  };
}