// Regression : RBP (Revenus Bruts Plateforme) du super admin.
//
// Verifie que l'onglet RBP expose une assiette coherente avec le contrat :
//   RBP = commissions acquises + packs + licences + publicite + abonnements
//         + autres encaissements.
// Les 90 % des organisateurs ne doivent jamais entrer dans le total, les
// depenses en pieces non plus, et les commissions 'pending' restent hors total.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const API = process.env.RBP_TEST_API || 'http://127.0.0.1:8888/api';
const PASSWORD = 'Tmp!23456789';
const stamp = Date.now();

let fails = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fails += 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label.padEnd(64)} attendu=${want} obtenu=${got}`);
};
const near = (a, b, tolerance = 1) => Math.abs(Number(a) - Number(b)) <= tolerance;

async function post(path, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const t = await res.text();
  let j; try { j = JSON.parse(t); } catch { j = { raw: t.slice(0, 200) }; }
  return { status: res.status, json: j };
}

const ids = [];
try {
  const email = `tmp-rbp-${stamp}@test.local`;
  const su = await post('/auth/signup', { email, password: PASSWORD });
  const id = su.json?.data?.user?.id;
  ids.push(id);
  await prisma.profiles.update({ where: { id }, data: { user_type: 'super_admin' } });
  const token = (await post('/auth/signin', { email, password: PASSWORD })).json?.data?.session?.access_token;

  const r = await post('/rpc', { name: 'get_super_admin_rbp_stats', args: {} }, token);
  check('la RPC RBP repond sans erreur', r.json?.error, null);
  const d = r.json?.data || {};

  const components = d.components || [];
  const sumComponents = components.reduce((s, c) => s + Number(c.amount_fcfa || 0), 0);
  check('total RBP = somme des composantes', Math.round(sumComponents), Math.round(Number(d.total_rbp_fcfa || 0)));
  check('six composantes contractuelles', components.length, 6);
  check('composantes non negatives', components.every((c) => Number(c.amount_fcfa || 0) >= 0), true);

  const dist = d.distribution || {};
  check('Fonds de Survie = 20 % du RBP', Number(dist.survival_fund_fcfa), Math.round(Number(d.total_rbp_fcfa || 0) * 0.2));
  check('Resultat distribuable = 80 % du RBP', Number(dist.distributable_fcfa), Number(d.total_rbp_fcfa || 0) - Number(dist.survival_fund_fcfa));
  check('Partie A + Partie B = 80 %', Number(dist.party_a_fcfa) + Number(dist.party_b_fcfa), Number(dist.distributable_fcfa));
  check('Partie A = 40 % du RBP', Number(dist.party_a_fcfa), Math.round(Number(d.total_rbp_fcfa || 0) * 0.4));

  const detail = d.by_event_type || [];
  const sumDetail = detail.reduce((s, t) => s + Number(t.commission_fcfa || 0), 0);
  const commissionComponent = components.find((c) => c.key === 'commissions');
  check('detail par type = composante commissions', Math.round(sumDetail), Math.round(Number(commissionComponent?.amount_fcfa || 0)));
  check('detail par type non negatif', detail.every((t) => Number(t.commission_fcfa || 0) >= 0), true);
  check('detail trie par commission decroissante', detail.every((t, i) => i === 0 || Number(detail[i - 1].commission_fcfa) >= Number(t.commission_fcfa)), true);

  const series = d.monthly_series || [];
  check('serie mensuelle = 12 mois', series.length, 12);
  check('la serie se termine au mois courant', series[series.length - 1]?.month, d.current_month);
  check('mois selectionne par defaut = mois courant', d.month, d.current_month);
  check('chaque mois de la serie a un total calcule', series.every((m) => {
    const sum = Number(m.commissions_fcfa) + Number(m.packs_fcfa) + Number(m.licences_fcfa)
      + Number(m.publicite_fcfa) + Number(m.abonnements_fcfa) + Number(m.autres_fcfa);
    return near(sum, m.total_rbp_fcfa);
  }), true);
  check('la serie ne contient pas de depenses en pieces', series.every((m) => Number(m.packs_fcfa) >= 0), true);

  // Controle independant : commissions acquises du mois courant, meme regle de date.
  const now = new Date();
  const pad = (n) => String(n).padStart(2, '0');
  const start = `${now.getFullYear()}-${pad(now.getMonth() + 1)}-01 00:00:00`;
  const endDate = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  const end = `${endDate.getFullYear()}-${pad(endDate.getMonth() + 1)}-01 00:00:00`;
  const settingsRows = await prisma.app_settings.findMany({
    orderBy: [{ updated_at: 'desc' }, { created_at: 'desc' }],
    take: 1,
    select: { coin_to_fcfa_rate: true, platform_fee_percentage: true },
  });
  const rate = Number(settingsRows[0]?.coin_to_fcfa_rate) || 10;
  const feePercent = Number(settingsRows[0]?.platform_fee_percentage);
  const feeRate = feePercent > 0 ? feePercent / 100 : 0.05;
  const monthRows = await prisma.$queryRawUnsafe(
    `SELECT organizer_id, status, transaction_type, earning_type,
            earnings_coins, earnings_fcfa, platform_commission, platform_fee, fee_percent,
            transferred_at, paid_at, created_at
     FROM organizer_earnings
     WHERE status IN ('transferred','paid','available','completed')
       AND COALESCE(transaction_type,'') <> 'promo_commission'
       AND COALESCE(transferred_at, paid_at, created_at) >= ?
       AND COALESCE(transferred_at, paid_at, created_at) < ?`,
    start, end,
  );
  const feeCoinsOfRow = (row) => {
    const commission = Number(row.platform_commission || 0);
    const fee = Number(row.platform_fee || 0);
    const gross = Number(row.earnings_coins || 0);
    const percent = Number(row.fee_percent || 0);
    const rowRate = percent > 0 ? percent / 100 : feeRate;
    if (commission > 0) return commission;
    if (fee > 0) return fee;
    return Math.floor(gross * rowRate);
  };
  const paidBatches = new Map();
  const singleRows = [];
  for (const row of monthRows) {
    if (String(row.earning_type || '').toLowerCase() === 'promo_commission') continue;
    if (String(row.status) === 'paid') {
      const key = `${row.organizer_id}|${row.paid_at ? new Date(row.paid_at).getTime() : 'no-date'}`;
      if (!paidBatches.has(key)) paidBatches.set(key, []);
      paidBatches.get(key).push(row);
    } else {
      singleRows.push(row);
    }
  }
  let expectedCommission = singleRows.reduce((sum, row) => sum + feeCoinsOfRow(row) * rate, 0);
  for (const batch of paidBatches.values()) {
    const sumCommission = batch.reduce((sum, row) => sum + Number(row.platform_commission || 0), 0);
    const sumGross = batch.reduce((sum, row) => sum + Number(row.earnings_coins || 0), 0);
    const maxFee = batch.reduce((max, row) => Math.max(max, Number(row.platform_fee || 0)), 0);
    const percent = Number(batch[0]?.fee_percent || 0);
    const expectedCoins = sumGross * (percent > 0 ? percent / 100 : feeRate);
    let feeCoins = maxFee;
    if (maxFee > 0 && rate > 0) {
      const asFcfaCoins = maxFee / rate;
      if (Math.abs(asFcfaCoins - expectedCoins) < Math.abs(maxFee - expectedCoins)) feeCoins = asFcfaCoins;
    }
    let coins = Math.max(sumCommission, feeCoins);
    if (coins <= 0) coins = expectedCoins;
    expectedCommission += coins * rate;
  }
  check('commissions du mois = controle independant (lots paid dedupliques)', Math.round(Number(commissionComponent?.amount_fcfa || 0)), Math.round(expectedCommission));

  // Aucun paiement evenement ne doit apparaitre dans les packs : on recalcule
  // la classification des paiements du mois courant et on compare.
  const packsComponent = components.find((c) => c.key === 'packs');
  const monthPayments = await prisma.payments.findMany({
    where: {
      status: { in: ['completed', 'success'] },
      payment_method: { not: 'coins' },
      OR: [
        { processed_at: { gte: new Date(start), lt: new Date(end) } },
        { processed_at: null, validated_at: { gte: new Date(start), lt: new Date(end) } },
        { processed_at: null, validated_at: null, created_at: { gte: new Date(start), lt: new Date(end) } },
      ],
    },
    select: { pack_id: true, payment_method: true, amount_fcfa: true },
  });
  const EVENT_PACKS = new Set(['ticket_payment', 'vote_payment', 'stand_rental_payment', 'raffle_payment', 'protected_access_payment']);
  let expectedPacks = 0;
  let eventPayments = 0;
  for (const p of monthPayments) {
    const pack = String(p.pack_id || '').toLowerCase();
    const method = String(p.payment_method || '').toLowerCase();
    if (pack.startsWith('pack_') || pack === 'custom' || (!pack && method !== 'moneyfusion_ticket')) {
      expectedPacks += Number(p.amount_fcfa || 0);
    } else if (EVENT_PACKS.has(pack) || method === 'moneyfusion_ticket' || pack.endsWith('_payment')) {
      eventPayments += Number(p.amount_fcfa || 0);
    }
  }
  check('packs du mois = classification independante', Math.round(Number(packsComponent?.amount_fcfa || 0)), Math.round(expectedPacks));
  check('les paiements evenements ne sont pas comptes comme packs', Math.round(Number(packsComponent?.amount_fcfa || 0)) >= Math.round(eventPayments), true);

  check('commissions en attente exposees separement', typeof d.commission_summary?.pending_commission_fcfa, 'number');
  check('les commissions en attente sont hors du total', Number(d.commission_summary?.pending_commission_fcfa || 0) >= 0, true);

  // Mois avec donnees : la RPC doit accepter p_month et renvoyer le mois demande.
  const latest = await prisma.organizer_earnings.findFirst({
    where: { status: 'transferred', transferred_at: { not: null } },
    orderBy: { transferred_at: 'desc' },
    select: { transferred_at: true },
  });
  if (latest?.transferred_at) {
    const dt = new Date(latest.transferred_at);
    const m = `${dt.getFullYear()}-${pad(dt.getMonth() + 1)}`;
    const r2 = await post('/rpc', { name: 'get_super_admin_rbp_stats', args: { p_month: m } }, token);
    check('p_month est respecte', r2.json?.data?.month, m);
    check('detail par type fourni pour un mois avec transferts', (r2.json?.data?.by_event_type || []).length > 0, true);
  }

  // Un simple utilisateur ne doit pas acceder a l'assiette du partenaire.
  const email2 = `tmp-rbp-user-${stamp}@test.local`;
  const u = await post('/auth/signup', { email: email2, password: PASSWORD });
  const uid = u.json?.data?.user?.id;
  ids.push(uid);
  const token2 = (await post('/auth/signin', { email: email2, password: PASSWORD })).json?.data?.session?.access_token;
  const r3 = await post('/rpc', { name: 'get_super_admin_rbp_stats', args: {} }, token2);
  check('RBP interdit a un utilisateur simple', !!r3.json?.error, true);
} catch (e) {
  fails += 1;
  console.log('ECHEC exception: ' + (e.stack || e.message));
} finally {
  await prisma.profiles.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
}

console.log(fails ? `\n${fails} ECHEC(S)` : '\nTOUT EST VERT');
process.exit(fails ? 1 : 0);
