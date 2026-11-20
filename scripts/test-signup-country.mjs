// Verifie que l'inscription enregistre bien le pays/ville/telephone choisis,
// et que le fallback ensure_user_profile_exists ne force pas "Côte d'Ivoire".
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const API = 'http://127.0.0.1:8888/api';
const PASSWORD = 'Tmp!23456789';

async function post(path, body, token, extraHeaders = {}) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...extraHeaders,
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json;
  try { json = JSON.parse(text); } catch { json = {}; }
  return { status: res.status, json };
}

let fails = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fails += 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label.padEnd(55)} attendu=${want} obtenu=${got}`);
};

const ids = [];
try {
  const stamp = Date.now();

  // 1. Inscription normale avec pays choisi (le cas du bug).
  const email = `tmp-country-${stamp}@test.local`;
  const signup = await post('/auth/signup', {
    email,
    password: PASSWORD,
    options: {
      data: {
        full_name: 'Test Pays',
        country: 'Burkina Faso',
        city: 'Ouagadougou',
        phone: '70123456',
        user_type: 'organizer',
      },
    },
  });
  const id = signup.json?.data?.user?.id;
  check('signup -> 200', signup.status, 200);
  check('signup -> id utilisateur', Boolean(id), true);
  if (id) ids.push(id);

  let profile = id ? await prisma.profiles.findUnique({ where: { id } }) : null;
  check('profil cree', Boolean(profile), true);
  check('pays = Burkina Faso (pas le defaut CI)', profile?.country, 'Burkina Faso');
  check('ville = Ouagadougou', profile?.city, 'Ouagadougou');
  check('telephone enregistre', profile?.phone, '70123456');
  check('role organizer respecte', profile?.user_type, 'organizer');

  // 2. Un client ne peut pas se donner un role admin a l'inscription.
  const evilEmail = `tmp-country-evil-${stamp}@test.local`;
  const evil = await post('/auth/signup', {
    email: evilEmail,
    password: PASSWORD,
    options: { data: { full_name: 'Tentative admin', user_type: 'super_admin' } },
  });
  const evilId = evil.json?.data?.user?.id;
  if (evilId) ids.push(evilId);
  const evilProfile = evilId ? await prisma.profiles.findUnique({ where: { id: evilId } }) : null;
  check('role super_admin refuse -> user', evilProfile?.user_type, 'user');

  // 3. Fallback RPC : recreer un profil avec le pays transmis.
  // On utilisa la cle interne : la resolution d'un jeton utilisateur exige un
  // profil existant, ce qui est precisement le cas que ce fallback repair.
  if (id && profile) {
    await prisma.profiles.delete({ where: { id } });
    const rpc = await post('/rpc', {
      name: 'ensure_user_profile_exists',
      args: {
        p_user_id: id,
        p_email: email,
        p_full_name: 'Test Pays',
        p_country: 'Burkina Faso',
        p_city: 'Ouagadougou',
        p_phone: '70123456',
      },
    }, null, { 'X-Internal-Key': process.env.INTERNAL_RPC_KEY || '' });
    const recreated = await prisma.profiles.findUnique({ where: { id } });
    check('fallback RPC -> 200', rpc.status, 200);
    check('fallback RPC respecte le pays', recreated?.country, 'Burkina Faso');
    check('fallback RPC respecte la ville', recreated?.city, 'Ouagadougou');
  }

  console.log(fails === 0 ? '\nTOUT EST VERT' : `\n${fails} ECHEC(S)`);
} catch (e) {
  console.log('ERREUR TEST:', String(e?.message || e).trim().slice(0, 300));
  fails += 1;
} finally {
  for (const id of [...new Set(ids.filter(Boolean))]) {
    await prisma.transactions.deleteMany({ where: { user_id: id } }).catch(() => {});
    await prisma.notifications.deleteMany({ where: { user_id: id } }).catch(() => {});
    await prisma.profiles.deleteMany({ where: { id } }).catch(() => {});
    await prisma.auth_users.deleteMany({ where: { id } }).catch(() => {});
  }
  await prisma.$disconnect();
  // Laisser Node terminer proprement : un process.exit() force ici peut
  // interrompre la fermeture du moteur Prisma sur Windows (assertion UV_HANDLE).
  process.exitCode = fails === 0 ? 0 : 1;
}
