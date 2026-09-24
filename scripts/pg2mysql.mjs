#!/usr/bin/env node
// Convertisseur dump cluster PostgreSQL (Supabase) -> MySQL
// Usage : node scripts/pg2mysql.mjs "chemin/vers/backup.backup"
// Sortie : db/mysql-schema.sql + db/mysql-data.sql
import fs from 'node:fs';
import path from 'node:path';

const INPUT = process.argv[2];
if (!INPUT) {
  console.error('Usage : node scripts/pg2mysql.mjs <fichier.backup>');
  process.exit(1);
}

// Tables firendues : public.* + auth.users uniquement (le reste est interne à Supabase)
const SCHEMAS_ALLOWED = new Set(['public']);
const AUTH_TABLES_OK = new Set(['users']);

const text = fs.readFileSync(INPUT, 'utf8');
const lines = text.split('\n');

// ---------------------------------------------------------------- types PG -> MySQL
const TYPE_MAP = [
  { re: /^uuid$/i, out: (p, s) => 'CHAR(36)' },
  { re: /^bigint$/i, out: (p, s) => 'BIGINT' },
  { re: /^bigserial$/i, out: (p, s) => 'BIGINT AUTO_INCREMENT' },
  { re: /^smallint$/i, out: (p, s) => 'SMALLINT' },
  { re: /^integer$/i, out: (p, s) => 'INT' },
  { re: /^serial$/i, out: (p, s) => 'INT AUTO_INCREMENT' },
  { re: /^numeric\s*\(\s*(\d+)\s*,\s*(\d+)\s*\)$/i, out: (p, s) => `DECIMAL(${s[1]},${s[2]})` },
  { re: /^numeric$/i, out: () => 'DECIMAL(20,4)' },
  { re: /^real$/i, out: () => 'FLOAT' },
  { re: /^double\s+precision$/i, out: () => 'DOUBLE' },
  { re: /^boolean$/i, out: () => 'TINYINT(1)' },
  { re: /^timestamp\s+with\s+time\s+zone$/i, out: () => 'DATETIME' },
  { re: /^timestamp\s+without\s+time\s+zone$/i, out: () => 'DATETIME' },
  { re: /^timestamp$/i, out: () => 'DATETIME' },
  { re: /^date$/i, out: () => 'DATE' },
  { re: /^time\s+with\s+time\s+zone$/i, out: () => 'TIME' },
  { re: /^time\s+without\s+time\s+zone$/i, out: () => 'TIME' },
  { re: /^time$/i, out: () => 'TIME' },
  { re: /^jsonb$/i, out: () => 'JSON' },
  { re: /^json$/i, out: () => 'JSON' },
  { re: /^bytea$/i, out: () => 'LONGBLOB' },
  { re: /^bytea\s*$/i, out: () => 'LONGBLOB' },
  { re: /^character\s+varying\s*\(\s*(\d+)\s*\)$/i, out: (p, s) => `VARCHAR(${s[1]})` },
  { re: /^varchar\s*\(\s*(\d+)\s*\)$/i, out: (p, s) => `VARCHAR(${s[1]})` },
  { re: /^character\s*\(\s*(\d+)\s*\)$/i, out: (p, s) => `CHAR(${s[1]})` },
  { re: /^char\s*\(\s*(\d+)\s*\)$/i, out: (p, s) => `CHAR(${s[1]})` },
  { re: /^text\[\]$/i, out: () => 'JSON' },
  { re: /^citext$/i, out: () => 'VARCHAR(255)' },
  { re: /^text$/i, out: () => 'TEXT' },
  { re: /^name$/i, out: () => 'VARCHAR(63)' },
  { re: /^oid$/i, out: () => 'BIGINT UNSIGNED' },
];
// Vrai si le type PG nécessite un VARCHAR (indexable MySQL) quand il est dans une clé.
const TEXT_ISH = /text|citext|name/i;

function mapType(pgType, isKey) {
  const t = pgType.trim();
  for (const { re, out } of TYPE_MAP) {
    const m = t.match(re);
    if (m) {
      if (TEXT_ISH.test(t) && isKey) return 'VARCHAR(191)';
      return out ? out(null, m) : m[0];
    }
  }
  // Type inconnu : péchés par excès de sécurité
  if (TEXT_ISH.test(t)) return isKey ? 'VARCHAR(191)' : 'TEXT';
  return 'TEXT';
}

// ---------------------------------------------------------------- parsing CREATE TABLE
function parseCreateTable(block) {
  // retire le préfixe "CREATE TABLE <schema>.<name> ("
  const head = block[0];
  const m = head.match(/^CREATE TABLE\s+(?:(auth|public)\.)?([A-Za-z0-9_]+)\s*\($/);
  if (!m) return null;
  const schema = m[1] || 'public';
  if (!SCHEMAS_ALLOWED.has(schema) && !(schema === 'auth' && AUTH_TABLES_OK.has(m[2]))) return null;
  const table = schema === 'auth' ? `auth_${m[2]}` : m[2];
  const body = block.slice(1, -1); // sans la ligne ");"
  // découper en définitions de colonnes / contraintes (garde les parenthèses imbriquées)
  const defs = splitTopLevel(body);
  const columns = [];
  const tablePk = [];
  const tableUnique = [];
  const tableIndexes = [];
  for (const def of defs) {
    const d = def.trim().replace(/,$/, '');
    if (!d) continue;
    // contraintes de niveau table (testées sur la définition COMPLÈTE)
    if (/^(?:CONSTRAINT\s+[\w"]+\s+)?(?:PRIMARY\s+KEY|UNIQUE|CHECK|FOREIGN\s*KEY|INDEX|EXCLUDE)\b/i.test(d)) {
      const pk = d.match(/PRIMARY\s+KEY\s*\(([^)]+)\)/i);
      const uq = d.match(/UNIQUE\s*\(([^)]+)\)/i);
      if (pk) tablePk.push(...stripCols(pk[1]));
      else if (uq) tableUnique.push(stripCols(uq[1]));
      continue;
    }
    const colMatch = d.match(/^"?([A-Za-z0-9_"]+)"?\s+([\s\S]+)$/);
    if (!colMatch) continue;
    const name = colMatch[1].replace(/"/g, '');
    const rest = colMatch[2];
    const isPk = /\bPRIMARY\s+KEY\b/i.test(rest);
    const notNull = /\bNOT\s+NULL\b/i.test(rest);
    const unique = /\bUNIQUE\b/i.test(rest);
    let autoInc = /\bDEFAULT\s+nextval\b/i.test(rest);
    let defVal = null;
    const dm = rest.match(/\bDEFAULT\s+([\s\S]+?)(?=\s+(PRIMARY|NOT|null|UNIQUE:|CONSTRAINT|REFERENCES|GENERATED|CHECK)|$)/i);
    if (dm) defVal = cleanDefault(dm[1].trim());
    // supprimer tout ce qui suit le type pour obtenir le type pur
    let typePart = rest.replace(/\s+(PRIMARY\s+KEY|NOT\s+NULL|UNIQUE|CONSTRAINT.*|REFERENCES.*|DEFAULT.*|GENERATED.*|CHECK.*)$/i, '').replace(/^\s+/, '');
    columns.push({ name, type: typePart, notNull, unique, isPk, autoInc, defVal });
    if (isPk) tablePk.push(name);
    if (unique) tableUnique.push([name]);
  }
  return { table, columns, tablePk, tableUnique, tableIndexes };
}

function splitTopLevel(lines) {
  const out = [];
  let cur = '';
  let depth = 0;
  let inStr = false;
  let strQ = '';
  for (const raw of lines) {
    const line = raw;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (inStr) {
        if (ch === strQ) {
          if (line[i + 1] === strQ) { i++; continue; }
          inStr = false;
        }
        continue;
      }
      if (ch === "'" || ch === '"') { inStr = true; strQ = ch; continue; }
      if (ch === '(') depth++;
      if (ch === ')') depth--;
    }
    cur += (cur ? '\n' : '') + line;
    if (depth === 0 && /\S/.test(cur)) {
      out.push(cur);
      cur = '';
    }
  }
  if (cur.trim()) out.push(cur);
  return out;
}

function cleanDefault(v) {
  if (v === 'NULL') return null;
  let s = v;
  if (/^nextval\(/.test(s)) return null;
  if (/^gen_random_uuid\(\)/i.test(s) || /^uuid_generate_v4\(\)/i.test(s)) return null;
  if (/^now\(\)$/i.test(s) || /^CURRENT_TIMESTAMP$/i.test(s) || /^current_timestamp$/i.test(s)) return 'CURRENT_TIMESTAMP';
  if (/^ARRAY\s*\[\s*\]/i.test(s)) return null;
  if (/^\(SELECT/.test(s)) return null;
  // retire les casts ::type
  s = s.replace(/::[a-zA-Z0-9_\]\[\s]+$/g, '').trim();
  const quoted = s.match(/^'(.*)'$/s);
  if (quoted) {
    // PG double les apostrophes ('') dans les littéraux : on dé-double puis on
    // ré-échappe une seule fois pour MySQL.
    const inner = quoted[1].replace(/''/g, "'").replace(/'/g, "''");
    return `'${inner}'`;
  }
  if (/^true$/i.test(s)) return '1';
}

function stripCols(s) {
  return s.split(',').map((x) => x.trim().replace(/"/g, '').replace(/^\w+\./, ''));
}

// ---------------------------------------------------------------- génération DDL
function buildDDL(info, table) {
  const parts = info.columns.map((c) => {
    const keyCol = info.tablePk.includes(c.name) ||
      info.tableUnique.some((u) => u.length === 1 && u[0] === c.name);
    let type = mapType(c.type, keyCol);
    // texte indexé en colonne UNIQUE composée ? on garde TEXT, MySQL l'indexera si (191) préfixé.
    const bits = [`\`${c.name}\` ${type}`];
    if (c.autoInc) {
      // ne garder l'auto-inc que si c'est une PK unique
      bits[0] = `\`${c.name}\` ${type.replace(' AUTO_INCREMENT', '')}${info.tablePk.length === 1 && info.tablePk[0] === c.name ? ' AUTO_INCREMENT' : ''}`;
    }
    if (c.notNull && !c.autoInc) bits.push('NOT NULL');
    if (c.defVal !== undefined && c.defVal !== null) bits.push(`DEFAULT ${c.defVal}`);
    if (c.autoInc && !info.tablePk.includes(c.name)) bits.push('DEFAULT 0');
    return bits.join(' ');
  });
  if (info.tablePk.length) {
    parts.push(`PRIMARY KEY (\`${info.tablePk.join('`,`')}\`)`);
  }
  for (const u of info.tableUnique) {
    if (u.length === 1 && u[0] === info.tablePk[0]) continue;
    parts.push(`UNIQUE KEY \`uk_${table}_${u.join('_')}\` (\`${u.join('`,`')}\`)`);
  }
  return `CREATE TABLE \`${table}\` (\n  ${parts.join(',\n  ')}\n) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;`;
}

// ---------------------------------------------------------------- parsing COPY
function parseCopy(headerLine, rows) {
  const m = headerLine.match(/^COPY\s+(?:(public|auth)\.)?([A-Za-z0-9_]+)\s*\((.*)\)\s+FROM\s+stdin;$/);
  if (!m) return null;
  const schema = m[1] || 'public';
  if (!SCHEMAS_ALLOWED.has(schema) && !(schema === 'auth' && AUTH_TABLES_OK.has(m[2]))) return null;
  const table = schema === 'auth' ? `auth_${m[2]}` : m[2];
  const cols = m[3].split(',').map((c) => c.trim().replace(/"/g, ''));
  const parsed = rows.map((r) => splitCopyRow(r));
  return { table, cols, rows: parsed };
}

function splitCopyRow(line) {
  // Format COPY text : séparateur TAB uniquement, aucune notion de guillemets.
  return line.split('\t');
}

function unescapeCell(cell) {
  // cell provient déjà du découpage ; gère les échappements backslash de COPY
  if (cell === '\\N') return null;
  if (!cell.includes('\\')) return cell;
  let out = '';
  for (let i = 0; i < cell.length; i++) {
    const c = cell[i];
    if (c === '\\') {
      const n = cell[i + 1];
      if (n === '\\') { out += '\\'; i++; continue; }
      if (n === 'n') { out += '\n'; i++; continue; }
      if (n === 't') { out += '\t'; i++; continue; }
      if (n === 'r') { out += '\r'; i++; continue; }
      if (n === 'b') { out += '\b'; i++; continue; }
      if (n === 'f') { out += '\f'; i++; continue; }
      if (n === 'v') { out += '\v'; i++; continue; }
      if (n === 'x') {
        const hex = cell.slice(i + 2, i + 4);
        out += String.fromCharCode(parseInt(hex, 16));
        i += 3;
        continue;
      }
      out += n || '\\';
      i++;
      continue;
    }
    out += c;
  }
  return out;
}

function escapeSql(v) {
  if (v === null) return 'NULL';
  return `'${v.replace(/'/g, "''").replace(/\\/g, '\\\\')}'`;
}

// Convertit un littéral tableau PG "{}" en JSON (pour colonnes JSON)
function pgArrayBody(s, start) {
  const arr = [];
  let i = start + 1; // skip '{'
  let cur = null;
  while (i < s.length) {
    const ch = s[i];
    if (ch === '}') {
      if (cur !== null) arr.push(unescapeCell(cur));
      return { arr, next: i + 1 };
    }
    if (ch === ',') {
      arr.push(unescapeCell(cur));
      cur = null;
      i++;
      continue;
    }
    if (ch === '{') {
      const r = pgArrayBody(s, i);
      arr.push(r.arr);
      i = r.next;
      continue;
    }
    if (ch === '"') {
      let j = i + 1;
      let buf = '';
      while (j < s.length && s[j] !== '"') {
        if (s[j] === '\\') { buf += s[j + 1]; j += 2; continue; }
        buf += s[j];
        j++;
      }
      cur = buf;
      i = j + 1;
      continue;
    }
    if (cur === null) cur = '';
    cur += ch;
    i++;
  }
  return { arr, next: i };
}

function pgArrayToJson(cell) {
  if (!/^\{.*\}$/s.test(cell)) return cell;
  const r = pgArrayBody(cell, 0);
  return JSON.stringify(r.arr);
}

// ---------------------------------------------------------------- MAIN
const tables = new Map();   // table -> {cols:[{name,mapType...}], ddl}
const schemaOut = [];
const dataOut = [];
const stats = [];

let i = 0;
const n = lines.length;
while (i < n) {
  const line = lines[i];
  const t = line.trim();
  const ctm = line.match(/^CREATE TABLE\s+(?:(auth|public)\.)?([A-Za-z0-9_]+)\s*\($/);
  if (ctm) {
    // collecter le bloc jusqu'à ");"
    const blockStart = i;
    const block = [line];
    // la 1ʳᵉ parenthèse ouvrante est sur la ligne d'en-tête -> la compter
    let depth = 0;
    for (const ch of line) { if (ch === '(') depth++; else if (ch === ')') depth--; }
    let inStr = false;
    let strQ = '';
    let j = i + 1;
    let endIdx = -1;
    for (; j < n; j++) {
      const l = lines[j];
      for (let k = 0; k < l.length; k++) {
        const ch = l[k];
        if (inStr) { if (ch === strQ) { if (l[k + 1] === strQ) { k++; continue; } inStr = false; } continue; }
        if (ch === "'" || ch === '"') { inStr = true; strQ = ch; continue; }
        if (ch === '(') depth++;
        if (ch === ')') depth--;
      }
      block.push(l);
      if (depth === 0 && /^\);/.test(l.trim()) && j > blockStart) { endIdx = j; break; }
    }
    if (endIdx === -1) { i++; continue; }
    const info = parseCreateTable(block);
    if (info) {
      if (tables.has(info.table)) {
        // déjà créée (ex: CREATE TABLE ... partition impl) -> garder la 1ère
      } else {
        tables.set(info.table, info);
        schemaOut.push(buildDDL(info, info.table));
        stats.push(`CREATE ${info.table} (${info.columns.length} cols)`);
      }
    }
    i = endIdx + 1;
    continue;
  }
  const copym = line.match(/^COPY\s+(?:(public|auth)\.)?([A-Za-z0-9_]+)\s*\(.*FROM\s+stdin;$/);
  if (copym) {
    const rows = [];
    let j = i + 1;
    while (j < n && lines[j].trim() !== '\\.') { rows.push(lines[j]); j++; }
    const parsed = parseCopy(line, rows);
    if (parsed) {
      dataOut.push({ ...parsed });
      stats.push(`DATA ${parsed.table} (${parsed.rows.length} rows)`);
    }
    i = j + 1;
    continue;
  }
  i++;
}

// ---------------------------------------------------------------- sérialisation
const schemaSql = [
  '-- Schéma MySQL généré par scripts/pg2mysql.mjs',
  'SET NAMES utf8mb4;',
  'SET FOREIGN_KEY_CHECKS=0;',
  ...schemaOut,
  'SET FOREIGN_KEY_CHECKS=1;',
].join('\n');

function sqlLiteralFor(pgType, rawCell) {
  const cell = unescapeCell(rawCell);
  if (cell === null) return 'NULL';
  const t = (pgType || '').trim().toLowerCase();
  // jsonb / json : document JSON pur -> pas de déclinaison, on échappe tel quel
  if (/^(jsonb|json)$/.test(t)) {
    if (cell === 'null' || cell === '{}') return escapeSql(cell);
    try { JSON.parse(cell); return escapeSql(cell); } catch { return 'NULL'; }
  }
  // tableau PG "text[]" (ou similaires) -> JSON array MySQL
  if (/\[\]$/.test(t)) return escapeSql(pgArrayToJson(cell));
  // booléen PG
  if (/^boolean$/.test(t)) return cell === 't' ? '1' : cell === 'f' ? '0' : escapeSql(cell);
  // numériques PG
  if (/^(bigint|smallint|integer|int|serial|numeric|real|double\s+precision)$/.test(t)) {
    return /^-?\d+(\.\d+)?$/.test(cell) ? cell : 'NULL';
  }
  // dates / temps PG
  if (/timestamp|^date$|^time/.test(t)) {
    let d = cell.replace('T', ' ').trim();
    // offset timezone : ne le retirer que si une heure précède (sinon une date
    // de type 2025-12-01 serait tronquée par le "-01" final)
    if (/^\d{4}-\d{2}-\d{2}\s+\d{2}:\d{2}:\d{2}/.test(d)) {
      d = d.replace(/\s*Z\s*$/, '').replace(/\s*[+-]\d{2}(:\d{2})?$/, '').trim();
    }
    if (d.startsWith('infinity') || d.startsWith('-infinity')) return 'NULL';
    if (!/^\d{4}-\d{2}-\d{2}(\s+\d{2}:\d{2}:\d{2}(\.\d+)?)?$/.test(d)) return 'NULL';
    return escapeSql(d);
  }
  // tout le reste en chaîne
  return escapeSql(cell);
}

const dataSql = [
  '-- Données MySQL générées par scripts/pg2mysql.mjs',
  'SET NAMES utf8mb4;',
  'SET FOREIGN_KEY_CHECKS=0;',
];
for (const ds of dataOut) {
  const info = tables.get(ds.table);
  const colTypes = ds.cols.map((c) =>
    (info && info.columns.find((x) => x.name === c) || {}).type || ''
  );
  const colNames = ds.cols.map((c) => `\`${c}\``);
  const header = `INSERT INTO \`${ds.table}\` (${colNames.join(',')}) VALUES`;
  const batch = [];
  for (const row of ds.rows) {
    if (row.length < ds.cols.length) continue;
    const vals = row.slice(0, ds.cols.length).map((c, idx) => sqlLiteralFor(colTypes[idx] || '', c));
    batch.push(`(${vals.join(',')})`);
    if (batch.length >= 500) {
      dataSql.push(`${header}\n${batch.join(',\n')};`);
      batch.length = 0;
    }
  }
  if (batch.length) dataSql.push(`${header}\n${batch.join(',\n')};`);
}
dataSql.push('SET FOREIGN_KEY_CHECKS=1;');

const outDir = path.join(process.cwd(), 'db');
fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(path.join(outDir, 'mysql-schema.sql'), schemaSql, 'utf8');
fs.writeFileSync(path.join(outDir, 'mysql-data.sql'), dataSql.join('\n'), 'utf8');

console.log(`✔ Schéma : ${tables.size} tables -> ${path.join(outDir, 'mysql-schema.sql')}`);
console.log(`✔ Données : ${dataOut.length} tables -> ${path.join(outDir, 'mysql-data.sql')}`);
for (const s of stats.slice(0, 20)) console.log('  ', s);
console.log('  ...');