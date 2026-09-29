// Brique 3 : ce qu'un utilisateur normal peut ecrire via /api/query.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const API = 'http://127.0.0.1:8888/api';
const PASSWORD = 'Tmp!23456789';
const OTHER = '00000000-0000-0000-0000-000000000000';

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
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label.padEnd(50)} attendu=${want} obtenu=${got}`);
};
const q = (t, body, token) => post('/query', body, token);

const ids = [];
try {
  const stamp = Date.now();
  let seq = 0;
  const mk = async (role) => {
    const email = `tmp-q-${role}-${stamp}-${++seq}@test.local`;
    const r = await post('/auth/signup', { email, password: PASSWORD });
    const id = r.json?.data?.user?.id;
    if (!id) throw new Error(`inscription ${email} -> HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
    ids.push(id);
    await prisma.profiles.update({ where: { id }, data: { user_type: role, coin_balance: 500 } });
    return { id, token: (await post('/auth/signin', { email, password: PASSWORD })).json?.data?.session?.access_token };
  };
  const A = await mk('user');
  const B = await mk('user');
  const S = await mk('secretary');
  const bal = async (id) => (await prisma.profiles.findUnique({ where: { id }, select: { coin_balance: true } })).coin_balance;
  const role = async (id) => (await prisma.profiles.findUnique({ where: { id }, select: { user_type: true } })).user_type;

  // ---------- escalade : la faille mesuree avant la brique 3 ----------
  const up = await q('profiles', { table: 'profiles', method: 'update', filters: [{ column: 'id', op: 'eq', value: A.id }], body: { user_type: 'super_admin' } }, A.token);
  check('auto-promotion en super_admin -> 403', up.status, 403);
  check('  role inchange', await role(A.id), 'user');
  const dis = await q('profiles', { table: 'profiles', method: 'update', filters: [{ column: 'id', op: 'eq', value: A.id }], body: { is_active: true } }, A.token);
  check('auto-reactivation de son compte -> 403', dis.status, 403);

  // ---------- argent ----------
  const coin = await q('profiles', { table: 'profiles', method: 'update', filters: [{ column: 'id', op: 'eq', value: A.id }], body: { coin_balance: 999999 } }, A.token);
  check('ecriture de coin_balance -> 403', coin.status, 403);
  check('  solde intact', await bal(A.id), 500);
  const ledger = await q('coin_transactions', { table: 'coin_transactions', method: 'insert', body: { user_id: A.id, amount: 100000, type: 'credit' } }, A.token);
  check('ecriture dans coin_transactions -> 403', ledger.status, 403);

  // ---------- lecture d'un tiers, ecriture sur un tiers ----------
  const other = await q('profiles', { table: 'profiles', method: 'update', filters: [{ column: 'id', op: 'eq', value: B.id }], body: { full_name: 'vole' } }, A.token);
  check('ecriture sur le profil d autrui -> 200', other.status, 200); //filtre injecte -> 0 ligne
  const stillB = await prisma.profiles.findUnique({ where: { id: B.id }, select: { full_name: true } });
  check('  profil d autrui intact', stillB?.full_name === 'Tmp Utilisateur' || !stillB?.full_name, true);
  const stillA = await prisma.profiles.findUnique({ where: { id: A.id }, select: { full_name: true } });
  check('  ecriture refusee ET non derivee vers soi', stillA?.full_name === 'Tmp Utilisateur' || !stillA?.full_name, true);

  // ---------- son propre profil ----------
  const mine = await q('profiles', { table: 'profiles', method: 'update', filters: [{ column: 'id', op: 'eq', value: A.id }], body: { bio: 'a moi' } }, A.token);
  check('ecriture sur son propre profil -> 200', mine.status, 200);
  check('  bio enregistree', (await prisma.profiles.findUnique({ where: { id: A.id }, select: { bio: true } })).bio, 'a moi');

  // ---------- filtre hostile sur son profil ----------
  const ne = await q('profiles', { table: 'profiles', method: 'update', filters: [{ column: 'id', op: 'neq', value: A.id }], body: { bio: 'pirate' } }, A.token);
  const touched = await prisma.profiles.findMany({ where: { id: { in: ids } }, select: { id: true, bio: true } });
  check('filtre neq : aucun compte du test modifie', touched.some((p) => p.bio === 'pirate'), false);
  void ne;

  // ---------- table non declaree ----------
  const app = await q('app_settings', { table: 'app_settings', method: 'update', filters: [{ column: 'id', op: 'eq', value: 'x' }], body: { coin_to_fcfa_rate: 1 } }, A.token);
  check('ecriture dans app_settings -> 403', app.status, 403);

  // ---------- insertion forcee sur une table personnelle ----------
  const notif = await q('notifications', { table: 'notifications', method: 'insert', body: { user_id: B.id, title: 'faux', message: 'faux', type: 'system' } }, A.token);
  check('notification inseree pour un tiers -> 200', notif.status, 200);
  const madeFor = await prisma.notifications.findFirst({ where: { title: 'faux' }, select: { user_id: true } });
  check('  redirigee vers soi', madeFor?.user_id, A.id);
  await prisma.notifications.deleteMany({ where: { title: 'faux' } });

  // ---------- evenement d'un tiers ----------
  const ev = await prisma.events.create({ data: { title: `TMP q ${stamp}`, organizer_id: B.id, status: 'draft', city: 'X', event_start_at: new Date(Date.now() + 86400000) } });
  const tt = await q('ticket_types', { table: 'ticket_types', method: 'insert', body: { event_id: ev.id, name: 'Vol', price: 1, quantity_available: 10, price_pi: 10 } }, A.token);
  check('type de billet sur l evenement d autrui -> 403', tt.status, 403);

  const evOwn = await prisma.events.create({ data: { title: `TMP q2 ${stamp}`, organizer_id: A.id, status: 'draft', city: 'X', event_start_at: new Date(Date.now() + 86400000) } });
  const ttOwn = await q('ticket_types', { table: 'ticket_types', method: 'insert', body: { event_id: evOwn.id, name: 'Standard', price: 100, quantity_available: 50, price_pi: 500 } }, A.token);
  check('type de billet sur SON evenement -> 200', ttOwn.status, 200);
  check('  type de billet cree', await prisma.ticket_types.count({ where: { event_id: evOwn.id, name: 'Standard' } }), 1);
  const own = await prisma.ticket_types.findFirst({ where: { event_id: evOwn.id, name: 'Standard' } });

  // Filtres exotiques : la requete est bornee par le moteur, donc la ligne
  // d'un tiers reste hors d'atteinte meme si le client ecrit neq/ilike/gt.
  const foreign = await prisma.ticket_types.create({ data: { event_id: ev.id, name: 'Vol', price: 1, quantity_available: 10, price_pi: 10 } });
  const upd = await q('ticket_types', { table: 'ticket_types', method: 'update', filters: [{ column: 'id', op: 'neq', value: foreign.id }], body: { price: 999 } }, A.token);
  const stillForeign = await prisma.ticket_types.findUnique({ where: { id: foreign.id } });
  check('update avec filtre neq ne touche pas le tiers', stillForeign.price.toString(), '1');
  check('  tiers ecarte de la reponse', (upd.json?.data ?? []).some?.((r) => r?.id === foreign.id) ?? false, false);
  const del = await q('ticket_types', { table: 'ticket_types', method: 'delete', filters: [{ column: 'name', op: 'ilike', value: 'Vol' }] }, A.token);
  check('delete avec filtre ilike ne supprime rien chez le tiers', await prisma.ticket_types.count({ where: { id: foreign.id } }), 1);
  check('  delete rejete ou sans effet', del.status === 403 || (del.json?.data?.length ?? 0) === 0, true);
  const updOwn = await q('ticket_types', { table: 'ticket_types', method: 'update', filters: [{ column: 'id', op: 'eq', value: own.id }], body: { price: 150 } }, A.token);
  check('update sur SON type de billet -> 200', updOwn.status, 200);
  check('  prix mis a jour', (await prisma.ticket_types.findUnique({ where: { id: own.id } })).price.toString(), '150');
  const updCross = await q('ticket_types', { table: 'ticket_types', method: 'update', filters: [{ column: 'id', op: 'eq', value: foreign.id }], body: { price: 777 } }, A.token);
  check('update cible du tiers -> refuse ou sans effet', updCross.status === 403 || (await prisma.ticket_types.findUnique({ where: { id: foreign.id } })).price.toString() === '1', true);


  // ---------- administrateur ----------
  const admCoin = await q('profiles', { table: 'profiles', method: 'update', filters: [{ column: 'id', op: 'eq', value: B.id }], body: { is_active: false } }, S.token);
  check('admin desactive un compte -> 200', admCoin.status, 200);
  const admRole = await q('profiles', { table: 'profiles', method: 'update', filters: [{ column: 'id', op: 'eq', value: B.id }], body: { user_type: 'admin' } }, S.token);
  check('secretaire nomme un admin -> 200', admRole.status, 200);
  check('  role applique', await role(B.id), 'admin');
  const admSelf = await q('profiles', { table: 'profiles', method: 'update', filters: [{ column: 'id', op: 'eq', value: S.id }], body: { user_type: 'secretary' } }, S.token);
  check('secretaire modifie son propre role -> 403', admSelf.status, 403);
  const admSuper = await q('profiles', { table: 'profiles', method: 'update', filters: [{ column: 'id', op: 'eq', value: B.id }], body: { user_type: 'super_admin' } }, S.token);
  check('secretaire nomme un super_admin -> 403', admSuper.status, 403);
  check('  role inchange', await role(B.id), 'admin');
  const admAppt = await q('profiles', { table: 'profiles', method: 'update', filters: [{ column: 'id', op: 'eq', value: B.id }], body: { appointed_by: S.id } }, S.token);
  check('secretaire renseigne appointed_by -> 403', admAppt.status, 403);
  const S2 = await mk('super_admin');
  const superRole = await q('profiles', { table: 'profiles', method: 'update', filters: [{ column: 'id', op: 'eq', value: B.id }], body: { user_type: 'user', appointed_by: null } }, S2.token);
  check('super_admin corrige un role -> 200', superRole.status, 200);
  check('  role applique', await role(B.id), 'user');

  // ---------- anonyme ----------
  check('ecriture anonyme -> 401', (await q('profiles', { table: 'profiles', method: 'update', filters: [{ column: 'id', op: 'eq', value: A.id }], body: { bio: 'x' } })).status, 401);
  check('lecture anonyme -> 200', (await post('/query', { table: 'profiles', method: 'select', filters: [{ column: 'id', op: 'eq', value: A.id }] })).status, 200);

  // ---------- fonction interne ----------
  const internal = await post('/query', { table: 'profiles', method: 'update', filters: [{ column: 'id', op: 'eq', value: A.id }], body: { bio: 'pose par la fonction' } }, null);
  void internal;
  const withKey = await fetch(`${API}/query`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Key': process.env.INTERNAL_RPC_KEY },
    body: JSON.stringify({ table: 'profiles', method: 'update', filters: [{ column: 'id', op: 'eq', value: A.id }], body: { bio: 'pose par la fonction' } }),
  });
  check('fonction interne (cle) -> 200', withKey.status, 200);
  check('  bio ecr par la fonction', (await prisma.profiles.findUnique({ where: { id: A.id }, select: { bio: true } })).bio, 'pose par la fonction');

  console.log(fails === 0 ? '\nTOUT EST VERT' : `\n${fails} ECHEC(S)`);
} catch (e) {
  console.log('ERREUR:', String(e?.message || e).trim().slice(0, 240));
} finally {
  const stray = await prisma.profiles.findMany({ where: { email: { startsWith: 'tmp-' } }, select: { id: true } });
  for (const p of stray) ids.push(p.id);
  await prisma.events.deleteMany({ where: { title: { startsWith: 'TMP q' } } });
  const ownedEvents = await prisma.events.findMany({ where: { organizer_id: { in: ids.filter(Boolean) } }, select: { id: true } });
  for (const id of [...new Set(ids.filter(Boolean))]) {
    await prisma.ticket_types.deleteMany({ where: { event_id: { in: ownedEvents.map((e) => e.id) } } });
    await prisma.notifications.deleteMany({ where: { user_id: id } });
    await prisma.transactions.deleteMany({ where: { user_id: id } });
    await prisma.profiles.deleteMany({ where: { id } });
    await prisma.auth_users.deleteMany({ where: { id } });
  }
  // purge des comptes temporaires forgets (authentification sans profil)
  await prisma.auth_users.deleteMany({ where: { email: { startsWith: 'tmp-' } } });
  await prisma.profiles.deleteMany({ where: { email: { startsWith: 'tmp-' } } });
  console.log(`nettoyage: comptes tmp restants = ${await prisma.profiles.count({ where: { email: { startsWith: 'tmp-' } } })} | evenements TMP restants = ${await prisma.events.count({ where: { title: { startsWith: 'TMP q' } } })}`);
  await prisma.$disconnect();
  process.exit(fails === 0 ? 0 : 1);
}
