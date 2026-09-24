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

const app = express();
app.set('json spaces', 2);
app.use(express.json({ limit: '30mb' }));

const PORT = process.env.PORT || 8888;

// API
app.use('/api/auth', authRouter);
app.use('/api/storage', storageRouter);
app.use('/api/rpc', rpcRouter);
app.post('/api/query', async (req, res) => {
  try {
    const result = await runQuery(req.body || {});
    if (result.error) return res.status(result.status || 400).json(result);
    res.json(result);
  } catch (err) {
    console.error('[api/query]', err);
    res.status(500).json({ data: null, error: { message: err?.message?.split('\n')[0], code: '500', details: null, hint: null } });
  }
});

// Compat ancien dbService : /api/db/... -> même moteur de requête simplifié
app.get('/api/db/health', async (req, res) => {
  res.json({ ok: true, models: ['events', 'categories', 'profiles', 'candidates', 'promotions'] });
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