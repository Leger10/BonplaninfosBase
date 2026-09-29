// conduct_raffle_draw : tirage atomique côté serveur + autorisation organisateur.
//  - tiers -> FORBIDDEN
//  - organisateur -> tirage complet (gagnants uniques par lot, statut, historique)
//  - double appel -> idempotent
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
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
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label.padEnd(46)} attendu=${want} obtenu=${got}`);
};

const ids = [];
const raffleId = uuidv4();
const eventId = uuidv4();
try {
  const stamp = Date.now();
  const org = await post('/auth/signup', { email: `tmp-raffle-org-${stamp}@test.local`, password: PASSWORD });
  const x = await post('/auth/signup', { email: `tmp-raffle-x-${stamp}@test.local`, password: PASSWORD });
  const orgId = org.json?.data?.user?.id;
  const xId = x.json?.data?.user?.id;
  ids.push(orgId, xId);

  await prisma.events.create({ data: { id: eventId, title: `TMP raffle ${stamp}`, organizer_id: orgId, status: 'published', city: 'CI', event_start_at: new Date(Date.now() + 86400000) } });
  const drawDate = new Date(Date.now() + 3600000);
  await prisma.raffle_events.create({
    data: {
      id: raffleId,
      event_id: eventId,
      organizer_id: orgId,
      base_price: 100,
      calculated_price_pi: 10,
      total_tickets: 100,
      tickets_sold: 4,
      max_tickets_per_user: 10,
      draw_date: drawDate,
      status: 'active',
      is_drawn: false,
      is_draw_conducted: false,
      is_postponed: false,
      auto_draw: true,
    },
  });
  const prize1 = await prisma.raffle_prizes.create({ data: { event_id: eventId, raffle_event_id: raffleId, rank: 1, description: 'TMP lot 1', value_fcfa: 100000 } });
  const prize2 = await prisma.raffle_prizes.create({ data: { event_id: eventId, raffle_event_id: raffleId, rank: 2, description: 'TMP lot 2', value_fcfa: 50000 } });

  const ticketIds = [];
  const makeTicket = async (userId, num) => {
    const t = await prisma.raffle_tickets.create({ data: { raffle_event_id: raffleId, user_id: userId, ticket_number: num, purchase_price_pi: 10 } });
    ticketIds.push(t.id);
    return t.id;
  };
  await makeTicket(orgId, 111111);
  await makeTicket(orgId, 222222);
  await makeTicket(xId, 333333);
  await makeTicket(xId, 444444);

  const tOrg = (await post('/auth/signin', { email: `tmp-raffle-org-${stamp}@test.local`, password: PASSWORD })).json?.data?.session?.access_token;
  const tX = (await post('/auth/signin', { email: `tmp-raffle-x-${stamp}@test.local`, password: PASSWORD })).json?.data?.session?.access_token;
  const rpc = (name, args, token) => post('/rpc', { name, args }, token);
  const code = (r) => r.json?.error?.code || String(r.status);

  check('draw : tiers -> FORBIDDEN', code(await rpc('conduct_raffle_draw', { p_raffle_event_id: raffleId }, tX)), 'FORBIDDEN');
  check('draw : sans raffle -> RAFFLE_ID_MISSING', code(await rpc('conduct_raffle_draw', {}, tOrg)), 'RAFFLE_ID_MISSING');
  check('draw : raffle inconnu -> RAFFLE_NOT_FOUND', code(await rpc('conduct_raffle_draw', { p_raffle_event_id: uuidv4() }, tOrg)), 'RAFFLE_NOT_FOUND');

  const drawn = await rpc('conduct_raffle_draw', { p_raffle_event_id: raffleId }, tOrg);
  check('draw : organisateur -> success', drawn.json?.data?.success, true);
  check('draw : 2 lots -> 2 gagnants', drawn.json?.data?.winners?.length, 2);
  check('draw : rangs 1,2', (drawn.json?.data?.winners || []).map((w) => w.rank).sort((a, b) => a - b).join(','), '1,2');
  const winnerIds = new Set((drawn.json?.data?.winners || []).map((w) => w.user_id));
  check('draw : gagnants distincts', winnerIds.size, 2);

  const raffle = await prisma.raffle_events.findUnique({ where: { id: raffleId } });
  check('db : is_draw_conducted', raffle?.is_draw_conducted, true);
  check('db : is_drawn', raffle?.is_drawn, true);
  check('db : winning_ticket_number pose', !!raffle?.winning_ticket_number, true);
  check('db : winner_user_id pose', !!raffle?.winner_user_id, true);

  const winners = await prisma.raffle_winners.findMany({ where: { raffle_event_id: raffleId } });
  check('db : 2 lignes raffle_winners', winners.length, 2);
  check('db : delivrance pending', winners.every((w) => w.delivery_status === 'pending'), true);
  const ticketRanks = await prisma.raffle_tickets.findMany({ where: { raffle_event_id: raffleId, rank: { not: null } } });
  check('db : 2 tickets classes', ticketRanks.length, 2);

  const status = await prisma.raffle_draw_status.findFirst({ where: { raffle_event_id: raffleId } });
  check('db : statut completed', status?.status, 'completed');
  check('db : statut inactif', status?.is_active, false);
  check('db : session liee', !!status?.draw_session_id, true);
  check('db : session existe', (await prisma.raffle_draw_sessions.count({ where: { id: status?.draw_session_id } })) > 0, true);
  check('db : historique', (await prisma.raffle_draw_history.count({ where: { raffle_event_id: raffleId } })), 1);

  const again = await rpc('conduct_raffle_draw', { p_raffle_event_id: raffleId }, tOrg);
  check('draw : double appel idempotent', again.json?.data?.already_drawn, true);
  check('    gagnants inchange', (await prisma.raffle_winners.count({ where: { raffle_event_id: raffleId } })), 2);

  const _keep = [prize1, prize2];
  console.log(fails === 0 ? '\nTOUT EST VERT' : `\n${fails} ECHEC(S)`);
} catch (e) {
  console.log('ERREUR:', String(e?.message || e).trim().slice(0, 600));
} finally {
  await prisma.raffle_draw_status.deleteMany({ where: { raffle_event_id: raffleId } });
  await prisma.raffle_draw_sessions.deleteMany({ where: { raffle_event_id: raffleId } });
  await prisma.raffle_draw_history.deleteMany({ where: { raffle_event_id: raffleId } });
  await prisma.raffle_winners.deleteMany({ where: { raffle_event_id: raffleId } });
  await prisma.raffle_tickets.deleteMany({ where: { raffle_event_id: raffleId } });
  await prisma.raffle_prizes.deleteMany({ where: { raffle_event_id: raffleId } });
  await prisma.raffle_events.deleteMany({ where: { id: raffleId } });
  await prisma.events.deleteMany({ where: { id: eventId } });
  for (const id of ids.filter(Boolean)) {
    await prisma.payments.deleteMany({ where: { user_id: id } });
    await prisma.transactions.deleteMany({ where: { user_id: id } });
    await prisma.notifications.deleteMany({ where: { user_id: id } });
    await prisma.profiles.deleteMany({ where: { id } });
    await prisma.auth_users.deleteMany({ where: { id } });
  }
  console.log(`residus tmp = ${await prisma.profiles.count({ where: { email: { startsWith: 'tmp-' } } })}`);
  await prisma.$disconnect();
  process.exit(fails === 0 ? 0 : 1);
}