// Regression : « Suivi des coupons » (onglet Analyse) affichait
//   Total genere          : 100 000 500 000 500 050 000 ... FCFA
//   Commission totale    : 200 010 000 100 100 020 100 ... FCFA
//
// Cause : `coupons.total_amount` et `coupons.commission_earned` sont des colonnes
// DECIMAL. L'API les renvoie sous forme de CHAINE ("1000", "0"). Les
// reductions `sum + (c.total_amount || 0)` partaient d'un accumulateur numerique
// (0) : le premier `0 + "0"` transformait l'accumulateur en chaine, et chaque
// iteration CONCATENAIT au lieu d'additionner. Le total affiche n'etait donc
// pas un nombre.
//
// Ce test verifie que le resultat est bien un nombre, et qu'il correspond a la
// somme reelle en base.
import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
const prisma = new PrismaClient();
const API = 'http://127.0.0.1:8888/api';
const PASSWORD = 'Tmp!23456789';

let fails = 0;
const check = (label, got, want) => {
  const ok = String(got) === String(want);
  if (!ok) fails += 1;
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label.padEnd(58)} attendu=${want} obtenu=${got}`);
};

const post = async (path, body, token) => {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;
  const res = await fetch(`${API}${path}`, { method: 'POST', headers, body: JSON.stringify(body) });
  const t = await res.text();
  try { return JSON.parse(t); } catch { return { raw: t.slice(0, 200) }; }
};

const ids = [];
try {
  const email = `tmp-coupons-reg-${Date.now()}@test.local`;
  const su = await post('/auth/signup', { email, password: PASSWORD });
  const id = su?.data?.user?.id;
  ids.push(id);
  await prisma.profiles.update({ where: { id }, data: { user_type: 'super_admin' } });
  const token = (await post('/auth/signin', { email, password: PASSWORD }))?.data?.session?.access_token;

  const r = await post('/query', {
    table: 'coupons', method: 'select',
    select: 'code, user_id, usage_count, total_amount, commission_earned',
  }, token);
  const rows = r.data || [];
  check('les coupons sont lus', rows.length > 0, true);

  // 1. Le piege : l'API renvoie bien des chaines pour les DECIMAL.
  const asString = rows.filter((c) => typeof c.total_amount === 'string').length;
  console.log(`\n  ${rows.length} coupons, ${asString} avec total_amount renvoye en chaine\n`);
  check('au moins un DECIMAL arrive en chaine (piege reproduit)', asString > 0, true);

  // 2. L'ancien calcul concatene : il ne doit plus etre employe.
  const buggyAmount = rows.reduce((s, c) => s + (c.total_amount || 0), 0);
  const buggyCommission = rows.reduce((s, c) => s + (c.commission_earned || 0), 0);
  check('l ancien calcul n est pas un nombre (bug reproduce)', typeof buggyAmount, 'string');

  // 3. Le nouveau calcul est numerique et exact.
  const totalAmount = rows.reduce((s, c) => s + (Number(c.total_amount) || 0), 0);
  const totalCommission = rows.reduce((s, c) => s + (Number(c.commission_earned) || 0), 0);
  check('total_amount cumule est un nombre', typeof totalAmount, 'number');
  check('commission cumulee est un nombre', typeof totalCommission, 'number');

  const truth = await prisma.coupons.aggregate({ _sum: { total_amount: true, commission_earned: true } });
  check('total_amount cumule = somme reelle', totalAmount, Number(truth._sum.total_amount || 0));
  check('commission cumulee = somme reelle', totalCommission, Number(truth._sum.commission_earned || 0));

  // 4. Coherence avec la commission de 2 % : elle ne peut pas depasser le cumul
  //    des ventes, et doit rester un ordre de grandeur sous lui.
  check('commission <= ventes', totalCommission <= totalAmount, true);
  if (totalAmount > 0) {
    const ratio = totalCommission / totalAmount;
    check('commission proche de 2 %', ratio > 0.005 && ratio < 0.05, true);
    console.log(`    (ratio reel : ${(ratio * 100).toFixed(2)} %)`);
  }

  // 5. Le code livre ne doit plus contenir le motif fautif.
  const fs = await import('node:fs');
  const dash = fs.readFileSync('src/components/admin/AnalyticsDashboard.jsx', 'utf8');
  check('cartes coupons : Number() applique', /sum \+ \(Number\(c\.total_amount\)/.test(dash), true);
  check('cartes coupons : plus de somme nue', /sum \+ \(c\.total_amount \|\| 0\)/.test(dash), false);
  check('tableau coupons : plus de .toLocaleString() direct', /coupon\.total_amount\.toLocaleString\(\)/.test(dash), false);

  const svc = fs.readFileSync('src/services/CouponService.js', 'utf8');
  check('CouponService : agregation convertie', /sum \+ toNum\(c\.total_amount\)/.test(svc), true);
  check('CouponService : ecriture en base convertie', /Number\(coupon\.total_amount\) \|\| 0\) \+ Number\(payment\.amount_fcfa/.test(svc), true);

  const ev = fs.readFileSync('src/pages/EventDetailPage.jsx', 'utf8');
  check('EventDetailPage : brut des stands converti', /Number\(curr\.amount_pi\)/.test(ev), true);

  console.log(`\n  Totaux affiches : ${totalAmount.toLocaleString('fr-FR')} FCFA genere, ${totalCommission.toLocaleString('fr-FR')} FCFA de commission\n`);
} catch (e) {
  fails += 1;
  console.log('ECHEC exception: ' + (e.stack || e.message));
} finally {
  // Node 24 / Windows : fermer Prisma alors que des sockets `fetch` (undici)
  // sont encore ouverts provoque un crash natif libuv
  // (STATUS_STACK_BUFFER_OVERRUN, src\win\async.c). On laisse d'abord le pool
  // de sockets se vider, et on ne deconnecte pas dans le chemin nominal :
  // `process.exit` termine le processus proprement.
  await prisma.profiles.deleteMany({ where: { id: { in: ids } } });
  await new Promise((r) => setTimeout(r, 250));
}

console.log(fails ? `\n${fails} ECHEC(S)` : '\nTOUT EST VERT');
// `process.exit` sans $disconnect() : evite le crash libuv du teardown.
process.exit(fails ? 1 : 0);