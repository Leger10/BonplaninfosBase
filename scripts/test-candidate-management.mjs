// Deux besoins joints, un seul test.
//
// 1. L'organisateur doit pouvoir gerer les candidats de son concours APRES la
//    creation (ajouter / modifier / retirer). `candidates` est dans
//    OWNER_SCOPES : le serveur refuse toute ligne dont l'event_id n'est pas a
//    l'appelant. Ce test verrouille ce comportement, y compris le refus sur
//    l'evenement d'autrui.
//
// 2. La correction du CLASSEMENT d'un concours payant est reservee au
//    super_admin (rpcPolicy : correct_candidate_votes / increment_vote_count en
//    `roles: SUPER`). Ni admin, ni secretaire, ni l'organisateur lui-meme ne
//    peuvent modifier un total de voix. Chaque correction est journalisee.
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
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label.padEnd(60)} attendu=${want} obtenu=${got}`);
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
const evIds = [];
let seq = 0;

const mk = async (role) => {
  const email = `tmp-cand-${role}-${stamp}-${++seq}@test.local`;
  const r = await post('/auth/signup', { email, password: PASSWORD });
  const id = r.json?.data?.user?.id;
  if (!id) throw new Error(`inscription ${role} -> HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 160)}`);
  ids.push(id);
  if (role) await prisma.profiles.update({ where: { id }, data: { user_type: role, coin_balance: 500 } });
  return { id, email, token: (await post('/auth/signin', { email, password: PASSWORD })).json?.data?.session?.access_token };
};

const mkEvent = async (organizerId, title) => {
  const id = crypto.randomUUID();
  evIds.push(id);
  await prisma.events.create({ data: {
    id, title, city: 'CI', country: "Côte d'Ivoire",
    organizer_id: organizerId, event_type: 'voting', status: 'active', is_active: true,
    price_pi: 100, price_fcfa: 1000,
    event_start_at: new Date(Date.now() + 86400000), event_end_at: new Date(Date.now() + 172800000),
  }});
  return id;
};

try {
  const A = await mk('user');        // organisateur
  const B = await mk('user');        // organisateur concurrent
  const S = await mk('secretary');
  const AD = await mk('admin');
  const SU = await mk('super_admin');

  const evA = await mkEvent(A.id, `TMP q cand ${stamp} A`);
  const evB = await mkEvent(B.id, `TMP q cand ${stamp} B`);

  // ---------- 1. ajout de candidat apres creation ----------
  const ins = await q({ table: 'candidates', method: 'insert', body: {
    event_id: evA, name: 'Candidat Ajoute', description: 'presente', category: 'Finale',
    vote_count: 0, created_at: new Date().toISOString(),
  }}, A.token);
  check('organisateur AJOUTE un candidat -> 200', ins.status, 200);
  const cid = ins.json?.data?.[0]?.id;
  check('  le candidat existe en base', await prisma.candidates.count({ where: { id: cid } }), 1);
  check('  vote_count initial a 0', (await prisma.candidates.findUnique({ where: { id: cid }, select: { vote_count: true } }))?.vote_count, 0);

  // ---------- 2. edition ----------
  const upd = await q({ table: 'candidates', method: 'update', filters: [{ column: 'id', op: 'eq', value: cid }], body: { name: 'Candidat Renomme', category: 'Demi-finale' }}, A.token);
  check('organisateur MODIFIE le candidat -> 200', upd.status, 200);
  const row = await prisma.candidates.findUnique({ where: { id: cid } });
  check('  nom mis a jour', row?.name, 'Candidat Renomme');
  check('  categorie mise a jour', row?.category, 'Demi-finale');

  // ---------- 3. l'organisateur ne touche pas au total de voix ----------
  // Un candidat ne peut pas arriver en course avec des voix : le serveur
  // impose 0 à l'insertion, quelle que soit la valeur envoyée.
  const rigged = await q({ table: 'candidates', method: 'insert', body: {
    event_id: evA, name: 'Candidat Rigole', vote_count: 9999, created_at: new Date().toISOString(),
  }}, A.token);
  check('insertion avec vote_count: 9999 -> acceptee', rigged.status, 200);
  const riggedId = rigged.json?.data?.[0]?.id;
  check('  mais le score est force a 0', (await prisma.candidates.findUnique({ where: { id: riggedId }, select: { vote_count: true } }))?.vote_count, 0);
  await q({ table: 'candidates', method: 'delete', filters: [{ column: 'id', op: 'eq', value: riggedId }] }, A.token);

  // Et il ne peut pas non plus modifier un total existant.
  const seeded = await prisma.candidates.create({ data: { event_id: evA, name: 'Candidat Fige', vote_count: 120, created_at: new Date() }});
  const bump = await q({ table: 'candidates', method: 'update', filters: [{ column: 'id', op: 'eq', value: seeded.id }], body: { vote_count: 9999 }}, A.token);
  check('organisateur ecrit vote_count -> 403', bump.status, 403);
  check('  total intact', (await prisma.candidates.findUnique({ where: { id: seeded.id }, select: { vote_count: true } }))?.vote_count, 120);

  // ---------- 4. perimetre : rien sur l'evenement d'autrui ----------
  const cross = await q({ table: 'candidates', method: 'insert', body: {
    event_id: evB, name: 'Intrus', vote_count: 0, created_at: new Date().toISOString(),
  }}, A.token);
  check('ajout sur l evenement d autrui -> refuse', cross.status, 403);
  check('  aucun candidat cree chez B', await prisma.candidates.count({ where: { event_id: evB, name: 'Intrus' } }), 0);

  const cb = await prisma.candidates.create({ data: { event_id: evB, name: 'Candidat B', vote_count: 5, created_at: new Date() }});
  const crossUpd = await q({ table: 'candidates', method: 'update', filters: [{ column: 'id', op: 'eq', value: cb.id }], body: { name: 'Vole' }}, A.token);
  check('edition du candidat d autrui -> sans effet', (await prisma.candidates.findUnique({ where: { id: cb.id }, select: { name: true } }))?.name, 'Candidat B');
  const crossDel = await q({ table: 'candidates', method: 'delete', filters: [{ column: 'id', op: 'eq', value: cb.id }] }, A.token);
  check('suppression du candidat d autrui -> sans effet', await prisma.candidates.count({ where: { id: cb.id } }), 1);
  void crossUpd; void crossDel;

  // ---------- 5. suppression par le proprietaire ----------
  const del = await q({ table: 'candidates', method: 'delete', filters: [{ column: 'id', op: 'eq', value: cid }] }, A.token);
  check('organisateur RETIRE le candidat -> 200', del.status, 200);
  check('  candidat disparu', await prisma.candidates.count({ where: { id: cid } }), 0);

  // ---------- 6. correction de voix : SUPER_ADMIN seulement ----------
  const cand = await prisma.candidates.create({ data: { event_id: evA, name: 'Candidat Vote', vote_count: 100, created_at: new Date() }});

  const asUser = await rpc('correct_candidate_votes', { p_candidate_id: cand.id, p_delta: 500, p_reason: 'je gagne' }, A.token);
  check('un utilisateur simple ne corrige pas -> refuse', asUser.status, 403);
  const asOrganizer = await rpc('correct_candidate_votes', { p_candidate_id: cand.id, p_delta: 500 }, A.token);
  check("l'organisateur de SON concours ne corrige pas -> refuse", asOrganizer.status, 403);
  const asSec = await rpc('correct_candidate_votes', { p_candidate_id: cand.id, p_delta: 500 }, S.token);
  check('le secretaire ne corrige pas -> refuse', asSec.status, 403);
  const asAdmin = await rpc('correct_candidate_votes', { p_candidate_id: cand.id, p_delta: 500 }, AD.token);
  check("l'admin de zone ne corrige pas -> refuse", asAdmin.status, 403);
  check('  total intact apres 4 refus', (await prisma.candidates.findUnique({ where: { id: cand.id }, select: { vote_count: true } }))?.vote_count, 100);

  // l'ancien increment_vote_count doit suivre la meme regle
  const legacy = await rpc('increment_vote_count', { candidate_id_to_inc: cand.id, inc_amount: 500 }, AD.token);
  check('increment_vote_count (ancien nom) refuse a l admin -> 403', legacy.status, 403);

  // le super_admin, lui, passe
  const asSuper = await rpc('correct_candidate_votes', { p_candidate_id: cand.id, p_delta: 250, p_reason: 'Correction d un bug de comptage' }, SU.token);
  check('le super_admin corrige -> 200', asSuper.status, 200);
  check('  total augmente de 250', (await prisma.candidates.findUnique({ where: { id: cand.id }, select: { vote_count: true } }))?.vote_count, 350);

  // retrait de voix
  const minus = await rpc('correct_candidate_votes', { p_candidate_id: cand.id, p_delta: -50, p_reason: 'double comptage' }, SU.token);
  check('le super_admin RETIRE des voix -> 200', minus.status, 200);
  check('  total redescendu a 300', (await prisma.candidates.findUnique({ where: { id: cand.id }, select: { vote_count: true } }))?.vote_count, 300);

  // journalisation
  const logs = await prisma.admin_logs.findMany({ where: { action_type: 'candidate_votes_corrected' }, select: { actor_id: true, target_id: true, details: true }});
  check('correction journalisee (2 entrées)', logs.length, 2);
  const parsed = logs.map((l) => JSON.parse(l.details || '{}'));
  check('  journal porte l auteur', logs.every((l) => l.actor_id === SU.id), true);
  check('  journal porte le motif', parsed.some((d) => d.reason === 'Correction d un bug de comptage'), true);
  check('  journal porte le delta', parsed.some((d) => d.delta === 250 && d.before === 100 && d.after === 350), true);
  check('  journal porte l evenement', parsed.every((d) => d.event_id === evA), true);

  // garde-fous
  const zero = await rpc('correct_candidate_votes', { p_candidate_id: cand.id, p_delta: 0 }, SU.token);
  check('delta nul -> refuse', zero.json?.error?.code, 'BAD_REQUEST');
  const neg = await rpc('correct_candidate_votes', { p_candidate_id: cand.id, p_delta: -99999 }, SU.token);
  check('delta sous zero -> refuse', neg.json?.error?.code, 'NEGATIVE_COUNT');
  check('  total toujours 300', (await prisma.candidates.findUnique({ where: { id: cand.id }, select: { vote_count: true } }))?.vote_count, 300);
  const ghost = await rpc('correct_candidate_votes', { p_candidate_id: '00000000-0000-0000-0000-000000000000', p_delta: 5 }, SU.token);
  check('candidat inexistant -> NOT_FOUND', ghost.json?.error?.code, 'NOT_FOUND');

  // la correction ne doit toucher NI l'historique des votants NI l'argent
  const voteRows = await prisma.user_votes.count({ where: { candidate_id: cand.id } });
  check("la correction n'ecrit aucun user_votes", voteRows, 0);

  console.log(fails === 0 ? '\nTOUT EST VERT' : `\n${fails} ECHEC(S)`);
} catch (e) {
  console.log('ERREUR:', String(e?.message || e).trim().slice(0, 300));
  fails += 1;
} finally {
  await prisma.candidates.deleteMany({ where: { event_id: { in: evIds } } });
  await prisma.admin_logs.deleteMany({ where: { action_type: 'candidate_votes_corrected' } });
  await prisma.events.deleteMany({ where: { id: { in: evIds } } });
  for (const id of ids) {
    await prisma.profiles.deleteMany({ where: { id } });
    await prisma.auth_users.deleteMany({ where: { id } });
  }
  await prisma.auth_users.deleteMany({ where: { email: { startsWith: 'tmp-cand-' } } });
  await prisma.profiles.deleteMany({ where: { email: { startsWith: 'tmp-cand-' } } });
  const lp = await prisma.profiles.count({ where: { email: { startsWith: 'tmp-cand-' } } });
  const le = await prisma.events.count({ where: { title: { startsWith: 'TMP q cand' } } });
  const lc = await prisma.candidates.count({ where: { event_id: { in: evIds } } });
  console.log(`nettoyage: comptes tmp restants = ${lp} | evenements TMP q restants = ${le} | candidats restants = ${lc}`);
  await prisma.$disconnect();
  process.exit(fails === 0 ? 0 : 1);
}
