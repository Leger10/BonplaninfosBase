// Commission de parrainage (coupon « coupons ») sur achat de crédits via USSD.
//
// Scénario : un acheteur paie un pack de crédits (5000 FCFA) via USSD en
// appliquant le coupon du propriétaire. L'admin valide le dépôt. L'acheteur
// reçoit ses crédits ET le propriétaire du coupon doit recevoir sa commission
// (2 % de 5000 = 100 FCFA = 10 crédits), avec les compteurs du coupon à jour.
//
// Régression : avant correction, ussd-payment.cjs créditait l'acheteur mais
// jamais le propriétaire du coupon (pas d'appel à credit_coupon_earnings dans
// la branche de validation des crédits).
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
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
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
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label.padEnd(54)} attendu=${want} obtenu=${got}`);
};

const ids = [];
const couponCodes = [];
const paymentIds = [];

try {
  const stamp = Date.now();
  let seq = 0;
  const mk = async () => {
    const email = `tmp-coupon-${stamp}-${++seq}@test.local`;
    const r = await post('/api/auth/signup', { email, password: PASSWORD });
    const id = r.json?.data?.user?.id;
    if (!id) throw new Error(`inscription ${email} -> HTTP ${r.status} ${JSON.stringify(r.json).slice(0, 200)}`);
    ids.push(id);
    const token = (await post('/api/auth/signin', { email, password: PASSWORD })).json?.data?.session?.access_token;
    return { id, token, email };
  };

  const owner = await mk(); // propriétaire du coupon
  const buyer = await mk(); // acheteur
  const admin = await mk();
  await prisma.profiles.update({ where: { id: admin.id }, data: { user_type: 'admin' } });

  const balance = async (id) => (await prisma.profiles.findUnique({ where: { id }, select: { coin_balance: true } })).coin_balance || 0;
  const bal0Owner = await balance(owner.id);
  const bal0Buyer = await balance(buyer.id);

  const COUPON = `C-${stamp}`.replace(/-/g, '');
  const COUPON_B = `CB-${stamp}`.replace(/-/g, '');
  couponCodes.push(COUPON, COUPON_B);

  // ---------- 0. le propriétaire crée son coupon via /api/query ----------
  const ins = await post('/api/query', {
    table: 'coupons', method: 'insert',
    body: {
      code: COUPON,
      user_id: buyer.id, // usurpation : doit être écrasé par owner.id
      active: true,
      usage_count: 0, total_amount: 0, commission_earned: 0,
    },
  }, owner.token);
  check('créer son coupon (usurpation user_id) -> 200', ins.status, 200);
  const couponCodeOut = ins.json?.data?.[0]?.code || ins.json?.data?.code;
  check('  code renvoyé (PK = code)', couponCodeOut, COUPON);
  const couponRow = await prisma.coupons.findUnique({ where: { code: COUPON } });
  check('  user_id forcé au propriétaire', couponRow?.user_id, owner.id);

  // L'acheteur tente de créer un coupon « au nom du propriétaire » -> forcé au sien.
  const insB = await post('/api/query', {
    table: 'coupons', method: 'insert',
    body: { code: COUPON_B, user_id: owner.id },
  }, buyer.token);
  const couponB = await prisma.coupons.findUnique({ where: { code: COUPON_B } });
  check('insert tiers : user_id forcé à l\'appelant', couponB?.user_id, buyer.id);

  // ---------- 1. submit USSD : crédits 5000 FCFA avec coupon ----------
  const PAYOUT = 5000;
  const txn = `ussd_${stamp}_${++seq}`;
  const sub = await post('/.netlify/functions/ussd-payment', {
    action: 'submit', type: 'credits', proofDataUrl: PROOF,
    amountFcfa: PAYOUT, phone: '+22670000001', transactionId: txn,
    userId: buyer.id, coinsAmount: 500, packId: 'test-pack',
    couponCode: COUPON, userEmail: buyer.email,
  }, buyer.token);
  check('submit USSD crédits -> 200', sub.status, 200);
  check('  paiement en attente', sub.json?.success === true && sub.json?.pending_validation === true, true);
  const payment = await prisma.payments.findFirst({ where: { transaction_id: txn }, orderBy: { created_at: 'desc' } });
  check('  payments.coupon_code enregistré', payment?.coupon_code, COUPON);
  if (!payment) throw new Error('paiement USSD absent');
  paymentIds.push(payment.id);

  // ---------- 2. validation admin ----------
  const val = await post('/.netlify/functions/ussd-payment', {
    action: 'validate', paymentId: payment.id, actorId: admin.id, depositVerified: true,
  });
  check('validation admin -> 200', val.status, 200);
  check('  message de confirmation', (val.json?.message || '').length > 0, true);

  const balAfterOwner = await balance(owner.id);
  const balAfterBuyer = await balance(buyer.id);
  check('acheteur reçoit ses crédits (+500)', balAfterBuyer, bal0Buyer + 500);
  check('propriétaire reçoit la commission (+10 crédits)', balAfterOwner, bal0Owner + 10);

  const cRow = await prisma.coupons.findUnique({ where: { code: COUPON }, select: { usage_count: true, total_amount: true, commission_earned: true, last_used_at: true } });
  check('  coupons.usage_count', Number(cRow?.usage_count) || 0, 1);
  check('  coupons.total_amount', Number(cRow?.total_amount) || 0, PAYOUT);
  check('  coupons.commission_earned', Number(cRow?.commission_earned) || 0, 100);
  check('  coupons.last_used_at posé', !!cRow?.last_used_at, true);

  const usage = await prisma.coupon_usages.findFirst({ where: { coupon_code: COUPON, transaction_id: payment.id } });
  check('  coupon_usages ligne (user=acheteur)', usage?.user_id, buyer.id);
  check('  coupon_usages.amount', Number(usage?.amount) || 0, PAYOUT);
  check('  coupon_usages.commission', Number(usage?.commission) || 0, 100);

  const ownerTx = await prisma.transactions.findFirst({ where: { user_id: owner.id, transaction_type: 'coupon_commission', transaction_reference: payment.id } });
  check('  transaction commission créée', !!ownerTx, true);
  check('  tx commission amount_pi', Number(ownerTx?.amount_pi) || 0, 10);
  check('  tx commission amount_fcfa', Number(ownerTx?.amount_fcfa) || 0, 100);

  // ---------- 3. idempotence : re-validations refusées ----------
  const reVal = await post('/.netlify/functions/ussd-payment', {
    action: 'validate', paymentId: payment.id, actorId: admin.id, depositVerified: true,
  });
  check('re-validation -> 409 (double traitement refusé)', reVal.status, 409);
  check('  pas de double commission', await balance(owner.id), bal0Owner + 10);
  check('  pas de double crédit acheteur', await balance(buyer.id), bal0Buyer + 500);

  console.log(fails === 0 ? '\nTOUT EST VERT' : `\n${fails} ECHEC(S)`);
} catch (e) {
  console.log('ERREUR:', String(e?.message || e).trim().slice(0, 400));
  fails += 1;
} finally {
  for (const pid of paymentIds.filter(Boolean)) {
    await prisma.transactions.deleteMany({ where: { transaction_reference: pid } });
    await prisma.payments.deleteMany({ where: { id: pid } });
  }
  for (const c of couponCodes.filter(Boolean)) {
    await prisma.coupon_usages.deleteMany({ where: { coupon_code: c } });
    await prisma.coupons.deleteMany({ where: { code: c } });
  }
  for (const id of ids.filter(Boolean)) {
    await prisma.transactions.deleteMany({ where: { user_id: id, transaction_type: 'coupon_commission' } });
    await prisma.transactions.deleteMany({ where: { user_id: id } });
    await prisma.profiles.deleteMany({ where: { id } });
    await prisma.auth_users.deleteMany({ where: { id } });
  }
  const remain = await prisma.coupons.count({ where: { code: { startsWith: 'C-' } } });
  console.log(`nettoyage: comptes tmp = ${ids.filter(Boolean).length} | coupons C- restants = ${remain}`);
  await prisma.$disconnect();
  process.exit(fails === 0 ? 0 : 1);
}