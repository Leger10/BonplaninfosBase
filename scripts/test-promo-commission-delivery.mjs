// Garantie demandée : « après débit de pièces OU validation USSD par le
// super admin / secrétaire, l'influenceur reçoit sa commission ET le billet
// est créé pour le client ».
//
// Ce test couvre les DEUX parcours avec un code promo événementiel :
//   A) Parcours « pièces » (purchase_tickets_v2) : débit du portefeuille,
//      billet créé, commission influenceur créditée, journal d'usage écrit.
//   B) Parcours USSD (submit puis validate par un secrétaire) : la remise est
//      appliquée et validée côté serveur, le billet n'est livré qu'à la
//      validation, la commission influenceur est alors créditée, le journal
//      d'usage est écrit.
//
// Régression couverte :
//   - « 0 FCFA » sur « Mes gains premium » : les stats lisent
//     promo_code_usages, qui n'était alimenté par AUCUN parcours.
//   - commission influenceur absente de la validation USSD.
//   - remise code promo non appliquée côté serveur USSD (montant attendu en
//     prix plein alors que le front envoie le montant remisé).
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const PORT = process.env.PROMO_TEST_PORT || 8888;
const BASE = `http://127.0.0.1:${PORT}`;
const PASSWORD = 'Tmp!23456789';
const PROOF = `${BASE}/storage/v1/object/public/media/ussd_proofs/TEST-PNG.png`;

async function post(path, body, token) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = {}; }
  return { status: res.status, json };
}
async function rpc(name, args, token) {
  const res = await fetch(`${BASE}/api/rpc`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    body: JSON.stringify({ name, args }),
  });
  const text = await res.text();
  let json; try { json = JSON.parse(text); } catch { json = {}; }
  return json;
}

let fails = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fails += 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label.padEnd(56)} attendu=${want} obtenu=${got}`);
};

const ids = [];
const created = { promos: [], configs: [], events: [], ticketTypes: [], payments: [], orderIds: [] };

try {
  const stamp = Date.now();
  let seq = 0;
  const mk = async (role) => {
    const email = `tmp-promo-${stamp}-${++seq}@test.local`;
    const r = await post('/api/auth/signup', { email, password: PASSWORD });
    const id = r.json?.data?.user?.id;
    if (!id) throw new Error(`inscription ${email} -> HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
    ids.push(id);
    const token = (await post('/api/auth/signin', { email, password: PASSWORD })).json?.data?.session?.access_token;
    if (role) await prisma.profiles.update({ where: { id }, data: { user_type: role } });
    return { id, token, email };
  };

  const organizer = await mk('organizer');
  const influencer = await mk('influencer');
  const buyerCoins = await mk(null);       // acheteur parcours pièces
  const buyerUssd = await mk(null);         // acheteur parcours USSD
  const secretary = await mk('secretary');  // validation par secrétaire
  const superAdmin = await mk('super_admin'); // validation par super admin

  // ---------- Événement + type de billet + config promo ----------
  const eventId = crypto.randomUUID();
  created.events.push(eventId);
  await prisma.events.create({
    data: {
      id: eventId, title: 'TMP promo commission', organizer_id: organizer.id,
      event_start_at: new Date(Date.now() + 86400000), status: 'published', is_sales_closed: false,
      city: 'Ouagadougou', country: 'Burkina Faso', event_type: 'ticketing', is_active: true,
    },
  });
  const ttId = crypto.randomUUID();
  created.ticketTypes.push(ttId);
  const PRICE_COINS = 100; // 1000 FCFA
  await prisma.ticket_types.create({
    data: { id: ttId, event_id: eventId, name: 'TMP Adulte', price: PRICE_COINS * 10, price_coins: PRICE_COINS, price_pi: PRICE_COINS, quantity_available: 50, quantity_sold: 0, is_active: true },
  });
  const cfgId = crypto.randomUUID();
  created.configs.push(cfgId);
  await prisma.event_promo_config.create({
    data: { id: cfgId, event_id: eventId, enabled: true, discount_type: 'percentage', discount_value: 20, commission_rate: 30, usage_limit: null },
  });

  const code = `T${stamp}`.replace(/[^A-Z0-9]/g, '').slice(0, 12);
  const promoId = crypto.randomUUID();
  created.promos.push(promoId);
  await prisma.promo_codes.create({
    data: { id: promoId, code, event_id: eventId, influencer_id: influencer.id, is_active: true, usage_count: 0, usage_limit: null },
  });

  const balance = async (id) => (await prisma.profiles.findUnique({ where: { id }, select: { coin_balance: true } })).coin_balance || 0;
  // Source de vérité de la commission : la ligne `organizer_earnings`
  // (earning_type = promo_commission). C'est elle que lisent « Mes gains »
  // et le portefeuille gains. `profiles.total_earnings` n'est PAS un
  // compteur fiable (il ne correspond pas à la somme des gains).
  const earnings = async (id) => (await prisma.organizer_earnings.findMany({ where: { organizer_id: id, transaction_type: 'promo_commission' } }));
  const usageRows = async () => prisma.promo_code_usages.findMany({ where: { promo_code_id: promoId } });
  const coinsOf = (row) => Number(row?.earnings_coins || 0);

  // =========================================================
  // A) PARCOURS PIÈCES — débit du portefeuille
  // =========================================================
  console.log('\n--- A) Parcours pièces (purchase_tickets_v2) ---');
  await prisma.profiles.update({ where: { id: buyerCoins.id }, data: { coin_balance: 500 } });
  const balBuyerCoins0 = await balance(buyerCoins.id);

  const purchase = await rpc('purchase_tickets_v2', {
    p_user_id: buyerCoins.id, p_event_id: eventId, p_cart: { [ttId]: 1 },
    p_final_amount: PRICE_COINS, p_promo_code_id: promoId,
    p_commission_amount: 0, p_payment_method: 'coins',
    p_transaction_reference: null, p_attendee_name: 'TMP Acheteur Pieces',
  }, buyerCoins.token);
  check('achat pièces réussi', purchase?.data?.success, true);
  const orderCoins = purchase?.data?.transaction_reference;
  if (!orderCoins) throw new Error('purchase_tickets_v2 n\'a pas renvoyé de référence : ' + JSON.stringify(purchase).slice(0, 300));
  created.orderIds.push(orderCoins);

  // Le billet existe pour le client
  const ticketCoins = await prisma.tickets.findFirst({ where: { transaction_reference: orderCoins, user_id: buyerCoins.id } });
  check('billet créé pour le client', !!ticketCoins, true);
  const mirrorCoins = await prisma.event_tickets.findFirst({ where: { transaction_reference: orderCoins, user_id: buyerCoins.id } });
  check('miroir event_tickets créé (Mes billets)', !!mirrorCoins, true);

  // Débit : 100 pièces - 20% = 80
  check('portefeuille débité du net (80)', await balance(buyerCoins.id), balBuyerCoins0 - 80);
  // Commission influenceur : 30% de la BASE 100 = 30 pièces
  const coinsPathEarnings = await earnings(influencer.id);
  check('commission influenceur créditée (ligne promo_commission)', coinsPathEarnings.length, 1);
  check('  commission = 30 pièces (30% de 100)', coinsOf(coinsPathEarnings[0]), 30);

  // Journal d'usage -> c'est ce que lit « Mes gains premium »
  const usagesAfterCoins = await usageRows();
  check('journal promo_code_usages écrit (stats « gains »)', usagesAfterCoins.length, 1);
  check('  commission_amount dans le journal', Number(usagesAfterCoins[0]?.commission_amount) || 0, 30);
  check('  discount_amount dans le journal', Number(usagesAfterCoins[0]?.discount_amount) || 0, 20);
  const promoAfterCoins = await prisma.promo_codes.findUnique({ where: { id: promoId }, select: { usage_count: true } });
  check('  usage_count incrémenté', Number(promoAfterCoins?.usage_count) || 0, 1);

  // =========================================================
  // B) PARCOURS USSD — remise validée serveur, livraison + commission à la validation
  // =========================================================
  console.log('\n--- B) Parcours USSD (submit puis validation secrétaire) ---');
  const orderUssd = `tmp_ussd_${stamp}_${++seq}`;
  created.orderIds.push(orderUssd);
  // Le front envoie le montant NET (base - 20%) = 80 pièces = 800 FCFA
  const submit = await post('/.netlify/functions/ussd-payment', {
    action: 'submit', type: 'tickets', proofDataUrl: PROOF,
    amountFcfa: 800, phone: '+22670000002', transactionId: orderUssd,
    userId: buyerUssd.id, eventId, cart: { [ttId]: 1 }, cartTotalFcfa: 800,
    attendeeName: 'TMP Acheteur USSD', promoCodeId: promoId, isGuest: false, userEmail: buyerUssd.email,
  }, buyerUssd.token);
  check('submit USSD avec code promo accepté (montant remisé)', submit.status, 200);
  check('  en attente de validation', submit.json?.pending_validation === true, true);

  const paymentUssd = await prisma.payments.findFirst({ where: { transaction_id: orderUssd }, orderBy: { created_at: 'desc' } });
  if (!paymentUssd) throw new Error('paiement USSD absent : ' + JSON.stringify(submit.json).slice(0, 300));
  created.payments.push(paymentUssd.id);
  check('  paiement au NET (80 pièces)', Number(paymentUssd.coins_amount) || 0, 80);
  check('  coupon_code = promo code', paymentUssd.coupon_code, promoId);

  // Avant validation : billet en attente, PAS de commission encore
  const ticketBefore = await prisma.tickets.findFirst({ where: { transaction_reference: orderUssd } });
  check('billet en attente avant validation', ticketBefore?.status, 'pending');
  const earningsBefore = await earnings(influencer.id);
  check('pas de commission avant validation', earningsBefore.length, 1);

  // Un utilisateur non-admin ne peut pas valider
  const badVal = await post('/.netlify/functions/ussd-payment', { action: 'validate', paymentId: paymentUssd.id, actorId: buyerUssd.id, depositVerified: true });
  check('validation par un non-admin refusée', badVal.status, 403);

  // Validation par le SECRÉTAIRE
  const val = await post('/.netlify/functions/ussd-payment', { action: 'validate', paymentId: paymentUssd.id, actorId: secretary.id, depositVerified: true });
  check('validation par secrétaire -> 200', val.status, 200);

  // Billet livré pour le client
  const ticketAfter = await prisma.tickets.findFirst({ where: { transaction_reference: orderUssd, user_id: buyerUssd.id } });
  check('billet livré (actif) après validation', ticketAfter?.status, 'active');
  const mirrorAfter = await prisma.event_tickets.findFirst({ where: { transaction_reference: orderUssd, user_id: buyerUssd.id } });
  check('miroir event_tickets actif après validation', mirrorAfter?.status, 'active');

  // Commission influenceur créditée à la validation
  const earningsAfter = await earnings(influencer.id);
  check('commission influenceur créditée à la validation USSD', earningsAfter.length, 2);
  const ussdEarning = earningsAfter.find((e) => e.transaction_id === orderUssd);
  check('  commission USSD = 30 pièces (30% de la base 100)', coinsOf(ussdEarning), 30);
  check('  commission USSD imputée au bon influenceur', ussdEarning?.organizer_id, influencer.id);

  // Organisateur crédité sur le NET
  const orgSale = await prisma.organizer_earnings.findFirst({ where: { transaction_id: orderUssd, transaction_type: 'ticket_sale' } });
  check('gains organisateur = net encaissé (80 pièces)', coinsOf(orgSale), 80);

  // Journal d'usage pour le parcours USSD aussi
  const usagesAfterUssd = await usageRows();
  check('journal promo_code_usages écrit pour USSD', usagesAfterUssd.length, 2);
  const usageUssd = usagesAfterUssd.find((u) => String(u.transaction_id) === orderUssd);
  check('  commission USSD dans le journal', Number(usageUssd?.commission_amount) || 0, 30);
  check('  remise USSD dans le journal', Number(usageUssd?.discount_amount) || 0, 20);
  const promoAfterUssd = await prisma.promo_codes.findUnique({ where: { id: promoId }, select: { usage_count: true } });
  check('  usage_count = 2 après les deux parcours', Number(promoAfterUssd?.usage_count) || 0, 2);

  // =========================================================
  // C) REJEU DE LA VALIDATION — idempotence
  // =========================================================
  console.log('\n--- C) Rejeu de la validation (double-clic admin) ---');
  const replay = await post('/.netlify/functions/ussd-payment', { action: 'validate', paymentId: paymentUssd.id, actorId: superAdmin.id, depositVerified: true });
  check('rejeu de validation accepté', [200, 400, 409].includes(replay.status), true);
  const earningsReplay = await earnings(influencer.id);
  check('  pas de double commission', earningsReplay.length, 2);
  check('  total commission toujours 60 pièces', earningsReplay.reduce((s, e) => s + coinsOf(e), 0), 60);
  const usagesReplay = await usageRows();
  check('  pas de double journal d\'usage', usagesReplay.length, 2);
  const promoReplay = await prisma.promo_codes.findUnique({ where: { id: promoId }, select: { usage_count: true } });
  check('  usage_count inchangé après rejeu', Number(promoReplay?.usage_count) || 0, 2);

  // =========================================================
  // D) VALIDATION PAR UN SUPER ADMIN
  // =========================================================
  console.log('\n--- D) Parcours USSD validé par un super admin ---');
  const orderAdmin = `tmp_ussd_admin_${stamp}_${++seq}`;
  created.orderIds.push(orderAdmin);
  const submitAdmin = await post('/.netlify/functions/ussd-payment', {
    action: 'submit', type: 'tickets', proofDataUrl: PROOF,
    amountFcfa: 800, phone: '+22670000003', transactionId: orderAdmin,
    userId: buyerUssd.id, eventId, cart: { [ttId]: 1 }, cartTotalFcfa: 800,
    attendeeName: 'TMP Acheteur USSD Admin', promoCodeId: promoId, isGuest: false, userEmail: buyerUssd.email,
  }, buyerUssd.token);
  check('submit USSD (2e commande) accepté', submitAdmin.status, 200);
  const payAdmin = await prisma.payments.findFirst({ where: { transaction_id: orderAdmin }, orderBy: { created_at: 'desc' } });
  if (payAdmin) created.payments.push(payAdmin.id);
  const valAdmin = await post('/.netlify/functions/ussd-payment', { action: 'validate', paymentId: payAdmin?.id, actorId: superAdmin.id, depositVerified: true });
  check('validation par super admin -> 200', valAdmin.status, 200);
  const ticketAdmin = await prisma.tickets.findFirst({ where: { transaction_reference: orderAdmin, user_id: buyerUssd.id } });
  check('billet livré après validation super admin', ticketAdmin?.status, 'active');
  const mirrorAdmin = await prisma.event_tickets.findFirst({ where: { transaction_reference: orderAdmin, user_id: buyerUssd.id } });
  check('miroir event_tickets actif (super admin)', mirrorAdmin?.status, 'active');
  const earningsAdmin = await earnings(influencer.id);
  check('commission créditée à la validation super admin', earningsAdmin.length, 3);
  const adminEarning = earningsAdmin.find((e) => e.transaction_id === orderAdmin);
  check('  commission super admin = 30 pièces', coinsOf(adminEarning), 30);
  const usagesAdmin = await usageRows();
  check('  journal d\'usage pour la commande super admin', usagesAdmin.length, 3);
  const promoAdmin = await prisma.promo_codes.findUnique({ where: { id: promoId }, select: { usage_count: true } });
  check('  usage_count = 3 après les trois parcours', Number(promoAdmin?.usage_count) || 0, 3);

  console.log(fails === 0 ? '\nTOUT EST VERT' : `\n${fails} ECHEC(S)`);
} catch (e) {
  console.log('ERREUR:', String(e?.message || e).trim().slice(0, 500));
  fails += 1;
} finally {
  for (const oid of created.orderIds.filter(Boolean)) {
    await prisma.event_tickets.deleteMany({ where: { transaction_reference: oid } });
    await prisma.tickets.deleteMany({ where: { transaction_reference: oid } });
    await prisma.organizer_earnings.deleteMany({ where: { transaction_id: oid } });
    await prisma.transactions.deleteMany({ where: { transaction_reference: oid } });
  }
  for (const pid of created.payments.filter(Boolean)) {
    await prisma.transactions.deleteMany({ where: { transaction_reference: pid } });
    await prisma.payments.deleteMany({ where: { id: pid } });
  }
  for (const p of created.promos.filter(Boolean)) {
    await prisma.promo_code_usages.deleteMany({ where: { promo_code_id: p } });
    await prisma.promo_codes.deleteMany({ where: { id: p } });
  }
  for (const id of ids.filter(Boolean)) {
    await prisma.organizer_earnings.deleteMany({ where: { organizer_id: id } });
    await prisma.transactions.deleteMany({ where: { user_id: id } });
    await prisma.profiles.deleteMany({ where: { id } });
    await prisma.auth_users.deleteMany({ where: { id } });
  }
  for (const cfg of created.configs.filter(Boolean)) await prisma.event_promo_config.deleteMany({ where: { id: cfg } });
  for (const tt of created.ticketTypes.filter(Boolean)) await prisma.ticket_types.deleteMany({ where: { id: tt } });
  for (const ev of created.events.filter(Boolean)) await prisma.events.deleteMany({ where: { id: ev } });
  console.log(`nettoyage: comptes tmp = ${ids.filter(Boolean).length}`);
  await prisma.$disconnect();
  process.exit(fails === 0 ? 0 : 1);
}
