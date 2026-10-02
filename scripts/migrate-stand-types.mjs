// Migration SQL incrementale, a executer en PRODUCTION avant / au deploiement.
//
// Pourquoi un fichier SQL plutot qu'un `prisma db push` dans le build :
// le build Render/Hostinger lance `prisma generate` (qui regenere le client
// depuis schema.prisma) mais n'applique AUCUN changement a la base. Or
// schema.prisma declara maintenant `stand_types.cover_image` : sans cette
// colonne en base, TOUTE lecture de stand_types echoue en production
// ("Unknown column") et la page evenement de location de stands tombe.
//
// Le fichier est idempotent : peut etre rejoue sans risque.
//
// Usage (sur la machine qui a DATABASE_URL de production) :
//   node scripts/migrate-stand-types.mjs
// Ou en SQL pur, via phpMyAdmin / hPanel :
//   mysql -h HOTE -u UTILISATEUR -p NOM_BASE < migrations-prod/stand-types-cover-image.sql

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
let failures = 0;

try {
  const cols = await prisma.$queryRawUnsafe('SHOW COLUMNS FROM stand_types');
  const has = cols.some((c) => c.Field === 'cover_image');

  if (has) {
    console.log('OK  stand_types.cover_image existe deja — rien a faire.');
  } else {
    await prisma.$executeRawUnsafe('ALTER TABLE stand_types ADD COLUMN cover_image TEXT NULL');
    const after = await prisma.$queryRawUnsafe('SHOW COLUMNS FROM stand_types');
    const ok = after.some((c) => c.Field === 'cover_image');
    console.log(
      ok
        ? 'OK  stand_types.cover_image ajoutee.'
        : 'ECHEC la colonne n existe toujours pas apres le ALTER.',
    );
    if (!ok) failures += 1;
  }
} catch (e) {
  failures += 1;
  console.log('ECHEC ' + (e.message || e));
} finally {
  // Pas de $disconnect() : Node 24 / Windows crash (libuv) si des sockets
  // sont encore ouvertes. process.exit termine proprement.
  await new Promise((r) => setTimeout(r, 150));
}

process.exit(failures ? 1 : 0);