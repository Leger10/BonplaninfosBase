// Brique securite 1 : votes payants atomiques (cast_contest_votes).
// Verifie : debit+sans-etat, double-clic (idempotence), concurrence (2 debits
// simultanes pour 1 solde), solde insuffisant sans ecriture, pieces gratuites
// consommees en premier, increment_vote_count ferre aux administrateurs.
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
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label.padEnd(48)} attendu=${want} obtenu=${got}`);
};

const ids = [];
const eventIds = [];
const candIds = [];
try {
  const stamp = Date.now();
  const org = await post('/auth/signup', { email: `tmp-vote-org-${stamp}@test.local`, password: PASSWORD });
  const voter = await post('/auth/signup', { email: `tmp-vote-u-${stamp}@test.local`, password: PASSWORD });
  const other = await post('/auth/signup', { email: `tmp-vote-o-${stamp}@test.local`, password: PASSWORD });
  const orgId = org.json?.data?.user?.id;
  const voterId = voter.json?.data?.user?.id;
  const otherId = other.json?.data?.user?.id;
  ids.push(orgId, voterId, otherId);

  // Organisateur : evenement payant + 2 candidats. Votant : solde piecer + pieces gratuites.
  const evA = await prisma.events.create({ data: { title: 'TMP votes atomic', organizer_id: orgId, status: 'published', city: 'CI', price_pi: 10, event_start_at: new Date(Date.now() + 86400000) } });
  eventIds.push(evA.id);
  const evB = await prisma.events.create({ data: { title: 'TMP votes b', organizer_id: otherId, status: 'published', city: 'CI', price_pi: 10, event_start_at: new Date(Date.now() + 86400000) } });
  eventIds.push(evB.id);
  const c1 = await prisma.candidates.create({ data: { id: uuidv4(), event_id: evA.id, name: 'Candidat A', created_at: new Date() } });
  const c2 = await prisma.candidates.create({ data: { id: uuidv4(), event_id: evA.id, name: 'Candidat B', created_at: new Date() } });
  const cB = await prisma.candidates.create({ data: { id: uuidv4(), event_id: evB.id, name: 'Autre event', created_at: new Date() } });
  candIds.push(c1.id, c2.id, cB.id);
  await prisma.profiles.update({ where: { id: voterId }, data: { coin_balance: 100, free_coin_balance: 10 } });
  await prisma.profiles.update({ where: { id: otherId }, data: { coin_balance: 1000, free_coin_balance: 0 } });

  const tokenV = (await post('/auth/signin', { email: `tmp-vote-u-${stamp}@test.local`, password: PASSWORD })).json?.data?.session?.access_token;
  const tokenO = (await post('/auth/signin', { email: `tmp-vote-o-${stamp}@test.local`, password: PASSWORD })).json?.data?.session?.access_token;
  const vote = (t, args) => post('/rpc', { name: 'cast_contest_votes', args }, t);
  const legacy = (t, args) => post('/rpc', { name: 'increment_vote_count', args }, t);
  const bal = async (id) => { const p = await prisma.profiles.findUnique({ where: { id }, select: { coin_balance: true, free_coin_balance: true } }); return `${p.coin_balance}/${p.free_coin_balance}`; };
  const vCount = async (id) => (await prisma.candidates.findUnique({ where: { id }, select: { vote_count: true } })).vote_count;
  const votesFor = async (id, cand) => { const r = await prisma.user_votes.findFirst({ where: { user_id: id, candidate_id: cand } }); return r?.vote_count || 0; };

  // --- anonyme & compte d'autrui ---
  check('vote anonyme -> 401', (await vote(null, { p_event_id: evA.id, p_votes: [{ candidate_id: c1.id, vote_count: 1 }] })).status, 401);
  check('voter pour le compte d autrui -> 403', (await vote(tokenO, { p_user_id: voterId, p_event_id: evA.id, p_votes: [{ candidate_id: c1.id, vote_count: 1 }] })).status, 403);

  // --- increment_vote_count ferme aux utilisateurs ---
  check('increment_vote_count utilisateur -> 403', (await legacy(tokenV, { candidate_id_to_inc: c1.id, inc_amount: 5 })).status, 403);
  check('  aucun vote ajoute', Number(await vCount(c1.id)), 0);

  // --- vote valide : gratuit puis pièces ---
  const r1 = await vote(tokenV, { p_event_id: evA.id, p_votes: [{ candidate_id: c1.id, vote_count: 3 }], p_idempotency_key: 'k1' });
  check('vote valide -> succes', r1.json?.success, true);
  check('  pieces debitees 100/10 -> 80/0 (3x10, gratuit d abord)', await bal(voterId), '80/0');
  check('  vote ecrit', await votesFor(voterId, c1.id), 3);
  check('  compteur candidat 0 -> 3', await vCount(c1.id), 3);

  // --- idempotence : rejouer la meme cle = aucun nouveau debit ---
  const r1b = await vote(tokenV, { p_event_id: evA.id, p_votes: [{ candidate_id: c1.id, vote_count: 3 }], p_idempotency_key: 'k1' });
  check('rejeu meme cle -> deja enregistre', r1b.json?.already_recorded, true);
  check('  solde intact apres rejeu', await bal(voterId), '80/0');
  check('  vote non double', await votesFor(voterId, c1.id), 3);

  // --- vote sur plusieurs candidats dans une meme transaction ---
  const r2 = await vote(tokenV, { p_event_id: evA.id, p_votes: [{ candidate_id: c1.id, vote_count: 1 }, { candidate_id: c2.id, vote_count: 1 }], p_idempotency_key: 'k2' });
  check('vote multi-candidats -> succes', r2.json?.success, true);
  check('  solde 80/0 -> 60/0', await bal(voterId), '60/0');
  check('  c1 = 4, c2 = 1', `${await votesFor(voterId, c1.id)}/${await votesFor(voterId, c2.id)}`, '4/1');

  // --- candidat d'un autre evenement : refus, aucun debit ---
  const rBad = await vote(tokenV, { p_event_id: evA.id, p_votes: [{ candidate_id: cB.id, vote_count: 1 }], p_idempotency_key: 'kbad' });
  check('candidat du mauvais evenement -> refuse', rBad.json?.error?.code, 'CANDIDATE_WRONG_EVENT');
  check('  solde intact', await bal(voterId), '60/0');

  // --- solde insuffisant : aucun debit, aucune ecriture ---
  const rPoor = await vote(tokenV, { p_event_id: evA.id, p_votes: [{ candidate_id: c1.id, vote_count: 8 }], p_idempotency_key: 'kpoor' });
  check('solde insuffisant -> refuse', rPoor.json?.error?.code, 'INSUFFICIENT_COINS');
  check('  solde intact', await bal(voterId), '60/0');
  check('  aucun vote ecrit', await votesFor(voterId, c1.id), 4);

  // --- vote payant sans id_personne : depe du compte du jeton ---
  const r3 = await vote(tokenV, { p_event_id: evA.id, p_votes: [{ candidate_id: c2.id, vote_count: 1 }], p_idempotency_key: 'k3' });
  check('vote sans p_user_id -> depe du compte du jeton', r3.json?.success, true);
  check('  solde 60/0 -> 50/0', await bal(voterId), '50/0');

  // --- concurrence : solde 60 piecer, deux votes simultanes de 50 ---
  await prisma.profiles.update({ where: { id: voterId }, data: { coin_balance: 60, free_coin_balance: 0 } });
  const [cc1, cc2] = await Promise.all([
    vote(tokenV, { p_event_id: evA.id, p_votes: [{ candidate_id: c1.id, vote_count: 5 }], p_idempotency_key: 'kc-a' }),
    vote(tokenV, { p_event_id: evA.id, p_votes: [{ candidate_id: c2.id, vote_count: 5 }], p_idempotency_key: 'kc-b' }),
  ]);
  const busuc = [cc1, cc2].filter((r) => r.json?.success).length;
  check('deux votes simultanes de 50 sur solde 60 -> 1 seul', busuc, 1);
  const bnow = await prisma.profiles.findUnique({ where: { id: voterId }, select: { coin_balance: true } });
  check('  solde final 60 - 50', bnow.coin_balance, 10);
  const totVotes = (await prisma.user_votes.aggregate({ where: { user_id: voterId }, _sum: { vote_count: true } }))._sum.vote_count;
  const expectedVotes = 3 + 2 + 1 + 5; // k1 + k2 + k3 + un seul des deux concurrents
  check('  total des votes = paye total (11)', Number(totVotes || 0), expectedVotes);

  // --- votes fermes (is_sales_closed) : refus avant debit ---
  await prisma.events.update({ where: { id: evA.id }, data: { is_sales_closed: true } });
  const rClosed = await vote(tokenV, { p_event_id: evA.id, p_votes: [{ candidate_id: c1.id, vote_count: 1 }], p_idempotency_key: 'kclosed' });
  check('votes fermes -> refuse', rClosed.json?.error?.code, 'VOTING_CLOSED');
  check('  solde intact', await bal(voterId), '10/0');

  console.log(fails === 0 ? '\nTOUT EST VERT' : `\n${fails} ECHEC(S)`);
} catch (e) {
  console.log('ERREUR:', String(e?.message || e).trim().slice(0, 500));
} finally {
  for (const id of candIds.filter(Boolean)) await prisma.candidates.deleteMany({ where: { id } });
  await prisma.organizer_earnings.deleteMany({ where: { organizer_id: ids[0] } });
  for (const id of eventIds.filter(Boolean)) await prisma.events.deleteMany({ where: { id } });
  for (const id of ids.filter(Boolean)) {
    await prisma.payments.deleteMany({ where: { user_id: id } });
    await prisma.user_votes.deleteMany({ where: { user_id: id } });
    await prisma.transactions.deleteMany({ where: { user_id: id } });
    await prisma.organizer_scan_agents.deleteMany({ where: { organizer_id: id } });
    await prisma.organizer_scan_agents.deleteMany({ where: { user_id: id } });
    await prisma.notifications.deleteMany({ where: { user_id: id } });
    await prisma.profiles.deleteMany({ where: { id } });
    await prisma.auth_users.deleteMany({ where: { id } });
  }
  console.log(`nettoyage: comptes tmp restants = ${await prisma.profiles.count({ where: { email: { startsWith: 'tmp-' } } })} | evenements = ${await prisma.events.count({ where: { title: { contains: 'TMP' } } })}`);
  await prisma.$disconnect();
  process.exit(fails === 0 ? 0 : 1);
}