-- ============================================================
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
DELETE FROM candidate_performances WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH));
DELETE FROM candidates WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH));
DELETE FROM comments WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH));
DELETE FROM event_bookmarks WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH));
DELETE FROM event_comments WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH));
DELETE FROM event_community_verifications WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH));
DELETE FROM event_disputes WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH));
DELETE FROM event_geocoding_results WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH));
DELETE FROM event_notifications WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH));
DELETE FROM event_participations WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH));
DELETE FROM event_reactions WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH));
DELETE FROM event_shares WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH));
DELETE FROM event_validation_status WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH));
DELETE FROM event_views WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH));
DELETE FROM live_rankings WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH));
DELETE FROM participant_votes WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH));
DELETE FROM promo_codes WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH));
DELETE FROM raffles WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH));
DELETE FROM stand_events WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH));
DELETE FROM trigger_debug_logs WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH));
DELETE FROM user_contract_acceptances WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH));
DELETE FROM verification_sessions WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH));
DELETE FROM votes WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH));
DELETE FROM voting_sessions WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH));
-- 2. L'evenement lui-meme, apres ses dependances.
--    Forme aliasee obligatoire : "DELETE FROM events WHERE id IN (SELECT ...)"
--    declencherait l'erreur MySQL 1093 (table cible dans la sous-requete).
DELETE e FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH);

COMMIT;

-- 3. Controle : doit renvoyer 0
SELECT COUNT(*) AS evenements_restants_purgables
FROM events e
WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH);
