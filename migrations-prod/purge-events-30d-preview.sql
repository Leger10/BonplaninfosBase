-- ============================================================
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
WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH);

-- 2. Liste detaillee (100 premieres lignes) : verifiez les dates
SELECT e.id,
       e.title,
       COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) AS date_fin,
       e.is_completed,
       e.is_cancelled
FROM events e
WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)
ORDER BY date_fin
LIMIT 100;

-- 3. Volumes par table fille qui sera effacee
SELECT 'candidate_performances' AS table_name, COUNT(*) AS lignes FROM candidate_performances WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'candidates' AS table_name, COUNT(*) AS lignes FROM candidates WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'comments' AS table_name, COUNT(*) AS lignes FROM comments WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'event_bookmarks' AS table_name, COUNT(*) AS lignes FROM event_bookmarks WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'event_comments' AS table_name, COUNT(*) AS lignes FROM event_comments WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'event_community_verifications' AS table_name, COUNT(*) AS lignes FROM event_community_verifications WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'event_disputes' AS table_name, COUNT(*) AS lignes FROM event_disputes WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'event_geocoding_results' AS table_name, COUNT(*) AS lignes FROM event_geocoding_results WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'event_notifications' AS table_name, COUNT(*) AS lignes FROM event_notifications WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'event_participations' AS table_name, COUNT(*) AS lignes FROM event_participations WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'event_reactions' AS table_name, COUNT(*) AS lignes FROM event_reactions WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'event_shares' AS table_name, COUNT(*) AS lignes FROM event_shares WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'event_validation_status' AS table_name, COUNT(*) AS lignes FROM event_validation_status WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'event_views' AS table_name, COUNT(*) AS lignes FROM event_views WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'live_rankings' AS table_name, COUNT(*) AS lignes FROM live_rankings WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'participant_votes' AS table_name, COUNT(*) AS lignes FROM participant_votes WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'promo_codes' AS table_name, COUNT(*) AS lignes FROM promo_codes WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'raffles' AS table_name, COUNT(*) AS lignes FROM raffles WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'stand_events' AS table_name, COUNT(*) AS lignes FROM stand_events WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'trigger_debug_logs' AS table_name, COUNT(*) AS lignes FROM trigger_debug_logs WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'user_contract_acceptances' AS table_name, COUNT(*) AS lignes FROM user_contract_acceptances WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'verification_sessions' AS table_name, COUNT(*) AS lignes FROM verification_sessions WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'votes' AS table_name, COUNT(*) AS lignes FROM votes WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'voting_sessions' AS table_name, COUNT(*) AS lignes FROM voting_sessions WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH))
;

-- 4. A CONSERVER - un chiffre > 0 signifie que des billets ou de
--    l'argent survivront a la purge. C'est le comportement voulu.
SELECT 'tickets' AS table_name, COUNT(*) AS lignes FROM tickets WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'ticket_purchases' AS table_name, COUNT(*) AS lignes FROM ticket_purchases WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'ticket_orders' AS table_name, COUNT(*) AS lignes FROM ticket_orders WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'ticket_types' AS table_name, COUNT(*) AS lignes FROM ticket_types WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'transactions' AS table_name, COUNT(*) AS lignes FROM transactions WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'platform_earnings' AS table_name, COUNT(*) AS lignes FROM platform_earnings WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'organizer_earnings' AS table_name, COUNT(*) AS lignes FROM organizer_earnings WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'organizer_interaction_earnings' AS table_name, COUNT(*) AS lignes FROM organizer_interaction_earnings WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'pending_withdrawals' AS table_name, COUNT(*) AS lignes FROM pending_withdrawals WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'participant_refunds' AS table_name, COUNT(*) AS lignes FROM participant_refunds WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'admin_commissions' AS table_name, COUNT(*) AS lignes FROM admin_commissions WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'event_revenues' AS table_name, COUNT(*) AS lignes FROM event_revenues WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'event_fund_releases' AS table_name, COUNT(*) AS lignes FROM event_fund_releases WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'event_refund_logs' AS table_name, COUNT(*) AS lignes FROM event_refund_logs WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'refund_appeals' AS table_name, COUNT(*) AS lignes FROM refund_appeals WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'vote_payments' AS table_name, COUNT(*) AS lignes FROM vote_payments WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'participation_payments' AS table_name, COUNT(*) AS lignes FROM participation_payments WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH)) UNION ALL
SELECT 'ligdicashtransactions' AS table_name, COUNT(*) AS lignes FROM ligdicashtransactions WHERE event_id IN (SELECT id FROM events e WHERE COALESCE(e.event_end_at, e.event_start_at, e.end_date, e.created_at) < DATE_SUB(NOW(), INTERVAL 1 MONTH))
;
