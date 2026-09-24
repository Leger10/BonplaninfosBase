// Moteur de requête générique : émule le chaînage Supabase/PostgREST
// dans un ordre de requête normalisé, exécuté sur Prisma + MySQL.
//
// Entrée (OrderedQuery) :
//   {
//     table, method: 'select'|'insert'|'update'|'delete'|'upsert',
//     select,               // chaîne PostgREST ('*, organizer:organizer_id(full_name, email)')
//     filters: [ {column, op, value} ],   // tous AND
//     orGroups: [ [ {column, op, value} ] ], // chaque groupe = liste AND ; groupes en OR
//     orders: [ {column, dir} ],
//     limit, offset, rangeFrom, rangeTo,
//     single, maybeSingle, count, head,
//     body,                 // payload insert/update
//     conflictColumns: [...]   // upsert
//   }
import { getDb, scalarColumns } from './db.mjs';
import { resolveEmbed } from './relations.mjs';
import { parseSelect } from './selectParser.mjs';
import { match } from './matchers.mjs';
import { v4 as uuidv4 } from 'uuid';

function ok(data, extra = {}) {
  return { data, error: null, count: extra.count, status: extra.status ?? 200 };
}
function err(message, status = 400, code) {
  return { data: null, error: { message, code, details: null, hint: null }, status };
}

const isDate = (v) =>
  typeof v === 'string' && /^\d{4}-\d{2}-\d{2}/.test(v) && !Number.isNaN(Date.parse(v));

function coerceVal(v) {
  if (isDate(v)) return new Date(v);
  return v;
}

const OP_MAP = {
  eq: (col, v) => ({ [col]: coerceVal(v) }),
  neq: (col, v) => ({ [col]: { not: coerceVal(v) } }),
  nin: (col) => ({ [col]: { not: null } }),
  is: (col, v) => {
    if (v === null || String(v) === 'null') return { [col]: null };
    if (String(v) === 'true') return { [col]: true };
    if (String(v) === 'false') return { [col]: false };
    return { [col]: v };
  },
  in: (col, v) => ({ [col]: { in: (Array.isArray(v) ? v : [v]).map(coerceVal) } }),
  like: (col, v) => ({ [col]: { contains: String(v).replace(/%/g, '') } }),
  ilike: (col, v) => ({ [col]: { contains: String(v).replace(/%/g, '') } }),
  notlike: (col, v) => ({ [col]: { not: { contains: String(v).replace(/%/g, '') } } }),
  notilike: (col, v) => ({ [col]: { not: { contains: String(v).replace(/%/g, '') } } }),
  notin: (col, v) => ({ [col]: { not: { in: (Array.isArray(v) ? v : [v]).map(coerceVal) } } }),
  contains: (col, v) => ({ [col]: { contains: String(v) } }),
  gt: (col, v) => ({ [col]: { gt: coerceVal(v) } }),
  gte: (col, v) => ({ [col]: { gte: coerceVal(v) } }),
  lt: (col, v) => ({ [col]: { lt: coerceVal(v) } }),
  lte: (col, v) => ({ [col]: { lte: coerceVal(v) } }),
};

function buildSingle(f) {
  const fn = OP_MAP[f.op] || OP_MAP.eq;
  return fn(f.column, f.value);
}

function buildPrismaWhere(mainFilters, orGroups, modelCols) {
  const where = {};
  const ands = [];
  for (const f of mainFilters) {
    if (!modelCols.includes(f.column)) continue;
    ands.push(buildSingle(f));
  }
  if (ands.length === 1) Object.assign(where, ands[0]);
  else if (ands.length > 1) where.AND = ands;
  if (orGroups.length) {
    const ors = orGroups
      .map((group) => {
        const grp = group.filter((f) => modelCols.includes(f.column));
        if (!grp.length) return null;
        if (grp.length === 1) return buildSingle(grp[0]);
        return { AND: grp.map(buildSingle) };
      })
      .filter(Boolean);
    if (ors.length) where.OR = ors;
  }
  return where;
}

function applyMatchersInMemory(row, filters, embeds) {
  for (const f of filters) {
    const target = resolveColumnValue(row, f.column, embeds);
    if (!match(f.op, f.value, target)) return false;
  }
  return true;
}

function resolveColumnValue(row, column, embeds) {
  const dot = column.indexOf('.');
  if (dot > 0) {
    const alias = column.slice(0, dot);
    const sub = column.slice(dot + 1);
    const emb = embeds.find((e) => e.alias === alias);
    if (emb) {
      const obj = row[alias];
      return obj === null || obj === undefined ? undefined : obj[sub];
    }
  }
  return row[column];
}

async function selectRows(q, modelCols) {
  const db = getDb();
  const spec = parseSelect(q.select || '*');
  const embeds = await Promise.all(
    spec.embeds.map((e) => resolveEmbed(q.table, e, modelCols))
  );

  const hasEmbedFilter = (f) =>
    f.column.includes('.') && embeds.some((eb) => eb.alias === f.column.split('.')[0]);
  const embedFilters = q.filters.filter(hasEmbedFilter);
  const orEmbed = q.orGroups.some((g) => g.some((f) => hasEmbedFilter(f)));
  const mainFilters = q.filters.filter((f) => !hasEmbedFilter(f));

  const where = buildPrismaWhere(mainFilters, orEmbed ? [] : q.orGroups, modelCols);
  const orderBy = q.orders.length ? q.orders.map((o) => ({ [o.column]: o.dir })) : undefined;
  const needMemFilter = embedFilters.length > 0 || orEmbed;

  let rows;
  if (needMemFilter) {
    rows = await db[q.table].findMany({ where: buildPrismaWhere(mainFilters, [], modelCols), orderBy });
  } else {
    const range = q.rangeFrom !== undefined ? q.rangeFrom : q.offset || 0;
    const take = q.limit !== undefined ? q.limit : q.rangeTo !== undefined ? q.rangeTo - range + 1 : undefined;
    rows = await db[q.table].findMany({ where, orderBy, ...(take ? { take } : {}), ...(range ? { skip: range } : {}) });
  }

  // total avant pagination (pour count exact) : en mémoire si embeds filtrants.
  let filtered = rows;
  let total;
  if (needMemFilter) {
    filtered = rows.filter(
      (r) =>
        applyMatchersInMemory(r, q.filters, embeds) &&
        (q.orGroups.length ? q.orGroups.some((g) => applyMatchersInMemory(r, g, embeds)) : true)
    );
    total = filtered.length;
  } else {
    total = q.count || q.head ? await db[q.table].count({ where }) : filtered.length;
  }

  const withEmbeds = await embedRows(filtered, embeds);

  let data = withEmbeds;
  if (needMemFilter) {
    const range = q.rangeFrom !== undefined ? q.rangeFrom : q.offset || 0;
    const take = q.limit !== undefined ? q.limit : q.rangeTo !== undefined ? q.rangeTo - range + 1 : undefined;
    data = take !== undefined ? withEmbeds.slice(range, range + take) : withEmbeds.slice(range);
  }

  if (q.head) return ok([], { count: total });

  if (q.single || q.maybeSingle) {
    if (data.length === 0) {
      if (q.single) return err('JSON object requested, multiple (or no) rows returned', 406, 'PGRST116');
      data = null;
    } else if (data.length > 1) {
      return err('JSON object requested, multiple (or no) rows returned', 406, 'PGRST116');
    } else {
      data = data[0];
    }
  }
  return ok(data, { count: q.count ? total : undefined });
}

async function embedRows(rows, embeds) {
  if (!embeds.length) return rows;
  const db = getDb();
  const parents = {};
  for (const row of rows) {
    for (const e of embeds) {
      const key = `${e.table}:${e.fk}`;
      if (!parents[key]) parents[key] = { ids: new Set(), e };
      if (row[e.fk] !== null && row[e.fk] !== undefined) parents[key].ids.add(row[e.fk]);
    }
  }
  const cache = {};
  await Promise.all(
    Object.entries(parents).map(async ([key, { ids, e }]) => {
      if (!ids.size) return;
      const sel = e.cols.length ? e.cols : '*';
      const selectObj = sel === '*' ? undefined : { id: true, ...sel.reduce((acc, c) => { acc[c] = true; return acc; }, {}) };
      const found = await db[e.table].findMany({
        where: { id: { in: [...ids] } },
        select: selectObj,
      });
      cache[key] = new Map(found.map((r) => [r.id, r]));
    })
  );
  return rows.map((row) => {
    const copy = { ...row };
    for (const e of embeds) {
      const key = `${e.table}:${e.fk}`;
      const v = row[e.fk];
      copy[e.alias] = v !== null && v !== undefined && cache[key] ? cache[key].get(v) || null : null;
    }
    return copy;
  });
}

async function insertRows(q, modelCols) {
  const db = getDb();
  const body = Array.isArray(q.body) ? q.body : [q.body];
  const created = [];
  for (const item of body) {
    const data = pick(item, modelCols);
    if (!data.id) data.id = uuidv4();
    const row = await db[q.table].create({ data });
    created.push(row);
  }
  if (q.select) {
    const ids = created.map((r) => r.id);
    const q2 = { ...q, select: q.select, filters: [{ column: 'id', op: 'in', value: ids }], single: false, maybeSingle: false };
    return selectRows(q2, modelCols);
  }
  return ok(created);
}

async function updateRows(q, modelCols) {
  const db = getDb();
  const where = buildPrismaWhere(q.filters, [], modelCols);
  const before = await db[q.table].findMany({ where, select: { id: true } });
  const data = pick(q.body, modelCols);
  if (before.length) {
    await db[q.table].updateMany({ where: { id: { in: before.map((r) => r.id) } }, data });
  }
  if (q.select) {
    const q2 = { ...q, filters: [{ column: 'id', op: 'in', value: before.map((r) => r.id) }] };
    return selectRows(q2, modelCols);
  }
  return ok([]);
}

async function deleteRows(q, modelCols) {
  const db = getDb();
  const where = buildPrismaWhere(q.filters, [], modelCols);
  if (q.orders && q.orders.length && q.limit) {
    // Supabase permet .delete().order(...).limit(n) : on ne supprime que les n
    // premiers triés (utilisé par free-vote pour l'annulation du dernier vote).
    const orderBy = q.orders.map((o) => ({ [o.column]: o.dir }));
    const targets = await db[q.table].findMany({ where, orderBy, take: q.limit, select: { id: true } });
    if (targets.length) {
      await db[q.table].deleteMany({ where: { id: { in: targets.map((r) => r.id) } } });
    }
    return ok([]);
  }
  await db[q.table].deleteMany({ where });
  return ok([]);
}

async function upsertRows(q, modelCols) {
  const db = getDb();
  const body = Array.isArray(q.body) ? q.body : [q.body];
  const conflicts = (q.conflictColumns || ['id']).map((s) => s.trim());
  const created = [];
  for (const item of body) {
    const fields = pick(item, modelCols);
    const where = {};
    let found = null;
    if (conflicts.length === 1 && conflicts[0] === 'id') {
      found = fields.id ? await db[q.table].findUnique({ where: { id: fields.id } }) : null;
    } else {
      for (const c of conflicts) where[c] = fields[c];
      found = await db[q.table].findFirst({ where });
    }
    if (found) {
      const updated = await db[q.table].update({ where: { id: found.id }, data: fields });
      created.push(updated);
    } else {
      const row = await db[q.table].create({ data: fields });
      created.push(row);
    }
  }
  if (q.select) {
    const q2 = { ...q, filters: [{ column: 'id', op: 'in', value: created.map((r) => r.id) }], single: false, maybeSingle: false };
    return selectRows(q2, modelCols);
  }
  return ok(created);
}

function pick(obj, cols) {
  if (!obj || typeof obj !== 'object') return {};
  const out = {};
  for (const k of Object.keys(obj)) {
    if (cols.includes(k) && obj[k] !== undefined) {
      let v = obj[k];
      if (Array.isArray(v) || (typeof v === 'object' && v !== null && typeof v.toISOString !== 'function')) {
        v = JSON.stringify(v);
      }
      out[k] = v;
    }
  }
  return out;
}

export async function runQuery(q) {
  q = q || {};
  q.filters = q.filters || [];
  q.orGroups = q.orGroups || [];
  q.orders = q.orders || [];
  q.body = q.body ?? null;
  q.conflictColumns = q.conflictColumns || [];
  q.single = !!q.single;
  q.maybeSingle = !!q.maybeSingle;
  q.head = !!q.head;
  const db = getDb();
  if (!db[q.table]) return err(`Relation "${q.table}" does not exist`, 404, 'PGRST205');
  const modelCols = scalarColumns(q.table) || [];
  const method = q.method || 'select';
  switch (method) {
    case 'insert': return insertRows(q, modelCols);
    case 'update': return updateRows(q, modelCols);
    case 'delete': return deleteRows(q, modelCols);
    case 'upsert': return upsertRows(q, modelCols);
    default: return selectRows(q, modelCols);
  }
}