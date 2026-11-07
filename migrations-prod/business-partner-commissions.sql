-- Partenaire d'affaires: frais distincts + commission partenaire (montant des frais retenus)
-- Idempotent where possible.

-- app_settings: split withdrawal fee and business partner commission
SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_settings' AND COLUMN_NAME = 'withdrawal_fee_percentage');
SET @stmt := IF(@col = 0, 'ALTER TABLE `app_settings` ADD COLUMN `withdrawal_fee_percentage` DECIMAL(20,4) NULL AFTER `platform_fee_percentage`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

SET @col := (SELECT COUNT(*) FROM information_schema.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'app_settings' AND COLUMN_NAME = 'business_partner_commission_percentage');
SET @stmt := IF(@col = 0, 'ALTER TABLE `app_settings` ADD COLUMN `business_partner_commission_percentage` DECIMAL(20,4) NULL AFTER `withdrawal_fee_percentage`', 'SELECT 1');
PREPARE s FROM @stmt; EXECUTE s; DEALLOCATE PREPARE s;

-- ledger: commissions credited to partners (idempotent via source_type+source_id)
CREATE TABLE IF NOT EXISTS `business_partner_commissions` (
  `id` CHAR(36) NOT NULL,
  `partner_id` CHAR(36) NOT NULL,
  `organizer_id` CHAR(36) NOT NULL,
  `source_type` VARCHAR(32) NOT NULL,
  `source_id` VARCHAR(64) DEFAULT NULL,
  `gross_fee_coins` INT NOT NULL,
  `commission_percent` DECIMAL(5,2) NOT NULL,
  `commission_coins` INT NOT NULL,
  `status` VARCHAR(32) NOT NULL DEFAULT 'credited',
  `metadata` JSON DEFAULT NULL,
  `created_at` DATETIME DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  KEY `idx_bpc_partner` (`partner_id`),
  KEY `idx_bpc_organizer` (`organizer_id`),
  UNIQUE KEY `uq_bpc_source` (`partner_id`, `source_type`, `source_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
