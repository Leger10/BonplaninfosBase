// Backfill idempotent des usages manquants dans promo_code_usages.
//
// Contexte : avant le correctif, la commission influenceur était créditée
// (organizer_earnings / promo_commission) mais la ligne de journal
// promo_code_usages n'était pas écrite. La page « Mes gains premium » lit
// promo_code_usages, elle affichait donc 0 FCFA alors que la commission avait
// bien été versée. Ce script réconcilie les deux sources.
//
// Les montants ne sont pas codés en dur : ils sont déduits des lignes
// organizer_earnings (commission = taux x base) et de la vente associée
// (purchase_amount = net encaissé).
//
// Usage : node scripts/backfill-promo-usage-journal.mjs [--apply]

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';

const APPLY = process.argv.includes('--apply');
const prisma = new PrismaClient();

const log = (...a) => console.log(...a);
let created = 0;
let skipped = 0;

try {
  // Tous les codes promo ayant déjà une commission créditée…
  const credited = await prisma.organizer_earnings.findMany({
    where: { transaction_type: 'promo_commission' },
    select: {
      transaction_id: true, organizer_id: true, event_id: true,
      earnings_coins: true, created_at: true,
    },
  });
  log(`lignes organizer_earnings (promo_commission) : ${credited.length}`);

  // … dont on sait retrouver le code promo, la base et l'acheteur.
  const promoRows = await prisma.promo_codes.findMany({
    select: { id: true, code: true, event_id: true, influencer_id: true, usage_count: true, usage_limit: true },
  });
  const byInfluencerEvent = new Map();
  for (const p of promoRows) {
    byInfluencerEvent.set(`${p.influencer_id}|${p.event_id}`, p);
  }

  const cfgRows = await prisma.event_promo_config.findMany({
    select: { event_id: true, commission_rate: true, discount_type: true, discount_value: true },
  });
  const cfgByEvent = new Map(cfgRows.map((c) => [c.event_id, c]));

  for (const c of credited) {
    const ref = c.transaction_id;
    if (!ref) { skipped++; continue; }

    const promo = byInfluencerEvent.get(`${c.organizer_id}|${c.event_id}`);
    if (!promo) { skipped++; continue; }

    const existing = await prisma.promo_code_usages.findFirst({
      where: { promo_code_id: promo.id, transaction_id: String(ref) },
      select: { id: true },
    });
    if (existing) { skipped++; continue; }

    // Net encaissé sur la même vente (organizer_earnings / ticket_sale).
    const sale = await prisma.organizer_earnings.findFirst({
      where: { transaction_id: ref, transaction_type: { in: ['ticket_sale', 'ticket_purchase'] } },
      select: { earnings_coins: true },
    });
    const purchase = Number(sale?.earnings_coins ?? 0);

    // Base = commission / taux. La remise = base - net.
    const rate = Number(cfgByEvent.get(c.event_id)?.commission_rate) || 0;
    const commission = Number(c.earnings_coins || 0);
    const base = rate > 0 ? Math.round((commission * 100) / rate) : commission;
    const discount = Math.max(0, base - purchase);

    const ticket = await prisma.tickets.findFirst({
      where: { transaction_reference: ref },
      select: { user_id: true },
    });
    const userId = ticket?.user_id;
    if (!userId) { skipped++; continue; }

    log(`${APPLY ? 'INSERT' : 'DRY-RUN'} ${promo.code} ${ref} : user=${userId} base=${base} remise=${discount} achat=${purchase} commission=${commission}`);
    if (APPLY) {
      await prisma.promo_code_usages.create({
        data: {
          id: randomUUID(),
          promo_code_id: promo.id,
          user_id: userId,
          discount_amount: discount,
          commission_amount: commission,
          purchase_amount: purchase,
          transaction_id: String(ref),
          used_at: c.created_at || new Date(),
        },
      });
      created++;
    } else {
      created++;
    }
  }

  log(`\nusage(s) ${APPLY ? 'inséré(s)' : 'à insérer'} : ${created} | ignoré(s) : ${skipped}`);
  if (!APPLY && created > 0) log('Relancer avec --apply pour écrire.');
} catch (e) {
  console.error('ERREUR:', e?.message || e);
  process.exitCode = 1;
} finally {
  await prisma.$disconnect();
}
