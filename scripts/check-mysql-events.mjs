import { PrismaClient } from '@prisma/client';

const p = new PrismaClient();

const total = await p.events.count();
const byStatus = await p.events.groupBy({ by: ['status'], _count: { _all: true } });

const now = new Date();
const activeCount = await p.events.count({ where: { status: 'active' } });
const activeFuture = await p.events.count({
  where: { status: 'active', OR: [{ event_end_at: null }, { event_end_at: { gt: now } }] },
});
const activePast = await p.events.count({
  where: { status: 'active', event_end_at: { not: null }, event_end_at: { lt: now } },
});
const activeNoDates = await p.events.count({ where: { status: 'active', event_end_at: null } });
const protectedCount = await p.events.count({ where: { status: 'protected' } });
const protectedFuture = await p.events.count({
  where: { status: 'protected', OR: [{ event_end_at: null }, { event_end_at: { gt: now } }] },
});

console.log('Total events  :', total);
console.log('By status     :', JSON.stringify(byStatus));
console.log('active        :', activeCount, '| encore en cours (end null ou > now):', activeFuture, '| terminés:', activePast, '| sans date fin:', activeNoDates);
console.log('protected     :', protectedCount, '| encore en cours:', protectedFuture);

const sample = await p.events.findMany({
  where: { status: 'active' },
  select: { id: true, title: true, event_start_at: true, event_end_at: true, city: true, country: true },
  orderBy: { created_at: 'desc' },
  take: 15,
});
console.log('\n--- 15 derniers events actifs (par created_at) ---');
for (const e of sample) {
  console.log(` - [${e.status}] ${e.title} | début=${e.event_start_at?.toISOString().slice(0,16)} | fin=${e.event_end_at ? new Date(e.event_end_at).toISOString().slice(0,16) : 'NONE'}`);
}

await p.$disconnect();