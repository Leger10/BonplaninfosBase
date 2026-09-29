// Brique 3a : la depense de pieces passe par spend_user_coins.
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
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label.padEnd(44)} attendu=${want} obtenu=${got}`);
};

const ids = [];
try {
  const stamp = Date.now();
  const a = await post('/auth/signup', { email: `tmp-spend-a-${stamp}@test.local`, password: PASSWORD });
  const b = await post('/auth/signup', { email: `tmp-spend-b-${stamp}@test.local`, password: PASSWORD });
  const idA = a.json?.data?.user?.id;
  const idB = b.json?.data?.user?.id;
  ids.push(idA, idB);
  await prisma.profiles.update({ where: { id: idA }, data: { coin_balance: 500, free_coin_balance: 0 } });
  await prisma.profiles.update({ where: { id: idB }, data: { coin_balance: 500, free_coin_balance: 0 } });
  const tokenA = (await post('/auth/signin', { email: `tmp-spend-a-${stamp}@test.local`, password: PASSWORD })).json?.data?.session?.access_token;
  const tokenB = (await post('/auth/signin', { email: `tmp-spend-b-${stamp}@test.local`, password: PASSWORD })).json?.data?.session?.access_token;
  const spend = (t, args) => post('/rpc', { name: 'spend_user_coins', args }, t);
  const bal = async (id) => (await prisma.profiles.findUnique({ where: { id }, select: { coin_balance: true } })).coin_balance;

  const anon = await spend(null, { p_user_id: idA, p_amount: 10, p_reason: 'x' });
  check('anonyme -> 401', anon.status, 401);
  const cross = await spend(tokenB, { p_user_id: idA, p_amount: 10, p_reason: 'vol' });
  check('depense sur le compte d autrui -> 403', cross.status, 403);
  const neg = await spend(tokenA, { p_user_id: idA, p_amount: -500, p_reason: 'recharge' });
  check('montant negatif (recharge) -> refuse', neg.json?.error?.code, 'INVALID_AMOUNT');
  check('  solde intact apres refus', await bal(idA), 500);
  const nori = await spend(tokenA, { p_user_id: idA, p_amount: 10, p_reason: '' });
  check('sans motif -> refuse', nori.json?.error?.code, 'REASON_REQUIRED');
  const poor = await spend(tokenA, { p_user_id: idA, p_amount: 900, p_reason: 'trop' });
  check('solde insuffisant -> refuse', poor.json?.error?.code, 'INSUFFICIENT_FUNDS');

  const good = await spend(tokenA, { p_user_id: idA, p_amount: 120, p_reason: 'Boost test', p_reference_type: 'event', p_reference_id: 'evt-1' });
  check('depense valide -> succes', good.json?.data?.success, true);
  check('  solde 500 -> 380', await bal(idA), 380);
  const tx = await prisma.transactions.findFirst({ where: { user_id: idA, transaction_type: 'spend_event' } });
  check('  ecriture du journal', `${tx?.amount_pi} / ${tx?.transaction_reference}`, '-120 / evt-1');

  // double depense concurrente : 380 disponibles, deux debits de 300 simultanes
  await prisma.profiles.update({ where: { id: idA }, data: { coin_balance: 380 } });
  const [r1, r2] = await Promise.all([
    spend(tokenA, { p_user_id: idA, p_amount: 300, p_reason: 'c1' }),
    spend(tokenA, { p_user_id: idA, p_amount: 300, p_reason: 'c2' }),
  ]);
  const okCount = [r1, r2].filter((r) => r.json?.data?.success).length;
  check('double depense concurrente : 1 seul succes', okCount, 1);
  check('  solde final 380 - 300', await bal(idA), 80);

  console.log(fails === 0 ? '\nTOUT EST VERT' : `\n${fails} ECHEC(S)`);
} catch (e) {
  console.log('ERREUR:', String(e?.message || e).trim().slice(0, 200));
} finally {
  for (const id of ids.filter(Boolean)) {
    await prisma.transactions.deleteMany({ where: { user_id: id } });
    await prisma.notifications.deleteMany({ where: { user_id: id } });
    await prisma.admin_logs.deleteMany({ where: { actor_id: id } });
    await prisma.profiles.deleteMany({ where: { id } });
    await prisma.auth_users.deleteMany({ where: { id } });
  }
  console.log(`nettoyage: comptes tmp restants = ${await prisma.profiles.count({ where: { email: { startsWith: 'tmp-' } } })}`);
  await prisma.$disconnect();
  process.exit(fails === 0 ? 0 : 1);
}
