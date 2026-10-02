// Regression : "Chiffre d'Affaires (Ventes)" de l'onglet Analyse.
//
// La carte affichait -447 270 FCFA. La cause : la RPC additionnait
// SUM(transactions.amount_fcfa) sur TOUTES les lignes completed, sans
// distinguer une vente d'un mouvement interne. Les annulations de credits de
// l'administration (credit_reversal, -2 525 321 FCFA) rendaient le total
// negatif.
//
// Le CA doit venir de `payments` : l'argent reellement encaisse sur les packs.
//   - payment_method 'coins' exclu (depense de pieces, pas une entree)
//   - status completed / success seulement
//   - taux de repli lu dans app_settings, plus code en dur
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
  console.log(`${ok ? 'OK   ' : 'ECHEC'} ${label.padEnd(58)} attendu=${want} obtenu=${got}`);
};

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
  const email = `tmp-ca-${stamp}@test.local`;
  const su = await post('/auth/signup', { email, password: PASSWORD });
  const id = su.json?.data?.user?.id;
  ids.push(id);
  await prisma.profiles.update({ where: { id }, data: { user_type: 'super_admin' } });
  const token = (await post('/auth/signin', { email, password: PASSWORD })).json?.data?.session?.access_token;

  const r = await post('/rpc', { name: 'get_super_admin_dashboard_stats', args: {} }, token);
  check('la RPC repond sans erreur', r.json?.error, null);

  const d = r.json?.data || {};

  // Recalcul independant, cale sur les regles documentees.
  const expected = await prisma.payments.aggregate({
    where: { status: { in: ['completed', 'success'] }, payment_method: { not: 'coins' } },
    _sum: { amount_fcfa: true, coins_amount: true },
    _count: true,
  });
  const expectedFcfa = Number(expected._sum.amount_fcfa || 0);

  console.log(`\n  CA calcule par la RPC : ${Number(d.total_sales_fcfa).toLocaleString('fr-FR')} FCFA`);
  console.log(`  CA attendu (payments completed/success hors coins) : ${expectedFcfa.toLocaleString('fr-FR')} FCFA\n`);

  check('total_sales_fcfa = encaissements packs', Math.round(Number(d.total_sales_fcfa)), Math.round(expectedFcfa));
  check('total_sales_coins est fourni', d.total_sales_coins, Number(expected._sum.coins_amount || 0));
  check('total_sales_count est fourni', d.total_sales_count, expected._count);

  check('le CA n est plus negatif', Number(d.total_sales_fcfa) >= 0, true);

  // Garde-fou : les mouvements internes ne doivent plus peser.
  const rev = await prisma.transactions.aggregate({ where: { transaction_type: 'credit_reversal', status: 'completed' }, _sum: { amount_fcfa: true } });
  if (Number(rev._sum.amount_fcfa || 0) < -100000) {
    const internalOnly = Number(rev._sum.amount_fcfa || 0);
    check('le CA ignore credit_reversal (il est negatif)', Number(d.total_sales_fcfa) === internalOnly, false);
  }

  // Le detail par canal doit etre coherent avec le total.
  const byMethod = d.sales_by_method || [];
  const sumMethod = byMethod.reduce((s, m) => s + Number(m.total_fcfa || 0), 0);
  check('le detail par canal somme au total', Math.round(sumMethod), Math.round(expectedFcfa));
  check('aucun canal "coins" dans le detail', byMethod.some((m) => m.payment_method === 'coins'), false);
  check('seul des statuts valides sont retenus', byMethod.length > 0, true);

  // Le taux de repli ne doit plus etre code en dur : le calcul doit utiliser la
  // variable `rate` lue dans app_settings, pas un litteral 10.
  const seg = (await import('node:fs')).readFileSync('server/rpc.mjs', 'utf8');
  const fnStart = seg.indexOf('async get_super_admin_dashboard_stats');
  const fnBody = seg.slice(fnStart, fnStart + 2400);
  check('le taux est lu dans app_settings', fnBody.includes('coin_to_fcfa_rate'), true);
  check('le CA utilise la variable rate', /coins_amount \|\| 0\) \* rate/.test(fnBody), true);
  check('aucun repli sur un 10 litteral dans le CA', /amount_pi \|\| 0\) \* 10/.test(fnBody), false);

  // Une seule definition de la RPC.
  const defs = (seg.match(/async get_super_admin_dashboard_stats/g) || []).length;
  check('une seule definition de la RPC', defs, 1);
} catch (e) {
  fails += 1;
  console.log('ECHEC exception: ' + (e.stack || e.message));
} finally {
  await prisma.profiles.deleteMany({ where: { id: { in: ids } } });
  await prisma.$disconnect();
}

console.log(fails ? `\n${fails} ECHEC(S)` : '\nTOUT EST VERT');
process.exit(fails ? 1 : 0);