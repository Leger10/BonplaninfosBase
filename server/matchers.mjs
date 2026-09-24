// Évaluation de prédicats en mémoire (nécessaire pour les filtres sur colonnes
// embarquées, et les clauses or() que Prisma ne peut pas exprimer facilement).

function toComparable(v) {
  if (v === null || v === undefined) return v;
  if (v instanceof Date) return v;
  if (typeof v === 'object') return String(v);
  return v;
}

function parseValue(op, raw) {
  if (op === 'is') {
    if (raw === 'null' || raw === 'NULL' || raw === null) return { value: null, isNull: true };
    if (raw === 'true') return { value: true, isNull: false };
    if (raw === 'false') return { value: false, isNull: false };
    return { value: raw, isNull: false };
  }
  return { value: raw, isNull: false };
}

function likeToRegex(pattern) {
  // % -> .* ; _ -> .
  const esc = pattern.replace(/[.+^$[\]\\(){}|]/g, '\\$&');
  const re = new RegExp('^' + esc.replace(/%/g, '.*').replace(/_/g, '.') + '$', 'i');
  return re;
}

export function match(op, value, actual) {
  if (op === 'nin') return actual !== null && actual !== undefined;
  if (op === 'is') {
    const p = parseValue('is', value);
    if (p.isNull) return actual === null || actual === undefined;
    if (typeof p.value === 'boolean') return actual === p.value;
    const target = toComparable(p.value);
    return actual === target;
  }
  if (actual === undefined) return false;
  if (actual === null) return value === null;
  switch (op) {
    case 'eq':
      return actual === value || String(actual) === String(value);
    case 'neq':
    case 'ne':
      return actual !== value && String(actual) !== String(value);
    case 'notlike':
    case 'notilike':
      return !likeToRegex(String(value)).test(String(actual));
    case 'notin':
      return Array.isArray(value) ? !value.map((v) => String(v)).includes(String(actual)) : String(actual) !== String(value);
    case 'gt':
      return toComparable(actual) > toComparable(value);
    case 'gte':
      return toComparable(actual) >= toComparable(value);
    case 'lt':
      return toComparable(actual) < toComparable(value);
    case 'lte':
      return toComparable(actual) <= toComparable(value);
    case 'like':
    case 'ilike':
      return likeToRegex(String(value)).test(String(actual));
    case 'contains':
      return String(actual).toLowerCase().includes(String(value).toLowerCase());
    case 'in':
      return Array.isArray(value) ? value.map((v) => String(v)).includes(String(actual)) : String(actual) === String(value);
    case 'cs':
    case 'cd':
    case 'ncs':
    case 'ncd':
      return true; // compatible : contient/contient par (JSON/arrays) non implémenté précisément
    default:
      return false;
  }
}

// Applique un littéral PostgREST (ex. "nom.ilike.%q%,ville.ilike.%q%") sur un objet.
// Retourne true si TOUT (AND) dans la chaîne matche ; l'oubli de séparateur = AND implicite.
export function matchOrString(row, clause, getValue) {
  const parts = clause.split(',');
  for (const part of parts) {
    const m = part.match(/^([^.]+)\.(eq|neq|ne|gt|gte|lt|lte|like|ilike|contains|in|is)\.(.+)$/);
    if (!m) continue;
    const [, col, op, rawVal] = m;
    let value = rawVal;
    if (op === 'in') value = rawVal.replace(/^\(|\)$/g, '').split(',');
    const actual = getValue(col);
    if (!match(col, op, value, actual)) return false;
  }
  return true;
}