// scripts/repair-profile-country.mjs
// Répare les profils dont le pays a été remplacé par le défaut SQL
// "Côte d'Ivoire" lors de l'inscription.
//
// Pourquoi : `/api/auth/signup` créait le profil sans copier `country`, `city`
// et `phone` depuis `options.data`. La colonne `profiles.country` ayant un
// défaut "Côte d'Ivoire", un inscrit ayant choisi "Burkina Faso" se retrouvait
// avec "Côte d'Ivoire" dans son profil. Le correctif applicatif empêche que
// cela se reproduise ; ce script répare les comptes déjà créés.
//
// Usage :
//   node scripts/repair-profile-country.mjs            (simulation, rien n'est écrit)
//   node scripts/repair-profile-country.mjs --apply    (écrit les corrections)
//
// Garde-fou : on ne touche QUE les profils dont le pays est encore la valeur
// par défaut (ou vide). Si l'utilisateur a déjà changé son pays depuis, on ne
// l'écrase jamais avec la métadonnée d'inscription, devenue obsolète.

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const APPLY = process.argv.includes('--apply');

const DEFAULT_COUNTRY_VALUES = new Set([
  "Côte d'Ivoire",
  "Cote d'Ivoire",
  "Côte d’Ivoire",
  "Cote d’Ivoire",
]);

const text = (v) => (typeof v === 'string' && v.trim() ? v.trim() : null);

async function main() {
  console.log(APPLY ? '⚙️  MODE APPLY (écriture)' : '🔍 MODE SIMULATION (aucune écriture)');

  const users = await prisma.auth_users.findMany({
    select: { id: true, email: true, raw_user_meta_data: true },
  });

  const fixes = [];
  for (const user of users) {
    let meta = {};
    try {
      meta = typeof user.raw_user_meta_data === 'string'
        ? JSON.parse(user.raw_user_meta_data || '{}')
        : (user.raw_user_meta_data || {});
    } catch (_) {
      continue;
    }

    const metaCountry = text(meta.country);
    const metaCity = text(meta.city);
    const metaPhone = text(meta.phone);
    if (!metaCountry && !metaCity && !metaPhone) continue;

    const profile = await prisma.profiles.findUnique({
      where: { id: user.id },
      select: { id: true, country: true, city: true, phone: true },
    });
    if (!profile) continue;

    const countryIsDefault = DEFAULT_COUNTRY_VALUES.has(text(profile.country) || '') || !text(profile.country);

    const next = {};
    // Pays : uniquement si la valeur actuelle est encore le defaut.
    if (metaCountry && countryIsDefault && metaCountry !== text(profile.country)) {
      next.country = metaCountry;
    }
    // Ville / telephone : uniquement s'ils sont vides cote profil.
    if (metaCity && !text(profile.city)) next.city = metaCity;
    if (metaPhone && !text(profile.phone)) next.phone = metaPhone;

    if (Object.keys(next).length === 0) continue;
    fixes.push({ id: user.id, email: user.email, current: profile, next });
  }

  console.log(`\n${fixes.length} profil(s) à corriger.`);
  for (const f of fixes) {
    console.log(`  ${f.email || f.id}`);
    console.log(`    pays : ${f.current.country || '(vide)'} -> ${f.next.country ?? '(inchangé)'}`);
    console.log(`    ville: ${f.current.city || '(vide)'} -> ${f.next.city ?? '(inchangé)'}`);
    console.log(`    tel  : ${f.current.phone || '(vide)'} -> ${f.next.phone ?? '(inchangé)'}`);
  }

  if (APPLY) {
    for (const f of fixes) {
      await prisma.profiles.update({ where: { id: f.id }, data: f.next });
    }
    console.log(`\n✅ ${fixes.length} profil(s) corrigé(s).`);
  } else {
    console.log('\nRelancer avec --apply pour écrire les corrections.');
  }
}

main()
  .catch((e) => {
    console.error('ERREUR REPARATION :', e);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
