import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

const contests = await p.contests.findMany({ select: { id: true, title: true, is_active: true, event_end_at: true, vote_cost_coins: true, organizer_id: true } });
console.log(`\ncontests en MySQL: ${contests.length}`);
for (const c of contests) console.log(` - [${c.is_active}] ${c.title} | fin=${c.event_end_at?.toISOString().slice(0,16)} | cost=${c.vote_cost_coins} | org=${c.organizer_id}`);

const votingEvents = await p.events.findMany({ where: { event_type: 'voting' }, select: { id: true, title: true } });
console.log('\nevents voting:', votingEvents.map(e => `${e.id} | ${e.title}`).join('\n'));

const votesTbl = await p.votes.count();
console.log('\nvotes rows:', votesTbl);

await p.$disconnect();