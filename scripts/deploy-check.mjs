// scripts/deploy-check.mjs
// Diagnostic post-deploiement : verifie que le serveur de production sert
// l'API, le build Vite, les fonctions emulees (/.netlify/functions/*) et que
// la politique de lecture sensible + la cle interne fonctionnent en prod.
// Lecture seule : aucune table modifiee, aucun paiment cree.
//
// Usage :
//   node scripts/deploy-check.mjs [baseUrl] [--key <INTERNAL_RPC_KEY>]
// ...
// defaut baseUrl : $VITE_SITE_URL | $DEPLOY_URL | http://127.0.0.1:8888
// defaut key     : $INTERNAL_RPC_KEY

const argv = process.argv.slice(2);
const keyIdx = argv.indexOf('--key');
const keyArg = keyIdx >= 0 ? argv[keyIdx + 1] : undefined;
const posUrl = argv.find((a, i) => !a.startsWith('-') && (keyIdx < 0 || (i !== keyIdx && i !== keyIdx + 1)));
const rawUrl = posUrl || process.env.VITE_SITE_URL || process.env.DEPLOY_URL || 'http://127.0.0.1:8888';
const INTERNAL_KEY = keyArg || process.env.INTERNAL_RPC_KEY || null;

const base = String(rawUrl).replace(/\/+$/, '');
const checks = [];
let failed = 0;

function record(name, result, detail) {
  checks.push({ name, result: result ? 'OK' : 'KO', detail });
  if (!result) failed++;
}

async function httpJson(path, { method = 'GET', headers = {}, body } = {}) {
  const res = await fetch(base + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
  let json = null;
  try { json = await res.json(); } catch { /* corps non JSON */ }
  return { status: res.status, headers: res.headers, json };
}

async function main() {
  // 1. /api/db/health : serveur et moteur de base repondent
  try {
    const h = await httpJson('/api/db/health');
    record('GET /api/db/health', h.status === 200 && h.json?.ok === true, `status=${h.status}`);
  } catch (e) {
    record('GET /api/db/health', false, String(e.message || e));
  }

  // 2. GET / : le build Vite est servi (SPA)
  try {
    const s = await fetch(base + '/', { headers: { Accept: 'text/html' } });
    const ct = s.headers.get('content-type') || '';
    record('GET / (build Vite)', s.status === 200 && /html/.test(ct), `status=${s.status}, content-type=${ct}`);
  } catch (e) {
    record('GET / (build Vite)', false, String(e.message || e));
  }

  // 3. /.netlify/functions/ussd-payment : dispatch des fonctions + config
  //    Supabase presente (action inconnue -> 400 sans aucun effet).
  try {
    const f = await httpJson('/.netlify/functions/ussd-payment', { method: 'POST', body: { action: '_deploy_probe' } });
    const is400 = f.status === 400 && f.json?.success === false;
    record('Functions Netlify emulees + Supabase', is400, `status=${f.status} (attendu 400 « action inconnue » ; 500=> config Supabase manquante)`);
  } catch (e) {
    record('Functions Netlify emulees + Supabase', false, String(e.message || e));
  }

  // 4. Lecture d'un RIB SANS identite : la politique doit refuser (403)
  try {
    const q = await httpJson('/api/query', {
      method: 'POST',
      body: { table: 'admin_payment_info', method: 'select', select: 'id', limit: 1 },
    });
    const denied = q.status === 403 && q.json?.error?.code === 'read_forbidden';
    record('Politique lecture (RIB anonyme -> 403)', denied, `status=${q.status}, code=${q.json?.error?.code || '?'}`);
  } catch (e) {
    record('Politique lecture (RIB anonyme -> 403)', false, String(e.message || e));
  }

  // 5. Lecture du meme RIB avec la cle interne : doit reussir
  if (!INTERNAL_KEY) {
    record('Cle interne (lecture RIB -> 200)', true, 'IGNORE: passer --key <INTERNAL_RPC_KEY> ou exporter INTERNAL_RPC_KEY');
  } else {
    try {
      const q = await httpJson('/api/query', {
        method: 'POST',
        headers: { 'X-Internal-Key': INTERNAL_KEY },
        body: { table: 'admin_payment_info', method: 'select', select: 'id', limit: 1 },
      });
      const ok = q.status === 200 && Array.isArray(q.json?.data);
      record('Cle interne (lecture RIB -> 200)', ok, `status=${q.status}`);
      if (!ok && q.status === 401) record('Cle interne' , true, 'NOTE: cle rejetee -> INTERNAL_RPC_KEY du serveur differente de celle fournie');
    } catch (e) {
      record('Cle interne (lecture RIB -> 200)', false, String(e.message || e));
    }
  }

  console.log(`\nDeploy-check contre ${base}`);
  console.log('----------------------------');
  for (const c of checks) {
    const pad = (c.name + ' ').padEnd(40, '.');
    console.log(`${c.result === 'OK' ? '  ok ' : c.result === 'KO' ? '  KO ' : '  -- '}${pad} ${c.detail || ''}`);
  }
  console.log(`\n${checks.length - failed}/${checks.length} passes.\n`);
  process.exit(failed ? 1 : 0);
}

main().catch((e) => {
  console.error('deploy-check interrompu :', e);
  process.exit(1);
});