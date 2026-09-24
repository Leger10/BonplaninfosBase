// Storage local : émule supabase.storage sur le système de fichiers.
// Racine : <ROOT>/storage/public/<bucket>/<path>
import { Router } from 'express';
import path from 'node:path';
import fs from 'node:fs';
import crypto from 'node:crypto';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const MEDIA_ROOT = process.env.MEDIA_ROOT || path.join(ROOT, 'storage', 'public');
fs.mkdirSync(MEDIA_ROOT, { recursive: true });

const r = Router();
r.use(expressRaw());

function expressRaw() {
  return (req, res, next) => {
    if (req.method !== 'POST') return next();
    const ct = req.headers['content-type'] || '';
    // JSON : express.json global a déjà consommé et parsé -> rawBuffer = JSON serialisé
    if (ct.includes('application/json') || ct.includes('text/plain') || req.body && typeof req.body === 'object' && Object.keys(req.body).length) {
      try {
        req.rawBody = Buffer.from(JSON.stringify(req.body));
      } catch (e) {
        req.rawBody = Buffer.alloc(0);
      }
      return next();
    }
    const chunks = [];
    req.on('data', (c) => chunks.push(c));
    req.on('end', () => {
      try {
        req.rawBody = Buffer.concat(chunks);
      } catch (e) {
        req.rawBody = Buffer.alloc(0);
      }
      next();
    });
    req.on('error', (e) => next(e));
  };
}

function safePath(bucket, filePath) {
  const p = path.normalize(filePath || '').replace(/^(\.\.(\/|\\|$))+/, '');
  const bucketNorm = path.normalize(bucket || '').replace(/^(\.\.(\/|\\|$))+/, '');
  const full = path.resolve(MEDIA_ROOT, bucketNorm, p);
  if (!full.startsWith(path.resolve(MEDIA_ROOT))) {
    throw new Error('Chemin invalide');
  }
  return full;
}

function walkFiles(dir) {
  const out = [];
  if (!fs.existsSync(dir)) return out;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walkFiles(full));
    else out.push(full);
  }
  return out;
}

r.post('/upload', (req, res) => {
  try {
    const bucket = req.query.bucket || req.body?.bucket || 'media';
    const filePath = req.query.path || req.body?.path;
    const contentType = req.query.contentType || req.headers['content-type'] || 'application/octet-stream';
    let data;
    if (req.query.bucket || req.headers['content-type']?.startsWith('application/octet-stream')) {
      data = req.rawBody || Buffer.alloc(0);
    } else if (req.body?.data) {
      data = Buffer.from(req.body.data, 'base64');
    } else {
      data = req.rawBody || Buffer.alloc(0);
    }
    if (!filePath) return res.status(400).json({ data: null, error: { message: 'path requis' }, status: 400 });
    const full = safePath(bucket, filePath);
    fs.mkdirSync(path.dirname(full), { recursive: true });
    fs.writeFileSync(full, data);
    const id = crypto.randomUUID();
    return res.json({ data: { path: filePath, id, fullPath: `${bucket}/${filePath}`, cacheControl: req.query.cacheControl || '3600' }, error: null });
  } catch (e) {
    console.error('[storage/upload]', e);
    return res.status(400).json({ data: null, error: { message: e.message } });
  }
});

r.post('/public-url', (req, res) => {
  try {
    const { bucket, path: p } = req.body || {};
    if (!bucket || !p) return res.status(400).json({ data: null, error: { message: 'bucket et path requis' } });
    const publicUrl = `${req.protocol}://${req.get('host')}/storage/v1/object/public/${bucket}/${p}`;
    return res.json({ data: { publicUrl }, error: null });
  } catch (e) {
    return res.status(400).json({ data: null, error: { message: e.message } });
  }
});

r.post('/signed-url', (req, res) => {
  const { bucket, path: p } = req.body || {};
  if (!bucket || !p) return res.status(400).json({ data: null, error: { message: 'bucket et path requis' } });
  const signedUrl = `${req.protocol}://${req.get('host')}/storage/v1/object/public/${bucket}/${p}`;
  return res.json({ data: { signedUrl, path: p }, error: null });
});

r.post('/remove', (req, res) => {
  try {
    const { bucket, paths } = req.body || {};
    const list = Array.isArray(paths) ? paths : [paths];
    let removed = 0;
    for (const p of list) {
      const full = safePath(bucket, p);
      if (fs.existsSync(full)) {
        fs.unlinkSync(full);
        removed++;
      }
    }
    return res.json({ data: { path: list, removed }, error: null });
  } catch (e) {
    return res.status(400).json({ data: null, error: { message: e.message } });
  }
});

r.post('/list', (req, res) => {
  try {
    const { bucket, path: p } = req.body || {};
    const dir = safePath(bucket, p || '');
    const files = walkFiles(dir).map((f) => path.relative(safePath(bucket, ''), f).replace(/\\/g, '/'));
    return res.json({ data: files.map((name) => ({ name })), error: null });
  } catch (e) {
    return res.status(400).json({ data: null, error: { message: e.message } });
  }
});

export const storageRouter = r;