#!/usr/bin/env node
/**
 * Synchronise les médias locaux (storage/public) vers le serveur de production
 * via l'API existante /api/storage/upload (aucun accès SSH requis).
 *
 * Usage (PowerShell) :
 *   node scripts/sync-media-to-prod.mjs --url https://bonplaninfos.net --email admin@exemple.com
 *   (le mot de passe est demandé, ou via PROD_PASSWORD)
 *
 * Options :
 *   --url <url>            URL de production (défaut: https://bonplaninfos.net)
 *   --email <email>        Compte (idéalement super_admin) pour s'authentifier
 *   --dir <path>           Dossier local à synchroniser (défaut: storage/public)
 *   --concurrency <n>      Uploads parallèles (défaut: 4)
 *   --limit <n>            Ne traiter que les n premiers fichiers (test)
 *   --dry-run              Liste ce qui serait envoyé, sans rien envoyer
 *   --skip-existing        Ne pas revérifier les fichiers déjà présents (défaut: vérifie)
 *   --include <substr>     Ne traiter que les chemins contenant ce texte
 *
 * Le script est idempotent : il vérifie d'abord l'URL publique de chaque fichier
 * et ne réenvoie que les manquants (404).
 */
import fs from 'node:fs/promises';
import path from 'node:path';
import readline from 'node:readline/promises';
import { stdin as input, stdout as output } from 'node:process';

function parseArgs(argv) {
  const out = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (!a.startsWith('--')) { out._.push(a); continue; }
    const key = a.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith('--')) { out[key] = true; }
    else { out[key] = next; i++; }
  }
  return out;
}

const args = parseArgs(process.argv.slice(2));
const BASE_URL = String(args.url || process.env.PROD_URL || 'https://bonplaninfos.net').replace(/\/+$/, '');
const ROOT = path.resolve(args.dir || process.env.MEDIA_DIR || 'storage/public');
const CONCURRENCY = Math.max(1, Math.min(12, Number(args.concurrency || 4)));
const LIMIT = Math.max(0, Number(args.limit || 0));
const DRY_RUN = args['dry-run'] === true;
const INCLUDE = args.include ? String(args.include) : '';
const CHECK_EXISTING = args['skip-existing'] !== true;

const IMAGE_TYPES = {
  '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png',
  '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf', '.mp4': 'video/mp4', '.webm': 'video/webm',
  '.mp3': 'audio/mpeg', '.wav': 'audio/wav', '.ico': 'image/x-icon',
  '.avif': 'image/avif',
};

async function walk(dir) {
  const out = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) out.push(...await walk(full));
    else if (e.isFile()) out.push(full);
  }
  return out;
}

function encodePath(rel) {
  return rel.split('/').map((s) => encodeURIComponent(s)).join('/');
}

async function login(email, password) {
  const res = await fetch(`${BASE_URL}/api/auth/signin`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  let json = null;
  try { json = await res.json(); } catch (_) {}
  if (!res.ok || json?.error) {
    const msg = json?.error?.message || json?.message || `HTTP ${res.status}`;
    throw new Error(`Connexion impossible : ${msg}`);
  }
  const token = json?.data?.session?.access_token;
  if (!token) throw new Error('Connexion réussie mais aucun access_token reçu.');
  const profile = json?.data?.user?.profile || json?.data?.user || {};
  return { token, profile };
}

async function exists(publicUrl) {
  try {
    const res = await fetch(publicUrl, { method: 'HEAD', headers: { Accept: '*/*' } });
    if (res.status === 200) return true;
    if (res.status === 404) return false;
    // Certains serveurs ne gèrent pas HEAD : on tente un GET très partiel.
    const g = await fetch(publicUrl, { method: 'GET', headers: { Range: 'bytes=0-0', Accept: '*/*' } });
    return g.status === 200 || g.status === 206;
  } catch (_) {
    return false;
  }
}

async function uploadOne(item, token) {
  const uploadUrl = `${BASE_URL}/api/storage/upload?bucket=${encodeURIComponent(item.bucket)}&path=${encodeURIComponent(item.objectPath)}`;
  const bytes = await fs.readFile(item.fullPath);
  const res = await fetch(uploadUrl, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/octet-stream',
      Accept: 'application/json',
    },
    body: bytes,
  });
  let json = null;
  try { json = await res.json(); } catch (_) {}
  if (!res.ok || json?.error) {
    const err = new Error(json?.error?.message || json?.message || `HTTP ${res.status}`);
    err.status = res.status;
    throw err;
  }
}

async function main() {
  console.log(`Source : ${ROOT}`);
  console.log(`Cible  : ${BASE_URL}`);
  if (DRY_RUN) console.log('Mode   : DRY RUN (aucun envoi)\n');

  let stat;
  try { stat = await fs.stat(ROOT); } catch (_) {
    console.error(`Dossier introuvable : ${ROOT}`);
    process.exit(1);
  }
  if (!stat.isDirectory()) {
    console.error(`Ce n'est pas un dossier : ${ROOT}`);
    process.exit(1);
  }

  let files = await walk(ROOT);
  if (INCLUDE) files = files.filter((f) => f.replaceAll('\\', '/').includes(INCLUDE));
  files.sort();
  if (LIMIT) files = files.slice(0, LIMIT);
  console.log(`${files.length} fichier(s) à examiner.\n`);

  let token = '';
  if (!DRY_RUN) {
    let email = args.email || process.env.PROD_EMAIL || '';
    let password = args.password || process.env.PROD_PASSWORD || '';
    if (!email) {
      const rl = readline.createInterface({ input, output });
      email = (await rl.question('Email du compte de production : ')).trim();
      if (!password) password = await rl.question('Mot de passe : ');
      await rl.close();
    } else if (!password) {
      const rl = readline.createInterface({ input, output });
      password = await rl.question('Mot de passe : ');
      await rl.close();
    }
    if (!email || !password) {
      console.error('Email et mot de passe requis.');
      process.exit(1);
    }
    const auth = await login(email, password);
    token = auth.token;
    const t = String(auth.profile?.user_type || auth.profile?.profile?.user_type || '');
    console.log(`Connecté : ${email}${t ? ` (${t})` : ''}\n`);
  }

  const items = files.map((fullPath) => {
    const rel = path.relative(ROOT, fullPath).replaceAll('\\', '/');
    const parts = rel.split('/');
    return { fullPath, rel, bucket: parts[0], objectPath: parts.slice(1).join('/') };
  }).filter((x) => x.bucket && x.objectPath);

  let uploaded = 0;
  let skipped = 0;
  let failed = 0;
  const failures = [];
  let fatal = null;

  let index = 0;
  async function worker() {
    while (true) {
      if (fatal) return;
      const i = index++;
      if (i >= items.length) return;
      const item = items[i];
      const publicUrl = `${BASE_URL}/storage/v1/object/public/${encodePath(item.rel)}`;
      const total = items.length;
      const label = `[${i + 1}/${total}] ${item.rel}`;
      try {
        if (CHECK_EXISTING && await exists(publicUrl)) {
          skipped++;
          console.log(`⏭  ${label}`);
          continue;
        }
        if (DRY_RUN) {
          uploaded++;
          console.log(`📤 ${label}`);
          continue;
        }
        await uploadOne(item, token);
        uploaded++;
        console.log(`✅ ${label}`);
      } catch (e) {
        const status = e?.status;
        if (status === 401 || status === 403) {
          fatal = `Accès refusé (${status}) : ${e.message}. Vérifiez que le compte est autorisé.`;
          return;
        }
        failed++;
        failures.push({ rel: item.rel, error: e?.message || String(e) });
        console.error(`❌ ${label} — ${e?.message || e}`);
      }
    }
  }

  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));

  console.log('\n──────── Résumé ────────');
  console.log(`Envoyés  : ${uploaded}`);
  console.log(`Déjà présents : ${skipped}`);
  console.log(`Échecs   : ${failed}`);
  if (failures.length) {
    console.log('\nÉchecs :');
    for (const f of failures.slice(0, 30)) console.log(` - ${f.rel} : ${f.error}`);
    if (failures.length > 30) console.log(` … et ${failures.length - 30} autre(s).`);
  }
  if (fatal) {
    console.error(`\nArrêt : ${fatal}`);
    process.exit(2);
  }
  if (failed) process.exit(3);
}

main().catch((e) => {
  console.error(`Erreur : ${e?.message || e}`);
  process.exit(1);
});
