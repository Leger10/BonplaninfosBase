import { spawnSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const bin = (p) => path.join(ROOT, 'node_modules', p);

function run(args, label) {
  const r = spawnSync(process.execPath, args, { cwd: ROOT, stdio: 'inherit' });
  if (r.status !== 0) {
    console.error(`[postinstall] ${label} a echoue (code ${r.status})`);
    process.exit(r.status ?? 1);
  }
}

run([bin('prisma/build/index.js'), 'generate'], 'prisma generate');

if (existsSync(path.join(ROOT, 'dist/index.html'))) {
  console.log('[postinstall] dist/ deja present, build Vite ignore');
} else {
  run([bin('vite/dist/node/cli.js'), 'build'], 'vite build');
}