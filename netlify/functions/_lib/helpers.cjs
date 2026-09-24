// Helpers partagés pour les fonctions Netlify : réponses JSON, CORS, auth JWT.
const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'dev-change-me';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
  'Access-Control-Allow-Methods': 'GET, POST, PUT, PATCH, DELETE, OPTIONS',
  'Access-Control-Max-Age': '86400',
};

function json(res, data, status = 200) {
  return {
    statusCode: status,
    headers: { 'Content-Type': 'application/json', ...CORS_HEADERS },
    body: JSON.stringify(data),
  };
}

function ok(res, data, status = 200) {
  return json(res, { success: true, data }, status);
}

function fail(res, message, status = 400) {
  return json(res, { success: false, error: message }, status);
}

function handleOptions() {
  return {
    statusCode: 204,
    headers: { ...CORS_HEADERS },
    body: '',
  };
}

// Vérifie le Bearer token et renvoie le payload décodé, ou null.
function verifyToken(authorizationHeader) {
  if (!authorizationHeader || !authorizationHeader.startsWith('Bearer ')) {
    return null;
  }
  const token = authorizationHeader.slice(7);
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function requireAuth(event) {
  const payload = verifyToken(event.headers.authorization);
  return payload;
}

module.exports = { json, ok, fail, handleOptions, verifyToken, requireAuth, JWT_SECRET };