globalThis.__LOCAL_SUPABASE_API_BASE__ = 'http://localhost:8888/api';
globalThis.localStorage = {
  _m: new Map(),
  getItem(k) { return this._m.has(k) ? this._m.get(k) : null; },
  setItem(k, v) { this._m.set(k, String(v)); },
  removeItem(k) { this._m.delete(k); },
};

const client = (await import('../src/lib/localSupabaseClient.js')).localSupabase;

(async () => {
  console.log('--- signup ---');
  const email = 'flotest-' + Date.now() + '@test.local';
  const su = await client.auth.signUp({ email, password: 'test1234', options: { data: { full_name: 'Flow Test' } } });
  console.log(JSON.stringify({ error: su.error, user: su.data?.user?.email, hasSession: !!su.data?.session }));

  console.log('\n--- getSession (persisted) ---');
  console.log(JSON.stringify(await client.auth.getSession()));

  console.log('\n--- getUser ---');
  const g = await client.auth.getUser();
  console.log(JSON.stringify({ error: g.error, email: g.data?.user?.email }));

  console.log('\n--- ensure_user_profile_exists ---');
  const rpc = await client.rpc('ensure_user_profile_exists', { p_user_id: g.data?.user?.id, p_email: email, p_full_name: 'Flow Test' });
  console.log(JSON.stringify({ error: rpc.error, profileEmail: rpc.data?.profile?.email }));

  console.log('\n--- query events avec embeds ---');
  const q = await client.from('events').select('*, organizer:organizer_id(full_name)').eq('status', 'active').limit(2);
  console.log(JSON.stringify({ error: q.error, n: q.data?.length, organizer: q.data?.[0]?.organizer }));

  console.log('\n--- or clause ---');
  const qo = await client.from('categories').select('name').or('slug.eq.tirage,slug.eq.fete');
  console.log(JSON.stringify({ error: qo.error, names: qo.data?.map((x) => x.name) }));

  console.log('\n--- not is null ---');
  const qn = await client.from('profiles').select('id').not('country', 'is', null).limit(2);
  console.log(JSON.stringify({ error: qn.error, n: qn.data?.length }));

  console.log('\n--- count exact head ---');
  const qc = await client.from('events').select('id', { count: 'exact', head: true }).eq('status', 'active');
  console.log(JSON.stringify({ count: qc.count, data: qc.data, error: qc.error }));

  console.log('\n--- storage public-url ---');
  const st = await client.storage.from('media').getPublicUrl('tests/x.jpg');
  console.log(JSON.stringify(st));

  console.log('\n--- signout puis getSession ---');
  await client.auth.signOut();
  console.log(JSON.stringify(await client.auth.getSession()));

  const qp = await client.from('profiles').select('id').ilike('email', 'flotest-%');
  const { PrismaClient } = await import('@prisma/client');
  const p = new PrismaClient();
  for (const r of qp.data || []) {
    await p.auth_users.deleteMany({ where: { id: r.id } });
    await p.profiles.deleteMany({ where: { id: r.id } });
  }
  await p.$disconnect();
  console.log('\ncleanup done');
})();