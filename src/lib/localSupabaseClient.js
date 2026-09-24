/**
 * Client local Supabase-compatible.
 * Remplace totalement @supabase/supabase-js : chaque appel est routé vers le
 * serveur Express+Prisma local (même surface API que Supabase).
 *
 *   supabase.from('events').select('*, organizer:organizer_id(full_name)')
 *     .eq('status','active').order('created_at',{ascending:false}).limit(8)
 *   supabase.rpc(name, args) / supabase.auth.* / supabase.storage.from(bucket)
 *   supabase.channel(name).on('postgres_changes', {...}, cb).subscribe()
 */

const API_BASE =
  (typeof globalThis !== 'undefined' && globalThis?.__LOCAL_SUPABASE_API_BASE__) ||
  import.meta.env?.VITE_API_BASE ||
  '/api';

function api(endpoint, options = {}, timeoutMs = 30000) {
  const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
  const timer = ctrl ? setTimeout(() => ctrl.abort(), timeoutMs) : null;
  const opts = { ...options, ...(ctrl ? { signal: ctrl.signal } : {}) };
  return fetch(`${API_BASE}${endpoint}`, opts).then(async (res) => {
    if (timer) clearTimeout(timer);
    const text = await res.text();
    let body;
    try { body = text ? JSON.parse(text) : null; } catch (e) { body = { data: text, error: null }; }
    if (!res.ok) {
      const msg = body?.error?.message || body?.message || `Erreur HTTP ${res.status}`;
      return { data: null, error: { message: msg, status: res.status, code: body?.error?.code || 'HTTP_ERROR' } };
    }
    return body;
  }).catch((e) => {
    if (timer) clearTimeout(timer);
    return { data: null, error: { message: e?.message || 'Network request failed', name: 'fetch' } };
  });
}

// ---------- réécriture des URLs média Supabase vers le local ----------
const SUPABASE_STORAGE_RE = /https:\/\/jdeuwvaauerzjdtpwjjz\.supabase\.co\/storage\/v1\/object\/public\//g;
function rewriteMedia(value) {
  if (typeof value === 'string') {
    return value.replace(SUPABASE_STORAGE_RE, '/storage/v1/object/public/');
  }
  if (Array.isArray(value)) return value.map(rewriteMedia);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value)) out[k] = rewriteMedia(value[k]);
    return out;
  }
  return value;
}

// ---------- sélecteur : parsing PostgREST ----------
const OPS = new Set(['eq', 'neq', 'gt', 'gte', 'lt', 'lte', 'like', 'ilike', 'in', 'is', 'contains']);
function parseAtom(atom) {
  // colonne.op.valeur ; la colonne peut contenir des points (relation.col)
  const m = atom.match(/^(.*)\.(eq|neq|gt|gte|lt|lte|like|ilike|in|is|contains)\.(.*)$/);
  if (!m) return null;
  const [, columnRaw, op, valueRaw] = m;
  const column = columnRaw.trim();
  let value;
  if (op === 'is') {
    value = valueRaw === 'null' ? null : valueRaw === 'true' ? true : valueRaw === 'false' ? false : valueRaw;
  } else if (op === 'in') {
    value = valueRaw.replace(/^\(|\)$/g, '').split(',').map((s) => s.trim());
  } else {
    value = valueRaw;
  }
  return { column, op, value };
}
function splitTop(s, sep) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of s) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === sep && depth === 0) { parts.push(cur.trim()); cur = ''; }
    else cur += ch;
  }
  if (cur.trim()) parts.push(cur.trim());
  return parts;
}
function parseOrClause(clause) {
  // En PostgREST, les virgules dans .or() sont des alternatives (OR).
  // "a.op.x,b.op.y,C.in.(d,e)" -> [[a], [b], [C-in-group]], chaque groupe = AND de 1..n filtres.
  return splitTop(clause, ',').map((group) => splitTop(group, '|').map(parseAtom).filter(Boolean));
}

// ---------- query builder (thenable) ----------
class LocalQuery {
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
  select(columns, opts = {}) {
    this.state.select = columns || '*';
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
  is(col, v) { this.state.filters.push({ column: col, op: 'is', value: v ?? null }); return this; }
  not(col, op, v) {
    // Cas réellement utilisé : .not(col, 'is', null) → col IS NOT NULL
    if (op === 'is') this.state.filters.push({ column: col, op: 'nin', value: v ?? null });
    else this.state.filters.push({ column: col, op: `not${op}`, value: v });
    return this;
  }
  contains(col, v) { this.state.filters.push({ column: col, op: 'contains', value: v }); return this; }
  in(col, v) { this.state.filters.push({ column: col, op: 'in', value: Array.isArray(v) ? v : [v] }); return this; }
  or(clause) { this.state.orGroups.push(...parseOrClause(clause)); return this; }
  order(col, { ascending = true, nullsFirst = false } = {}) {
    this.state.orders.push({ column: col, dir: ascending ? 'asc' : 'desc', nullsFirst });
    return this;
  }
  limit(n) { this.state.limit = n; return this; }
  offset(n) { this.state.rangeFrom = n; return this; }
  range(from, to) { this.state.rangeFrom = from; this.state.rangeTo = to; return this; }
  single() { this.state.single = true; return this; }
  maybeSingle() { this.state.maybeSingle = true; return this; }
  insert(body) { this.state.method = 'insert'; this.state.body = body; return this; }
  update(body) { this.state.method = 'update'; this.state.body = body; return this; }
  delete() { this.state.method = 'delete'; return this; }
  upsert(body, opts = {}) {
    this.state.method = 'upsert';
    this.state.body = body;
    if (opts.onConflict) this.state.conflictColumns = opts.onConflict.split(',').map((s) => s.trim());
    return this;
  }
  then(resolve, reject) {
    return this.execute().then(resolve, reject);
  }
  catch(reject) { return this.execute().catch(reject); }
  finally(fn) { return this.execute().finally(fn); }
  async execute() {
    const res = await api('/query', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(this.state),
    });
    if (res.error) return res;
    // rewriting médias + shapes de données
    let data = rewriteMedia(res.data);
    if (this.state.head) {
      return { data: null, count: res.count ?? (Array.isArray(data) ? data.length : 0), error: null };
    }
    const payload = { data, error: null };
    if (res.count !== undefined) payload.count = res.count;
    return payload;
  }
}

// ---------- storage ----------
class LocalStorageFile {
  constructor(bucket) { this.bucket = bucket; }
  async upload(path, fileBody, options = {}) {
    const params = new URLSearchParams({ bucket: this.bucket, path });
    if (options.contentType) params.set('contentType', options.contentType);
    if (options.cacheControl) params.set('cacheControl', options.cacheControl);
    return api(`/storage/upload?${params}`, { method: 'POST', body: fileBody });
  }
  getPublicUrl(path) {
    // ⚠️ Supabase-js renvoie le résultat SYNCrone : `const { data: { publicUrl } } = ...getPublicUrl(p)`.
    // L'URL est dérivée localement (aucun appel réseau) pour rester compatible.
    const cleanPath = String(path || '').replace(/^\/+/, '');
    const origin =
      (typeof window !== 'undefined' && window.location.origin) ||
      (typeof globalThis !== 'undefined' && globalThis?.location?.origin) ||
      '';
    const publicUrl = `${origin}/storage/v1/object/public/${this.bucket}/${cleanPath}`;
    return { data: { publicPath: `${this.bucket}/${cleanPath}`, publicUrl }, error: null };
  }
  async createSignedUrl(path, _expiresIn) {
    return api('/storage/signed-url', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bucket: this.bucket, path }) });
  }
  async remove(paths) {
    return api('/storage/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bucket: this.bucket, paths }) });
  }
  async list(path, _opts) {
    return api('/storage/list', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ bucket: this.bucket, path: path || '' }) });
  }
}

// ---------- realtime (émulation locale) ----------
const CHANNELS = new Map();
const ROW_CACHE = new Map();
class LocalChannel {
  constructor(name) { this.name = name; this.listeners = []; this.timer = null; }
  on(typeName, configOrCallback, maybeCallback) {
    if (typeof configOrCallback === 'function') {
      this.listeners.push({ type: typeName, cb: configOrCallback });
    } else if (configOrCallback && maybeCallback) {
      const cfg = configOrCallback;
      this.listeners.push({
        type: typeName,
        cfg,
        cb: maybeCallback,
        onFilter: cfg.filter ? (row) => {
          // id=eq.X / user_id=eq.X (filtres simples)
          const parts = cfg.filter.split(',').map((s) => s.trim());
          for (const p of parts) {
            const m = p.match(/^(.+?)=(eq|neq|in)\.(.+)$/);
            if (!m) continue;
            const [, col, op, raw] = m;
            let val = raw;
            if (op === 'in') val = raw.replace(/^\(|\)$/g, '').split(',');
            if (op === 'eq' && String(row?.[col]) !== String(val)) return false;
            if (op === 'neq' && String(row?.[col]) === String(val)) return false;
            if (op === 'in' && !(Array.isArray(val) ? val : [val]).map((x) => String(x)).includes(String(row?.[col]))) return false;
          }
          return true;
        } : null,
      });
    }
    return this;
  }
  send(args) {
    this.listeners.forEach((l) => {
      if (l.type === 'broadcast' && args?.type === 'broadcast') {
        this.emit(l, { payload: args.payload, event: args.event });
      }
    });
    return Promise.resolve({ ok: true });
  }
  subscribe(callback) {
    const chan = this;
    let uninterruptable = 0;
    this.emitStatus = (s) => callback && callback(s);
    // Arrêt du polling
    this.emit = (l, payload) => l.cb(payload);
    this.emitStatus('SUBSCRIBED');
    // Polling léger des postgres_changes (rafraîchissement local)
    this.listeners.forEach((l) => {
      if (l.type === 'postgres_changes' && l.cfg && l.cfg.table) {
        this.startPolling(l);
      }
    });
    return {
      unsubscribe: () => {
        if (chan.timer) clearInterval(chan.timer);
        if (chan._untimer) clearInterval(chan._untimer);
        CHANNELS.delete(chan.name);
      },
      status: 'SUBSCRIBED',
    };
  }
  startPolling(l) {
    const key = `${this.name}:${l.cfg.table}:${l.cfg.filter || ''}`;
    this._untimer = setInterval(async () => {
      try {
        const q = localSupabase.from(l.cfg.table).select('*');
        if (l.cfg.filter) {
          l.cfg.filter.split(',').forEach((p) => {
            const m = p.match(/^(.+?)=(eq|neq|in)\.(.+)$/);
            if (m) {
              const [, col, , raw] = m;
              if (m[2] === 'in') q.in(col, raw.replace(/^\(|\)$/g, '').split(','));
              else q.eq(col, raw);
            }
          });
        }
        const { data, error } = await q;
        if (error) return;
        const ids = (data || []).map((r) => r.id).sort().join(',');
        const prev = ROW_CACHE.get(key);
        ROW_CACHE.set(key, ids);
        if (prev !== undefined && prev !== ids) {
          (data || []).forEach((row) => {
            if (l.onFilter && !l.onFilter(row)) return;
            this.emit(l, { new: row, old: null, eventType: 'INSERT', schema: 'public', table: l.cfg.table });
          });
        }
      } catch (e) {
        // silencieux : le polling est best-effort
      }
    }, 8000);
  }
}

// ---------- auth (émulation locale) ----------
const SESSION_KEY = 'sb-local-auth-token';
function getStoredSession() {
  try { return JSON.parse(localStorage.getItem(SESSION_KEY)); } catch (e) { return null; }
}
function storeSession(session) {
  try { localStorage.setItem(SESSION_KEY, JSON.stringify(session)); } catch (e) {}
}
function clearSession() {
  try { localStorage.removeItem(SESSION_KEY); } catch (e) {}
}
function withBearer(options) {
  const session = getStoredSession();
  return {
    ...options,
    headers: {
      ...(options.headers || {}),
      'Content-Type': 'application/json',
      ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
    },
  };
}

const authListeners = new Set();
function emitAuth(event, session) {
  authListeners.forEach((cb) => {
    try { cb(event, session); } catch (e) { console.warn('auth listener error', e); }
  });
}

const auth = {
  async signInWithPassword({ email, password }) {
    const res = await api('/auth/signin', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password }) });
    if (res.error) return res;
    const session = res.data?.session;
    if (session) { storeSession(session); emitAuth('SIGNED_IN', session); }
    return { data: { user: res.data?.user, session }, error: null };
  },
  async signUp({ email, password, options }) {
    const res = await api('/auth/signup', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ email, password, options }) });
    if (res.error) return res;
    const session = res.data?.session;
    if (session) { storeSession(session); emitAuth('SIGNED_IN', session); }
    return { data: { user: res.data?.user, session, user_metadata: res.data?.user?.user_metadata }, error: null };
  },
  async getSession() {
    const stored = getStoredSession();
    if (!stored?.access_token) return { data: { session: null }, error: null };
    const res = await api('/auth/session', withBearer({ method: 'POST', body: JSON.stringify({}) }));
    if (res.error) {
      clearSession();
      emitAuth('SIGNED_OUT', null);
      return { data: { session: null }, error: res.error };
    }
    const session = res.data?.session || stored;
    storeSession(session);
    return { data: { session }, error: null };
  },
  async getUser() {
    const stored = getStoredSession();
    if (!stored?.access_token) return { data: { user: null }, error: null };
    const res = await api('/auth/user', withBearer({ method: 'POST', body: JSON.stringify({}) }));
    if (res.error) return { data: { user: null }, error: res.error };
    return { data: { user: res.data?.user }, error: null };
  },
  async refreshSession() {
    const stored = getStoredSession();
    if (!stored?.access_token) return { data: { session: null }, error: { message: 'No session', code: 'session_not_found' } };
    const res = await api('/auth/refresh', withBearer({ method: 'POST', body: JSON.stringify({}) }));
    if (res.error) {
      clearSession();
      return { data: { session: null }, error: res.error };
    }
    const session = res.data?.session || stored;
    storeSession(session);
    emitAuth('TOKEN_REFRESHED', session);
    return { data: { session, user: session.user }, error: null };
  },
  async updateUser({ data, password }) {
    const res = await api('/auth/updateuser', withBearer({ method: 'POST', body: JSON.stringify({ data, password }) }));
    if (res.error) return res;
    const stored = getStoredSession();
    if (stored) { storeSession({ ...stored, user: { ...stored.user, ...res.data?.user } }); }
    emitAuth('USER_UPDATED', getStoredSession());
    return { data: { user: res.data?.user }, error: null };
  },
  async signOut() {
    const res = await api('/auth/signout', withBearer({ method: 'POST', body: JSON.stringify({}) }));
    clearSession();
    emitAuth('SIGNED_OUT', null);
    return { error: res.error || null };
  },
  async resend(opts) {
    const res = await api('/auth/resend', withBearer({ method: 'POST', body: JSON.stringify(opts || {}) }));
    return res.error ? { data: null, error: res.error } : { data: {}, error: null };
  },
  async revert() {
    return { data: null, error: null };
  },
  onAuthStateChange(cb) {
    authListeners.add(cb);
    // INITIAL_SESSION : session connue, sinon null
    emitAuth('INITIAL_SESSION', getStoredSession());
    return {
      data: { subscription: { unsubscribe: () => authListeners.delete(cb) } },
    };
  },
};

// ---------- rpc ----------
async function rpc(name, args, options = {}) {
  const res = await api('/rpc', {
    method: options.method || 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, args: args || {} }),
  });
  if (res.error) return res;
  return { data: rewriteMedia(res.data), error: null };
}

// ---------- functions.invoke ----------
async function invokeFunctions(name, options = {}) {
  const body = options.body;
  const res = await api(`/functions/${name}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: typeof body === 'string' ? body : JSON.stringify(body || {}),
  });
  if (res.error) return { data: null, error: { message: res.error.message, context: { json: { error: res.error.message } } } };
  return { data: res.data ?? res, error: null };
}

// ---------- racine ----------
export const localSupabase = {
  supabaseUrl: '/',
  supabaseKey: 'local',
  from: (table) => new LocalQuery(table),
  rpc,
  auth,
  functions: { invoke: invokeFunctions },
  storage: { from: (bucket) => new LocalStorageFile(bucket) },
  channel: (name) => {
    if (!CHANNELS.has(name)) CHANNELS.set(name, new LocalChannel(name));
    return CHANNELS.get(name);
  },
  removeChannel(channel) {
    if (channel?.timer) clearInterval(channel.timer);
    if (channel?._untimer) clearInterval(channel._untimer);
    CHANNELS.delete(channel.name);
  },
  getChannels() { return [...CHANNELS.values()]; },
};

export default localSupabase;