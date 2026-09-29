// Brique securite 2 : fin du fail-open des RPC sans regle.
//  - get_verification_stats  : organiseur + agent + admin seulement
//  - get_promo_code_stats    : organiseur, influenceur proprietaire ou admin
//  - credit_user_for_video   : recompense LUE sur le serveur, une seule par
//                              (user, video, jour), jamais pour autrui
//  - get_organizer_earnings_summary / get_withdrawable_balances : selfArg
//  - salaires & zones        : admin seulement
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
const eventIds = [];
const videoIds = [];
try {
  const stamp = Date.now();
  const org = await post('/auth/signup', { email: `tmp-scope-org-${stamp}@test.local`, password: PASSWORD });
  const agent = await post('/auth/signup', { email: `tmp-scope-ag-${stamp}@test.local`, password: PASSWORD });
  const intrud = await post('/auth/signup', { email: `tmp-scope-x-${stamp}@test.local`, password: PASSWORD });
  const orgId = org.json?.data?.user?.id;
  const agentId = agent.json?.data?.user?.id;
  const intrudId = intrud.json?.data?.user?.id;
  ids.push(orgId, agentId, intrudId);

  const ev = await prisma.events.create({ data: { title: `TMP scope ${stamp}`, organizer_id: orgId, status: 'published', city: 'CI', event_start_at: new Date(Date.now() + 86400000) } });
  eventIds.push(ev.id);
  await prisma.organizer_scan_agents.create({ data: { id: uuidv4(), organizer_id: orgId, user_id: agentId, granted_by: orgId, is_active: true } });
  await prisma.profiles.update({ where: { id: orgId }, data: { coin_balance: 500, available_earnings: 42 } });
  await prisma.profiles.update({ where: { id: intrudId }, data: { coin_balance: 0 } });
  const vid = await prisma.mandatory_videos.create({ data: { id: uuidv4(), title: 'TMP reward', video_url: 'https://x.test/a.mp4', video_duration: 30, reward_coins: 7, is_active: true, expires_at: new Date(Date.now() + 86400000) } });
  videoIds.push(vid.id);

  const tOrg = (await post('/auth/signin', { email: `tmp-scope-org-${stamp}@test.local`, password: PASSWORD })).json?.data?.session?.access_token;
  const tAgent = (await post('/auth/signin', { email: `tmp-scope-ag-${stamp}@test.local`, password: PASSWORD })).json?.data?.session?.access_token;
  const tX = (await post('/auth/signin', { email: `tmp-scope-x-${stamp}@test.local`, password: PASSWORD })).json?.data?.session?.access_token;
  const rpc = (name, args, token) => post('/rpc', { name, args }, token);
  const code = (r) => r.json?.error?.code || String(r.status);

  // ---------- get_verification_stats ----------
  check('stats scans : tiers -> 403', code(await rpc('get_verification_stats', { p_event_id: ev.id }, tX)), 'FORBIDDEN');
  check('stats scans : organi-> ok', await rpc('get_verification_stats', { p_event_id: ev.id }, tOrg).then((r) => r.json?.data ? 'ok' : 'KO'), 'ok');
  check('stats scans : agent -> ok', await rpc('get_verification_stats', { p_event_id: ev.id }, tAgent).then((r) => r.json?.data ? 'ok' : 'KO'), 'ok');

  // ---------- get_promo_code_stats ----------
  await prisma.promo_codes.create({ data: { id: uuidv4(), code: `TMP${stamp}`, influencer_id: orgId, event_id: ev.id } });
  check('codes promo : tiers -> FORBIDDEN', code(await rpc('get_promo_code_stats', { p_event_id: ev.id }, tX)), 'FORBIDDEN');
  check('codes promo : organi -> ok', await rpc('get_promo_code_stats', { p_event_id: ev.id }, tOrg).then((r) => (r.json?.data && r.json.data.total === 1) ? 'ok' : 'KO'), 'ok');
  check('codes promo : agent (deleg.) -> FORBIDDEN', code(await rpc('get_promo_code_stats', { p_event_id: ev.id }, tAgent)), 'FORBIDDEN');

  // ---------- credit_user_for_video (recompense serveur + anti-double) ----------
  const v1 = await rpc('credit_user_for_video', { p_user_id: agentId, p_video_id: vid.id, p_reward_coins: 9999 }, tAgent);
  const agentBal = (await prisma.profiles.findUnique({ where: { id: agentId }, select: { coin_balance: true } })).coin_balance;
  check('video : recompense ignoree 9999 -> 7 reels', v1.json?.data?.reward_coins, 7);
  check('  solde debite de 7', agentBal, 7);
  const v2 = await rpc('credit_user_for_video', { p_user_id: agentId, p_video_id: vid.id, p_reward_coins: 7 }, tAgent);
  check('video : double clic -> deja credite', v2.json?.data?.already_credited, true);
  check('  solde inchange', (await prisma.profiles.findUnique({ where: { id: agentId }, select: { coin_balance: true } })).coin_balance, 7);
  check('video : crediter autrui -> 403', await rpc('credit_user_for_video', { p_user_id: orgId, p_video_id: vid.id, p_reward_coins: 7 }, tAgent).then((r) => r.status), 403);
  check('  compte cible inchangé', (await prisma.profiles.findUnique({ where: { id: orgId }, select: { coin_balance: true } })).coin_balance, 500);
  check('video : video inconnue -> VIDEO_NOT_ACTIVE', code(await rpc('credit_user_for_video', { p_user_id: agentId, p_video_id: uuidv4(), p_reward_coins: 7 }, tAgent)), 'VIDEO_NOT_ACTIVE');

  // ---------- selfArg : gains de quelqu'un d'autre ----------
  check('earnings summary d autrui -> 403', await rpc('get_organizer_earnings_summary', { p_organizer_id: orgId }, tAgent).then((r) => r.status), 403);
  check('earnings summary de soi -> ok', await rpc('get_organizer_earnings_summary', { p_organizer_id: orgId }, tOrg).then((r) => r.json?.data ? 'ok' : 'KO'), 'ok');
  check('withdrawable d autrui -> 403', await rpc('get_withdrawable_balances', { p_organizer_id: orgId }, tAgent).then((r) => r.status), 403);

  // ---------- ADMIN seulement ----------
  check('salaires admin : utilisateur -> 403', await rpc('get_admin_salary_stats', { p_admin_id: orgId }, tOrg).then((r) => r.status), 403);
  check('zones stats : utilisateur -> 403', await rpc('get_zones_stats', {}, tOrg).then((r) => r.status), 403);
  check('todays mandatory video autrui -> 403', await rpc('get_todays_mandatory_video', { user_uuid: agentId }, tOrg).then((r) => r.status), 403);

  // ---------- /api/storage fermé aux visiteurs, ouvert aux connectés ----------
  const upAnon = await post('/storage/upload?bucket=test&path=tmp-scope.txt', Buffer.from('x'), null);
  check('storage upload : anonyme -> 401', upAnon.status, 401);
  const listAnon = await post('/storage/list', { bucket: 'test', path: '' }, null);
  check('storage list : anonyme -> 401', listAnon.status, 401);
  const upAuth = await post('/storage/upload?bucket=test&path=tmp-scope.txt', Buffer.from('hello'), tOrg);
  check('storage upload : connecte -> ok', upAuth.status, 200);
  const remAuth = await post('/storage/remove', { bucket: 'test', paths: ['tmp-scope.txt'] }, tOrg);
  check('storage remove : connecte -> ok', remAuth.status, 200);

  console.log(fails === 0 ? '\nTOUT EST VERT' : `\n${fails} ECHEC(S)`);
} catch (e) {
  console.log('ERREUR:', String(e?.message || e).trim().slice(0, 600));
} finally {
  try { await import('node:fs').then((fs) => fs.promises.unlink(new URL('../storage/public/test/tmp-scope.txt', import.meta.url))) } catch (e) {}
  for (const id of videoIds.filter(Boolean)) await prisma.mandatory_videos.deleteMany({ where: { id } });
  for (const id of eventIds.filter(Boolean)) await prisma.events.deleteMany({ where: { id } });
  for (const id of ids.filter(Boolean)) {
    await prisma.user_video_watches.deleteMany({ where: { user_id: id } });
    await prisma.promo_codes.deleteMany({ where: { influencer_id: id } });
    await prisma.organizer_scan_agents.deleteMany({ where: { organizer_id: id } });
    await prisma.organizer_scan_agents.deleteMany({ where: { user_id: id } });
    await prisma.payments.deleteMany({ where: { user_id: id } });
    await prisma.transactions.deleteMany({ where: { user_id: id } });
    await prisma.organizer_earnings.deleteMany({ where: { organizer_id: id } });
    await prisma.notifications.deleteMany({ where: { user_id: id } });
    await prisma.profiles.deleteMany({ where: { id } });
    await prisma.auth_users.deleteMany({ where: { id } });
  }
  console.log(`residus tmp = ${await prisma.profiles.count({ where: { email: { startsWith: 'tmp-' } } })}`);
  await prisma.$disconnect();
  process.exit(fails === 0 ? 0 : 1);
}