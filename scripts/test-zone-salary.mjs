// Régression : après transfert des gains en attente vers le portefeuille, le CA
// de la zone de l'admin pays doit inclure la commission (et donc alimenter le
// salaire du mois). Couvre aussi les anciens lots 'paid' (frais du lot répété
// sur chaque ligne) et les variantes de libellé pays (Cameroun/Cameroon).
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { v4 as uuidv4 } from 'uuid';

const prisma = new PrismaClient();
const API = process.env.TEST_API_URL || 'http://127.0.0.1:8888/api';
const PASSWORD = 'Tmp!23456789';
const stamp = Date.now();
const zoneCountry = 'Cameroun';
const organizerCountry = 'Cameroon'; // variante volontaire
const created = { authIds: [], profileIds: [], partnerIds: [], licenseIds: [], eventIds: [], earningIds: [] };
let failures = 0;

function check(label, actual, expected) {
  const ok = JSON.stringify(actual) === JSON.stringify(expected);
  if (!ok) failures += 1;
  console.log(`${ok ? 'OK  ' : 'FAIL'} ${label}${ok ? '' : ` (attendu ${JSON.stringify(expected)}, obtenu ${JSON.stringify(actual)})`}`);
}

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const text = await res.text();
  try { return JSON.parse(text); } catch { return { raw: text.slice(0, 300) }; }
}

async function mkUser(label, userType, country, city = null) {
  const email = `tmp-zonesalary-${label}-${stamp}@test.local`;
  const signup = await post('/auth/signup', { email, password: PASSWORD });
  const id = signup?.data?.user?.id;
  if (!id) throw new Error(`signup ${label} échoué: ${JSON.stringify(signup).slice(0, 300)}`);
  created.authIds.push(id);
  created.profileIds.push(id);
  await prisma.profiles.update({ where: { id }, data: { user_type: userType, country, city } });
  const signin = await post('/auth/signin', { email, password: PASSWORD });
  const token = signin?.data?.session?.access_token;
  if (!token) throw new Error(`signin ${label} échoué: ${JSON.stringify(signin).slice(0, 300)}`);
  return { id, email, token };
}

async function rpc(name, args, token) {
  return post('/rpc', { name, args }, token);
}

try {
  const health = await post('/auth/signin', { email: 'nobody@test.local', password: 'x' }).catch(() => null);
  if (!health) throw new Error(`API injoignable sur ${API}`);
  const settings = await prisma.app_settings.findMany({ orderBy: [{ updated_at: 'desc' }, { created_at: 'desc' }], take: 1 });
  const coinRate = Number(settings[0]?.coin_to_fcfa_rate) || 10;
  const platformFeeRate = Number(settings[0]?.platform_fee_percentage) > 0
    ? Number(settings[0].platform_fee_percentage) / 100
    : 0.05;

  let license = await prisma.partner_licenses.findFirst({ select: { id: true, name: true, commission_rate: true } });
  if (!license) {
    const id = uuidv4();
    created.licenseIds.push(id);
    license = await prisma.partner_licenses.create({
      data: { id, name: 'Test Zone', slug: `test-zone-${stamp}`, coverage_type: 'country', commission_rate: 20, price_fcfa: 0 },
    });
  }
  const licenseRate = Number(license.commission_rate);

  const admin = await mkUser('admin', 'admin', zoneCountry, null);
  const organizer = await mkUser('org', 'user', organizerCountry, null);

  const partnerId = uuidv4();
  created.partnerIds.push(partnerId);
  await prisma.partners.create({
    data: {
      id: partnerId,
      user_id: admin.id,
      license_id: license.id,
      coverage_zone: JSON.stringify({ country: zoneCountry, cities: [] }),
      status: 'active',
    },
  });

  const eventId = uuidv4();
  created.eventIds.push(eventId);
  await prisma.events.create({
    data: {
      id: eventId,
      title: `Test zone salary ${stamp}`,
      city: 'Douala',
      country: organizerCountry,
      organizer_id: organizer.id,
      event_type: 'ticketing',
      status: 'active',
      event_start_at: new Date(),
    },
  });

  // 1) Gain en attente : ne doit PAS compter dans le CA.
  const credit = await rpc('credit_organizer_earnings', {
    p_organizer_id: organizer.id,
    p_event_id: eventId,
    p_transaction_type: 'ticket_sale',
    p_earnings_coins: 1000,
    p_earnings_fcfa: 1000 * coinRate,
  }, admin.token);
  const earningId = credit?.data?.earning_id;
  const commissionCoins = Number(credit?.data?.platform_commission || 0);
  check('gain crédité en attente', !!earningId, true);
  check('commission calculée avec le taux réel', commissionCoins, Math.floor(1000 * platformFeeRate));
  if (earningId) created.earningIds.push(earningId);

  const before = await rpc('get_admin_salary_stats', { p_admin_id: admin.id }, admin.token);
  check('CA mois avant transfert = 0', Number(before?.data?.monthly_zone_revenue_fcfa || 0), 0);
  check('salaire avant transfert = 0', Number(before?.data?.total_salary_fcfa || 0), 0);

  // 2) Transfert vers le portefeuille : le CA de la zone doit apparaître.
  const transfer = await rpc('transfer_pending_earnings_to_available', { p_user_id: organizer.id }, organizer.token);
  check('transfert effectué', transfer?.data?.success, true);

  const rows = await prisma.organizer_earnings.findMany({ where: { organizer_id: organizer.id } });
  check('ligne transférée', rows.every((row) => row.status === 'transferred'), true);
  check('commission persistée (non nulle)', rows.every((row) => Number(row.platform_commission || 0) > 0), true);

  const expectedCa = commissionCoins * coinRate;
  const expectedSalary = Math.round(expectedCa * (licenseRate / 100));
  const after = await rpc('get_admin_salary_stats', { p_admin_id: admin.id }, admin.token);
  check('CA mois après transfert (alias Cameroun/Cameroon)', Number(after?.data?.monthly_zone_revenue_fcfa || 0), expectedCa);
  check('salaire calculé sur le CA', Number(after?.data?.total_salary_fcfa || 0), expectedSalary);
  check('taux de licence résolu', Number(after?.data?.license_commission_rate || 0), licenseRate);
  check('licence non manquante', after?.data?.license_missing, false);

  const zone = await rpc('get_admin_zone_stats', { p_admin_id: admin.id }, admin.token);
  check('carte zone = salaire (CA mois)', Number(zone?.data?.monthly_zone_revenue_fcfa || 0), expectedCa);
  check('carte zone = salaire (commission)', Number(zone?.data?.monthly_commission_coins || 0), commissionCoins);

  // 3) Ancien flux 'paid' : le frais du lot est répété sur chaque ligne.
  const paidAt = new Date();
  const batchFeeCoins = 305;
  const batchGross = 1500;
  await prisma.organizer_earnings.update({
    where: { id: earningId },
    data: {
      status: 'paid',
      paid_at: paidAt,
      transferred_at: null,
      earnings_coins: batchGross,
      platform_commission: 0,
      platform_fee: batchFeeCoins,
      fee_percent: 5,
    },
  });
  const batchIds = [];
  for (let i = 0; i < 3; i += 1) {
    const id = uuidv4();
    batchIds.push(id);
    await prisma.organizer_earnings.create({
      data: {
        id,
        organizer_id: organizer.id,
        event_id: eventId,
        transaction_id: uuidv4(),
        transaction_type: 'ticket_sale',
        earnings_coins: batchGross,
        earnings_fcfa: batchGross * coinRate,
        status: 'paid',
        paid_at: paidAt,
        platform_commission: 0,
        platform_fee: batchFeeCoins,
        net_amount: batchGross * coinRate,
        fee_percent: 5,
        earning_type: 'ticket_sale',
        event_type: 'ticketing',
      },
    });
  }
  created.earningIds.push(...batchIds);

  const paidCa = batchFeeCoins * coinRate;
  const paid = await rpc('get_admin_zone_stats', { p_admin_id: admin.id }, admin.token);
  check('lot paid : frais compté une seule fois', Number(paid?.data?.monthly_zone_revenue_fcfa || 0), paidCa);
  check('lot paid : commission du lot', Number(paid?.data?.monthly_commission_coins || 0), batchFeeCoins);

  const paidSalary = await rpc('get_admin_salary_stats', { p_admin_id: admin.id }, admin.token);
  check('salaire calculé sur lot paid', Number(paidSalary?.data?.total_salary_fcfa || 0), Math.round(paidCa * (licenseRate / 100)));

  // 4) Commission promo (gain net) : jamais de frais inventé.
  await prisma.organizer_earnings.create({
    data: {
      id: uuidv4(),
      organizer_id: organizer.id,
      event_id: eventId,
      transaction_id: uuidv4(),
      transaction_type: 'promo_commission',
      earnings_coins: 100,
      earnings_fcfa: 100 * coinRate,
      status: 'transferred',
      platform_commission: 0,
      platform_fee: 0,
      fee_percent: 0,
      earning_type: 'promo_commission',
      event_type: 'ticketing',
      transferred_at: new Date(),
    },
  });
  const promo = await rpc('get_admin_zone_stats', { p_admin_id: admin.id }, admin.token);
  check('commission promo exclue du CA', Number(promo?.data?.monthly_zone_revenue_fcfa || 0), paidCa);

  // 5) Gain en attente exclu du CA.
  await prisma.organizer_earnings.create({
    data: {
      id: uuidv4(),
      organizer_id: organizer.id,
      event_id: eventId,
      transaction_id: uuidv4(),
      transaction_type: 'ticket_sale',
      earnings_coins: 2000,
      earnings_fcfa: 2000 * coinRate,
      status: 'pending',
      platform_commission: 100,
      platform_fee: 100 * coinRate,
      fee_percent: 5,
      earning_type: 'ticket_sale',
      event_type: 'ticketing',
    },
  });
  const pending = await rpc('get_admin_zone_stats', { p_admin_id: admin.id }, admin.token);
  check('gain pending exclu du CA', Number(pending?.data?.monthly_zone_revenue_fcfa || 0), paidCa);

  check('statuts reconnus exposés', pending?.data?.recognized_statuses, ['transferred', 'paid', 'available', 'completed']);
} catch (error) {
  failures += 1;
  console.error('ERREUR TEST:', error.stack || error.message);
} finally {
  try {
    if (created.profileIds.length) await prisma.organizer_earnings.deleteMany({ where: { organizer_id: { in: created.profileIds } } });
    if (created.earningIds.length) await prisma.organizer_earnings.deleteMany({ where: { id: { in: created.earningIds } } });
    if (created.eventIds.length) await prisma.events.deleteMany({ where: { id: { in: created.eventIds } } });
    if (created.partnerIds.length) await prisma.partners.deleteMany({ where: { id: { in: created.partnerIds } } });
    if (created.licenseIds.length) await prisma.partner_licenses.deleteMany({ where: { id: { in: created.licenseIds } } });
    if (created.profileIds.length) await prisma.profiles.deleteMany({ where: { id: { in: created.profileIds } } });
    if (created.authIds.length) await prisma.auth_users.deleteMany({ where: { id: { in: created.authIds } } });
  } catch (error) {
    console.log('cleanup error:', error.message);
  }
  await prisma.$disconnect();
}

console.log(failures ? `\n${failures} échec(s)` : '\nTous les contrôles sont passés.');
process.exit(failures ? 1 : 0);
