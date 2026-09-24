import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const rows = await p.profiles.findMany({ where: { email: { startsWith: 'probe-local-' } } });
for (const r of rows) {
  await p.auth_users.deleteMany({ where: { id: r.id } });
  await p.profiles.deleteMany({ where: { id: r.id } });
}
console.log('deleted probe:', rows.length);
await p.$disconnect();