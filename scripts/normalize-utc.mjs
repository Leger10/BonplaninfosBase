import { execFileSync } from 'node:child_process';

const MYSQL = 'C:/xampp/mysql/bin/mysql.exe';
const DB = 'bonplaninfos';
const APPLY = process.argv.includes('--apply');

const run = (sql) =>
  execFileSync(MYSQL, ['-u', 'root', '-N', '-B', '-e', sql], { encoding: 'utf8' })
    .trim().split('\n').map((s) => s.replace(/\r$/, ''));

const offsetMin = parseInt(run(`SELECT TIMESTAMPDIFF(MINUTE, UTC_TIMESTAMP(), NOW())`)[0], 10);
console.log(`Décalage serveur vs UTC : ${offsetMin} min`);

const rows = run(
  `SELECT table_name, column_name, data_type
     FROM information_schema.columns
    WHERE table_schema='${DB}'
      AND data_type IN ('datetime','timestamp','date','time')
    ORDER BY table_name, ordinal_position`
).map((l) => {
  const [t, c, ty] = l.split('\t');
  return { t, c, ty };
});
console.log(`Colonnes date/heure : ${rows.length}`);

const nonNull = [];
for (const { t, c } of rows) {
  const n = parseInt(run(`SELECT COUNT(*) FROM \`${DB}\`.\`${t}\` WHERE \`${c}\` IS NOT NULL`)[0], 10);
  nonNull.push({ ...rows.find((x) => x.t === t && x.c === c), n });
}
console.log(`Valeurs non NULL à examiner : ${nonNull.reduce((a, b) => a + b.n, 0)}`);

if (APPLY) {
  let changed = 0, done = 0;
  for (const { t, c, ty, n } of nonNull) {
    if (ty !== 'datetime' && ty !== 'timestamp') continue;
    const out = run(`UPDATE \`${DB}\`.\`${t}\` SET \`${c}\` = CONVERT_TZ(\`${c}\`, 'SYSTEM', '+00:00')
      WHERE \`${c}\` IS NOT NULL; SELECT ROW_COUNT();`).pop();
    changed += n;
    done++;
    console.log(`  converti ${t}.${c} (${n} lignes)`);
  }
  console.log(`APPLY terminé : ${done} colonnes DateTime normalisées vers UTC (${changed} valeurs).`);
} else {
  console.log('Mode vérification (sans --apply).');
  if (offsetMin === 0) console.log('✔ Aucun décalage : les valeurs DATETIME sont déjà UTC.');
  else console.log(`⚠ Décalage ${offsetMin} min : relancer avec --apply pour convertir les DATETIME en UTC.`);
  for (const t of nonNull.slice(0, 8)) console.log(`  ex: ${t.t}.${t.c} (${t.ty}, ${t.n} valeurs)`);
}