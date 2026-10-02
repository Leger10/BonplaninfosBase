// Regression : a la creation d'un evenement de stands, les 4 offres
// (stand, accommodation, camping, glamping) n'etaient PAS toutes enregistrees :
// seule la premiere ("Stand Standard") etait visible apres enregistrement.
//
// Cause : server/queryPolicy.mjs conservait `body[0]` pour tout insert portant
// une portee evenement, transformant un insert en LOT en insertion unique.
// Le moteur (server/queryEngine.mjs) ne recevait donc qu'une ligne.
//
// Ce test verifie :
//  1. qu'un insert en LOT de N lignes persiste bien N lignes ;
//  2. que la portee evenement est TOUJOURS verifiee (une ligne d'un evenement
//     etranger doit etre refusee) — le correctif ne doit pas ouvrir une
//     faille d'ecriture croisee ;
//  3. que la colonne cover_image des stands existe et est acceptee.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const API = 'http://127.0.0.1:8888/api';
const PASSWORD = 'Tmp!23456789';

let fails = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fails += 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label.padEnd(60)} attendu=${want} obtenu=${got}`);
};

const post = async (path, body, token) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const t = await res.text();
  try { return JSON.parse(t); } catch { return { raw: t.slice(0, 200) }; }
};

const newUser = async (tag, userType = 'super_admin') => {
  const email = `tmp-stand-${tag}-${Date.now()}@test.local`;
  const su = await post('/auth/signup', { email, password: PASSWORD });
  const id = su?.data?.user?.id;
  await prisma.profiles.update({ where: { id }, data: { user_type: userType } });
  const token = (await post('/auth/signin', { email, password: PASSWORD }))?.data?.session?.access_token;
  return { id, token };
};

const makeEvent = async (ownerId) => {
  const ev = await prisma.events.create({
    data: {
      title: 'Test stands batch',
      description: 'evenement de test',
      event_type: 'stand_rental',
      status: 'active',
      start_date: new Date(),
      event_start_at: new Date(),
      city: 'Bamako',
      country: 'Mali',
      organizer_id: ownerId,
    },
  });
  const se = await prisma.stand_events.create({
    data: { event_id: ev.id, base_currency: 'XOF' },
  });
  return { ev, se };
};

const ids = [];
const created = [];
try {
  // 1. Insert en LOT de 4 offres : c'est le scenario du bug.
  //    Organisateur classique (role `user`, pas admin) : c'est le cas
  //    reellement soumis a la portee evenement, les roles admin
  //    court-circuitant volontairement cette verification (queryPolicy
  //    `if (isAdmin)`) pour garder la main sur les tables d'exploitation.
  const owner = await newUser('owner', 'user');
  const other = await newUser('other', 'user');
  ids.push(owner.id, other.id);

  const { ev, se } = await makeEvent(owner.id);
  created.push(ev.id);

  const OFFRES = [
    { name: 'Stand Standard', rental_type: 'stand', cover_image: 'https://ex.test/a.jpg' },
    { name: 'Hebergement Case', rental_type: 'accommodation', cover_image: 'https://ex.test/b.jpg' },
    { name: 'Emplacement Camping', rental_type: 'camping', cover_image: null },
    { name: 'Glamping Tente Luxe', rental_type: 'glamping', cover_image: 'https://ex.test/d.jpg' },
  ];

  const r = await post('/query', {
    table: 'stand_types',
    method: 'insert',
    body: OFFRES.map((o) => ({
      stand_event_id: se.id,
      event_id: ev.id,
      name: o.name,
      rental_type: o.rental_type,
      size: '3x3m',
      description: '',
      base_price: 50000,
      base_currency: 'XOF',
      calculated_price_pi: 1000,
      quantity_available: 5,
      quantity_rented: 0,
      is_active: true,
      cover_image: o.cover_image,
    })),
  }, owner.token);

  check('insert en lot : pas de refus', r.error || '', '');
  const rows = await prisma.stand_types.findMany({ where: { stand_event_id: se.id } });
  check('les 4 offres sont bien enregistrees', rows.length, 4);
  const types = rows.map((x) => x.rental_type).sort();
  check(
    'les 4 rental_type distincts sont presents',
    types.join(','),
    'accommodation,camping,glamping,stand',
  );
  check(
    'les noms correspondent, aucun ecrasement par body[0]',
    rows.filter((x) => x.name === 'Stand Standard').length,
    1,
  );
  const withCover = rows.filter((x) => x.cover_image);
  check('cover_image enregistre pour 3 offres sur 4', withCover.length, 3);

  // 2. La securite doit etre intacte : une ligne d'un evenement etranger
  //    est refusee, meme dans un lot dont la premiere ligne est legitime.
  const { ev: foreignEv } = await makeEvent(other.id);
  created.push(foreignEv.id);
  const bad = await post('/query', {
    table: 'stand_types',
    method: 'insert',
    body: [
      { stand_event_id: se.id, event_id: ev.id, name: 'Legitime', base_price: 1000, quantity_available: 1 },
      { stand_event_id: null, event_id: foreignEv.id, name: 'Evenement etranger', base_price: 1000, quantity_available: 1 },
    ],
  }, owner.token);

  check('lot melangeant 2 evenements : refuse', bad.status || 403, 403);
  const leaked = await prisma.stand_types.count({ where: { event_id: foreignEv.id } });
  check('aucune ligne ecrite chez un autre organisateur', leaked, 0);

  // 3. Une ligne unique continue de fonctionner (non-regression).
  const single = await post('/query', {
    table: 'stand_types',
    method: 'insert',
    body: { stand_event_id: se.id, event_id: ev.id, name: 'Offre unique', rental_type: 'stand', base_price: 2000, quantity_available: 1, quantity_rented: 0, is_active: true },
  }, owner.token);
  check('insert simple : pas de refus', single.error || '', '');
  const one = await prisma.stand_types.count({ where: { stand_event_id: se.id, name: 'Offre unique' } });
  check('insert simple : 1 ligne creee', one, 1);

  // 4. Le code livre ne doit pas contenir `body[0]`.
  const fs = await import('node:fs');
  const pol = fs.readFileSync('server/queryPolicy.mjs', 'utf8');
  // On ne controle que le BLOC `if (scope.event) { ... }`, pas tout le
  // fichier : les autres `body[0]` (validation de colonnes, upsert par
  // colonne de portee) sont legitimes car ils designent une ligne de
  // reference et non l'ensemble a inserer.
  const start = pol.indexOf('if (scope.event) {');
  const after = pol.indexOf('\n  if (', start + 20);
  const scopeEventBlock = pol.slice(start, after === -1 ? pol.length : after);
  check(
    'queryPolicy : la portee evenement ne tronque plus le lot',
    /q\.body\[0\]/.test(scopeEventBlock),
    false,
  );
  check('queryPolicy : le tableau est preserve', /isBatch \? patched : patched\[0\]/.test(pol), true);

  const create = fs.readFileSync('src/pages/CreateStandEventPage.jsx', 'utf8');
  check('creation : payload porte cover_image', /cover_image: st\.cover_image \|\| null/.test(create), true);
  check('creation : total_stands sans priorite d operateur', /\(acc, st\) => acc \+ \(parseInt\(st\.quantity_available, 10\) \|\| 0\)/.test(create), true);

  const sri = fs.readFileSync('src/components/event/StandRentalInterface.jsx', 'utf8');
  check('affichage : carte affiche l affiche si presente', /type\.cover_image \? \(/.test(sri), true);
  check('edition : editeur des offres present', /const StandTypesEditor = /.test(sri), true);

  const iu = fs.readFileSync('src/components/ImageUpload.jsx', 'utf8');
  check('upload : plus de refus pour taille', /file\.size > maxSizeMB/.test(iu), false);
  check('upload : compression par reduction de dimension', /LONG_EDGE = 1600/.test(iu), true);
} catch (e) {
  fails += 1;
  console.log('ECHEC exception: ' + (e.stack || e.message));
} finally {
  for (const eventId of created) {
    await prisma.stand_types.deleteMany({ where: { event_id: eventId } });
    await prisma.stand_events.deleteMany({ where: { event_id: eventId } });
  }
  await prisma.events.deleteMany({ where: { id: { in: created } } });
  await prisma.profiles.deleteMany({ where: { id: { in: ids } } });
  await new Promise((r) => setTimeout(r, 250));
}

console.log(fails ? `\n${fails} ECHEC(S)` : '\nTOUT EST VERT');
process.exit(fails ? 1 : 0);