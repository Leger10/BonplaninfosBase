const BASE = 'http://localhost:8888';
const test = async (name, fn) => {
  try {
    const r = await fn();
    console.log(`${name}: ${r}`);
  } catch (e) {
    console.log(`${name}: FAIL ${e.message}`);
  }
};
await test('health', async () => (await (await fetch(`${BASE}/api/db/health`)).json()).ok);
await test('og', async () => {
  const r = await fetch(`${BASE}/.netlify/functions/og/02143ae5-7936-4ce3-b619-35d174a1d34f`);
  const html = await r.text();
  return `${r.status} contains-title=${html.includes('Votez pour')}`;
});
process.exit(0);