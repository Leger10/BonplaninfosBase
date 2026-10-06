import fs from "node:fs";

const DEL = [
  "candidates",
  "candidate_performances",
  "comments",
  "event_bookmarks",
  "event_comments",
  "event_community_verifications",
  "event_disputes",
  "event_geocoding_results",
  "event_notifications",
  "event_participations",
  "event_reactions",
  "event_shares",
  "event_validation_status",
  "event_views",
  "live_rankings",
  "participant_votes",
  "promo_codes",
  "raffles",
  "stand_events",
  "trigger_debug_logs",
  "user_contract_acceptances",
  "verification_sessions",
  "votes",
  "voting_sessions",
].sort();

const KEEP = [
  "tickets",
  "ticket_purchases",
  "ticket_orders",
  "ticket_types",
  "transactions",
  "platform_earnings",
  "organizer_earnings",
  "organizer_interaction_earnings",
  "pending_withdrawals",
  "participant_refunds",
  "admin_commissions",
  "event_revenues",
  "event_fund_releases",
  "event_refund_logs",
  "refund_appeals",
  "vote_payments",
  "participation_payments",
  "ligdicashtransactions",
];

const cond =
  "COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)";

const counts = (tables) =>
  tables
    .map(
      (t) =>
        `SELECT '${t}' AS table_name, COUNT(*) AS lignes FROM ${t} WHERE event_id IN (SELECT id FROM events e WHERE ${cond})`,
    )
    .join(" UNION ALL\n");

const deletes = (tables) =>
  tables.map((t) => `DELETE FROM ${t} WHERE event_id IN (SELECT id FROM events e WHERE ${cond});`).join("\n");

const preview = `-- ============================================================
-- PURGE DES ANCIENS EVENEMENTS - ETAPE 1 : DRY RUN (SEULEMENT)
-- Fichier sans danger : uniquement des SELECT, aucune ecriture.
-- Lisez-le avant de lancer migrations-prod/purge-events-30d.sql
-- ============================================================
-- Critere : un evenement est purge si sa date de fin reelle
--   COALESCE(event_end_at, event_start_at, end_date, created_at)
--   est anterieure a NOW() - 1 MOIS.
-- Conservation : argent (transactions, gains, commissions, retraits)
--                et billets achetes (event_tickets, tickets, ticket_purchases).
-- ============================================================

-- 1. Nombre d'evenements qui seraient purges
SELECT COUNT(*) AS evenements_a_purger
FROM events e
WHERE ${cond};

-- 2. Liste detaillee (100 premieres lignes) : verifiez les dates
SELECT e.id,
       e.title,
       COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) AS date_fin,
       e.is_completed,
       e.is_cancelled
FROM events e
WHERE ${cond}
ORDER BY date_fin
LIMIT 100;

-- 3. Volumes par table fille qui sera effacee
${counts(DEL)}
;

-- 4. A CONSERVER - un chiffre > 0 signifie que des billets ou de
--    l'argent survivront a la purge. C'est le comportement voulu.
${counts(KEEP)}
;
`;

const purge = `-- ============================================================
-- PURGE DES ANCIENS EVENEMENTS - ETAPE 2 : EXECUTION
-- ATTENTION : SUPPRESSION DEFINITIVE ET IRREREVERSIBLE.
-- Lancez d'abord migrations-prod/purge-events-30d-preview.sql et lisez le resultat.
-- TOUT EST DANS UNE TRANSACTION : en cas de probleme, ROLLBACK.
-- ============================================================
-- Critere : COALESCE(event_end_at, event_start_at, end_date, created_at)
--           < NOW() - 1 MOIS
-- Conservation : argent et billets achetes, comme demandes.
-- Idempotent : relancer le fichier ne supprime rien une deuxieme fois.
-- ============================================================

START TRANSACTION;

-- 1. Tables filles effacables
${deletes(DEL)}
-- 2. L'evenement lui-meme, apres ses dependances.
--    Forme aliasee obligatoire : "DELETE FROM events WHERE id IN (SELECT ...)"
--    declencherait l'erreur MySQL 1093 (table cible dans la sous-requete).
DELETE e FROM events e WHERE ${cond};

COMMIT;

-- 3. Controle : doit renvoyer 0
SELECT COUNT(*) AS evenements_restants_purgables
FROM events e
WHERE ${cond};
`;

fs.writeFileSync("migrations-prod/purge-events-30d-preview.sql", preview, "utf8");
fs.writeFileSync("migrations-prod/purge-events-30d.sql", purge, "utf8");
console.log("ecrit migrations-prod/purge-events-30d-preview.sql (dry run)");
console.log("ecrit migrations-prod/purge-events-30d.sql        (execution)");
console.log("tables filles supprimees : " + DEL.length);
console.log("tables conservees        : " + KEEP.length);

