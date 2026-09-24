import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
const rows = await p.$queryRawUnsafe("SELECT id, email, role, LEFT(encrypted_password,4) AS hash_prefix, LENGTH(encrypted_password) AS hash_len, email_confirmed_at IS NOT NULL AS confirmed, created_at FROM auth_users ORDER BY created_at ASC LIMIT 8");
console.log(JSON.stringify(rows, null, 1));
const prof = await p.$queryRawUnsafe("SELECT id, email, full_name, user_type, avatar_url FROM profiles LIMIT 5");
console.log('profiles sample:', JSON.stringify(prof, null, 1));
const cnt = await p.$queryRawUnsafe("SELECT COUNT(*) AS n FROM auth_users");
console.log('auth_users count:', cnt[0].n);
await p.$disconnect();