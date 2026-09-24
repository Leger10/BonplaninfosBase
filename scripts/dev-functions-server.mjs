// Mini serveur local des Netlify functions (émule le proxy de `netlify dev`),
// afin de valider `/.netlify/functions/db` en `npm run dev` sans netlify-cli.
// Lancement : node scripts/dev-functions-server.mjs   (écoute sur le port 8888)
import http from 'node:http';
import { handler } from '../netlify/functions/db.js';

const PORT = Number(process.env.FUNCTIONS_PORT || 8888);

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname.replace(/^\/\.netlify\/functions\/db/, '/db');
  const queryStringParameters = Object.fromEntries(url.searchParams.entries());

  if (req.method === 'GET' && path.startsWith('/db')) {
    try {
      const { statusCode, headers, body } = await handler(
        { httpMethod: 'GET', path, queryStringParameters, headers: req.headers },
        {},
      );
      res.writeHead(statusCode, headers);
      res.end(body);
    } catch (err) {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: err.message.split('\n')[0] }));
    }
    return;
  }

  res.writeHead(404, { 'Content-Type': 'application/json' });
  res.end(JSON.stringify({ error: `Non géré : ${req.method} ${url.pathname}` }));
});

server.listen(PORT, () => {
  console.log(`[functions] http://localhost:${PORT}  (/.netlify/functions/db/...)`);
});