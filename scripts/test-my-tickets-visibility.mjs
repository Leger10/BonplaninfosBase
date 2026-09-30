// Vérifie que la requête EXACTE de la page « Mes billets » (/api/query sur
// event_tickets, filtrée par user_id et triée par purchased_at) renvoie bien
// les billets d'un client ayant payé en pièces, via le chemin HTTP réel.
//
// Contexte : les billets étaient bien créés en base, mais invisibles dans
// l'onglet « Mes billets ». Deux causes possibles : la requête du composant
// (moteur local) qui échouerait, ou le composant qui n'interrogeait pas la
// base. Ce test verrouille la première.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.API_BASE || `http://127.0.0.1:${process.env.PROMO_TEST_PORT || 8888}`;
const PASSWORD = 'Password!1234';
const INTERNAL = process.env.INTERNAL_RPC_KEY || 'test-internal-key';
const prisma = new PrismaClient();

let pass = 0;
let fail = 0;
const say = (ok, label, extra = '') => {
  if (ok) { pass++; console.log(`OK    ${label}`); }
  else { fail++; console.log(`FAIL  ${label}${extra ? `   ${extra}` : ''}`); }
};
const check = (label, want, got) =>
  say(JSON.stringify(want) === JSON.stringify(got), label, `attendu=${JSON.stringify(want)} obtenu=${JSON.stringify(got)}`);

async function req(path, body, token, internalKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (internalKey) headers['X-Internal-Key'] = internalKey;
  const res = await fetch(`${BASE}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json };
}

const stamp = Date.now();
const created = { users: [], events: [], ticketTypes: [], configs: [], promos: [], orders: [] };

try {
  const email = `tmp-mytickets-${stamp}@test.local`;
  const signup = await req('/api/auth/signup', { email, password: PASSWORD });
  const uid = signup.json?.data?.user?.id;
  if (!uid) throw new Error('inscription impossible: ' + JSON.stringify(signup.json).slice(0, 200));
  created.users.push(uid);
  const signin = await req('/api/auth/signin', { email, password: PASSWORD });
  const token = signin.json?.data?.session?.access_token;
  if (!token) throw new Error('connexion impossible');

  const eventId = `ev_my_tk_${stamp}`;
  const ttId = `tt_my_tk_${stamp}`;
  await prisma.events.create({
    data: {
      id: eventId, title: 'TMP Mes billets', organizer_id: uid,
      event_start_at: new Date(Date.now() + 86400000), status: 'published',
      is_sales_closed: false, city: 'Ouagadougou', country: 'Burkina Faso',
      event_type: 'ticketing', is_active: true,
    },
  });
  created.events.push(eventId);
  await prisma.ticket_types.create({
    data: { id: ttId, event_id: eventId, name: 'Standard', price: 1000, price_pi: 100, price_coins: 100, quantity_available: 50, quantity_sold: 0, is_active: true },
  });
  created.ticketTypes.push(ttId);

  await prisma.profiles.update({ where: { id: uid }, data: { coin_balance: 500 } });

  const buy = await req('/api/rpc', { name: 'purchase_tickets_v2', args: {
    p_user_id: uid, p_event_id: eventId, p_cart: { [ttId]: 1 },
    p_final_amount: 100, p_promo_code_id: null, p_commission_amount: 0,
    p_payment_method: 'coins', p_transaction_reference: null,
    p_attendee_name: 'TMP Acheteur Mes Billets',
  } }, token);
  const order = buy.json?.data?.transaction_reference;
  say(buy.status === 200 && !!order, 'achat pièces réussi', `status=${buy.status}`);
  if (order) created.orders.push(order);

  // >>> LA REQUÊTE DU COMPOSANT, TELLE QU'ELLE EST ÉCRITE <<<
  const pageQuery = await req('/api/query', {
    table: 'event_tickets',
    method: 'select',
    select: '*',
    filters: [{ column: 'user_id', op: 'eq', value: uid }],
    order: [{ column: 'purchased_at', direction: 'desc' }],
  }, token);

  check('requête de la page « Mes billets » -> 200', 200, pageQuery.status);
  const rows = pageQuery.json?.data;
  say(Array.isArray(rows), 'la réponse est un tableau', JSON.stringify(rows).slice(0, 120));
  check('  1 billet renvoyé', 1, (rows || []).length);
  say(rows?.[0]?.transaction_reference === order, '  même référence de commande', `obtenu=${rows?.[0]?.transaction_reference}`);
  say(rows?.[0]?.status === 'active', '  statut active', `obtenu=${rows?.[0]?.status}`);
  say(!!rows?.[0]?.purchased_at, '  purchased_at renseigné (tri possible)');
  say(!!rows?.[0]?.event_title, '  event_title présent (carte rendue)');
  say(!!rows?.[0]?.ticket_number, '  ticket_number présent (QR)');
  say(!!rows?.[0]?.qr_code, '  qr_code présent');

  // Un autre utilisateur ne doit rien voir.
  const other = await req('/api/auth/signup', { email: `tmp-mytickets-other-${stamp}@test.local`, password: PASSWORD });
  const oid = other.json?.data?.user?.id;
  if (oid) created.users.push(oid);
  const otherIn = await req('/api/auth/signin', { email: `tmp-mytickets-other-${stamp}@test.local`, password: PASSWORD });
  const otherQuery = await req('/api/query', {
    table: 'event_tickets', method: 'select', select: '*',
    filters: [{ column: 'user_id', op: 'eq', value: oid }],
    order: [{ column: 'purchased_at', direction: 'desc' }],
  }, otherIn.json?.data?.session?.access_token);
  check('un autre compte ne voit pas ces billets', 0, (otherQuery.json?.data || []).length);
} catch (e) {
  fail++;
  console.log('ERREUR:', String(e?.message || e).slice(0, 400));
} finally {
  for (const o of created.orders) {
    await prisma.event_tickets.deleteMany({ where: { transaction_reference: o } });
    await prisma.tickets.deleteMany({ where: { transaction_reference: o } });
    await prisma.organizer_earnings.deleteMany({ where: { transaction_id: o } });
    await prisma.transactions.deleteMany({ where: { transaction_reference: o } });
  }
  for (const c of created.configs) await prisma.event_promo_config.deleteMany({ where: { id: c } });
  for (const p of created.promos) {
    await prisma.promo_code_usages.deleteMany({ where: { promo_code_id: p } });
    await prisma.promo_codes.deleteMany({ where: { id: p } });
  }
  for (const t of created.ticketTypes) await prisma.ticket_types.deleteMany({ where: { id: t } });
  for (const e of created.events) await prisma.events.deleteMany({ where: { id: e } });
  for (const u of created.users) {
    await prisma.organizer_earnings.deleteMany({ where: { organizer_id: u } });
    await prisma.transactions.deleteMany({ where: { user_id: u } });
    await prisma.payments.deleteMany({ where: { user_id: u } });
    await prisma.profiles.deleteMany({ where: { id: u } });
    await prisma.auth_users.deleteMany({ where: { id: u } });
  }
  console.log(`\n${pass} assertions passent, ${fail} echouent`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}