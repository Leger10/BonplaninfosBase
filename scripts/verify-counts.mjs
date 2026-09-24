import fs from 'node:fs';
import { execFileSync } from 'node:child_process';

const lines = fs.readFileSync('db_cluster-21-09-2026@02-42-49.backup (1)', 'utf8').split('\n');
const schemaFile = fs.readFileSync('db/mysql-schema.sql', 'utf8');
const migrated = new Set();
for (const m of schemaFile.matchAll(/CREATE TABLE `([a-z0-9_]+)`/g)) migrated.add(m[1]);
const src = new Map();
for (let i = 0; i < lines.length; i++) {
  const m = lines[i].match(/^COPY\s+(?:(public|auth)\.)?([A-Za-z0-9_]+)\s*\(.*FROM\s+stdin;$/);
  if (!m) continue;
  const table = m[1] === 'auth' ? `auth_${m[2]}` : m[2];
  let n = 0;
  for (let j = i + 1; j < lines.length && lines[j].trim() !== '\\.'; j++) n++;
  src.set(table, n);
  i += n + 1;
}

const names = [...src.keys()].map((t) => `'${t}'`).join(',');
const q =
  'SELECT table_name, table_rows FROM information_schema.tables ' +
  `WHERE table_schema='bonplaninfos' AND table_name IN (${names});`;
const out = execFileSync('C:/xampp/mysql/bin/mysql.exe', ['-u', 'root', '-N', '-B', '-e', q], { encoding: 'utf8' });
const dst = new Map();
for (const l of out.trim().split('\n')) {
  const [t, r] = l.split('\t');
  if (t) dst.set(t, parseInt(r, 10));
}

let bad = 0;
for (const [t, s] of src) {
  if (!migrated.has(t)) continue;
  const d = dst.get(t) ?? 0;
  // information_schema.table_rows est approximatif avec InnoDB -> on re-compte via SELECT COUNT(*)
  let real;
  try {
    real = parseInt(
      execFileSync('C:/xampp/mysql/bin/mysql.exe', ['-u', 'root', '-N', '-e', `SELECT COUNT(*) FROM bonplaninfos.\`${t}\``], { encoding: 'utf8' }),
      10
    );
  } catch {
    real = -1;
  }
  if (real !== s) {
    bad++;
    console.log(`DIFFERE  ${t}: src=${s} mysql=${real}`);
  }
}
console.log(bad === 0 ? `✔ ${src.size} tables : tous les comptages correspondent` : `✘ ${bad}/${src.size} tables différentes`);