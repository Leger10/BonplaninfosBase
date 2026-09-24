import { execFileSync } from 'node:child_process';

const MYSQL = 'C:/xampp/mysql/bin/mysql.exe';
const run = (sql) =>
  execFileSync(MYSQL, ['-u', 'root', '-N', '-B', '-e', sql], { encoding: 'utf8' });

// tables SANS clé primaire
const noPk = run(`SELECT table_name FROM information_schema.tables t
  WHERE table_schema='bonplaninfos'
    AND table_type='BASE TABLE'
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints c
      WHERE c.table_schema=t.table_schema AND c.table_name=t.table_name
        AND c.constraint_type='PRIMARY KEY')`)
  .trim().split('\n').map((s) => s.replace(/\r$/, '')).filter(Boolean);

// colonnes de chaque table
const colsByTable = new Map();
for (const t of noPk) {
  const cols = run(`SELECT column_name FROM information_schema.columns
    WHERE table_schema='bonplaninfos' AND table_name='${t}'`)
    .trim().split('\n').map((s) => s.replace(/\r$/, '')).filter(Boolean);
  colsByTable.set(t, cols);
}

const plans = [];
const problems = [];
for (const t of noPk) {
  const cols = colsByTable.get(t);
  let key;
  if (cols.includes('id')) key = 'id';
  else if (t === 'app_config' && cols.includes('key')) key = 'key';
  else if (t === 'coupons' && cols.includes('code')) key = 'code';
  if (!key) { problems.push(`${t} : pas de candidat (colonnes: ${cols.join(',')})`); continue; }

  const nullCount = parseInt(run(`SELECT COUNT(*) FROM bonplaninfos.\`${t}\` WHERE \`${key}\` IS NULL`), 10);
  if (nullCount > 0) { problems.push(`${t}.${key} : ${nullCount} NULL`); continue; }
  const dup = run(`SELECT \`${key}\`, COUNT(*) c FROM bonplaninfos.\`${t}\` GROUP BY \`${key}\` HAVING c>1 LIMIT 1`).trim();
  if (dup) { problems.push(`${t}.${key} : doublons (${dup.split('\t')[0]})`); continue; }
  plans.push(`ALTER TABLE bonplaninfos.\`${t}\` ADD PRIMARY KEY (\`${key}\`);`);
}

console.log(`tables sans PK : ${noPk.length}`);
console.log(`ALTER à appliquer : ${plans.length}`);
if (problems.length) { console.log('--- PROBLÈMES (non traités) ---'); console.log(problems.join('\n')); }

const applied = [];
for (const sql of plans) {
  try { execFileSync(MYSQL, ['-u', 'root', '-e', sql]); applied.push(sql); }
  catch (e) { problems.push(`ECHEC ${sql} -> ${String(e).split('\n')[0]}`); }
}
console.log('PK ajoutées :', applied.length);
console.log('--- après application ---');
const after = run(`SELECT COUNT(*) FROM information_schema.tables t
  WHERE table_schema='bonplaninfos' AND table_type='BASE TABLE'
    AND NOT EXISTS (
      SELECT 1 FROM information_schema.table_constraints c
      WHERE c.table_schema=t.table_schema AND c.table_name=t.table_name
        AND c.constraint_type='PRIMARY KEY')`).trim();
console.log('tables encore sans PK :', after);
if (problems.length) { console.log('--- restant ---'); console.log(problems.join('\n')); }