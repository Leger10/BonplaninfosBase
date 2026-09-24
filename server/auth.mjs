// Auth locale : émule Supabase Auth via auth_users (bcrypt) + profiles.
// JWT signé en HMAC-SHA256 (JWT_SECRET). Schéma de réponse : { data, error }.
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import { getDb } from './db.mjs';

const JWT_SECRET = process.env.JWT_SECRET || 'bonplaninfos-local-dev-secret';
const TOKEN_TTL_S = 60 * 60 * 24 * 7; // 7 jours

const r = Router();

function now() { return new Date(); }

function ok(data) { return { data: data ?? {}, error: null }; }
function fail(message, status = 400, code = 'bad_request') {
  return { data: null, error: { message, status, code, details: null, hint: null } };
}

function buildSession(authUser, profile) {
  const access_token = jwt.sign(
    {
      sub: authUser.id,
      email: authUser.email || '',
      aud: authUser.aud || 'authenticated',
      role: authUser.role || 'authenticated',
      exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_S,
    },
    JWT_SECRET
  );
  return {
    access_token,
    token_type: 'bearer',
    expires_in: TOKEN_TTL_S,
    expires_at: Math.floor(Date.now() / 1000) + TOKEN_TTL_S,
    refresh_token: uuidv4(),
    user: buildUser(authUser, profile),
  };
}

function buildUser(authUser, profile) {
  let meta = {};
  let appMeta = {};
  try { meta = authUser.raw_user_meta_data ? JSON.parse(authUser.raw_user_meta_data) : {}; } catch (e) { meta = {}; }
  try { appMeta = authUser.raw_app_meta_data ? JSON.parse(authUser.raw_app_meta_data) : {}; } catch (e) { appMeta = {}; }
  const p = profile || {};
  return {
    id: authUser.id,
    aud: authUser.aud || 'authenticated',
    role: authUser.role || 'authenticated',
    email: authUser.email,
    email_confirmed_at: authUser.email_confirmed_at,
    phone: authUser.phone,
    confirmation_sent_at: authUser.confirmation_sent_at,
    created_at: authUser.created_at,
    updated_at: authUser.updated_at,
    app_metadata: appMeta,
    user_metadata: {
      ...(meta || {}),
      full_name: meta.full_name || p.full_name || p.email,
      avatar_url: meta.avatar_url || p.avatar_url,
    },
    identities: [],
    profile: p,
  };
}

async function findAuthUserByEmail(email) {
  if (!email) return null;
  const db = getDb();
  return db.auth_users.findFirst({ where: { email: String(email).toLowerCase() } });
}

async function findAuthUserById(id) {
  if (!id) return null;
  const db = getDb();
  return db.auth_users.findUnique({ where: { id } });
}

async function findProfile(id) {
  const db = getDb();
  return db.profiles.findUnique({ where: { id } });
}

function decodeToken(req) {
  const h = req.headers.authorization || '';
  if (!h.startsWith('Bearer ')) return { error: fail('Token manquant', 401, 'bad_jwt') };
  try {
    const payload = jwt.verify(h.slice(7), JWT_SECRET);
    return { payload };
  } catch (e) {
    return { error: fail('JWT invalide ou expiré', 401, 'bad_jwt') };
  }
}

async function currentUser(req) {
  const { payload, error } = decodeToken(req);
  if (error) return { error };
  const user = await findAuthUserById(payload.sub);
  if (!user) return { error: fail('Utilisateur introuvable', 401, 'user_not_found') };
  return { user };
}

r.post('/signin', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const user = await findAuthUserByEmail(email);
    if (!user || !user.encrypted_password) return res.status(400).json(fail('Email ou mot de passe incorrect', 400, 'invalid_credentials'));
    const okPwd = await bcrypt.compare(password || '', user.encrypted_password);
    if (!okPwd) return res.status(400).json(fail('Email ou mot de passe incorrect', 400, 'invalid_credentials'));
    const profile = await findProfile(user.id);
    const session = buildSession(user, profile);
    return res.json(ok({ user: session.user, session }));
  } catch (e) {
    console.error('[auth/signin]', e);
    return res.status(500).json(fail('Erreur serveur', 500));
  }
});

r.post('/signup', async (req, res) => {
  try {
    const { email, password, options } = req.body || {};
    const data = options?.data || {};
    if (!email || !password) return res.status(400).json(fail('Email et mot de passe requis', 400));
    const normalized = String(email).toLowerCase();
    const db = getDb();
    const exists = await db.auth_users.findFirst({ where: { email: normalized } });
    if (exists) return res.json(ok({ user: null, session: null, weak_password: null, email_confirmation_required: true }));
    const id = uuidv4();
    const hashed = await bcrypt.hash(password, 10);
    const sig = new Date();
    await db.auth_users.create({
      data: {
        instance_id: uuidv4(),
        id,
        aud: 'authenticated',
        role: 'authenticated',
        email: normalized,
        encrypted_password: hashed,
        email_confirmed_at: sig,
        created_at: sig,
        updated_at: sig,
        raw_app_meta_data: JSON.stringify({ provider: 'email', providers: ['email'] }),
        raw_user_meta_data: JSON.stringify(data),
        is_sso_user: false,
        is_anonymous: false,
      },
    });
    const profile = await db.profiles.findUnique({ where: { id } });
    if (!profile) {
      await db.profiles.create({
        data: {
          id,
          email: normalized,
          full_name: data.full_name || null,
          avatar_url: data.avatar_url || null,
          user_type: 'user',
          is_active: true,
          created_at: sig,
          updated_at: sig,
        },
      });
    }
    const profileRow = await findProfile(id);
    const user = await findAuthUserById(id);
    const session = buildSession(user, profileRow);
    return res.json(ok({ user: session.user, session }));
  } catch (e) {
    console.error('[auth/signup]', e);
    return res.status(500).json(fail('Erreur serveur', 500));
  }
});

r.post('/user', async (req, res) => {
  const { user, error } = await currentUser(req);
  if (error) return res.status(error.status || 401).json(error);
  const profile = await findProfile(user.id);
  return res.json(ok({ user: buildUser(user, profile) }));
});

r.post('/session', async (req, res) => {
  const { user, error } = await currentUser(req);
  if (error) return res.status(error.status || 401).json(error);
  const profile = await findProfile(user.id);
  const session = buildSession(user, profile);
  return res.json(ok({ session }));
});

r.post('/refresh', async (req, res) => {
  const { user, error } = await currentUser(req);
  if (error) return res.status(error.status || 401).json(error);
  const profile = await findProfile(user.id);
  const session = buildSession(user, profile);
  return res.json(ok({ session, user: session.user }));
});

r.post('/updateuser', async (req, res) => {
  const { user, error } = await currentUser(req);
  if (error) return res.status(error.status || 401).json(error);
  try {
    const db = getDb();
    const body = req.body || {};
    const update = {};
    if (body.password) {
      update.encrypted_password = await bcrypt.hash(body.password, 10);
    }
    let newEmail = null;
    if (body.data) {
      const prevMeta = {};
      try { Object.assign(prevMeta, user.raw_user_meta_data ? JSON.parse(user.raw_user_meta_data) : {}); } catch (e) {}
      update.raw_user_meta_data = JSON.stringify({ ...prevMeta, ...body.data });
      const profile = await findProfile(user.id);
      const pfields = {};
      for (const k of ['full_name', 'avatar_url', 'email', 'phone', 'bio', 'updated_at']) {
        if (body.data[k] !== undefined && profile) pfields[k] = body.data[k];
      }
      if (profile && Object.keys(pfields).length) {
        if (pfields.email) { newEmail = String(pfields.email).toLowerCase(); update.email = newEmail; }
        await db.profiles.update({ where: { id: user.id }, data: pfields });
      }
    }
    update.updated_at = now();
    await db.auth_users.update({ where: { id: user.id }, data: update });
    const fresh = newEmail ? await findAuthUserByEmail(newEmail) : await findAuthUserById(user.id);
    const profile = await findProfile(user.id);
    return res.json(ok({ user: buildUser(fresh || user, profile) }));
  } catch (e) {
    console.error('[auth/updateuser]', e);
    return res.status(500).json(fail('Erreur serveur', 500));
  }
});

r.post('/signout', (req, res) => res.json(ok({})));
r.post('/resend', (req, res) => res.status(400).json(fail('Confirmation email désactivée en local', 400, 'email_not_supported')));
r.post('/revert', (req, res) => res.json(ok({})));

// ---------- Auth admin (émulation supabase.auth.admin) ----------
// listUsers / createUser : utilisés par les edge functions locales
// (ussd-payment, moneyfusion-ticket-webhook, free-vote...).
r.post('/admin/list-users', async (req, res) => {
  try {
    const db = getDb();
    const users = await db.auth_users.findMany({ orderBy: { created_at: 'asc' } });
    return res.json(ok({
      users: users.map((u) => ({
        id: u.id,
        email: u.email,
        phone: u.phone,
        role: u.role,
        created_at: u.created_at,
        email_confirmed_at: u.email_confirmed_at,
        user_metadata: (() => { try { return JSON.parse(u.raw_user_meta_data || '{}'); } catch (e) { return {}; } })(),
      })),
    }));
  } catch (e) {
    console.error('[auth/admin/list-users]', e);
    return res.status(500).json(fail('Erreur serveur', 500));
  }
});

r.post('/admin/create-user', async (req, res) => {
  try {
    const body = req.body || {};
    const email = String(body.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json(fail('email requis', 400));
    const db = getDb();
    const exists = await db.auth_users.findFirst({ where: { email } });
    if (exists) {
      return res.json(ok({ user: { id: exists.id, email: exists.email, created_at: exists.created_at }, already_exists: true }));
    }
    const id = uuidv4();
    const sig = new Date();
    const hashed = await bcrypt.hash(body.password || '000000', 10);
    const meta = body.user_metadata || {};
    await db.auth_users.create({
      data: {
        instance_id: uuidv4(),
        id,
        aud: 'authenticated',
        role: 'authenticated',
        email,
        encrypted_password: hashed,
        email_confirmed_at: body.email_confirm ? sig : null,
        created_at: sig,
        updated_at: sig,
        raw_app_meta_data: JSON.stringify({ provider: 'email', providers: ['email'] }),
        raw_user_meta_data: JSON.stringify(meta),
        is_sso_user: false,
        is_anonymous: false,
      },
    });
    const profile = await db.profiles.findUnique({ where: { id } });
    if (!profile) {
      await db.profiles.create({
        data: {
          id,
          email,
          full_name: meta.full_name || body.full_name || null,
          phone: meta.phone || body.phone || null,
          avatar_url: meta.avatar_url || null,
          user_type: body.user_type || 'user',
          is_active: true,
          created_at: sig,
          updated_at: sig,
        },
      });
    }
    return res.json(ok({ user: { id, email, created_at: sig }, already_exists: false }));
  } catch (e) {
    console.error('[auth/admin/create-user]', e);
    return res.status(500).json(fail('Erreur serveur', 500));
  }
});

export const authRouter = r;