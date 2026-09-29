// Brique 4 : le scan de billets appartient a l'evenement, pas au role.
//
// Mesure avant ce garde : verify_ticket_direct et reset_ticket ne recevaient
// ni acteur ni evenement, et le front (TicketScannerDialog.jsx,
// VerifyTicketPage.jsx) n'envoyait que le code du billet. Tout compte
// enregistre pouvait donc valider l'entree de n'importe quel evenement, et
// annuler un check-in avec reset_ticket.
//
// Modele valide cote metier : delegation par ORGANISATEUR, reinitialisation
// reservee a l'organisateur. Voir server/rpcPolicy.mjs (TICKET_SCAN_RPCS).
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';
const prisma = new PrismaClient();
const API = 'http://127.0.0.1:8888/api';
const PASSWORD = 'Tmp!23456789';
const INTERNAL = process.env.INTERNAL_RPC_KEY;

// La cle interne n'est PAS envoyee par defaut : resolveActor la privilegierait
// et court-circuiterait toutes les politiques, rendant les scenarios
// "anonyme" / "tiers" invalides. Elle doit etre demandee explicitement.
async function post(path, body, token, { internal = false } = {}) {
  const res = await fetch(`${API}${path}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(internal && INTERNAL ? { 'X-Internal-Key': INTERNAL } : {}),
    },
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
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label.padEnd(48)} attendu=${want} obtenu=${got}`);
};

const ids = [];
const ticketIds = [];
const verifIds = [];

try {
  const stamp = Date.now();
  let seq = 0;
  const mk = async (role) => {
    const email = `tmp-scan-${role}-${stamp}-${++seq}@test.local`;
    const r = await post('/auth/signup', { email, password: PASSWORD });
    const id = r.json?.data?.user?.id;
    if (!id) throw new Error(`inscription ${email} -> ${JSON.stringify(r.json).slice(0, 160)}`);
    ids.push(id);
    if (role !== 'user') await prisma.profiles.update({ where: { id }, data: { user_type: role } });
    const token = (await post('/auth/signin', { email, password: PASSWORD })).json?.data?.session?.access_token;
    return { id, token, email };
  };

  const A = await mk('user');   // organisateur
  const B = await mk('user');   // agent terrain
  const C = await mk('user');   // tiers sans lien
  const S = await mk('secretary');
  const D = await mk('super_admin'); // admin : regard global

  const mkEvent = (owner) => prisma.events.create({
    data: {
      title: `TMP scan ${stamp} ${owner === A.id ? 'A' : 'C'}`,
      organizer_id: owner,
      status: 'published',
      city: 'X',
      event_start_at: new Date(Date.now() + 86400000),
    },
  });
  const evA = await mkEvent(A.id);
  const evC = await mkEvent(C.id);

  const today = new Date().toISOString().slice(0, 10);
  const mkTicket = (eventId) => {
    const id = uuidv4();
    ticketIds.push(id);
    return prisma.tickets.create({
      data: {
        id,
        event_id: eventId,
        user_id: null,
        status: 'active',
        ticket_number: `TMP-SCAN-${id.slice(0, 8).toUpperCase()}`,
        ticket_code_short: id.slice(0, 8).toUpperCase(),
        qr_code: `qr-${id}`,
        ticket_date: new Date(`${today}T00:00:00.000Z`),
        entry_count: null,
        reentry_count: null,
        quantity: 1,
        total_amount_pi: 1000,
        purchase_price_pi: 1000,
        payment_method: 'coins',
        attendee_name: 'TMP Candidat',
      },
    });
  };
  const tA = await mkTicket(evA.id);
  const tC = await mkTicket(evC.id);

  const rpc = (name, args, token) => post('/rpc', { name, args }, token);
  const verify = (token, code, exitMode = false) => rpc('verify_ticket_direct', { p_ticket_identifier: code, p_verification_method: 'manual_entry', p_exit_mode: exitMode }, token);
  const reset = (token, code) => rpc('reset_ticket', { p_ticket_identifier: code }, token);
  const ticket = (id) => prisma.tickets.findUnique({ where: { id }, select: { status: true, check_in_time: true, entry_count: true } });

  // ---------- 1. anonyme ----------
  check('scan anonyme -> 401', (await verify(null, tA.ticket_number)).status, 401);
  check('reset anonyme -> 401', (await reset(null, tA.ticket_number)).status, 401);

  // ---------- 2. tiers sans delegation ----------
  check('tiers scan un billet etranger -> 403', (await verify(C.token, tA.ticket_number)).status, 403);
  check('  billet intact', (await ticket(tA.id)).check_in_time, null);
  check('tiers reinitialise un billet etranger -> 403', (await reset(C.token, tA.ticket_number)).status, 403);

  // ---------- 3. agent non encore delegue ----------
  check('agent non delegue -> 403', (await verify(B.token, tA.ticket_number)).status, 403);

  // ---------- 4. l'organisateur scanne et reinitialise ----------
  const scanOwn = await verify(A.token, tA.ticket_number);
  check('organisateur scanne son billet -> 200', scanOwn.status, 200);
  check('  entree validee', scanOwn.json?.data?.status_code, 'checkin');
  check('  billet marque utilise', (await ticket(tA.id)).status, 'used');
  // Filtrage par action : verification_time est en DateTime(0) (seconde), donc
  // l'ordre est ambigu quand plusieurs scans tombent dans la meme seconde.
  const logged = await prisma.ticket_verifications.findFirst({ where: { ticket_id: tA.id, action: 'entry' } });
  verifIds.push(logged?.id);
  check('  scan journalise', !!logged, true);
  check('  scan attribue a l\'organisateur', logged?.scanner_id, A.id);
  check('  organisateur journalise', logged?.organizer_id, A.id);

  // ---------- 5. delegation ----------
  const addBad = await rpc('add_scan_agent', { p_email: `inexistant-${stamp}@test.local` }, A.token);
  check('deleguer un email inconnu -> refus', addBad.json?.error?.code, 'AGENT_NOT_FOUND');
  const addSelf = await rpc('add_scan_agent', { p_email: A.email }, A.token);
  check('deleguer soi-meme -> refus', addSelf.json?.error?.code, 'SELF_AGENT');
  const addAgent = await rpc('add_scan_agent', { p_email: B.email }, A.token);
  check('organisateur delegue son agent -> succes', addAgent.json?.data?.success, true);
  const addTwice = await rpc('add_scan_agent', { p_email: B.email }, A.token);
  check('  delegation idempotente', addTwice.json?.data?.already, true);

  // Un agent ne peut pas creer de delegation au nom d'un tiers
  await rpc('add_scan_agent', { p_email: C.email }, B.token);
  const bAgents = await rpc('list_scan_agents', {}, B.token);
  check('l\'agent gere sa propre liste, pas celle d\'autrui', (bAgents.json?.data?.agents || []).length, 1);
  const aAgents = await rpc('list_scan_agents', {}, A.token);
  check('l\'organisateur voit son agent', (aAgents.json?.data?.agents || []).filter((x) => x.user_id === B.id).length, 1);
  const cSteal = await rpc('remove_scan_agent', { p_user_id: B.id }, C.token);
  check('un tiers ne desactive pas l\'agent de A', cSteal.json?.data?.removed, 0);
  check('  delegation toujours active', (await rpc('list_scan_agents', {}, A.token)).json?.data?.agents?.[0]?.is_active, true);

  // ---------- 6. l'agent delegue scanne ----------
  // p_exit_mode (et non p_scan_type) : le billet a ete entree par
  // l'organisateur, l'agent enregistre la sortie. L'attribution de l'agent
  // dans le journal est ainsi verifiee sur le meme billet.
  const scanAgent = await verify(B.token, tA.ticket_number, true);
  check('agent delegue scanne -> 200', scanAgent.status, 200);
  check('  sortie enregistree', scanAgent.json?.data?.status_code, 'exit_registered');
  const logged2 = await prisma.ticket_verifications.findFirst({ where: { ticket_id: tA.id, action: 'exit' } });
  verifIds.push(logged2?.id);
  check('  scan attribue a l\'agent', logged2?.scanner_id, B.id);
  check('  action enregistree', logged2?.action, 'exit');

  // ---------- 7. l'agent ne reinitialise pas ----------
  check('agent delegue : reset refuse -> 403', (await reset(B.token, tA.ticket_number)).status, 403);
  check('  billet toujours utilise', (await ticket(tA.id)).status, 'used');
  const resetOwn = await reset(A.token, tA.ticket_number);
  check('organisateur reinitialise -> 200', resetOwn.status, 200);
  check('  billet reactif', (await ticket(tA.id)).status, 'active');

  // ---------- 8. la delegation est par organisateur ----------
  check('agent ne scanne pas l\'evenement d un tiers -> 403', (await verify(B.token, tC.ticket_number)).status, 403);
  const scanC = await verify(C.token, tC.ticket_number);
  check('organisateur tiers scanne le sien -> 200', scanC.status, 200);
  check('  entree validee chez C', scanC.json?.data?.status_code, 'checkin');

  // ---------- 9. retrait de la delegation ----------
  const removed = await rpc('remove_scan_agent', { p_user_id: B.id }, A.token);
  check('organisateur retire son agent -> succes', removed.json?.data?.removed, 1);
  check('agent retire ne scanne plus -> 403', (await verify(B.token, tA.ticket_number)).status, 403);
  check('  et ne peut toujours pas reinitialiser', (await reset(B.token, tA.ticket_number)).status, 403);

  // ---------- 10. cas limites ----------
  const ghost = await verify(B.token, 'BILLET-QUI-EXISTE-PAS');
  check('billet inconnu -> pas un 403', ghost.status !== 403, true);
  check('  message du handler', ghost.json?.data?.status_code, 'not_found');
  // Billet sans evenement (event_id nullable) : la politique doit refuser en
  // mode ferme plutot que de laisser passer un evenement indeterminable.
  const noEvent = uuidv4();
  ticketIds.push(noEvent);
  await prisma.tickets.create({ data: { id: noEvent, status: 'active', ticket_number: 'TMP-SCAN-ORPHELIN', ticket_date: new Date(`${today}T00:00:00.000Z`) } });
  check('billet sans evenement -> 403', (await verify(A.token, `TMP-SCAN-ORPHELIN`)).status, 403);

  // ---------- 11. la cle interne n'ouvre pas la gestion ----------
  const internalAgents = await post('/rpc', { name: 'add_scan_agent', args: { p_email: B.email } }, null, { internal: true });
  check('cle interne ne gere pas les agents', internalAgents.json?.error?.code, 'NO_ORGANIZER');
  const secretaryScan = await verify(S.token, tA.ticket_number);
  check('un secretaire n\'est pas.scanneur de cet evenement -> 403', secretaryScan.status, 403);

  // ---------- 12. vue consolidée réservée à l'administration ----------
  check('admin_list_scan_agents refusé à un non-admin -> 403', (await rpc('admin_list_scan_agents', {}, B.token)).status, 403);
  const adminView = await rpc('admin_list_scan_agents', {}, D.token);
  check('super_admin liste les délégations -> 200', adminView.status, 200);
  const mine = (adminView.json?.data?.agents || []).filter((x) => x.organizer_id === A.id && x.user_id === B.id);
  check('  délégation A→B visible', mine.length, 1);
  check('  agent présent avec profil', mine[0]?.agent?.email, B.email);
  check('  organisateur présent avec profil', mine[0]?.organizer?.email, A.email);
  check('  gracieur présent avec profil', mine[0]?.granted_by_profile?.email, A.email);
  check('  délégation marquée inactive (retirée)', mine[0]?.is_active, false);
  const adminSum = await rpc('admin_list_scan_agents', {}, D.token);
  check('  active_count reflète l\'état', adminSum.json?.data?.active_count, adminSum.json?.data?.agents.filter((x) => x.is_active).length);

  // ---------- 13. identité résolue même pour déjà entré / déjà sorti ----------
  // Un billet acheté en ligne n'a pas always attendee_name/phone : l'identité
  // est le profil lié (tickets.user_id). Le scan « déjà à l'intérieur » /
  // « déjà sorti » doit afficher le nom complet et le contact, pas « Inconnu ».
  await prisma.profiles.update({ where: { id: B.id }, data: { full_name: 'Agent Scan NomComplet', phone: '+22500001111' } });
  const idOwner = uuidv4();
  ticketIds.push(idOwner);
  await prisma.tickets.create({
    data: {
      id: idOwner,
      event_id: evA.id,
      user_id: B.id,
      status: 'active',
      ticket_number: `TMP-SCAN-OWN-${idOwner.slice(0, 8).toUpperCase()}`,
      ticket_code_short: idOwner.slice(0, 8).toUpperCase(),
      qr_code: `qr-own-${idOwner}`,
      ticket_date: new Date(`${today}T00:00:00.000Z`),
      quantity: 1,
      total_amount_pi: 1000,
      purchase_price_pi: 1000,
      payment_method: 'coins',
    },
  });
  const ownTicket = `TMP-SCAN-OWN-${idOwner.slice(0, 8).toUpperCase()}`;
  const firstIn = await verify(A.token, ownTicket);
  check('entrée (checkin) -> nom complet résolu', firstIn.json?.data?.attendee_name, 'Agent Scan NomComplet');
  check('  contact résolu', firstIn.json?.data?.phone, '+22500001111');
  check('  message accentué intact', firstIn.json?.data?.message, 'Entrée validée');
  check('  entrées après checkin', firstIn.json?.data?.entry_count, 1);
  const inside = await verify(A.token, ownTicket);
  check('déjà à l\'intérieur -> 200', inside.status, 200);
  check('  nom complet affiché', inside.json?.data?.attendee_name, 'Agent Scan NomComplet');
  check('  contact affiché', inside.json?.data?.phone, '+22500001111');
  check('  message accentué intact', inside.json?.data?.message, "Déjà à l'intérieur");
  check('  entrées affichées', inside.json?.data?.entry_count, 1);
  const exit1 = await verify(A.token, ownTicket, true);
  check('sortie enregistrée -> 200', exit1.status, 200);
  const exit2 = await verify(A.token, ownTicket, true);
  check('déjà sorti -> 200', exit2.status, 200);
  check('  code', exit2.json?.data?.status_code, 'already_exited');
  check('  nom complet affiché', exit2.json?.data?.attendee_name, 'Agent Scan NomComplet');
  check('  contact affiché', exit2.json?.data?.phone, '+22500001111');
  check('  message accentué intact', exit2.json?.data?.message, 'Déjà sorti');

  console.log(fails === 0 ? '\nTOUT EST VERT' : `\n${fails} ECHEC(S)`);
} catch (e) {
  console.log('ERREUR:', String(e?.message || e).trim().slice(0, 300));
  fails += 1;
} finally {
  for (const id of verifIds.filter(Boolean)) await prisma.ticket_verifications.deleteMany({ where: { id } });
  for (const id of ticketIds.filter(Boolean)) await prisma.ticket_verifications.deleteMany({ where: { ticket_id: id } });
  for (const id of ticketIds.filter(Boolean)) await prisma.tickets.deleteMany({ where: { id } });
  for (const id of ids.filter(Boolean)) {
    await prisma.organizer_scan_agents.deleteMany({ where: { organizer_id: id } });
    await prisma.organizer_scan_agents.deleteMany({ where: { user_id: id } });
    await prisma.profiles.deleteMany({ where: { id } });
    await prisma.auth_users.deleteMany({ where: { id } });
  }
  const tmpEvents = await prisma.events.findMany({ where: { title: { startsWith: 'TMP scan' } }, select: { id: true } });
  for (const e of tmpEvents) await prisma.events.deleteMany({ where: { id: e.id } });
  await prisma.profiles.deleteMany({ where: { email: { startsWith: 'tmp-' } } });
  await prisma.auth_users.deleteMany({ where: { email: { startsWith: 'tmp-' } } });
  console.log(`nettoyage: comptes tmp restants = ${await prisma.profiles.count({ where: { email: { startsWith: 'tmp-' } } })} | evenements TMP restants = ${await prisma.events.count({ where: { title: { startsWith: 'TMP scan' } } })}`);
  await prisma.$disconnect();
  process.exit(fails === 0 ? 0 : 1);
}
