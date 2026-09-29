// scripts/backfill-ticket-counters.mjs
// Recalcule les compteurs de stock et d'usage des codes promo.
//
// Pourquoi : `ticketing_events.tickets_sold` n'était jamais mis à jour lors des
// ventes (seuls les compteurs par type de billet l'étaient), et
// `ticket_types.tickets_sold` / `quantity_sold` pouvaient diverger. Les
// statistiques et compteurs de l'événement repartaient donc de zéro.
//
// Usage :
//   node scripts/backfill-ticket-counters.mjs            (simulation, rien n'est écrit)
//   node scripts/backfill-ticket-counters.mjs --apply    (écrit les corrections)
//   node scripts/backfill-ticket-counters.mjs --event <event_id> --apply
//
// garde-fous : on n'écrit jamais une valeur INFÉRIEURE à la valeur actuelle
// (une baisse signifierait que l'on détruirait de l'information). C'est vrai
// pour les compteurs de stock comme pour les compteurs d'usage des codes promo :
// un code dont les paiements traçables dépassent l'usage_count enregistré est
// sous-compté (ex. TIBOSS10 : 10 paiements traçables, 0 compté) => corrigé vers
// le HAUT. Un code dont usage_count est au-dessus des paiements traçables n'est
// jamais abaissé : les usages non tracés restent légitimes (KAFF10, MOUSSA1…).
//
// Compteurs tenus : `ticketing_events.tickets_sold` n'était jamais mis à jour
// lors des ventes (seuls les compteurs par type de billet l'étaient), et
// `ticket_types.tickets_sold` / `quantity_sold` pouvaient diverger. Les
// statistiques et compteurs de l'événement repartaient donc de zéro.
//
// Usage :
//   node scripts/backfill-ticket-counters.mjs            (simulation, rien n'est écrit)
//   node scripts/backfill-ticket-counters.mjs --apply    (écrit les corrections)
//   node scripts/backfill-ticket-counters.mjs --event <event_id> --apply
//
// Le script est idempotent : le rejouer ne modifie que ce qui reste faux.
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const APPLY = process.argv.includes('--apply');
const eventArgIndex = process.argv.indexOf('--event');
const EVENT_ID = eventArgIndex >= 0 ? process.argv[eventArgIndex + 1] : null;

const num = (v) => Number(v || 0);
const pad = (s, n) => String(s).padEnd(n);

async function main() {
  console.log(APPLY ? '⚙️  MODE APPLY (écriture)' : '🔍 MODE SIMULATION (aucune écriture)');
  if (EVENT_ID) console.log(`📌 Événement ciblé : ${EVENT_ID}`);

  // ---------- 1. Compteurs par type de billet ----------
  const types = await prisma.ticket_types.findMany({
    where: EVENT_ID ? { event_id: EVENT_ID } : {},
    select: {
      id: true, event_id: true, name: true,
      quantity_available: true, quantity_sold: true, tickets_sold: true,
    },
    orderBy: { event_id: 'asc' },
  });

  const typeFixes = [];
  const typeDecreases = [];
  for (const t of types) {
    // `quantity_sold` est le compteur tenu par le code d'achat ; on aligne
    // `tickets_sold` dessus pour que les deux colonnes ne divergent plus.
    const target = Math.max(num(t.quantity_sold), 0);
    if (num(t.tickets_sold) === target) continue;
    (target < num(t.tickets_sold) ? typeDecreases : typeFixes).push({
      id: t.id, name: t.name, event_id: t.event_id, from: num(t.tickets_sold), to: target,
    });
  }

  // ---------- 2. Compteur par événement ----------
  const events = await prisma.ticketing_events.findMany({
    where: EVENT_ID ? { event_id: EVENT_ID } : {},
    select: { id: true, event_id: true, tickets_sold: true, total_tickets: true },
  });

  const eventFixes = [];
  const eventDecreases = [];
  for (const e of events) {
    const own = types.filter((t) => t.event_id === e.event_id);
    const sold = own.reduce((s, t) => s + Math.max(num(t.quantity_sold), num(t.tickets_sold)), 0);
    if (num(e.tickets_sold) === sold) continue;
    (sold < num(e.tickets_sold) ? eventDecreases : eventFixes).push({
      event_id: e.event_id, from: num(e.tickets_sold), to: sold,
    });
  }

  // ---------- 3. Compteur d'usage des codes promo ----------
  // Les usages de codes promo ne sont PAS tous tracés dans `payments.coupon_code`
  // (les tickets achetés en pièces y laissent l'identifiant, les autres flux non) :
  // on ne corrige donc que vers le HAUT (un usage traçable ignore l'usage_count
  // du code) et jamais vers le bas (ne pas remettre à zéro un compteur juste).
  const promos = await prisma.promo_codes.findMany({
    select: { id: true, code: true, usage_count: true, usage_limit: true, is_active: true },
    orderBy: { code: 'asc' },
  });
  const promoReport = [];
  const promoFixes = [];
  for (const p of promos) {
    const paid = await prisma.payments.count({
      where: {
        coupon_code: p.id,
        status: { in: ['paid', 'completed', 'validated'] },
      },
    });
    if (num(p.usage_count) !== paid) {
      const upward = paid > num(p.usage_count);
      promoReport.push({
        code: p.code, from: num(p.usage_count), to: paid,
        limit: p.usage_limit ?? null,
        exceeded: p.usage_limit != null && paid > num(p.usage_limit),
        upward,
      });
      if (upward) promoFixes.push({ id: p.id, to: paid });
    }
  }

  // ---------- Rapport ----------
  console.log(`\n📦 Types de billet : ${types.length} analysés, ${typeFixes.length} à compléter`);
  for (const f of typeFixes) {
    console.log(`   • ${pad(f.name || f.id, 22)} tickets_sold ${f.from} → ${f.to}   (event ${f.event_id})`);
  }
  if (typeDecreases.length) {
    console.log(`   ⚠️ ${typeDecreases.length} type(s) où quantity_sold < tickets_sold (non modifiés, à vérifier) :`);
    for (const f of typeDecreases) {
      console.log(`     • ${pad(f.name || f.id, 22)} tickets_sold ${f.from} → ${f.to}`);
    }
  }

  console.log(`\n🎪 Événements : ${events.length} analysés, ${eventFixes.length} à compléter`);
  for (const f of eventFixes) {
    console.log(`   • ${f.event_id}  tickets_sold ${f.from} → ${f.to}`);
  }
  if (eventDecreases.length) {
    console.log(`   ⚠️ ${eventDecreases.length} événement(s) dont le total par type est inférieur au compteur (non modifiés) :`);
    for (const f of eventDecreases) {
      console.log(`     • ${f.event_id}  tickets_sold ${f.from} → ${f.to}`);
    }
  }

  console.log(`\n🎟️  Codes promo : ${promos.length} analysés, ${promoReport.length} divergent(s) — ${promoFixes.length} corrigés vers le HAUT (compteurs sous-comptés, jamais abaissés)`);
  for (const f of promoReport) {
    const warn = f.exceeded ? '  ⚠️ au-delà de la limite' : '';
    const dir = f.upward ? `  → ${f.to} ✔` : `  (${f.to} traçables, non abaissé)`;
    console.log(`   • ${pad(f.code, 16)} usage_count ${f.from}${dir}${warn}`);
  }

  if (!typeFixes.length && !eventFixes.length && !promoFixes.length) {
    console.log('\n✅ Compteurs de stock et d\'usage des codes déjà cohérents : rien à corriger.');
  }

  if (!typeFixes.length && !eventFixes.length && !promoFixes.length) {
    return;
  }

  if (!APPLY) {
    console.log('\n(Relancer avec --apply pour écrire ces corrections.)');
    return;
  }

  // ---------- Écriture ----------
  for (const f of typeFixes) {
    await prisma.ticket_types.update({ where: { id: f.id }, data: { tickets_sold: f.to } });
  }
  for (const f of eventFixes) {
    await prisma.ticketing_events.updateMany({
      where: { event_id: f.event_id },
      data: { tickets_sold: f.to },
    });
  }
  for (const f of promoFixes) {
    await prisma.promo_codes.update({
      where: { id: f.id },
      data: { usage_count: f.to },
    });
  }

  console.log(
    `\n✅ Corrections appliquées : ${typeFixes.length} type(s), ${eventFixes.length} événement(s), ${promoFixes.length} code(s) promo.`,
  );
}

main()
  .catch((e) => {
    console.error('❌ Échec du backfill:', e);
    process.exitCode = 1;
  })
  .finally(() => prisma.$disconnect());
