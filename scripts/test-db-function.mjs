import { createRequire } from 'node:module';
const require = createRequire(import.meta.url);
const { handler } = require('../netlify/functions/db.js');

const call = async (path, qs = {}) => {
  const res = await handler({ httpMethod: 'GET', path, queryStringParameters: qs }, {});
  return { statusCode: res.statusCode, ...JSON.parse(res.body) };
};

console.log('--- /db/events?status=active&limit=1 ---');
const ev = await call('/db/events', { status: 'active', limit: '1' });
console.log(JSON.stringify({ statusCode: ev.statusCode, model: ev.model, count: ev.count, first: ev.rows?.[0] && { id: ev.rows[0].id, title: ev.rows[0].title, category: ev.rows[0].category, organizer: ev.rows[0].organizer } }, null, 1));

console.log('--- /db/categories ---');
const cat = await call('/db/categories');
console.log(JSON.stringify({ statusCode: cat.statusCode, count: cat.count, first: cat.rows?.[0] }));

console.log('--- /db/promo-events ---');
const promo = await call('/db/promo-events');
console.log(JSON.stringify({ statusCode: promo.statusCode, count: promo.count, sample: promo.rows?.slice(0, 3) }));

console.log('--- /db/bad-route ---');
console.log(JSON.stringify(await call('/db/bad-route')));