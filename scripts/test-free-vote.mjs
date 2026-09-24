const BASE = 'http://localhost:8888';
const q = async (state) => (await fetch(`${BASE}/api/query`, {
  method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(state),
})).json();

// trouver un événement avec voting_type free et des candidats
const events = await q({ table: 'events', method: 'select', select: 'id,title,price_pi,is_sales_closed,event_end_at', limit: 100 });
const evs = events.data || [];
console.log('events:', evs.length);
for (const e of evs.slice(0, 30)) {
  const settings = await q({ table: 'event_settings', method: 'select', select: 'event_id,voting_type,voting_enabled,max_votes_per_user', filters: [{ column: 'event_id', op: 'eq', value: e.id }], maybeSingle: true });
  const vt = settings.data?.voting_type;
  if (vt === 'free') {
    const cands = await q({ table: 'candidates', method: 'select', select: 'id,name,vote_count', filters: [{ column: 'event_id', op: 'eq', value: e.id }], limit: 2 });
    console.log('FREE event:', e.title, '| cands:', cands.data?.map(c => `${c.name}(${c.vote_count})`));
    if (cands.data?.length) {
      const c = cands.data[0];
      console.log('  test vote guest ->', await (async () => {
        const r = await fetch(`${BASE}/.netlify/functions/free-vote`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'vote', eventId: e.id, candidateId: c.id, guestId: 'test-' + Date.now(), voteCount: 1, fullName: 'Test Local', phone: '+22670000000' }),
        });
        return r.status + ' ' + (await r.text());
      })());
      break;
    }
  }
}
process.exit(0);