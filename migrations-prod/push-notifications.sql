-- ---------------------------------------------------------------------------
-- Push notifications (Firebase Cloud Messaging) - MySQL / MariaDB
-- ---------------------------------------------------------------------------
-- Idempotent : peut etre rejoue sans erreur sur une base deja migree.
-- A executer une seule fois en production AVANT de deployer le code qui
-- utilise les nouvelles tables (sinon /api/push/* repondra 503).
--
-- Contenu :
--   1. user_push_tokens : colonnes appareil + hash unique du jeton FCM
--   2. push_reminders   : rappels programmes (1 par evenement/creneau)
--   3. push_outbox      : notifications immediates (confirmation, annonce...)
--
-- Les rappels sont diffuses a TOUS les utilisateurs actifs disposant d'un
-- appareil abonne (audience = 'all'). Les confirmations personnelles restent
-- ciblees (audience = 'user').
-- ---------------------------------------------------------------------------

-- 1. Colonnes manquantes sur user_push_tokens ------------------------------
DROP PROCEDURE IF EXISTS bpi_push_add_column;
DELIMITER $$
CREATE PROCEDURE bpi_push_add_column(
  IN p_table VARCHAR(64),
  IN p_column VARCHAR(64),
  IN p_definition TEXT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND COLUMN_NAME = p_column
  ) THEN
    SET @ddl = CONCAT('ALTER TABLE `', p_table, '` ADD COLUMN `', p_column, '` ', p_definition);
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CALL bpi_push_add_column('user_push_tokens', 'platform',    "VARCHAR(20) NOT NULL DEFAULT 'web'");
CALL bpi_push_add_column('user_push_tokens', 'token_hash',  'CHAR(64) NULL');
CALL bpi_push_add_column('user_push_tokens', 'user_agent',  'VARCHAR(255) NULL');
CALL bpi_push_add_column('user_push_tokens', 'last_used_at','DATETIME(0) NULL');

DROP PROCEDURE IF EXISTS bpi_push_add_column;

-- Backfill du hash pour les jetons deja enregistres.
UPDATE user_push_tokens
SET token_hash = SHA2(fcm_token, 256)
WHERE (token_hash IS NULL OR token_hash = '')
  AND fcm_token IS NOT NULL
  AND fcm_token <> '';

-- Un meme appareil ne doit avoir qu'une ligne : on garde la plus ancienne.
DELETE t1
FROM user_push_tokens t1
JOIN user_push_tokens t2
  ON t1.token_hash = t2.token_hash
 AND t1.token_hash IS NOT NULL
 AND t1.token_hash <> ''
 AND t1.id > t2.id;

-- Index unique sur le hash (TEXT ne peut pas etre UNIQUE directement).
DROP PROCEDURE IF EXISTS bpi_push_add_index;
DELIMITER $$
CREATE PROCEDURE bpi_push_add_index(
  IN p_table VARCHAR(64),
  IN p_index VARCHAR(64),
  IN p_columns VARCHAR(255),
  IN p_unique TINYINT
)
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.STATISTICS
    WHERE TABLE_SCHEMA = DATABASE()
      AND TABLE_NAME = p_table
      AND INDEX_NAME = p_index
  ) THEN
    SET @ddl = CONCAT(
      'ALTER TABLE `', p_table, '` ADD ',
      IF(p_unique = 1, 'UNIQUE ', ''),
      'INDEX `', p_index, '` (', p_columns, ')'
    );
    PREPARE stmt FROM @ddl;
    EXECUTE stmt;
    DEALLOCATE PREPARE stmt;
  END IF;
END$$
DELIMITER ;

CALL bpi_push_add_index('user_push_tokens', 'uq_user_push_tokens_token_hash', '`token_hash`', 1);
CALL bpi_push_add_index('user_push_tokens', 'idx_user_push_tokens_user_active', '`user_id`, `is_active`', 0);

DROP PROCEDURE IF EXISTS bpi_push_add_index;

-- 2. Rappels programmes ----------------------------------------------------
CREATE TABLE IF NOT EXISTS `push_reminders` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `event_id`      CHAR(36)     NOT NULL,
  `user_id`       CHAR(36)     NOT NULL,
  `audience`      VARCHAR(16)  NOT NULL DEFAULT 'user',
  `kind`          VARCHAR(24)  NOT NULL,
  `scheduled_at`  DATETIME(0)  NOT NULL,
  `title`         VARCHAR(255) NOT NULL,
  `body`          TEXT         NOT NULL,
  `url`           VARCHAR(500) NULL,
  `status`        VARCHAR(16)  NOT NULL DEFAULT 'pending',
  `attempts`      INT          NOT NULL DEFAULT 0,
  `last_error`    VARCHAR(500) NULL,
  `dedupe_key`    VARCHAR(191) NOT NULL,
  `locked_by`     VARCHAR(64)  NULL,
  `processing_at` DATETIME(0)  NULL,
  `sent_at`       DATETIME(0)  NULL,
  `cancelled_at`  DATETIME(0)  NULL,
  `created_at`    DATETIME(0)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME(0)  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_push_reminders_dedupe` (`dedupe_key`),
  KEY `idx_push_reminders_due` (`status`, `scheduled_at`),
  KEY `idx_push_reminders_event` (`event_id`, `audience`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. File d'envoi immediate ------------------------------------------------
CREATE TABLE IF NOT EXISTS `push_outbox` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`         CHAR(36)     NOT NULL,
  `audience`        VARCHAR(16)  NOT NULL DEFAULT 'user',
  `type`            VARCHAR(32)  NOT NULL,
  `event_id`        CHAR(36)     NULL,
  `dedupe_key`      VARCHAR(191) NOT NULL,
  `title`           VARCHAR(255) NOT NULL,
  `body`            TEXT         NOT NULL,
  `url`             VARCHAR(500) NULL,
  `status`          VARCHAR(16)  NOT NULL DEFAULT 'pending',
  `attempts`        INT          NOT NULL DEFAULT 0,
  `last_error`      VARCHAR(500) NULL,
  `next_attempt_at` DATETIME(0)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `locked_by`       VARCHAR(64)  NULL,
  `processing_at`   DATETIME(0)  NULL,
  `sent_at`         DATETIME(0)  NULL,
  `created_at`      DATETIME(0)  NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME(0)  NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_push_outbox_dedupe` (`dedupe_key`),
  KEY `idx_push_outbox_due` (`status`, `next_attempt_at`),
  KEY `idx_push_outbox_user` (`user_id`, `status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
