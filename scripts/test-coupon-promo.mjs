// Port des RPC fidelité : credit_coupon_earnings / add_commission_to_user /
// process_promo_usage, alignées sur le schéma MySQL réel.
//  - expertise : propriétaire du coupon crédité, usage journalisé, idempotence
//  - add_commission_to_user : ADMIN seulement (mouvement de porte-monnaie)
//  - process_promo_usage : journal promo_code_usages, selfArg acheteur
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
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label.padEnd(48)} attendu=${want} obtenu=${got}`);
};

const ids = [];
const couponCode = `TMPCP${Date.now().toString().slice(-6)}`;
const transactionRef = `TXN-${Date.now()}`;
const promoCodeId = uuidv4();
try {
  const stamp = Date.now();
  const owner = await post('/auth/signup', { email: `tmp-cpo-${stamp}@test.local`, password: PASSWORD });
  const buyer = await post('/auth/signup', { email: `tmp-cpb-${stamp}@test.local`, password: PASSWORD });
  const intruder = await post('/auth/signup', { email: `tmp-cpx-${stamp}@test.local`, password: PASSWORD });
  const adminRes = await post('/auth/signup', { email: `tmp-cpa-${stamp}@test.local`, password: PASSWORD });
  const ownerId = owner.json?.data?.user?.id;
  const buyerId = buyer.json?.data?.user?.id;
  const intruderId = intruder.json?.data?.user?.id;
  const adminId = adminRes.json?.data?.user?.id;
  ids.push(ownerId, buyerId, intruderId, adminId);
  await prisma.profiles.update({ where: { id: adminId }, data: { user_type: 'super_admin' } });
  await prisma.profiles.update({ where: { id: ownerId }, data: { coin_balance: 100 } });

  await prisma.coupons.create({ data: { code: couponCode, user_id: ownerId, active: true, usage_count: 0, total_amount: 0, commission_earned: 0 } });
  await prisma.promo_codes.create({ data: { id: promoCodeId, code: `P${stamp}`, influencer_id: ownerId, is_active: true, usage_count: 0 } });

  const tOwner = (await post('/auth/signin', { email: `tmp-cpo-${stamp}@test.local`, password: PASSWORD })).json?.data?.session?.access_token;
  const tBuyer = (await post('/auth/signin', { email: `tmp-cpb-${stamp}@test.local`, password: PASSWORD })).json?.data?.session?.access_token;
  const tIntruder = (await post('/auth/signin', { email: `tmp-cpx-${stamp}@test.local`, password: PASSWORD })).json?.data?.session?.access_token;
  const rpc = (name, args, token) => post('/rpc', { name, args }, token);
  const code = (r) => r.json?.error?.code || String(r.status);

  // ---------- credit_coupon_earnings ----------
  const buy5000 = { p_coupon_code: couponCode, p_buyer_user_id: buyerId, p_amount_fcfa: 5000, p_transaction_id: transactionRef };
  check('coupon : intrudeur (achat d autrui) -> 403', await rpc('credit_coupon_earnings', buy5000, tIntruder).then((r) => r.status), 403);
  const cpRes = await rpc('credit_coupon_earnings', buy5000, tBuyer);
  check('coupon : achat pour soi -> success', cpRes.json?.data?.success, true);
  let ownerBal = (await prisma.profiles.findUnique({ where: { id: ownerId }, select: { coin_balance: true } })).coin_balance;
  check('  commission 2% de 5000 -> +100 fcfa = +10 pieces', ownerBal, 110);
  const coupon = await prisma.coupons.findUnique({ where: { code: couponCode } });
  check('  coupon usage_count=1', Number(coupon?.usage_count), 1);
  check('  coupon total_amount=5000', Number(coupon?.total_amount), 5000);
  check('  coupon commission_earned=100', Number(coupon?.commission_earned), 100);
  check('  coupo_usages journalise', (await prisma.coupon_usages.count({ where: { coupon_code: couponCode } })), 1);
  const usageRow = await prisma.coupon_usages.findFirst({ where: { coupon_code: couponCode } });
  check('  usage adosse a la transaction', usageRow?.transaction_id, transactionRef);
  check('  usage montant/commission', `${usageRow?.amount}|${usageRow?.commission}`, '5000|100');
  check('  transaction commission creee', (await prisma.transactions.count({ where: { transaction_reference: transactionRef, transaction_type: 'coupon_commission' } })), 1);
  const replay = await rpc('credit_coupon_earnings', buy5000, tBuyer);
  check('coupon : rejeu idempotent', replay.json?.data?.already_recorded, true);
  ownerBal = (await prisma.profiles.findUnique({ where: { id: ownerId }, select: { coin_balance: true } })).coin_balance;
  check('  solde inchange apres rejeu', ownerBal, 110);
  check('coupon : auto-usage -> COUPON_SELF_USE', code(await rpc('credit_coupon_earnings', { ...buy5000, p_buyer_user_id: ownerId }, tOwner)), 'COUPON_SELF_USE');
  check('coupon : inconnu -> COUPON_NOT_FOUND', code(await rpc('credit_coupon_earnings', { ...buy5000, p_coupon_code: 'INCONNU' }, tBuyer)), 'COUPON_NOT_FOUND');
  await prisma.coupons.update({ where: { code: couponCode }, data: { active: false } });
  check('coupon : desactive -> COUPON_INACTIVE', code(await rpc('credit_coupon_earnings', { ...buy5000, p_transaction_id: `TXN-${Date.now()}` }, tBuyer)), 'COUPON_INACTIVE');
  await prisma.coupons.update({ where: { code: couponCode }, data: { active: true } });

  // ---------- add_commission_to_user ----------
  const credit = { p_user_id: ownerId, p_amount_fcfa: 70, p_payment_id: 'pay-123', p_commission_coins: 7 };
  check('commission : simple utilisateur -> 403', await rpc('add_commission_to_user', credit, tBuyer).then((r) => r.status), 403);
  const okCredit = await rpc('add_commission_to_user', credit, null);
  check('commission : anonyme -> 401', okCredit.status, 401);
  const adminTok = (await post('/auth/signin', { email: `tmp-cpa-${stamp}@test.local`, password: PASSWORD })).json?.data?.session?.access_token;
  check('commission : admin -> success', adminTok ? true : false, true);
  if (adminTok) {
    const cre = await rpc('add_commission_to_user', credit, adminTok);
    check('  coin_balance +7', cre.json?.data?.coin_balance, 117);
    ownerBal = (await prisma.profiles.findUnique({ where: { id: ownerId }, select: { coin_balance: true } })).coin_balance;
    check('  solde confirme 117', ownerBal, 117);
    check('  rejeu idempotent', (await rpc('add_commission_to_user', credit, adminTok)).json?.data?.already_credited, true);
    check('  solde inchange', (await prisma.profiles.findUnique({ where: { id: ownerId }, select: { coin_balance: true } })).coin_balance, 117);
    check('  transaction commission_credit', (await prisma.transactions.count({ where: { transaction_reference: 'pay-123', transaction_type: 'commission_credit' } })), 1);
  }

  // ---------- process_promo_usage ----------
  const usageArgs = { p_code_id: promoCodeId, p_user_id: buyerId, p_discount: 10, p_commission: 3, p_purchase: 90, p_transaction_id: `PAY-${stamp}` };
  const puRes = await rpc('process_promo_usage', usageArgs, tBuyer);
  check('promo : usage pour soi -> OK', puRes.json?.data?.success, true);
  check('promo : journalise', (await prisma.promo_code_usages.count({ where: { promo_code_id: promoCodeId } })), 1);
  const pu = await prisma.promo_code_usages.findFirst({ where: { promo_code_id: promoCodeId } });
  check('promo : montants', `${pu?.discount_amount}|${pu?.commission_amount}|${pu?.purchase_amount}`, '10|3|90');
  const puReplay = await rpc('process_promo_usage', usageArgs, tBuyer);
  check('promo : rejeu idempotent', puReplay.json?.data?.already_recorded, true);
  check('promo : usage d autrui -> 403', await rpc('process_promo_usage', usageArgs, tIntruder).then((r) => r.status), 403);
  check('promo : code inconnu -> PROMO_NOT_FOUND', code(await rpc('process_promo_usage', { ...usageArgs, p_code_id: uuidv4() }, tBuyer)), 'PROMO_NOT_FOUND');

  console.log(fails === 0 ? '\nTOUT EST VERT' : `\n${fails} ECHEC(S)`);
} catch (e) {
  console.log('ERREUR:', String(e?.message || e).trim().slice(0, 700));
} finally {
  await prisma.coupon_usages.deleteMany({ where: { coupon_code: couponCode } });
  await prisma.coupons.deleteMany({ where: { code: couponCode } });
  await prisma.promo_code_usages.deleteMany({ where: { promo_code_id: promoCodeId } });
  await prisma.promo_codes.deleteMany({ where: { id: promoCodeId } });
  await prisma.transactions.deleteMany({ where: { transaction_reference: transactionRef } });
  await prisma.transactions.deleteMany({ where: { transaction_reference: 'pay-123' } });
  for (const id of ids.filter(Boolean)) {
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