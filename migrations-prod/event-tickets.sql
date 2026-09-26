-- =====================================================================
--  MIGRATION PROD : table `event_tickets` (miroir "Mes billets")
--  Base de donnees MySQL de PRODUCTION.
--
--  Cette table est lue par :
--    - l'onglet "Mes billets" (MyTicketsTab.jsx -> /api/query)
--    - l'achat de billets (purchase_tickets_v2 -> miroir dans server/rpc.mjs)
--    - le paiement USSD (netlify/functions/ussd-payment.cjs)
--  Elle est creee et lue via Prisma (modele `event_tickets` dans
--  prisma/schema.prisma). Ce script est la version SQL equivalente,
--  generee depuis ce schema avec `prisma migrate diff`.
--
--  En local la table existe deja (creee via `npx prisma db push`).
--  Ce script est destine a la PROD, qui n'a PAS encore la table.
--
--  Instructions d'application : voir README.md (meme dossier).
--  Idempotent : `IF NOT EXISTS` -> peut etre rejoue sans risque.
-- =====================================================================

CREATE TABLE IF NOT EXISTS `event_tickets` (
    `id`                    CHAR(36)         NOT NULL,
    `order_id`              TEXT             NULL,
    `event_id`              CHAR(36)         NULL,
    `user_id`               CHAR(36)         NULL,
    `ticket_type_id`        CHAR(36)         NULL,
    `ticket_number`         TEXT             NULL,
    `qr_code`               TEXT             NULL,
    `status`                TEXT             NULL DEFAULT 'active',
    `purchase_amount_pi`    INT              NULL,
    `purchase_amount_fcfa`  INT              NULL,
    `purchase_price_pi`     INT              NULL,
    `purchased_at`          DATETIME(0)      NULL DEFAULT CURRENT_TIMESTAMP(0),
    `transaction_reference` TEXT             NULL,
    `attendee_name`         TEXT             NULL,
    `email`                 TEXT             NULL,
    `phone`                 TEXT             NULL,
    `payment_method`        TEXT             NULL DEFAULT 'coins',
    `payment_status`        TEXT             NULL,
    `ticket_code`           TEXT             NULL,
    `ticket_code_short`     TEXT             NULL,
    `event_title`           TEXT             NULL,
    `event_start_at`        DATETIME(0)      NULL,
    `event_end_at`          DATETIME(0)      NULL,
    `location`              TEXT             NULL,
    `full_address`          TEXT             NULL,
    `address`               TEXT             NULL,
    `city`                  TEXT             NULL,
    `country`               TEXT             NULL,
    `created_at`            DATETIME(0)      NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at`            DATETIME(0)      NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
