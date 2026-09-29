// Parcours E2E complet de l'application, via l'API réelle sur 8888 :
//   auth (signup/signin) -> événement + types de billets
//   -> billetterie purchase_tickets_v2 (promo comprise, stock, SOLDE)
//   -> doublon de commande / solde insuffisant
//   -> coupon (credit_coupon_earnings) + journal promo (process_promo_usage)
//   -> lecture "mes billets" (/api/query) + scan verify_ticket_direct
//   -> tombola : achat purchase_raffle_tickets puis conduct_raffle_draw
// Tout est créé en TMP et nettoyé (0 résidu attendu).
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
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label.padEnd(50)} attendu=${want} obtenu=${got}`);
};

const stamp = Date.now();
const eventId = uuidv4();
const raffleId = uuidv4();
const vipTypeId = uuidv4();
const promoCodeId = uuidv4();
const couponCode = `E2E${stamp.toString().slice(-5)}`;
const orderRef = `TKT-E2E-${stamp}`;
const refs = [orderRef];
const userIds = [];
try {
  // ================= 1. AUTH =================
  const org = await post('/auth/signup', { email: `tmp-e2e-org-${stamp}@test.local`, password: PASSWORD });
  const buyer = await post('/auth/signup', { email: `tmp-e2e-buy-${stamp}@test.local`, password: PASSWORD });
  const orgId = org.json?.data?.user?.id;
  const buyerId = buyer.json?.data?.user?.id;
  userIds.push(orgId, buyerId);
  check('auth : signup organisateur', !!orgId, true);
  check('auth : signup acheteur', !!buyerId, true);

  const tOrg = (await post('/auth/signin', { email: `tmp-e2e-org-${stamp}@test.local`, password: PASSWORD })).json?.data?.session?.access_token;
  const tBuyer = (await post('/auth/signin', { email: `tmp-e2e-buy-${stamp}@test.local`, password: PASSWORD })).json?.data?.session?.access_token;
  check('auth : signin organisateur -> token', !!tOrg, true);
  check('auth : signin acheteur -> token', !!tBuyer, true);

  const rpc = (name, args, token) => post('/rpc', { name, args }, token);
  const errCode = (r) => r.json?.error?.code || String(r.status);

  // ================= 2. ORGANISATEUR : ÉVÉNEMENT + BILLETTERIE =================
  await prisma.events.create({ data: { id: eventId, title: `TMP E2E ${stamp}`, organizer_id: orgId, status: 'published', city: 'CI', event_start_at: new Date(Date.now() + 86400000) } });
  await prisma.ticket_types.create({ data: { id: vipTypeId, event_id: eventId, name: 'TMP VIP', price_coins: 200, price_pi: 200, price: 2000, quantity_available: 100, quantity_sold: 0 } });
  await prisma.event_promo_config.create({ data: { event_id: eventId, enabled: true, discount_type: 'percentage', discount_value: 10, commission_rate: 5 } });
  await prisma.promo_codes.create({ data: { id: promoCodeId, code: `E2EP${stamp}`, influencer_id: orgId, is_active: true, usage_count: 0, event_id: null } });
  await prisma.profiles.update({ where: { id: buyerId }, data: { coin_balance: 1000, full_name: 'TMP Kayak' } });

  // ================= 3. BILLETTERIE =================
  const buy = {
    p_user_id: buyerId, p_event_id: eventId,
    p_cart: [{ type_id: vipTypeId, quantity: 3 }],
    p_final_amount: 999, // non fiable : le serveur recalcule
    p_promo_code_id: promoCodeId, p_commission_amount: 0,
    p_payment_method: 'coins', p_transaction_reference: orderRef,
    p_attendee_name: 'TMP Kayak',
  };
  const br = await rpc('purchase_tickets_v2', buy, tBuyer);
  check('billetterie : achat 3x VIP -> success', br.json?.data?.success, true);
  check('billetterie : total serveur (600 -10%) = 540', br.json?.data?.total_coins ?? br.json?.data?.totalCoins, 540);
  const tickets = await prisma.tickets.findMany({ where: { event_id: eventId, user_id: buyerId } });
  check('billetterie : 3 billets crees', tickets.length, 3);
  check('billetterie : 3 event_tickets miroirs', (await prisma.event_tickets.count({ where: { event_id: eventId, transaction_reference: orderRef } })), 3);
  check('billetterie : stock type -3', (await prisma.ticket_types.findUnique({ where: { id: vipTypeId } })).quantity_sold, 3);
  check('billetterie : solde 1000-540=460', (await prisma.profiles.findUnique({ where: { id: buyerId } })).coin_balance, 460);
  check('billetterie : paiement paid 540', Number((await prisma.payments.findFirst({ where: { transaction_id: orderRef } })).coins_amount), 540);
  check('billetterie : transaction ticket_purchase', (await prisma.transactions.count({ where: { transaction_reference: orderRef, transaction_type: 'ticket_purchase' } })), 1);
  const oe = await prisma.organizer_earnings.findFirst({ where: { transaction_id: orderRef, transaction_type: 'ticket_sale' } });
  check('billetterie : gain organisateur 540', Number(oe?.earnings_coins), 540);
  check('billetterie : statut gain pending', oe?.status, 'pending');
  const pc = await prisma.organizer_earnings.findFirst({ where: { transaction_id: orderRef, transaction_type: 'promo_commission' } });
  check('billetterie : commission influenceur 600x5%=30', Number(pc?.earnings_coins), 30);
  check('billetterie : usage_code 1', (await prisma.promo_codes.findUnique({ where: { id: promoCodeId } })).usage_count, 1);

  const dup = await rpc('purchase_tickets_v2', buy, tBuyer);
  check('billetterie : rejeu meme ref -> DUPLICATE_ORDER', errCode(dup), 'DUPLICATE_ORDER');
  check('billetterie : pas de nouveau billet', (await prisma.tickets.count({ where: { event_id: eventId } })), 3);

  const poor = await rpc('purchase_tickets_v2', { ...buy, p_cart: [{ type_id: vipTypeId, quantity: 3 }], p_transaction_reference: `TKT-POOR-${stamp}` }, tBuyer);
  check('billetterie : solde insuffisant -> INSUFFICIENT_COINS', errCode(poor), 'INSUFFICIENT_COINS');

  // ================= 4. COUPON + JOURNAL PROMO =================
  await prisma.coupons.create({ data: { code: couponCode, user_id: orgId, active: true, usage_count: 0, total_amount: 0, commission_earned: 0 } });
  check('coupon : fidelite 2% de 5400 FCFA', (await rpc('credit_coupon_earnings', { p_coupon_code: couponCode, p_buyer_user_id: buyerId, p_amount_fcfa: 5400, p_transaction_id: orderRef }, tBuyer)).json?.data?.success, true);
  check('coupon : usage adosse vente', (await prisma.coupon_usages.count({ where: { coupon_code: couponCode, transaction_id: orderRef } })), 1);
  check('coupon : commission_earned 108', Number((await prisma.coupons.findUnique({ where: { code: couponCode } })).commission_earned), 108);
  check('coupon : +10 pieces organisateur', (await prisma.profiles.findUnique({ where: { id: orgId } })).coin_balance, 10);

  check('promo : journal process_promo_usage', (await rpc('process_promo_usage', { p_code_id: promoCodeId, p_user_id: buyerId, p_discount: 60, p_commission: 30, p_purchase: 600, p_transaction_id: orderRef }, tBuyer)).json?.data?.success, true);
  const puu = await prisma.promo_code_usages.findFirst({ where: { promo_code_id: promoCodeId, transaction_id: orderRef } });
  check('promo : montants 60|30|600', `${Number(puu?.discount_amount)}|${Number(puu?.commission_amount)}|${Number(puu?.purchase_amount)}`, '60|30|600');

  // ================= 5. MES BILLETS + SCAN =================
  const qr = tickets[0].qr_code;
  const qres = await post('/query', { method: 'select', table: 'tickets', filters: [{ column: 'user_id', op: 'eq', value: buyerId }, { column: 'event_id', op: 'eq', value: eventId }] }, tBuyer);
  check('mes billets : lecture 3 tickets', (qres.json?.data || []).length, 3);
  const v = await rpc('verify_ticket_direct', { p_ticket_identifier: qr, p_verification_method: 'manual_entry', p_exit_mode: false }, tOrg);
  check('scan : entree acceptee', v.json?.data?.success, true);
  check('scan : entry_count 1', Number((await prisma.tickets.findUnique({ where: { id: tickets[0].id } })).entry_count), 1);
  const intruderScan = await rpc('verify_ticket_direct', { p_ticket_identifier: qr, p_verification_method: 'manual_entry' }, tBuyer);
  check('scan : acheteur ne peut pas valider -> 403', intruderScan.status, 403);
  const badScan = await rpc('verify_ticket_direct', { p_ticket_identifier: 'TKT-XXXX-0000' }, tOrg);
  check('scan : billet inconnu -> not_found', badScan.json?.data?.status_code, 'not_found');

  // ================= 6. TOMBOLA =================
  await prisma.raffle_events.create({
    data: { id: raffleId, event_id: eventId, organizer_id: orgId, base_price: 100, calculated_price_pi: 10, total_tickets: 100, tickets_sold: 0, max_tickets_per_user: 10, draw_date: new Date(Date.now() + 3600000), status: 'active', is_drawn: false, is_draw_conducted: false, auto_draw: true },
  });
  await prisma.raffle_prizes.create({ data: { event_id: eventId, raffle_event_id: raffleId, rank: 1, description: 'TMP lot 1', value_fcfa: 100000 } });
  await prisma.raffle_prizes.create({ data: { event_id: eventId, raffle_event_id: raffleId, rank: 2, description: 'TMP lot 2', value_fcfa: 50000 } });
  const rt = await rpc('purchase_raffle_tickets', { p_user_id: buyerId, p_raffle_event_id: raffleId, p_quantity: 5 }, tBuyer);
  check('tombola : achat 5 tickets -> success', rt.json?.data?.success, true);
  check('tombola : 5 tickets', (await prisma.raffle_tickets.count({ where: { raffle_event_id: raffleId, user_id: buyerId } })), 5);
  check('tombola : sold 5', (await prisma.raffle_events.findUnique({ where: { id: raffleId } })).tickets_sold, 5);
  check('tombola : solde 460-50=410', (await prisma.profiles.findUnique({ where: { id: buyerId } })).coin_balance, 410);
  check('tombola : tiers -> FORBIDDEN', errCode(await rpc('conduct_raffle_draw', { p_raffle_event_id: raffleId }, tBuyer)), 'FORBIDDEN');
  const dr = await rpc('conduct_raffle_draw', { p_raffle_event_id: raffleId }, tOrg);
  check('tombola : tirage organisateur -> success', dr.json?.data?.success, true);
  check('tombola : 2 lots -> 2 gagnants', dr.json?.data?.winners?.length, 2);
  check('tombola : rangs 1,2', (dr.json?.data?.winners || []).map((w) => w.rank).sort((a, b) => a - b).join(','), '1,2');
  const raff = await prisma.raffle_events.findUnique({ where: { id: raffleId } });
  check('tombola : is_draw_conducted', raff.is_draw_conducted, true);
  check('tombola : 2 lignes winners', (await prisma.raffle_winners.count({ where: { raffle_event_id: raffleId } })), 2);
  check('tombola : 2 tickets classes', (await prisma.raffle_tickets.count({ where: { raffle_event_id: raffleId, rank: { not: null } } })), 2);
  check('tombola : statut completed', (await prisma.raffle_draw_status.findFirst({ where: { raffle_event_id: raffleId } }))?.status, 'completed');
  check('tombola : historique 1', (await prisma.raffle_draw_history.count({ where: { raffle_event_id: raffleId } })), 1);
  const replay = await rpc('conduct_raffle_draw', { p_raffle_event_id: raffleId }, tOrg);
  check('tombola : rejeu idempotent', replay.json?.data?.already_drawn, true);

  console.log(fails === 0 ? '\nTOUT EST VERT' : `\n${fails} ECHEC(S)`);
} catch (e) {
  console.log('ERREUR:', String(e?.message || e).trim().slice(0, 700));
} finally {
  await prisma.raffle_draw_status.deleteMany({ where: { raffle_event_id: raffleId } });
  await prisma.raffle_draw_sessions.deleteMany({ where: { raffle_event_id: raffleId } });
  await prisma.raffle_draw_history.deleteMany({ where: { raffle_event_id: raffleId } });
  await prisma.raffle_winners.deleteMany({ where: { raffle_event_id: raffleId } });
  await prisma.raffle_tickets.deleteMany({ where: { raffle_event_id: raffleId } });
  await prisma.raffle_prizes.deleteMany({ where: { raffle_event_id: raffleId } });
  await prisma.raffle_events.deleteMany({ where: { id: raffleId } });
  await prisma.promo_code_usages.deleteMany({ where: { promo_code_id: promoCodeId } });
  await prisma.promo_codes.deleteMany({ where: { id: promoCodeId } });
  await prisma.event_promo_config.deleteMany({ where: { event_id: eventId } });
  await prisma.coupon_usages.deleteMany({ where: { coupon_code: couponCode } });
  await prisma.coupons.deleteMany({ where: { code: couponCode } });
  await prisma.organizer_earnings.deleteMany({ where: { event_id: eventId } });
  await prisma.event_tickets.deleteMany({ where: { event_id: eventId } });
  await prisma.payments.deleteMany({ where: { transaction_id: { in: refs } } });
  await prisma.transactions.deleteMany({ where: { transaction_reference: { in: refs } } });
  await prisma.tickets.deleteMany({ where: { event_id: eventId } });
  await prisma.ticket_types.deleteMany({ where: { event_id: eventId } });
  await prisma.events.deleteMany({ where: { id: eventId } });
  for (const id of userIds.filter(Boolean)) {
    await prisma.organizer_earnings.deleteMany({ where: { organizer_id: id } });
    await prisma.payments.deleteMany({ where: { user_id: id } });
    await prisma.transactions.deleteMany({ where: { user_id: id } });
    await prisma.notifications.deleteMany({ where: { user_id: id } });
    await prisma.coupons.deleteMany({ where: { user_id: id } });
    await prisma.profiles.deleteMany({ where: { id } });
    await prisma.auth_users.deleteMany({ where: { id } });
  }
  console.log(`residus tmp = ${await prisma.profiles.count({ where: { email: { startsWith: 'tmp-' } } })}`);
  await prisma.$disconnect();
  process.exit(fails === 0 ? 0 : 1);
}