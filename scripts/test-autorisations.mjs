// scripts/test-autorisations.mjs
// Test de non-regression des autorisations de l'API (briques 1 et 2).
//
// Prérequis : le serveur tourne sur http://127.0.0.1:8888 et la base est
// accessible. Le script crée deux comptes jetables (un « user », un « admin »
// promu directement en base, car la promotion par RPC est justement restreinte),
// vérifie la matrice des droits, puis supprime tout ce qu'il a créé.
//
//   node scripts/test-autorisations.mjs
//
// Ne lancez pas ce script sur une base de production.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API = process.env.API_BASE || 'http://127.0.0.1:8888/api';
const PASSWORD = 'Tmp!23456789';
const OTHER = '00000000-0000-0000-0000-000000000000'; // identifiant inexistant

let failures = 0;
const created = [];

async function post(path, body, token) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = {}; }
  return { status: res.status, json };
}
const signin = async (email) => (await post('/auth/signin', { email, password: PASSWORD })).json?.data?.session?.access_token;
const outcome = (r) => (r.status === 403 ? '403' : r.status === 401 ? '401' : 'ok');

// attend : ce qu'un utilisateur normal doit obtenir
async function expect(label, name, args, want, userToken) {
  const anon = await post('/rpc', { name, args });
  const usr = await post('/rpc', { name, args }, userToken);
  const ok = outcome(usr) === want;
  if (!ok) failures += 1;
  const pad = label.padEnd(36);
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${pad} attendu=${want} | anonyme=${outcome(anon)} user=${outcome(usr)}`);
}

try {
  const stamp = Date.now();
  const emails = { user: `tmp-autorisations-user-${stamp}@test.local`, admin: `tmp-autorisations-admin-${stamp}@test.local` };
  for (const email of [emails.user, emails.admin]) {
    const r = await post('/auth/signup', { email, password: PASSWORD });
    const id = r.json?.data?.user?.id;
    if (!id) throw new Error(`inscription impossible pour ${email} : ${JSON.stringify(r.json).slice(0, 160)}`);
    created.push(id);
    if (email === emails.admin) await prisma.profiles.update({ where: { id }, data: { user_type: 'admin' } });
  }
  const userToken = await signin(emails.user);
  const adminToken = await signin(emails.admin);
  if (!userToken || !adminToken) throw new Error('connexion impossible');

  console.log('--- administration des comptes ---');
  await expect('update_user_role_securely', 'update_user_role_securely', { p_user_id: OTHER, p_new_role: 'super_admin' }, '403', userToken);
  await expect('admin_reset_password', 'admin_reset_password', { target_user_id: OTHER, new_password: 'x' }, '403', userToken);
  await expect('delete_user_securely', 'delete_user_securely', { p_user_id: OTHER }, '403', userToken);

  console.log('--- finances ---');
  await expect('credit_user_coins', 'credit_user_coins', { p_user_id: OTHER, p_amount: 1000, p_reason: 'test' }, '403', userToken);
  await expect('debit_user_coins', 'debit_user_coins', { p_user_id: OTHER, p_amount: 1 }, '403', userToken);
  await expect('increment_user_coins', 'increment_user_coins', { p_user_id: OTHER, p_coin_increment: 1000 }, '403', userToken);
  await expect('reverse_credit', 'reverse_credit', { p_log_id: OTHER }, '403', userToken);
  await expect('process_organizer_withdrawal', 'process_organizer_withdrawal', { p_request_id: OTHER, p_status: 'approved' }, '403', userToken);
  await expect('approve_admin_withdrawal', 'approve_admin_withdrawal', { p_request_id: OTHER }, '403', userToken);
  await expect('reset_granular_user_data', 'reset_granular_user_data', { p_target_id: OTHER, p_reset_paid: true }, '403', userToken);
  await expect('clear_all_user_transactions', 'clear_all_user_transactions', { p_user_id: OTHER }, '403', userToken);
  await expect('restore_user_transactions', 'restore_user_transactions', { p_user_id: OTHER }, '403', userToken);
  await expect('get_audit_log_stats', 'get_audit_log_stats', { period_days: 1 }, '403', userToken);
  await expect('get_super_admin_dashboard_stats', 'get_super_admin_dashboard_stats', {}, '403', userToken);
  await expect('send_announcement_to_users', 'send_announcement_to_users', { announcement_uuid: OTHER }, '403', userToken);
  await expect('delete_location', 'delete_location', { p_location_id: OTHER }, '403', userToken);

  console.log('--- son propre compte : autorisé ---');
  await expect('convert_coins_to_earnings (soi)', 'convert_coins_to_earnings', { p_user_id: created[0], p_amount: 1 }, 'ok', userToken);
  await expect('update_user_profile (soi)', 'update_user_profile', { p_user_id: created[0], p_full_name: 'x' }, 'ok', userToken);

  console.log("--- le compte d'un tiers : refusé ---");
  await expect('update_user_profile (autrui)', 'update_user_profile', { p_user_id: OTHER, p_full_name: 'pirate' }, '403', userToken);
  await expect('convert_coins_to_earnings (autrui)', 'convert_coins_to_earnings', { p_user_id: OTHER, p_amount: 1 }, '403', userToken);
  await expect('purchase_tickets_v2 (autrui)', 'purchase_tickets_v2', { p_user_id: OTHER, p_items: [] }, '403', userToken);
  await expect('cast_votes (autrui)', 'cast_votes', { p_user_id: OTHER, p_event_id: OTHER, p_votes: [] }, '403', userToken);

  console.log('--- l’admins garde ses droits ---');
  const adm = await post('/rpc', { name: 'credit_user_coins', args: { p_user_id: OTHER, p_amount: 0, p_reason: 'test' } }, adminToken);
  const admOk = outcome(adm) === 'ok';
  if (!admOk) failures += 1;
  console.log(`${admOk ? 'OK   ' : 'ECHEC'} admin credit_user_coins          -> ${outcome(adm)}`);

  console.log(failures === 0 ? '\nTOUT EST VERT' : `\n${failures} TEST(S) EN ECHEC`);
} catch (e) {
  failures += 1;
  console.log('ERREUR :', String(e?.message || e).trim().slice(0, 200));
} finally {
  for (const id of created.filter(Boolean)) {
    for (const t of ['transactions', 'organizer_earnings', 'earnings_transfers', 'notifications']) {
      try { await prisma[t].deleteMany({ where: { user_id: id } }); } catch { /* table absente */ }
    }
    await prisma.profiles.deleteMany({ where: { id } });
    await prisma.auth_users.deleteMany({ where: { id } });
  }
  const left = await prisma.profiles.count({ where: { email: { startsWith: 'tmp-' } } });
  console.log(`nettoyage : ${created.length} compte(s) créé(s), ${left} compte(s) tmp restant(s)`);
  await prisma.$disconnect();
  process.exit(failures === 0 ? 0 : 1);
}
