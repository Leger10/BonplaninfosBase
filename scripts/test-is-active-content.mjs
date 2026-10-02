// Regression : is_active sur les tables de contenu.
//
// Le commit de securite ed85b1a8 a place 'is_active' dans PROTECTED_COLUMNS
// pour interdire a un utilisateur de reactiver son propre compte. La colonne
// y etait donc refusee sur TOUTE table, y compris celles dont l'appelant est
// proprietaire : les quatre pages Create* envoient `is_active: true` et la
// creation d'un evenement de vote payant repondait
// 403 « Colonne protegee : is_active ».
//
// Ce test verifie les deux moities de la regle introduite dans queryPolicy.mjs
// (PROTECTED_ON_TABLES) : is_active libre sur le contenu que l'appelant
// possede, toujours bloque sur profiles.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const API = 'http://127.0.0.1:8888/api';
const PASSWORD = 'Tmp!23456789';

async function post(path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = {}; }
  return { status: res.status, json };
}

let fails = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fails += 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label.padEnd(58)} attendu=${want} obtenu=${got}`);
};
const q = (body, token) => post('/query', body, token);

const iso = (ms) => new Date(Date.now() + ms).toISOString();
const ids = [];
let stamp = 0;
let eventIds = [];

try {
  stamp = Date.now();
  const email = `tmp-isactive-${stamp}@test.local`;
  const su = await post('/auth/signup', { email, password: PASSWORD });
  const uid = su.json?.data?.user?.id;
  if (!uid) throw new Error(`inscription -> HTTP ${su.status} ${JSON.stringify(su.json).slice(0, 200)}`);
  ids.push(uid);
  const token = (await post('/auth/signin', { email, password: PASSWORD })).json?.data?.session?.access_token;

  // Le corps exact de CreateVotingEventPage.jsx / CreateTicketingEventPage.jsx /
  // CreateStandEventPage.jsx / CreateSimpleEventPage.jsx : is_active: true.
  const base = (type) => ({
    title: `TMP q ${type} ${stamp}`,
    city: 'CI',
    country: "Côte d'Ivoire",
    event_start_at: iso(86400000),
    event_end_at: iso(172800000),
    description: 'regression is_active',
    organizer_id: uid,
    event_type: type,
    status: 'active',
    location: 'CI',
    tags: [],
    is_active: true,
    is_online: true,
    is_public: true,
    is_promoted: false,
    views_count: 0,
    interactions_count: 0,
    participants_count: 0,
    promotion_views_count: 0,
    requires_approval: false,
    max_attendees: 0,
    max_participants: 0,
    allows_reentry: false,
    is_sales_closed: false,
    contract_accepted_at: new Date().toISOString(),
    contract_version: 'v1.0',
  });

  // ---------- les quatre creations d'evenements ----------
  const created = {};
  for (const [type, extra] of [
    ['voting', { price_fcfa: 1000, price_pi: 100, voting_enabled: true, max_votes_per_user: 0, allow_multiple_votes: true }],
    ['ticketing', { price_fcfa: 5000, price_pi: 500 }],
    ['stand', { price_fcfa: 2000, price_pi: 200 }],
    ['simple', {}],
  ]) {
    const r = await q({ table: 'events', method: 'insert', body: { ...base(type), ...extra } }, token);
    check(`creation ${type} avec is_active: true -> 200`, r.status, 200);
    const id = r.json?.data?.[0]?.id;
    if (id) {
      eventIds.push(id);
      created[type] = id;
      const row = await prisma.events.findUnique({ where: { id }, select: { is_active: true } });
      check(`  ${type}.is_active enregistre`, row?.is_active, true);
    }
  }

  // ---------- is_active sur une table de contenu liee a l'evenement ----------
  if (created.ticketing) {
    const tt = await q({ table: 'ticket_types', method: 'insert', body: {
      event_id: created.ticketing, name: 'Standard', price: 1000, price_pi: 100,
      price_coins: 100, quantity_available: 10, quantity_sold: 0,
      sales_start: new Date().toISOString(), sales_end: iso(172800000),
      is_active: true, color: 'blue',
    } }, token);
    check('creation ticket_type avec is_active: true -> 200', tt.status, 200);
  }
  if (created.stand) {
    const st = await q({ table: 'stand_types', method: 'insert', body: {
      event_id: created.stand, name: 'Stand A', base_price: 2000,
      calculated_price_pi: 200, quantity_available: 5, is_active: true,
    } }, token);
    check('creation stand_type avec is_active: true -> 200', st.status, 200);
  }

  // ---------- le code promo de l'influenceur (meme exception) ----------
  const pc = await q({ table: 'promo_codes', method: 'insert', body: {
    influencer_id: uid, code: `TMPISACT${stamp}`.slice(0, 20), is_active: true,
  } }, token);
  check('creation promo_code avec is_active: true -> 200', pc.status, 200);
  if (pc.status === 200) {
    const pid = pc.json?.data?.[0]?.id;
    if (pid) {
      const off = await q({ table: 'promo_codes', method: 'update', filters: [{ column: 'id', op: 'eq', value: pid }], body: { is_active: false } }, token);
      check('  desactivation de SON code promo -> 200', off.status, 200);
    }
  }

  // ---------- l'autre moitié : is_active reste bloqué sur profiles ----------
  const reac = await q({ table: 'profiles', method: 'update', filters: [{ column: 'id', op: 'eq', value: uid }], body: { is_active: true } }, token);
  check('auto-reactivation de son compte -> 403', reac.status, 403);
  const other = await q({ table: 'profiles', method: 'update', filters: [{ column: 'id', op: 'eq', value: '00000000-0000-0000-0000-000000000000' }], body: { is_active: false } }, token);
  check('desactivation du compte d autrui -> refuse', other.status, 403);

  // ---------- un evenement d autrui reste hors d'atteinte ----------
  const desact = await q({ table: 'events', method: 'update', filters: [{ column: 'id', op: 'eq', value: '00000000-0000-0000-0000-000000000000' }], body: { is_active: false } }, token);
  check('is_active sur l evenement d autrui -> sans effet', desact.status, 200); // filtre injecte -> 0 ligne

  console.log(fails === 0 ? '\nTOUT EST VERT' : `\n${fails} ECHEC(S)`);
} catch (e) {
  console.log('ERREUR:', String(e?.message || e).trim().slice(0, 240));
  fails += 1;
} finally {
  await prisma.ticket_types.deleteMany({ where: { event_id: { in: eventIds } } });
  await prisma.stand_types.deleteMany({ where: { event_id: { in: eventIds } } });
  await prisma.events.deleteMany({ where: { id: { in: eventIds } } });
  for (const id of ids) {
    await prisma.promo_codes.deleteMany({ where: { influencer_id: id } });
    await prisma.profiles.deleteMany({ where: { id } });
    await prisma.auth_users.deleteMany({ where: { id } });
  }
  await prisma.auth_users.deleteMany({ where: { email: { startsWith: 'tmp-isactive-' } } });
  await prisma.profiles.deleteMany({ where: { email: { startsWith: 'tmp-isactive-' } } });
  const leftProfiles = await prisma.profiles.count({ where: { email: { startsWith: 'tmp-isactive-' } } });
  const leftEvents = await prisma.events.count({ where: { title: { startsWith: 'TMP q' } } });
  console.log(`nettoyage: comptes tmp restants = ${leftProfiles} | evenements TMP q restants = ${leftEvents}`);
  await prisma.$disconnect();
  process.exit(fails === 0 ? 0 : 1);
}