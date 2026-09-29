// Verifie les gardes poses sur /api/auth/admin/*.
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
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label.padEnd(52)} attendu=${want} obtenu=${got}`);
};

const ids = [];
try {
  const stamp = Date.now();
  const mk = async (role) => {
    const email = `tmp-auth-${role}-${stamp}@test.local`;
    const r = await post('/auth/signup', { email, password: PASSWORD });
    const id = r.json?.data?.user?.id;
    ids.push(id);
    await prisma.profiles.update({ where: { id }, data: { user_type: role } });
    return (await post('/auth/signin', { email, password: PASSWORD })).json?.data?.session?.access_token;
  };
  const userToken = await mk('user');
  const secToken = await mk('secretary');
  const superToken = await mk('super_admin');

  // la menace : se creer un super_admin depuis le dehors
  const evil = { email: `tmp-attaquant-${stamp}@test.local`, password: 'Attaque!12345', user_type: 'super_admin' };
  const anonCreate = await post('/auth/admin/create-user', evil);
  check('create-user anonyme -> 401', anonCreate.status, 401);
  check('  aucun compte cree', await prisma.profiles.count({ where: { email: evil.email } }), 0);
  const userCreate = await post('/auth/admin/create-user', evil, userToken);
  check('create-user par un utilisateur -> 403', userCreate.status, 403);
  const secCreate = await post('/auth/admin/create-user', evil, secToken);
  check('create-user par un secretaire -> 403', secCreate.status, 403);
  check('  toujours aucun compte', await prisma.profiles.count({ where: { email: evil.email } }), 0);
  const superCreate = await post('/auth/admin/create-user', evil, superToken);
  check('create-user par un super_admin -> 200', superCreate.status, 200);
  const made = await prisma.profiles.findFirst({ where: { email: evil.email }, select: { id: true, user_type: true } });
  check('  compte cree avec le role demande', made?.user_type, 'super_admin');
  if (made) ids.push(made.id);

  check('list-users anonyme -> 401', (await post('/auth/admin/list-users', {})).status, 401);
  check('list-users par un utilisateur -> 403', (await post('/auth/admin/list-users', {}, userToken)).status, 403);
  check('list-users par un admin -> 200', (await post('/auth/admin/list-users', {}, secToken)).status, 200);

  console.log(fails === 0 ? '\nTOUT EST VERT' : `\n${fails} ECHEC(S)`);
} catch (e) {
  console.log('ERREUR:', String(e?.message || e).trim().slice(0, 200));
} finally {
  // rattrapage : tout compte temporaire, y compris celui d'une tentative
  // d'attaque que le script n'a pas réussi a refermer
  const stray = await prisma.profiles.findMany({ where: { email: { startsWith: 'tmp-' } }, select: { id: true } });
  for (const p of stray) ids.push(p.id);
  for (const id of [...new Set(ids.filter(Boolean))]) {
    await prisma.transactions.deleteMany({ where: { user_id: id } });
    await prisma.notifications.deleteMany({ where: { user_id: id } });
    await prisma.profiles.deleteMany({ where: { id } });
    await prisma.auth_users.deleteMany({ where: { id } });
  }
  console.log(`nettoyage: comptes tmp restants = ${await prisma.profiles.count({ where: { email: { startsWith: 'tmp-' } } })}`);
  await prisma.$disconnect();
  process.exit(fails === 0 ? 0 : 1);
}
