// Regression : les credits manuels doivent etre COMPTABILISES dans
// l'onglet « Crédits Globaux ».
//
// Symptome : un super admin ou un secretaire credite un compte, la ligne
// apparait dans l'historique mais avec 0 piece et le total « Versements par
// l'equipe » reste a 0.
//
// Cause : `credit_user_coins` ecrit `admin_logs.details` avec JSON.stringify.
// La couche locale renvoie la colonne telle quelle (une chaine) sauf si elle
// est declaree dans JSON_TEXT_COLUMNS. Le client fait `details?.amount`, qui
// vaut undefined sur une chaine : le montant tombe a 0 via `|| 0`.
//
// Ce test reproduit le chemin exact du composant (meme select sur
// admin_logs) et verifie que `details` arrive bien comme objet.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const API = 'http://127.0.0.1:8888/api';
const PASSWORD = 'Tmp!23456789';
const stamp = Date.now();

let fails = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fails += 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label.padEnd(62)} attendu=${want} obtenu=${got}`);
};

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const t = await res.text();
  let j; try { j = JSON.parse(t); } catch { j = { raw: t.slice(0, 200) }; }
  return { status: res.status, json: j };
}
const q = (body, token) => post('/query', body, token);
const rpc = (name, args, token) => post('/rpc', { name, args }, token);

const ids = [];
let seq = 0;
const mk = async (role, country) => {
  const email = `tmp-credits-${role}-${stamp}-${++seq}@test.local`;
  const r = await post('/auth/signup', { email, password: PASSWORD });
  const id = r.json?.data?.user?.id;
  if (!id) throw new Error(`inscription ${role} -> HTTP ${r.status}`);
  ids.push(id);
  await prisma.profiles.update({ where: { id }, data: { user_type: role, coin_balance: 0, country: country || 'Côte d\'Ivoire' } });
  return { id, email, token: (await post('/auth/signin', { email, password: PASSWORD })).json?.data?.session?.access_token };
};

// Select identique a celui de AdminCreditsGlobalTab : toute divergence ici
// ferait diverger le test de l'onglet reel.
const readCredits = (token) => q({ table: 'admin_logs', method: 'select', select: `
  id,
  created_at,
  details,
  target_id,
  actor:actor_id (full_name, user_type),
  target_user:target_id (full_name, email, country, city)
`, filters: [{ column: 'action_type', op: 'eq', value: 'user_credited' }], orders: [{ column: 'created_at', dir: 'desc' }] }, token);

try {
  const SU = await mk('super_admin');
  const SEC = await mk('secretary');
  const U1 = await mk('user');
  const U2 = await mk('user', 'Sénégal');

  // ---------- 1. le super admin credite ----------
  const c1 = await rpc('credit_user_coins', { p_user_id: U1.id, p_amount: 120, p_reason: 'test global', p_creditor_id: SU.id }, SU.token);
  check('credit_user_coins (super admin) reussit', !c1.json?.error, true);
  check('  le solde du beneficiaire est credite', (await prisma.profiles.findUnique({ where: { id: U1.id } })).coin_balance, 120);

  // ---------- 2. le secretaire credite ----------
  const c2 = await rpc('credit_user_coins', { p_user_id: U2.id, p_amount: 55, p_reason: 'test global sec', p_creditor_id: SEC.id }, SEC.token);
  check('credit_user_coins (secretaire) reussit', !c2.json?.error, true);

  // ---------- 3. la lecture doitDeliver details en OBJET ----------
  const r = await readCredits(SU.token);
  check('lecture admin_logs sans erreur', r.json?.error, null);

  const mine = (r.json?.data || []).filter((l) => l.target_id === U1.id || l.target_id === U2.id);
  check('les 2 versements remontent', mine.length, 2);

  const su = mine.find((l) => l.target_id === U1.id);
  const sec = mine.find((l) => l.target_id === U2.id);

  check('  details est bien un objet', typeof su?.details, 'object');
  check('  details.amount vaut 120 (montant lisible)', su?.details?.amount, 120);
  check('  details.reason est conserve', su?.details?.reason, 'test global');
  check('  details n\'est PAS une chaine JSON', typeof su?.details === 'string', false);
  check('  montant secretaire lisible', sec?.details?.amount, 55);
  check('  beneficiaire resolu (target_user)', su?.target_user?.email, U1.email);
  check('  acteur resolu (actor.user_type)', su?.actor?.user_type, 'super_admin');
  check('  acteur secretaire resolu', sec?.actor?.user_type, 'secretary');
  check('  target_id alimente le decompte des servis', su?.target_id ? 1 : 0, 1);

  // ---------- 4. le total affiche par le composant ----------
  // Le composant fait exactement : Number(entry.details?.amount || 0).
  const sum = mine.reduce((s, l) => s + (Number(l.details?.amount) || 0), 0);
  check('total « versements equipe » calcule', sum, 175);

  // ---------- 5. un credit annule ne doit pas compter ----------
  const logId = su.id;
  await prisma.admin_logs.update({ where: { id: logId }, data: { details: JSON.stringify({ amount: 120, reason: 'test global', reversed: true }) } });
  const r2 = await readCredits(SU.token);
  const reversed = (r2.json?.data || []).find((l) => l.id === logId);
  check('  details.reversed est lisible apres update', reversed?.details?.reversed, true);
  const valid = (r2.json?.data || []).filter((l) => !l.details?.reversed);
  const sumValid = valid.filter((l) => l.target_id === U1.id || l.target_id === U2.id).reduce((s, l) => s + (Number(l.details?.amount) || 0), 0);
  check('total apres annulation du credit de 120', sumValid, 55);
} catch (e) {
  fails += 1;
  console.log('ECHEC exception: ' + (e.stack || e.message));
} finally {
  await prisma.admin_logs.deleteMany({ where: { actor_id: { in: ids } } });
  await prisma.transactions.deleteMany({ where: { user_id: { in: ids }, transaction_type: 'manual_credit' } });
  await prisma.profiles.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
}

console.log(fails ? `\n${fails} ECHEC(S)` : '\nTOUT EST VERT');
process.exit(fails ? 1 : 0);