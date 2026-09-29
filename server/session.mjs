// server/session.mjs
// Identité de l'appelant pour /api/rpc et /api/query.
//
// Deux voies d'accès reconnues :
//   - utilisateur : en-tête `Authorization: Bearer <JWT>`, vérifié par le même
//     code que /api/auth (server/auth.mjs) — source de vérité unique ;
//   - service interne : en-tête `X-Internal-Key: <INTERNAL_RPC_KEY>`, utilisé par
//     les fonctions Netlify qui appellent l'API en HTTP sans session
//     utilisateur (paiement USSD, webhook MoneyFusion, vote gratuit).
//
// Avant cette brique, ces deux routes étaient ouvertes à tous : n'importe quel
// visiteur pouvait appeler n'importe quelle RPC ou écrire dans n'importe quelle
// table. Authentifier n'est pas autoriser : les vérifications de rôle restent
// à faire dans chaque handler sur `req.actor` (et non sur un id fourni par
// l'appelant).
import crypto from 'node:crypto';
import { decodeToken, findProfile } from './auth.mjs';

const ADMIN_ROLES = ['super_admin', 'admin', 'secretary'];
const READ_METHODS = new Set(['select', 'head']);

export { ADMIN_ROLES };

function safeEqual(a, b) {
  const ba = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  if (ba.length !== bb.length) return false;
  return crypto.timingSafeEqual(ba, bb);
}

function internalActor(req) {
  const expected = process.env.INTERNAL_RPC_KEY;
  if (!expected) return null;
  const provided = req.headers['x-internal-key'];
  if (typeof provided !== 'string' || !provided) return null;
  if (!safeEqual(provided, expected)) return null;
  return { source: 'internal', id: null, user_type: 'service', is_active: true };
}

// Retourne null si l'appelant est anonyme.
export async function resolveActor(req) {
  const internal = internalActor(req);
  if (internal) return internal;
  const { payload, error } = decodeToken(req);
  if (error) return null;
  if (!payload?.sub) return null;
  const profile = await findProfile(payload.sub);
  if (!profile) return null;
  if (profile.is_active === false) return null;
  return {
    source: 'user',
    id: profile.id,
    user_type: profile.user_type || 'user',
    is_active: true,
    email: profile.email || null,
  };
}

export function isAdmin(actor) {
  if (!actor) return false;
  if (actor.source === 'internal') return true;
  return ADMIN_ROLES.includes(actor.user_type);
}

function unauthorized(res) {
  return res.status(401).json({
    data: null,
    error: {
      message: 'Authentification requise',
      code: 'not_authenticated',
      details: null,
      hint: null,
    },
  });
}

// /api/rpc : tout exige une session, sauf les RPC listés comme publics.
export function requireActorUnless(publicNames) {
  return async (req, res, next) => {
    const name = String(req.body?.name || '');
    if (publicNames.has(name)) {
      req.actor = await resolveActor(req).catch(() => null);
      return next();
    }
    const actor = await resolveActor(req).catch(() => null);
    if (!actor) return unauthorized(res);
    req.actor = actor;
    return next();
  };
}

// /api/query : les lectures restent publiques (pages publiques sans session),
// les écritures exigent une session. L'acteur est résolu dans les deux cas
// quand un jeton est présent : la politique de lecture (queryPolicy.mjs) en a
// besoin pour restreindre les tables sensibles à leurs propriétaires.
export async function requireActorForWrites(req, res, next) {
  const method = String(req.body?.method || 'select').toLowerCase();
  if (READ_METHODS.has(method)) {
    req.actor = await resolveActor(req).catch(() => null);
    return next();
  }
  const actor = await resolveActor(req).catch(() => null);
  if (!actor) return unauthorized(res);
  req.actor = actor;
  return next();
}

// Routes d'administration (/api/auth/admin/*). Elles passent par le même
// jeton que le reste, puis exigent un rôle d'administration : sans ce garde,
// n'importe quel visiteur pouvait lister les comptes et en créer un en
// super_admin. `superOnly` réserve en plus la route au super administrateur.
export function requireAdmin({ superOnly = false } = {}) {
  return async (req, res, next) => {
    const actor = await resolveActor(req).catch(() => null);
    if (!actor) return unauthorized(res);
    if (!isAdmin(actor)) {
      return res.status(403).json({
        data: null,
        error: {
          message: 'Droits insuffisants',
          code: 'forbidden',
          details: null,
          hint: null,
        },
      });
    }
    if (superOnly && actor.user_type !== 'super_admin') {
      return res.status(403).json({
        data: null,
        error: {
          message: 'Réservé au super administrateur',
          code: 'forbidden',
          details: null,
          hint: null,
        },
      });
    }
    req.actor = actor;
    return next();
  };
}
