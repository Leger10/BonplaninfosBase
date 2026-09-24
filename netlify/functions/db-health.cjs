// Endpoint de santé : vérifie la connexion MySQL via Prisma.
// GET /.netlify/functions/db-health
const { prisma } = require('./_lib/prisma.cjs');
const { json, handleOptions } = require('./_lib/helpers.cjs');

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return handleOptions();
  if (event.httpMethod !== 'GET') {
    return json({ success: false, error: 'Méthode non autorisée' }, 405);
  }

  try {
    await prisma.$queryRaw`SELECT 1`;
    const { count } = await prisma.$queryRaw`SELECT COUNT(*) AS count FROM information_schema.tables`;
    return json({
      success: true,
      db: 'connected',
      tables: count,
      time: new Date().toISOString(),
    });
  } catch (e) {
    return json({ success: false, error: 'MySQL inaccessible', detail: e.message }, 500);
  }
};