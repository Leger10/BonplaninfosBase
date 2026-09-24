import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();
const now = new Date();

const votingEvents = await p.events.findMany({
  where: { event_type: 'voting' },
  select: { id: true, title: true, status: true, event_start_at: true, event_end_at: true, is_active: true },
  orderBy: { created_at: 'desc' },
});

console.log(`\n=== Evenements voting: ${votingEvents.length} ===`);
for (const e of votingEvents) {
  const candidates = await p.candidates.count({ where: { event_id: e.id } });
  const votes = await p.votes.count({ where: { event_id: e.id } });
  const ongoing = e.event_end_at ? new Date(e.event_end_at) > now : true;
  console.log(`[${e.status}]${ongoing ? ' EN COURS' : ' terminé'} | cand=${candidates} votes=${votes} | ${e.title} | début=${e.event_start_at?.toISOString().slice(0,16)} fin=${e.event_end_at ? new Date(e.event_end_at).toISOString().slice(0,16) : 'NONE'}`);
}

const sample = await p.candidates.findMany({ select: { id: true, event_id: true, name: true, vote_count: true }, orderBy: { event_id: 'asc' }, take: 5 });
console.log('\nSample candidates:', JSON.stringify(sample, null, 2));

await p.$disconnect();