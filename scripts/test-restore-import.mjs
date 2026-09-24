// Test d'import complet : rejoue schéma + données dans une base vierge (bonplaninfos_testexport).
// Usage : node scripts/test-restore-import.mjs
import fs from 'node:fs';
import path from 'node:path';
import mysql from 'mysql2/promise';

async function main() {
  const targetDb = 'bonplaninfos_testexport';
  const schemaFile = path.resolve('db/mysql-schema.sql');
  const dataFile = path.resolve('db/export-mysql-data.sql');
  if (!fs.existsSync(schemaFile) || !fs.existsSync(dataFile)) {
    console.error('Fichiers dump manquants');
    process.exit(1);
  }
  const conn = await mysql.createConnection({ uri: 'mysql://root:@localhost:3306', multipleStatements: true });
  try {
    await conn.query(`DROP DATABASE IF EXISTS \`${targetDb}\``);
    await conn.query(`CREATE DATABASE \`${targetDb}\` CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci`);
    await conn.query(`USE \`${targetDb}\``);
    console.log('db créée:', targetDb);

    // Schéma : le serveur gère le multi-statements complet (testé OK).
    console.log('→ import schéma...');
    await conn.query({ sql: fs.readFileSync(schemaFile, 'utf8'), multipleStatements: true });
    console.log('→ schéma OK');

    // Données : chaque INSERT envoyé séparément (respecte max_allowed_packet).
    const data = fs.readFileSync(dataFile, 'utf8');
    const pieces = data.split(/\n(?=INSERT INTO)/).map((p) => p.trim()).filter(Boolean);
    let ok = 0, err = 0;
    for (const p of pieces) {
      try { await conn.query(p); ok++; }
      catch (e) {
        err++;
        const m = p.match(/INSERT INTO `([\w]+)`/);
        console.error('ERR ligne=' + (m ? m[1] : '?') + ' ::', String(e.message).split('\n')[0]);
      }
    }
    console.log(`→ données: ${ok} INSERT ok / ${err} erreurs`);

    const [tbl] = await conn.query('SELECT COUNT(*) n FROM information_schema.tables WHERE table_schema=?', [targetDb]);
    const [ev] = await conn.query('SELECT COUNT(*) n FROM events');
    const [ca] = await conn.query('SELECT COUNT(*) n FROM candidates');
    const [us] = await conn.query('SELECT COUNT(*) n FROM auth_users');
    console.log(`tables=${tbl[0].n} events=${ev[0].n} candidates=${ca[0].n} auth_users=${us[0].n}`);
  } finally {
    try { await conn.query(`DROP DATABASE IF EXISTS \`${targetDb}\``); console.log('db test supprimée.'); } catch {}
    await conn.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });