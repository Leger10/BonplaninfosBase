// Serveur Express local : remplace Supabase (query, auth, storage, rpc)
// et sert le build statique. Démarrage : node server/index.mjs
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { config } from 'dotenv';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
config({ path: path.join(ROOT, '.env') });

import { runQuery } from './queryEngine.mjs';
import { authRouter } from './auth.mjs';
import { storageRouter } from './storage.mjs';
import { rpcRouter } from './rpc.mjs';
import { requireActorForWrites, requireAdmin } from './session.mjs';
import { checkWritePolicy, checkReadPolicy } from './queryPolicy.mjs';
import { purgeOldEvents } from './purgeOldEvents.mjs';

const app = express();
app.set('json spaces', 2);
app.use(express.json({ limit: '30mb' }));

// Découverte de l'adresse publique : les fonctions /.netlify/functions/* passent
// par le shim local-supabase (netlify/functions/_lib/local-supabase.cjs) qui doit
// rappeler ce serveur. Sur Hostinger le process n'est pas joignable en loopback
// (ECONNREFUSED sur 127.0.0.1/*) : on expose donc l'hôte des requêtes entrantes,
// le shim bascule alors en https:443 vers l'hôte public (comme le navigateur).
app.use((req, res, next) => {
  let host = String(req.headers.host || '').trim();
  if (host) {
    let h = host;
    let p = '';
    if (h.startsWith('[')) {
      const end = h.indexOf(']');
      h = h.slice(1, end === -1 ? h.length : end);
      const rest = end !== -1 ? host.slice(end + 1) : '';
      if (rest.startsWith(':')) p = rest.slice(1);
    } else {
      const colon = h.lastIndexOf(':');
      if (colon !== -1 && /^\d+$/.test(h.slice(colon + 1))) {
        p = h.slice(colon + 1);
        h = h.slice(0, colon);
      }
    }
    const loopback = /^localhost$/.test(h) || /^127\.|^192\.168\.|^10\.|^0\.0\.0\.0$/.test(h);
    process.env.SUPABASE_LOCAL_HOST = h;
    if (p) process.env.SUPABASE_LOCAL_PORT = p;
    process.env.SUPABASE_LOCAL_PROTO = loopback ? 'http' : 'https';
  }
  next();
});

const PORT = process.env.PORT || 8888;

// API
// Administration des comptes : les gardes sont posés ici, pas dans le routeur,
// pour ne pas créer de cycle d'import entre auth.mjs et session.mjs.
app.use('/api/auth/admin/list-users', requireAdmin());
app.use('/api/auth/admin/create-user', requireAdmin({ superOnly: true }));
app.use('/api/auth', authRouter);
app.use('/api/storage', storageRouter);
app.use('/api/rpc', rpcRouter);
// Purge automatique des événements passés de plus d'un mois (super admin).
app.post('/api/admin/purge-old-events', requireAdmin({ superOnly: true }), async (req, res) => {
  try {
    const dryRun = req.body?.dryRun !== false;
    const result = await purgeOldEvents({ dryRun });
    console.log(`[purge] admin route -> ${result.purgedEvents} purgés, ${result.candidateCount} candidats${dryRun ? ' (dry run)' : ''}`);
    res.json({ data: result, error: null });
  } catch (e) {
    console.error('[purge] admin route', e);
    res.status(500).json({ data: null, error: { message: e?.message?.split('\n')[0], code: 'PURGE_ERROR', details: null, hint: null } });
  }
});
// CRUD générique : les lectures restent publiques (pages visibles sans compte),
// les écritures exigent une session (utilisateur ou clé interne des fonctions)
// ET passent par server/queryPolicy.mjs, qui restreint chaque écriture aux
// lignes de l'appelant ou aux rôles d'administration.
app.post('/api/query', requireActorForWrites, async (req, res) => {
  const q = req.body || {};
  const method = String(q.method || 'select').toLowerCase();
  try {
    let query = q;
    // Lecture : les tables sensibles (RIB, salaires, logs, retraits…) sont
    // réservées à l'administration, ou restreintes aux propres lignes de
    // l'appelant pour les tables mixtes.
    const readVerdict = await checkReadPolicy(q, req.actor);
    if (!readVerdict.ok) {
      console.log(`[query] read ${method} ${q.table} -> ${readVerdict.status} ${readVerdict.body.error.message}`);
      return res.status(readVerdict.status).json(readVerdict.body);
    }
    query = readVerdict.query;
    if (method !== 'select' && method !== 'head') {
      const verdict = await checkWritePolicy(query, req.actor);
      if (!verdict.ok) {
        console.log(`[query] ${method} ${q.table} -> ${verdict.status} ${verdict.body.error.message}`);
        return res.status(verdict.status).json(verdict.body);
      }
      query = verdict.query;
    }
    const result = await runQuery(query);
    if (result.error) {
      console.log(`[query] ${method} ${q.table} -> ${result.status} ${result.error.code || ''} ${JSON.stringify(result.error.message)?.slice(0, 160)}`);
      return res.status(result.status || 400).json(result);
    }
    res.json(result);
  } catch (err) {
    console.error('[api/query]', err);
    res.status(500).json({ data: null, error: { message: err?.message?.split('\n')[0], code: '500', details: null, hint: null } });
  }
});

// Compat ancien dbService : /api/db/... -> même moteur de requête simplifié
// Le contrôle de santé interroge réellement MySQL. La liste des models venait
// du client Prisma en mémoire (_runtimeDataModel) : elle renvoyait "ok" même
// avec une DATABASE_URL injoignable, ce qui masquait une base inopérante.
app.get('/api/db/health', async (req, res) => {
  const started = Date.now();
  try {
    const { getDb } = await import('./db.mjs');
    await getDb().$queryRaw`SELECT 1`;
    res.json({
      ok: true,
      database: 'reachable',
      latency_ms: Date.now() - started,
      models: ['events', 'categories', 'profiles', 'candidates', 'promotions'],
    });
  } catch (e) {
    const raw = String(e?.message || e);
    const lines = raw.split('\n').map((l) => l.trim()).filter(Boolean);
    // Prisma place la cause utile sur les lignes suivantes (« Can't reach
    // database server at `host:port` », « Access denied for user ... »).
    // Sans elles, un 503 n'apportait aucune information exploitable.
    const cause =
      lines.find((l) => /can't reach|can't connect|access denied|unknown database|timed out|ECONNREFUSED/i.test(l)) ||
      lines[1] ||
      lines[0] ||
      raw;
    res.status(503).json({
      ok: false,
      database: 'unreachable',
      latency_ms: Date.now() - started,
      error: cause,
    });
  }
});

// Edge functions locales : routées vers netlify/functions/<name>.cjs ou .js
// Compat : GET/POST /.netlify/functions/<name> <sous-chemin>?query  (emule Netlify)
async function dispatchFunction(name, sub, req, res) {
  let fnPath = path.join(ROOT, 'netlify', 'functions', `${name}.cjs`);
  if (!fs.existsSync(fnPath)) fnPath = path.join(ROOT, 'netlify', 'functions', `${name}.js`);
  if (!fs.existsSync(fnPath)) {
    res.status(404).json({ error: `Fonction locale introuvable : ${name}` });
    return;
  }
  try {
    delete require?.cache?.[require?.resolve?.(fnPath)];
  } catch (e) { /* ignore */ }
  const mod = await import(`file://${fnPath.replace(/\\/g, '/')}`);
  const handler = mod.handler;
  if (typeof handler !== 'function') {
    res.status(500).json({ error: `Mauvais handler pour ${name}` });
    return;
  }
  const fake = {
    rawUrl: req.originalUrl,
    path: `/${name}${sub ? '/' + sub : ''}`,
    body: req.method === 'POST' ? JSON.stringify(req.body ?? {}) : '',
    headers: { 'Content-Type': 'application/json' },
    httpMethod: req.method,
    queryStringParameters: req.query || {},
  };
  let result;
  try {
    result = await handler(fake);
  } catch (e) {
    console.error(`[functions/${name}]`, e);
    res.status(500).json({ error: `${e?.name}: ${e?.message?.split('\n')[0]}` });
    return;
  }
  let bodyPayload;
  const rawBody = result?.body;
  if (typeof rawBody === 'string' && rawBody.trim().startsWith('{')) {
    try { bodyPayload = JSON.parse(rawBody); } catch (e) { bodyPayload = rawBody; }
  } else {
    bodyPayload = rawBody ?? {};
  }
  const contentType = result?.headers?.['Content-Type'] || result?.headers?.['content-type'] || 'application/json';
  res.status(result?.statusCode || 200).type(contentType).send(typeof bodyPayload === 'string' ? bodyPayload : JSON.stringify(bodyPayload));
}

app.all('/.netlify/functions/:name/*', async (req, res) => {
  try {
    await dispatchFunction(req.params.name, req.params[0] || '', req, res);
  } catch (e) {
    console.error('[functions]', e);
    res.status(500).json({ error: `${e?.name}: ${e?.message?.split('\n')[0]}` });
  }
});

app.all('/.netlify/functions/:name', async (req, res) => {
  try {
    await dispatchFunction(req.params.name, '', req, res);
  } catch (e) {
    console.error('[functions]', e);
    res.status(500).json({ error: `${e?.name}: ${e?.message?.split('\n')[0]}` });
  }
});

app.post('/api/functions/:name', async (req, res) => {
  const { name } = req.params;
  let fnPath = path.join(ROOT, 'netlify', 'functions', `${name}.cjs`);
  if (!fs.existsSync(fnPath)) {
    fnPath = path.join(ROOT, 'netlify', 'functions', `${name}.js`);
  }
  if (!fs.existsSync(fnPath)) {
    return res.status(404).json({ data: null, error: { message: `Fonction locale introuvable : ${name}`, code: 'FUNCTION_NOT_FOUND', details: null, hint: null } });
  }
  try {
    delete require?.cache?.[require?.resolve?.(fnPath)];
  } catch (e) { /* ignore */ }
  const mod = await import(`file://${fnPath.replace(/\\/g, '/')}`);
  const handler = mod.handler;
  if (typeof handler !== 'function') {
    return res.status(500).json({ data: null, error: { message: `Mauvais handler pour ${name}`, code: 'BAD_HANDLER', details: null, hint: null } });
  }
  const body = req.body;
  const fake = {
    rawUrl: body?.rawUrl || body?.url || `/.netlify/functions/${name}/${body?.path || ''}`,
    path: body?.path || `/.netlify/functions${name}`,
    body: JSON.stringify({ ...(req.query || {}), ...(body && typeof body === 'object' ? body : {}) }),
    headers: { 'Content-Type': 'application/json' },
    httpMethod: 'POST',
    queryStringParameters: req.query || {},
  };
  let result;
  try {
    result = await handler(fake);
  } catch (e) {
    console.error(`[functions/${name}]`, e);
    return res.status(500).json({ data: null, error: { message: e?.message || 'Erreur interne', code: 'HANDLER_ERROR', details: null, hint: null } });
  }
  let bodyPayload;
  const rawBody = result?.body;
  if (typeof rawBody === 'string' && rawBody.trim().startsWith('{')) {
    try { bodyPayload = JSON.parse(rawBody); } catch (e) { bodyPayload = rawBody; }
  } else {
    bodyPayload = rawBody ?? {};
  }
  const contentType = result?.headers?.['Content-Type'] || result?.headers?.['content-type'] || 'application/json';
  return res.status(result?.statusCode || 200).type(contentType).send(typeof bodyPayload === 'string' ? bodyPayload : JSON.stringify(bodyPayload));
});

// Médias : tout fichier sous /media ou /storage/v1/object/public/<bucket>/<path>
const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(ROOT, 'storage', 'public');
fs.mkdirSync(MEDIA_ROOT, { recursive: true });
app.use('/media', express.static(MEDIA_ROOT));
app.use('/storage/v1/object/public', express.static(MEDIA_ROOT));

// Placeholder d'image généré côté serveur (fallback photo_url des candidats…)
const clampDim = (v, fallback) => {
  const n = Math.floor(Number(v));
  return Number.isFinite(n) && n > 0 ? Math.min(2048, n) : fallback;
};
app.get('/api/placeholder/:w/:h', (req, res) => {
  const w = clampDim(req.params.w, 64);
  const h = clampDim(req.params.h, 64);
  const m = Math.max(2, Math.round(Math.min(w, h) * 0.18));
  const rx = Math.max(2, Math.round(Math.min(w, h) * 0.06));
  const stroke = Math.max(1, Math.round(Math.min(w, h) / 16));
  const cx = Math.round(w * 0.36);
  const cy = Math.round(h * 0.38);
  const r = Math.max(2, Math.round(Math.min(w, h) * 0.09));
  const gy = Math.round(h * 0.55);
  const px = Math.round(w * 0.42);
  const p2 = Math.round(w * 0.58);
  const p3x = Math.round(w * 0.62);
  const p3y = Math.round(h * 0.62);
  const p4x = Math.round(w * 0.78);
  const p5x = Math.round(w * 0.9);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="100%" height="100%" fill="#111827"/><rect x="${m}" y="${m}" width="${w - 2 * m}" height="${h - 2 * m}" rx="${rx}" fill="none" stroke="#374151" stroke-width="${stroke}"/><circle cx="${cx}" cy="${cy}" r="${r}" fill="none" stroke="#4b5563" stroke-width="${stroke}"/><path d="M ${m} ${h - m} L ${px} ${gy} L ${p2} ${h - m} Z M ${p3x} ${p3y} L ${p4x} ${h - m} L ${p5x} ${h - m}" fill="none" stroke="#4b5563" stroke-width="${stroke}" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
  res.set('Content-Type', 'image/svg+xml');
  res.set('Cache-Control', 'public, max-age=86400');
  res.send(svg);
});

// Build statique (production)
const DIST = path.join(ROOT, 'dist');
if (fs.existsSync(DIST)) {
  app.use(express.static(DIST));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api') || req.path.startsWith('/media') || req.path.startsWith('/storage/')) return next();
    res.sendFile(path.join(DIST, 'index.html'));
  });
}

// CanSDO: éviter l'écrasement des erreurs aval
app.use((req, res) => res.status(404).json({ error: `Route introuvable : ${req.path}` }));

app.listen(PORT, () => {
  console.log(`BonPlan Infos server local -> http://localhost:${PORT}`);
  console.log(`  Media : ${MEDIA_ROOT}`);
});

const PURGE_ENABLED = process.env.PURGE_FINISHED_ENABLED !== 'false';
const PURGE_INTERVAL_H = Math.max(1, parseInt(process.env.PURGE_FINISHED_INTERVAL_HOURS || '24', 10));
if (PURGE_ENABLED) {
  const runPurge = async () => {
    try {
      const dryRun = process.env.PURGE_FINISHED_DRY_RUN === 'true';
      const r = await purgeOldEvents({ dryRun });
      const detail = r.candidateCount
        ? `${r.purgedEvents} purgés / ${r.candidateCount} détectés, tables absentes: ${r.missingTables.length}`
        : '0 événement passé détecté';
      console.log(`[purge] ${detail}${dryRun ? ' (dry run)' : ''}`);
    } catch (e) {
      console.error('[purge]', e?.message);
    }
  };
  setTimeout(() => {
    runPurge();
    setInterval(runPurge, PURGE_INTERVAL_H * 3600 * 1000);
  }, 60_000);
}
