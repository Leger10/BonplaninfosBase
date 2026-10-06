// SONDE TEMPORAIRE : diagnostique l'écoute interne du process (à supprimer).
const http = require('http');

function probe(host, port) {
  return new Promise((resolve) => {
    const req = http.request(
      { host, port, path: '/api/db/health', method: 'GET', timeout: 2000 },
      (res) => {
        res.resume();
        resolve({ host, port, status: res.statusCode });
      }
    );
    req.on('error', (e) => resolve({ host, port, err: e.code || e.message }));
    req.on('timeout', () => {
      req.destroy();
      resolve({ host, port, err: 'timeout' });
    });
    req.end();
  });
}

exports.handler = async () => {
  const out = {
    env: {
      PORT: process.env.PORT,
      SUPABASE_LOCAL_HOST: process.env.SUPABASE_LOCAL_HOST,
      SUPABASE_LOCAL_PORT: process.env.SUPABASE_LOCAL_PORT,
      HOST: process.env.HOST,
    },
    probes: [],
  };
  const ports = [3000, 4000, 8888, 8080, 10000, 5000];
  for (const port of ports) {
    for (const host of ['127.0.0.1', '::1', 'localhost']) {
      out.probes.push(await probe(host, port));
    }
  }
  return {
    statusCode: 200,
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(out, null, 2),
  };
};