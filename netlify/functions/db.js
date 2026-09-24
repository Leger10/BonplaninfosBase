// Netlify function : exposer la base MySQL (MariaDB) via Prisma.
// GET /.netlify/functions/db/events?status=active&limit=3&order=created_at:desc&id=<uuid>
// GET /.netlify/functions/db/categories
// GET /.netlify/functions/db/promo-events
// GET /.netlify/functions/db/profiles?limit=3&id=<uuid>
// GET /.netlify/functions/db/health
import { PrismaClient } from '@prisma/client';

let prisma;
function getPrisma() {
  if (!prisma) prisma = new PrismaClient();
  return prisma;
}

const json = (statusCode, body) => ({
  statusCode,
  headers: {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  },
  body: JSON.stringify(body),
});

async function eventsRoute(db, q) {
  const where = {};
  if (q.status) where.status = q.status;
  if (q.status_in) where.status = { in: q.status_in.split(',').map((s) => s.trim()) };
  if (q.id) where.id = q.id;
  if (q.organizer_id) where.organizer_id = q.organizer_id;
  if (q.country) where.country = q.country;
  if (q.promoted === 'true') where.is_promoted = true;
  if (q.promoted_live === 'true') {
    where.OR = [
      { promoted_until: { gt: new Date() } },
      { promotion_end: { gt: new Date() } },
    ];
  }

  const [field, dir] = (q.order || 'created_at:desc').split(':');
  const orderBy = { [field === 'created_at' ? 'created_at' : 'event_start_at']: dir === 'asc' ? 'asc' : 'desc' };
  const take = q.limit ? Math.min(q.limit, 1000) : undefined;

  const [events, profiles, categories] = await Promise.all([
    db.events.findMany({ where, orderBy, ...(take ? { take } : {}) }),
    db.profiles.findMany({ select: { id: true, full_name: true } }),
    db.event_categories.findMany({ select: { id: true, name: true, slug: true } }),
  ]);

  const profileMap = new Map(profiles.map((p) => [p.id, p]));
  const categoryMap = new Map(categories.map((c) => [c.id, c]));

  const rows = events.map((event) => ({
    ...event,
    category: event.category_id ? categoryMap.get(event.category_id) || null : null,
    organizer: event.organizer_id ? profileMap.get(event.organizer_id) || null : null,
  }));

  return json(200, { model: 'events', count: rows.length, returned: rows.length, rows });
}

async function handle(event) {
  const { path = '', queryStringParameters = {} } = event;
  const segments = path.split('/').filter(Boolean);
  const route = segments[1];
  const limit = Math.min(parseInt(queryStringParameters.limit, 10) || 10, 100);

  const db = getPrisma();

  switch (route) {
    case 'health':
      return json(200, { ok: true, models: ['events', 'categories', 'promo-events', 'promotions', 'protected-events', 'profiles', 'candidates'] });

    case 'events':
      return eventsRoute(db, { ...queryStringParameters, limit });

    case 'candidates': {
      if (!queryStringParameters.event_id) {
        return json(400, { error: 'Paramètre event_id requis.' });
      }
      const where = { event_id: queryStringParameters.event_id };
      if (queryStringParameters.category) where.category = queryStringParameters.category;
      const [count, rows] = await Promise.all([
        db.candidates.count({ where }),
        db.candidates.findMany({ where, orderBy: { vote_count: 'desc' } }),
      ]);
      return json(200, { model: 'candidates', count, returned: rows.length, rows });
    }

    case 'categories': {
      const rows = await db.event_categories.findMany({
        where: { is_active: true },
        orderBy: { name: 'asc' },
      });
      return json(200, { model: 'categories', count: rows.length, returned: rows.length, rows });
    }

    case 'promo-events': {
      const rows = await db.event_promo_config.findMany({
        where: { enabled: true },
        select: { event_id: true },
      });
      return json(200, { model: 'promo-events', count: rows.length, returned: rows.length, rows: rows.map((r) => r.event_id) });
    }

    case 'promotions': {
      const [promos, profiles] = await Promise.all([
        db.event_promotions.findMany({ orderBy: { created_at: 'desc' } }),
        db.profiles.findMany({ select: { id: true, full_name: true, email: true } }),
      ]);
      const profileMap = new Map(profiles.map((p) => [p.id, p]));
      const rows = promos.map((p) => ({
        ...p,
        organizer: p.organizer_id ? profileMap.get(p.organizer_id) || null : null,
      }));
      return json(200, { model: 'promotions', count: rows.length, returned: rows.length, rows });
    }

    case 'profiles': {
      const where = queryStringParameters.id ? { id: queryStringParameters.id } : {};
      const [count, rows] = await Promise.all([
        db.profiles.count({ where }),
        db.profiles.findMany({
          where,
          select: { id: true, email: true, full_name: true, user_type: true, created_at: true },
          orderBy: { created_at: 'desc' },
          take: limit,
        }),
      ]);
      return json(200, { model: 'profiles', count, returned: rows.length, rows });
    }

    case 'protected-events': {
      if (!queryStringParameters.user_id) {
        return json(400, { error: 'Paramètre user_id requis.' });
      }
      const rows = await db.protected_event_access.findMany({
        where: { user_id: queryStringParameters.user_id, status: 'active' },
        select: { event_id: true },
      });
      return json(200, {
        model: 'protected-events',
        count: rows.length,
        returned: rows.length,
        rows: rows.map((r) => r.event_id).filter(Boolean),
      });
    }

    default:
      return json(404, { error: `Route inconnue : ${route ?? '(vide)'}. Utilisez events, categories, promo-events, profiles ou health.` });
  }
}

export async function handler(event, context) {
  try {
    return await handle(event);
  } catch (err) {
    console.error('[db] handler error:', err);
    return json(500, { error: `${err?.name}: ${err?.message?.split('\n')[0]}`.trim() });
  } finally {
    await getPrisma().$disconnect();
  }
}