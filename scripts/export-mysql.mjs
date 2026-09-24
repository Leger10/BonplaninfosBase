#!/usr/bin/env node
// Export des DONNÉES de la base MySQL locale actuelle vers SQL portable.
// Usage : node scripts/export-mysql.mjs  ->  db/export-mysql-data.sql
// Le schéma est déjà fourni par db/mysql-schema.sql (structure identique).
import fs from 'node:fs';
import path from 'node:path';
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

function esc(v) {
  if (v === null || v === undefined) return 'NULL';
  if (typeof v === 'bigint') return v.toString();
  if (Buffer.isBuffer(v)) return `X'${v.toString('hex')}'`;
  if (v instanceof Date) {
    const s = v.toISOString().replace('T', ' ').replace('Z', '');
    return `'${s}'`;
  }
  if (typeof v === 'number') return String(v);
  return `'${String(v).replace(/\\/g, '\\\\').replace(/'/g, "''")}'`;
}

async function allTables() {
  const rows = await prisma.$queryRawUnsafe(
    `SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name`,
  );
  return rows.map((r) => r.TABLE_NAME || r.table_name).filter(Boolean);
}

async function exportTable(table) {
  const rows = await prisma.$queryRawUnsafe(`SELECT * FROM \`${table}\``);
  if (!rows.length) return [];
  const cols = Object.keys(rows[0]);
  const lines = rows.map((r) => {
    const values = cols.map((c) => {
      let val = r[c];
      // JSON/Objets déjà sérialisés par le driver
      if (typeof val === 'object' && val !== null && !Buffer.isBuffer(val) && !(val instanceof Date)) {
        val = JSON.stringify(val);
      }
      return esc(val);
    });
    return `(${values.join(',')})`;
  });
  // Découper par lots d'environ 256 Ko pour respecter max_allowed_packet
  const groups = [];
  let batch = [];
  let batchSize = 0;
  for (const line of lines) {
    batch.push(line);
    batchSize += line.length;
    if (batchSize >= 262144) {
      groups.push(
        `INSERT INTO \`${table}\` (\`${cols.join('`,`')}\`) VALUES\n${batch.join(',\n')};`,
      );
      batch = [];
      batchSize = 0;
    }
  }
  if (batch.length) {
    groups.push(
      `INSERT INTO \`${table}\` (\`${cols.join('`,`')}\`) VALUES\n${batch.join(',\n')};`,
    );
  }
  return [`-- Table: ${table} (${rows.length} rows)`, ...groups, ''];
}

(async () => {
  try {
    const tables = await allTables();
    const outDir = path.resolve('db');
    fs.mkdirSync(outDir, { recursive: true });
    const chunks = [
      '-- Données MySQL exportées depuis la base locale (script export-mysql.mjs)',
      'SET NAMES utf8mb4;',
      'SET FOREIGN_KEY_CHECKS=0;',
      '',
    ];
    for (const t of tables) {
      const lines = await exportTable(t);
      chunks.push(...lines);
    }
    chunks.push('SET FOREIGN_KEY_CHECKS=1;');
    fs.writeFileSync(path.join(outDir, 'export-mysql-data.sql'), chunks.join('\n'), 'utf8');
    console.log(`✔ Export terminé : ${tables.length} tables -> db/export-mysql-data.sql`);
  } catch (e) {
    console.error('Export échoué:', e);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
})();