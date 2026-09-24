// Parse une chaîne select PostgREST en liste de colonnes principales + embeds.
// Ex.: "*, organizer:organizer_id(full_name, email)"
//      "id, organizer:organizer_id!inner(country)"
//      "*, profiles!pin_reset_requests_user_id_fkey (id, full_name, email)"
function splitTopLevel(input) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of input) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}

function parseSubSelect(inner) {
  if (!inner) return [];
  return inner
    .split(',')
    .map((s) => s.trim())
    .filter((s) => s && s !== '*');
}

export function parseSelect(select) {
  if (!select) return { main: [], embeds: [] };
  const main = [];
  const embeds = [];
  for (const token of splitTopLevel(select)) {
    let m = token.match(/^(\w+):(\w+)(!inner)?\s*\(([^)]*)\)$/);
    if (m) {
      embeds.push({ alias: m[1], fk: m[2], inner: !!m[3], cols: parseSubSelect(m[4]) });
      continue;
    }
    m = token.match(/^(\w+)!\s*([^()]+)\s*\(([^)]*)\)$/);
    if (m) {
      embeds.push({ alias: m[1], inner: true, constraint: m[2], cols: parseSubSelect(m[3]) });
      continue;
    }
    m = token.match(/^(\*|[^:()]+)$/);
    if (m && m[1] !== '*') main.push(m[1]);
    else if (m && m[1] === '*') main.push('*');
  }
  return { main: main.includes('*') || main.length === 0 ? ['*'] : main, embeds };
}