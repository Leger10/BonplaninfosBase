// netlify/functions/_lib/local-supabase.cjs
// Remplacement local de @supabase/supabase-js pour les fonctions Netlify :
// chaque appel est routé en HTTP vers le serveur Express+Prisma local
// (localhost:PORT/api) — la surface d'API que le navigateur utilise déjà.
//
// Usage :  const supabase = require('./_lib/local-supabase.cjs');
// Surface émulée (suffisante pour les fonctions du projet) :
//   supabase.from(table).select(...).eq(...).single()/.maybeSingle()
//                    .order(...).limit(...).insert().update().upsert().delete()
//   supabase.rpc(name, args)
//   supabase.storage.from(bucket).upload(path, buf, opts) .getPublicUrl(path)
//   supabase.auth.admin.listUsers({})  supabase.auth.admin.createUser({...})
const http = require('http');

const DEFAULT_PORT = process.env.PORT || 8888;
const API_HOST = process.env.SUPABASE_LOCAL_HOST || '127.0.0.1';
const API_PORT = process.env.SUPABASE_LOCAL_PORT || DEFAULT_PORT;
const MAX_BODY = 100 * 1024 * 1024;

function request(path, { method = 'POST', payload, raw } = {}) {
  return new Promise((resolve, reject) => {
    const body = raw !== undefined ? raw : payload !== undefined ? JSON.stringify(payload) : '';
    const req = http.request(
      {
        host: API_HOST,
        port: API_PORT,
        path,
        method,
        headers: {
          'Content-Type': raw !== undefined ? 'application/octet-stream' : 'application/json',
          'Content-Length': Buffer.byteLength(body),
        },
      },
      (res) => {
        const chunks = [];
        let size = 0;
        res.on('data', (c) => {
          size += c.length;
          if (size > MAX_BODY) { res.destroy(); reject(new Error('Réponse trop volumineuse')); return; }
          chunks.push(c);
        });
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          try { resolve({ status: res.statusCode, json: text ? JSON.parse(text) : {} }); }
          catch (e) { resolve({ status: res.statusCode, json: { data: text, error: null } }); }
        });
      }
    );
    req.on('error', reject);
    if (body) req.write(body);
    req.end();
  });
}

// ---------- query builder (OHLC compatible /api/query) ----------
class Q {
  constructor(table) {
    this.state = {
      table,
      method: 'select',
      select: '*',
      filters: [],
      orGroups: [],
      orders: [],
      limit: undefined,
      rangeFrom: undefined,
      rangeTo: undefined,
      single: false,
      maybeSingle: false,
      head: false,
      count: undefined,
      body: undefined,
      conflictColumns: undefined,
    };
  }
  select(cols, opts = {}) {
    this.state.select = cols || '*';
    if (opts.count) this.state.count = opts.count;
    if (opts.head) this.state.head = true;
    return this;
  }
  eq(col, v) { this.state.filters.push({ column: col, op: 'eq', value: v }); return this; }
  neq(col, v) { this.state.filters.push({ column: col, op: 'neq', value: v }); return this; }
  gt(col, v) { this.state.filters.push({ column: col, op: 'gt', value: v }); return this; }
  gte(col, v) { this.state.filters.push({ column: col, op: 'gte', value: v }); return this; }
  lt(col, v) { this.state.filters.push({ column: col, op: 'lt', value: v }); return this; }
  lte(col, v) { this.state.filters.push({ column: col, op: 'lte', value: v }); return this; }
  like(col, v) { this.state.filters.push({ column: col, op: 'like', value: v }); return this; }
  ilike(col, v) { this.state.filters.push({ column: col, op: 'ilike', value: v }); return this; }
  in(col, v) { this.state.filters.push({ column: col, op: 'in', value: Array.isArray(v) ? v : [v] }); return this; }
  is(col, v) { this.state.filters.push({ column: col, op: 'is', value: v }); return this; }
  contains(col, v) { this.state.filters.push({ column: col, op: 'contains', value: v }); return this; }
  not(col, v) { this.state.filters.push({ column: col, op: 'is', value: v === null ? 'null' : v }); return this; }
  or(clause) { this.state.orGroups.push([{ raw: clause }]); return this; }
  order(col, opts = {}) {
    this.state.orders.push({ column: col, dir: opts.ascending === true ? 'asc' : 'desc' });
    return this;
  }
  limit(n) { this.state.limit = n; return this; }
  offset(n) { this.state.offset = n; return this; }
  range(from, to) { this.state.rangeFrom = from; this.state.rangeTo = to; return this; }
  single() { this.state.single = true; return this; }
  maybeSingle() { this.state.maybeSingle = true; return this; }
  insert(body, opts) {
    this.state.method = 'insert';
    this.state.body = body;
    if (opts && opts.count) this.state.count = 'exact';
    return this;
  }
  update(body, opts) {
    this.state.method = 'update';
    this.state.body = body;
    if (opts && opts.count) this.state.count = 'exact';
    return this;
  }
  upsert(body, opts) {
    this.state.method = 'upsert';
    this.state.body = body;
    if (opts && opts.conflict) this.state.conflictColumns = [].concat(opts.conflict);
    return this;
  }
  delete(opts) {
    this.state.method = 'delete';
    if (opts && opts.count) this.state.count = 'exact';
    return this;
  }

  async exec() {
    const res = await request('/api/query', { payload: this.state });
    return res.json;
  }

  then(resolve, reject) { return this.exec().then(resolve, reject); }
  catch(reject) { return this.exec().catch(reject); }
  finally(fn) { return this.exec().finally(fn); }
}

// ---------- storage ----------
function storageFrom(bucket) {
  return {
    upload: async (path, fileBody, opts = {}) => {
      const q = new URLSearchParams({
        bucket,
        path,
        contentType: opts.contentType || 'application/octet-stream',
        cacheControl: opts.cacheControl || '3600',
      });
      if (opts.upsert) q.set('upsert', 'true');
      const res = await request(`/api/storage/upload?${q.toString()}`, {
        raw: Buffer.isBuffer(fileBody) ? fileBody : Buffer.from(String(fileBody || '')),
      });
      const j = res.json || {};
      if (j.error) return { data: null, error: j.error };
      return { data: { path, id: path }, error: null };
    },
    getPublicUrl: (path) => {
      const publicUrl = `${'/storage/v1/object/public/' + bucket + '/'}${path}`;
      return { data: { publicUrl }, error: null };
    },
    remove: async (paths) => {
      const res = await request('/api/storage/remove', { payload: { bucket, paths: [].concat(paths) } });
      return res.json;
    },
    list: async (opts = {}) => {
      const res = await request('/api/storage/list', { payload: { bucket, path: opts.prefix || '', ...opts } });
      return res.json;
    },
  };
}

// ---------- échatillon de la coquille ----------
function coerceError(j) {
  if (!j) return { data: null, error: { message: 'Réponse vide du serveur', code: 'EMPTY' } };
  return j;
}

// ---------- createClient ----------
function createClient(supabaseUrl, supabaseKey) {
  return {
    supabaseUrl: supabaseUrl || '',
    supabaseKey: supabaseKey || '',
    from: (table) => new Q(table),
    rpc: async (name, args = {}) => {
      const res = await request('/api/rpc', { payload: { name, args } });
      return coerceError(res.json);
    },
    storage: { from: storageFrom },
    auth: {
      admin: {
        listUsers: async () => {
          const res = await request('/api/auth/admin/list-users', { payload: {} });
          const j = res.json || {};
          if (j.error) return { data: null, error: j.error };
          return { data: { users: j.users || [] }, error: null };
        },
        createUser: async (opts = {}) => {
          const res = await request('/api/auth/admin/create-user', { payload: opts });
          const j = res.json || {};
          if (j.error) return { data: null, error: j.error };
          return { data: { user: j.user }, error: null };
        },
      },
    },
  };
}

module.exports = createClient;
module.exports.createClient = createClient;