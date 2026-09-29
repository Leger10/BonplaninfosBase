import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const BASE = process.env.API_BASE || 'http://127.0.0.1:8888';
const prisma = new PrismaClient();
let pass = 0;
let fail = 0;

const say = (ok, label, extra = '') => {
  if (ok) { pass++; console.log(`OK    ${label}`); }
  else { fail++; console.log(`FAIL  ${label}${extra ? `   ${extra}` : ''}`); }
};

const check = (label, want, got) => say(want === got, `${label}`, `attendu=${want} obtenu=${JSON.stringify(got)}`);

async function req(path, body, token, internalKey) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  if (internalKey) headers['X-Internal-Key'] = internalKey;
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers,
    body: JSON.stringify(body),
  });
  let json = null;
  try { json = await res.json(); } catch { /* ignore */ }
  return { status: res.status, json };
}

const PASSWORD = 'Password!1234';
const INTERNAL = process.env.INTERNAL_RPC_KEY || 'test-internal-key';

const ids = [];
try {
  const stamp = Date.now();
  const mk = async (tag, role) => {
    const email = `tmp-read-${tag}-${stamp}@test.local`;
    const signup = await req('/api/auth/signup', { email, password: PASSWORD });
    const id = signup.json?.data?.user?.id;
    if (id) {
      ids.push(id);
      await prisma.profiles.update({ where: { id }, data: { user_type: role } });
    }
    const signin = await req('/api/auth/signin', { email, password: PASSWORD });
    return { id, token: signin.json?.data?.session?.access_token, signupStatus: signup.status, signinStatus: signin.status };
  };

  const alice = await mk('alice', 'creator');
  const bob = await mk('bob', 'creator');
  const admin = await mk('admin', 'admin');
  if (!alice.token || !bob.token || !admin.token) throw new Error('creation de comptes impossible');

  // --- Lecteur anonyme ---
  check('public : events lisible anonyme', (await req('/api/query', { table: 'events', method: 'select' })).status, 200);
  check('anonyme -> RIB refuse 403', (await req('/api/query', { table: 'admin_payment_info', method: 'select' })).status, 403);
  check('anonyme -> admin_logs refuse 403', (await req('/api/query', { table: 'admin_logs', method: 'select' })).status, 403);
  check('anonyme -> organizer_earnings 401', (await req('/api/query', { table: 'organizer_earnings', method: 'select' })).status, 401);

  // --- Utilisateur simple ---
  const rAearn = await req('/api/query', { table: 'organizer_earnings', method: 'select', select: '*' }, alice.token);
  check('alice lit organizer_earnings -> [scope, vide]', rAearn.status, 200);
  check('  data = tableau vide', (rAearn.json?.data || []).length, 0);
  check('alice -> admin_logs refuse 403', (await req('/api/query', { table: 'admin_logs', method: 'select' }, alice.token)).status, 403);
  check('alice -> admin_payment_info refuse 403', (await req('/api/query', { table: 'admin_payment_info', method: 'select' }, alice.token)).status, 403);
  check('alice lit payments -> [scope, vide]', (await req('/api/query', { table: 'payments', method: 'select' }, alice.token)).status, 200);

  // --- L'utilisateur ne voit que ses lignes ---
  const sharedWallet = `w_${Date.now()}`;
  await prisma.organizer_earnings.createMany({
    data: [
      { id: `${sharedWallet}_a`, organizer_id: alice.id, event_id: `ev_${stamp}_a`, transaction_id: `${sharedWallet}_a_tx`, amount_pi: 5, earnings_coins: 50, earnings_fcfa: 100, platform_commission: 1, status: 'pending', transaction_type: 'test_read', created_at: new Date(), updated_at: new Date() },
      { id: `${sharedWallet}_b`, organizer_id: bob.id, event_id: `ev_${stamp}_b`, transaction_id: `${sharedWallet}_b_tx`, amount_pi: 7, earnings_coins: 50, earnings_fcfa: 100, platform_commission: 1, status: 'pending', transaction_type: 'test_read', created_at: new Date(), updated_at: new Date() },
    ],
  });
  ids.push(`${sharedWallet}_a`, `${sharedWallet}_b`);

  const rWhatAliceSees = await req('/api/query', { table: 'organizer_earnings', method: 'select', select: '*', filters: [] }, alice.token);
  const aliceRows = rWhatAliceSees.json?.data || [];
  check('alice ne voit que SA ligne (pas celle de bob)', aliceRows.length, 1);
  if (aliceRows.length === 1) check('  ligne = a elle', aliceRows[0].organizer_id, alice.id);

  const rWhatBobSees = await req('/api/query', { table: 'organizer_earnings', method: 'select', select: '*' }, bob.token);
  const bobRows = rWhatBobSees.json?.data || [];
  check('bob ne voit que SA ligne', bobRows.length, 1);
  if (bobRows.length === 1) check('  ligne = a lui', bobRows[0].organizer_id, bob.id);

  // --- Administrateur : tout est lisible ---
  check('admin lit admin_logs', (await req('/api/query', { table: 'admin_logs', method: 'select' }, admin.token)).status, 200);
  check('admin lit admin_payment_info (RIB)', (await req('/api/query', { table: 'admin_payment_info', method: 'select' }, admin.token)).status, 200);
  const rAdmAearn = await req('/api/query', { table: 'organizer_earnings', method: 'select', select: 'id' }, admin.token);
  const admIds = (rAdmAearn.json?.data || []).map((r) => r.id);
  say(rAdmAearn.status === 200 && admIds.includes(`${sharedWallet}_a`) && admIds.includes(`${sharedWallet}_b`), 'admin voit les 2 lignes earnings', `nbLignes=${admIds.length}`);

  // --- Clé interne : contournement assumé ---
  check('cle interne -> RIB lisible', (await req('/api/query', { table: 'admin_payment_info', method: 'select' }, null, INTERNAL)).status, 200);
} catch (e) {
  console.log('ERREUR:', String(e?.message || e).trim().slice(0, 300));
  fail += 1;
} finally {
  for (const id of ids.filter(Boolean)) {
    const str = String(id);
    if (str.startsWith('w_')) {
      await prisma.organizer_earnings.deleteMany({ where: { id: str } });
    } else {
      await prisma.transactions.deleteMany({ where: { user_id: id } });
      await prisma.payments.deleteMany({ where: { user_id: id } });
      await prisma.notifications.deleteMany({ where: { user_id: id } });
      await prisma.profiles.deleteMany({ where: { id } });
      await prisma.auth_users.deleteMany({ where: { id } });
    }
  }
  console.log(`nettoyage: comptes tmp restants = ${await prisma.profiles.count({ where: { email: { startsWith: 'tmp-read-' } } })}`);
  await prisma.$disconnect();
}

console.log(`\n${pass} assertions passent, ${fail} echouent`);
process.exit(fail ? 1 : 0);