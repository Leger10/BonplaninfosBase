-- CreateTable
CREATE TABLE `admin_activites` (
    `id` CHAR(36) NOT NULL,
    `admin_id` CHAR(36) NOT NULL,
    `mois` DATE NOT NULL,
    `nb_evenements_moderes` INTEGER NULL,
    `nb_evenements_corrects` INTEGER NULL,
    `nb_utilisateurs_inscrits` INTEGER NULL,
    `nb_evenements_ajoutes` INTEGER NULL,
    `score` DECIMAL(3, 2) NULL,
    `date_calcul` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_balance_transactions` (
    `id` CHAR(36) NOT NULL,
    `admin_id` CHAR(36) NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `balance_before` DECIMAL(10, 2) NOT NULL,
    `balance_after` DECIMAL(10, 2) NOT NULL,
    `transaction_type` TEXT NOT NULL,
    `description` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_balances` (
    `id` CHAR(36) NOT NULL,
    `admin_id` CHAR(36) NULL,
    `total_commissions` INTEGER NULL,
    `available_balance` INTEGER NULL,
    `total_withdrawn` INTEGER NULL,
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_commissions` (
    `id` CHAR(36) NOT NULL,
    `admin_id` CHAR(36) NULL,
    `transaction_id` CHAR(36) NULL,
    `event_id` CHAR(36) NULL,
    `commission_type` TEXT NOT NULL,
    `amount_pi` INTEGER NOT NULL,
    `amount_fcfa` INTEGER NOT NULL,
    `commission_rate` DECIMAL(5, 2) NOT NULL,
    `zone_city` TEXT NULL,
    `zone_region` TEXT NULL,
    `zone_country` TEXT NULL,
    `status` TEXT NULL DEFAULT 'pending',
    `calculated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_config` (
    `id` INTEGER NOT NULL,
    `coin_to_fcfa_rate` DECIMAL(20, 4) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_coverage_zones` (
    `id` CHAR(36) NOT NULL,
    `admin_id` CHAR(36) NULL,
    `zone_type` TEXT NOT NULL,
    `zone_name` TEXT NOT NULL,
    `is_active` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_licences` (
    `id` CHAR(36) NOT NULL,
    `admin_id` CHAR(36) NULL,
    `licence_type` TEXT NOT NULL,
    `zone_city` TEXT NULL,
    `zone_region` TEXT NULL,
    `zone_country` TEXT NULL,
    `date_debut` DATETIME(0) NOT NULL,
    `date_fin` DATETIME(0) NOT NULL,
    `statut` TEXT NULL DEFAULT 'actif',
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_logs` (
    `id` CHAR(36) NOT NULL,
    `actor_id` CHAR(36) NOT NULL,
    `action_type` TEXT NOT NULL,
    `target_id` CHAR(36) NULL,
    `details` LONGTEXT NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `actor_name` TEXT NULL,
    `target_name` TEXT NULL,
    `actor_email` TEXT NULL,
    `target_email` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_notifications` (
    `id` CHAR(36) NOT NULL,
    `admin_id` CHAR(36) NOT NULL,
    `notification_type` TEXT NOT NULL,
    `title` TEXT NOT NULL,
    `message` TEXT NOT NULL,
    `is_read` BOOLEAN NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `read_at` DATETIME(0) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_payment_info` (
    `id` CHAR(36) NOT NULL,
    `admin_id` CHAR(36) NULL,
    `orange_money` TEXT NULL,
    `orange_details` TEXT NULL,
    `mtn_money` TEXT NULL,
    `mtn_details` TEXT NULL,
    `moov_money` TEXT NULL,
    `moov_details` TEXT NULL,
    `wave_number` TEXT NULL,
    `wave_details` TEXT NULL,
    `bank_name` TEXT NULL,
    `bank_iban` TEXT NULL,
    `bank_account_name` TEXT NULL,
    `bank_details` TEXT NULL,
    `notes` TEXT NULL,
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_performance` (
    `id` CHAR(36) NOT NULL,
    `admin_id` CHAR(36) NULL,
    `score` DECIMAL(20, 4) NULL,
    `calculation_date` DATE NULL,
    `metrics` LONGTEXT NULL,
    `country` TEXT NULL,
    `city` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_revenue` (
    `id` CHAR(36) NOT NULL,
    `admin_id` CHAR(36) NOT NULL,
    `credited_user_id` CHAR(36) NOT NULL,
    `creditor_id` CHAR(36) NOT NULL,
    `credit_source` TEXT NOT NULL,
    `amount_pi` INTEGER NOT NULL,
    `amount_fcfa` INTEGER NOT NULL,
    `created_at` DATETIME(0) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_salaries` (
    `id` CHAR(36) NOT NULL,
    `admin_id` CHAR(36) NOT NULL,
    `month` DATE NOT NULL,
    `country_revenue` DECIMAL(20, 4) NULL,
    `referral_earnings` DECIMAL(20, 4) NULL,
    `license_rate` DECIMAL(20, 4) NULL,
    `personal_score` DECIMAL(20, 4) NULL,
    `total_salary` DECIMAL(20, 4) NULL,
    `withdrawal_status` TEXT NULL DEFAULT 'pending',
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_salary_calculations` (
    `id` CHAR(36) NOT NULL,
    `admin_id` CHAR(36) NOT NULL,
    `calculation_month` DATE NOT NULL,
    `revenue_fcfa` DECIMAL(10, 2) NOT NULL,
    `license_rate` DECIMAL(5, 2) NOT NULL,
    `personal_score` DECIMAL(3, 2) NOT NULL,
    `calculated_salaire` DECIMAL(10, 2) NOT NULL,
    `calculated_by` TEXT NOT NULL DEFAULT 'super_admin',
    `calculated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `notes` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_salary_history` (
    `id` CHAR(36) NOT NULL,
    `admin_id` CHAR(36) NOT NULL,
    `month` DATE NOT NULL,
    `revenue_fcfa` DECIMAL(20, 4) NOT NULL,
    `license_rate` DECIMAL(20, 4) NOT NULL,
    `personal_score` DECIMAL(20, 4) NOT NULL,
    `final_salary` DECIMAL(20, 4) NOT NULL,
    `is_paid` BOOLEAN NULL,
    `paid_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_users` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `role` TEXT NULL DEFAULT 'admin',
    `permissions` LONGTEXT NULL DEFAULT '{}',
    `is_active` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_users_summary` (
    `id` CHAR(36) NOT NULL,
    `email` TEXT NOT NULL,
    `role` TEXT NOT NULL,
    `created_at` DATETIME(0) NOT NULL,
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_withdrawal_config` (
    `id` CHAR(36) NOT NULL,
    `withdrawal_available_date` INTEGER NOT NULL,
    `min_withdrawal_amount` DECIMAL(20, 4) NOT NULL,
    `max_withdrawal_amount` DECIMAL(20, 4) NOT NULL,
    `withdrawal_methods` LONGTEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `withdrawal_dates` TEXT NULL DEFAULT '{5}',
    `restricted_categories` LONGTEXT NULL,
    `min_withdrawal_pi` INTEGER NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `admin_withdrawal_requests` (
    `id` CHAR(36) NOT NULL,
    `admin_id` CHAR(36) NULL,
    `amount_pi` INTEGER NOT NULL,
    `amount_fcfa` INTEGER NOT NULL,
    `bank_name` TEXT NULL,
    `account_number` TEXT NULL,
    `mobile_money_number` TEXT NULL,
    `status` TEXT NULL DEFAULT 'pending',
    `requested_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `processed_at` DATETIME(0) NULL,
    `processed_by` CHAR(36) NULL,
    `method` TEXT NULL,
    `payment_date` DATETIME(0) NULL,
    `notes` TEXT NULL,
    `rejection_reason` TEXT NULL,
    `balance_deducted` BOOLEAN NULL,
    `deduction_date` DATETIME(0) NULL,
    `withdrawal_details` LONGTEXT NULL DEFAULT '{}',
    `fees` DECIMAL(20, 4) NULL,
    `net_amount` DECIMAL(20, 4) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `announcements` (
    `id` CHAR(36) NOT NULL,
    `title` TEXT NOT NULL,
    `message` TEXT NOT NULL,
    `type` TEXT NULL DEFAULT 'info',
    `image_url` TEXT NULL,
    `video_url` TEXT NULL,
    `video_required` BOOLEAN NULL DEFAULT true,
    `target_audience` TEXT NULL DEFAULT 'all',
    `target_cities` LONGTEXT NULL,
    `target_countries` LONGTEXT NULL,
    `specific_users` TEXT NULL,
    `send_immediately` BOOLEAN NULL,
    `scheduled_for` DATETIME(0) NULL,
    `send_to_all_users` BOOLEAN NULL DEFAULT true,
    `status` TEXT NULL DEFAULT 'draft',
    `is_active` BOOLEAN NULL DEFAULT true,
    `total_recipients` INTEGER NULL,
    `delivered_count` INTEGER NULL,
    `opened_count` INTEGER NULL,
    `created_by` CHAR(36) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `sent_at` DATETIME(0) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_config` (
    `key` VARCHAR(255) NOT NULL,
    `value` TEXT NULL,
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`key`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_images` (
    `id` CHAR(36) NOT NULL,
    `image_key` TEXT NOT NULL,
    `image_url` TEXT NOT NULL,
    `alt_text` TEXT NULL,
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_by` CHAR(36) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `app_settings` (
    `id` CHAR(36) NOT NULL,
    `app_name` TEXT NULL DEFAULT 'BonPlanInfos',
    `app_logo` TEXT NULL,
    `app_favicon` TEXT NULL,
    `contact_email` TEXT NULL DEFAULT 'contact@bonplaninfos.com',
    `contact_phone` TEXT NULL,
    `address` TEXT NULL,
    `social_facebook` TEXT NULL,
    `social_twitter` TEXT NULL,
    `social_instagram` TEXT NULL,
    `social_linkedin` TEXT NULL,
    `maintenance_mode` BOOLEAN NULL,
    `maintenance_message` TEXT NULL,
    `currency_eur_rate` DECIMAL(20, 4) NULL,
    `currency_usd_rate` DECIMAL(20, 4) NULL,
    `coin_to_fcfa_rate` DECIMAL(20, 4) NULL,
    `min_withdrawal_pi` INTEGER NULL,
    `transaction_fee_percent` DECIMAL(20, 4) NULL,
    `email_notifications` BOOLEAN NULL DEFAULT true,
    `push_notifications` BOOLEAN NULL DEFAULT true,
    `analytics_enabled` BOOLEAN NULL,
    `cookie_consent_enabled` BOOLEAN NULL DEFAULT true,
    `privacy_policy_url` TEXT NULL,
    `terms_of_service_url` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `logo_url` TEXT NULL,
    `favicon_url` TEXT NULL,
    `site_name` TEXT NULL,
    `site_description` TEXT NULL,
    `logo` TEXT NULL,
    `favicon` TEXT NULL,
    `meta_keywords` TEXT NULL,
    `meta_description` TEXT NULL,
    `platform_fee_percentage` DECIMAL(20, 4) NULL,
    `support_email` TEXT NULL DEFAULT 'support@bonplaninfos.net',
    `admin_email` TEXT NULL DEFAULT 'client@bonplaninfos.net',
    `noreply_email` TEXT NULL DEFAULT 'bonplaninfos@gmail.com',
    `billing_email` TEXT NULL DEFAULT 'digihouse10@gmail.com',
    `moneyfusion_fee_percent` DECIMAL(20, 4) NULL,
    `moneyfusion_enabled` BOOLEAN NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `auth_users` (
    `instance_id` CHAR(36) NULL,
    `id` CHAR(36) NOT NULL,
    `aud` VARCHAR(255) NULL,
    `role` VARCHAR(255) NULL,
    `email` VARCHAR(255) NULL,
    `encrypted_password` VARCHAR(255) NULL,
    `email_confirmed_at` DATETIME(0) NULL,
    `invited_at` DATETIME(0) NULL,
    `confirmation_token` VARCHAR(255) NULL,
    `confirmation_sent_at` DATETIME(0) NULL,
    `recovery_token` VARCHAR(255) NULL,
    `recovery_sent_at` DATETIME(0) NULL,
    `email_change_token_new` VARCHAR(255) NULL,
    `email_change` VARCHAR(255) NULL,
    `email_change_sent_at` DATETIME(0) NULL,
    `last_sign_in_at` DATETIME(0) NULL,
    `raw_app_meta_data` LONGTEXT NULL,
    `raw_user_meta_data` LONGTEXT NULL,
    `is_super_admin` BOOLEAN NULL,
    `created_at` DATETIME(0) NULL,
    `updated_at` DATETIME(0) NULL,
    `phone` TEXT NULL,
    `phone_confirmed_at` DATETIME(0) NULL,
    `phone_change` TEXT NULL DEFAULT '',
    `phone_change_token` VARCHAR(255) NULL DEFAULT '',
    `phone_change_sent_at` DATETIME(0) NULL,
    `confirmed_at` DATETIME(0) NULL,
    `email_change_token_current` VARCHAR(255) NULL DEFAULT '',
    `email_change_confirm_status` SMALLINT NULL,
    `banned_until` DATETIME(0) NULL,
    `reauthentication_token` VARCHAR(255) NULL DEFAULT '',
    `reauthentication_sent_at` DATETIME(0) NULL,
    `is_sso_user` BOOLEAN NOT NULL,
    `deleted_at` DATETIME(0) NULL,
    `is_anonymous` BOOLEAN NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `candidate_likes` (
    `id` CHAR(36) NOT NULL,
    `candidate_id` CHAR(36) NULL,
    `user_id` CHAR(36) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `candidate_performances` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `candidate_id` CHAR(36) NOT NULL,
    `candidate_name` VARCHAR(255) NOT NULL,
    `performance_score` DECIMAL(10, 2) NULL,
    `votes_count` INTEGER NULL,
    `ranking_position` INTEGER NULL,
    `performance_data` LONGTEXT NULL,
    `qualification_status` VARCHAR(50) NULL DEFAULT 'pending',
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `candidate_shares` (
    `id` CHAR(36) NOT NULL,
    `candidate_id` CHAR(36) NULL,
    `user_id` CHAR(36) NULL,
    `platform` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `candidates` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `name` TEXT NOT NULL,
    `description` TEXT NULL,
    `photo_url` TEXT NULL,
    `vote_count` INTEGER NULL,
    `category` TEXT NULL,
    `created_at` DATETIME(0) NOT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `categories` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(255) NOT NULL,
    `slug` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `icon` VARCHAR(255) NULL,
    `color` VARCHAR(50) NULL,
    `is_active` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coin_conversion_rates` (
    `id` CHAR(36) NOT NULL,
    `currency` TEXT NOT NULL,
    `coins_per_unit` DECIMAL(10, 4) NOT NULL,
    `min_purchase_amount` INTEGER NULL,
    `is_active` BOOLEAN NULL DEFAULT true,
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coin_packs` (
    `id` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `slug` VARCHAR(100) NULL,
    `coin_amount` INTEGER NOT NULL,
    `bonus_coins` INTEGER NULL,
    `fcfa_price` INTEGER NOT NULL,
    `is_active` BOOLEAN NULL DEFAULT true,
    `is_custom` BOOLEAN NULL,
    `display_order` INTEGER NULL,
    `badge` VARCHAR(50) NULL,
    `description` TEXT NULL,
    `created_at` DATETIME(0) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coin_spending` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `amount` INTEGER NOT NULL,
    `spent_from_free` BOOLEAN NULL,
    `free_coins_used` INTEGER NULL,
    `paid_coins_used` INTEGER NULL,
    `purpose` TEXT NOT NULL,
    `target_id` CHAR(36) NULL,
    `target_type` TEXT NULL,
    `description` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `raffle_event_id` CHAR(36) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coin_transactions` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `pack_id` CHAR(36) NULL,
    `amount_paid` INTEGER NOT NULL,
    `coins_credited` INTEGER NOT NULL,
    `status` TEXT NULL DEFAULT 'pending',
    `moneyfusion_reference` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `completed_at` DATETIME(0) NULL,
    `related_event_id` CHAR(36) NULL,
    `balance_before` DECIMAL(15, 2) NULL,
    `balance_after` DECIMAL(15, 2) NULL,
    `transaction_type` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coin_transfers` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `amount` INTEGER NOT NULL,
    `type` TEXT NOT NULL,
    `description` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `comments` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `parent_id` CHAR(36) NULL,
    `comment_text` TEXT NOT NULL,
    `is_approved` BOOLEAN NULL DEFAULT true,
    `is_edited` BOOLEAN NULL,
    `likes_count` INTEGER NULL,
    `replies_count` INTEGER NULL,
    `report_count` INTEGER NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `edited_at` DATETIME(0) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `content_reports` (
    `id` CHAR(36) NOT NULL,
    `reporter_id` CHAR(36) NULL,
    `target_type` TEXT NULL,
    `target_id` CHAR(36) NULL,
    `reason` TEXT NOT NULL,
    `status` TEXT NULL DEFAULT 'pending',
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `reviewed_by` CHAR(36) NULL,
    `reviewed_at` DATETIME(0) NULL,
    `content` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contests` (
    `id` CHAR(36) NOT NULL,
    `title` TEXT NOT NULL,
    `description` TEXT NULL,
    `start_date` DATETIME(0) NOT NULL,
    `event_end_at` DATETIME(0) NOT NULL,
    `vote_cost_coins` INTEGER NOT NULL,
    `category` TEXT NULL,
    `organizer_id` CHAR(36) NULL,
    `is_active` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `primary_media_id` CHAR(36) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `contract_submissions` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `license_pack_id` INTEGER NULL,
    `license_id` INTEGER NULL,
    `contract_file_url` TEXT NOT NULL,
    `status` TEXT NULL DEFAULT 'pending',
    `submitted_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `admin_notes` TEXT NULL,
    `reviewed_by` CHAR(36) NULL,
    `reviewed_at` DATETIME(0) NULL,
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `contract_type` TEXT NULL,
    `user_email` TEXT NULL,
    `user_name` TEXT NULL,
    `user_phone` TEXT NULL,
    `message` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `conversion_rates` (
    `id` CHAR(36) NOT NULL,
    `currency_from` VARCHAR(10) NOT NULL,
    `currency_to` VARCHAR(10) NOT NULL,
    `rate` DECIMAL(10, 4) NOT NULL,
    `is_active` BOOLEAN NULL DEFAULT true,
    `effective_from` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `effective_until` DATETIME(0) NULL,
    `created_by` CHAR(36) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coupon_usages` (
    `id` CHAR(36) NOT NULL,
    `coupon_code` TEXT NULL,
    `user_id` CHAR(36) NULL,
    `transaction_id` TEXT NULL,
    `amount` DECIMAL(20, 4) NULL,
    `commission` DECIMAL(20, 4) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `coupons` (
    `code` VARCHAR(255) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `active` BOOLEAN NULL DEFAULT true,
    `usage_count` INTEGER NULL,
    `total_amount` DECIMAL(20, 4) NULL,
    `commission_earned` DECIMAL(20, 4) NULL,
    `last_used_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`code`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `creator_monthly_stats` (
    `id` CHAR(36) NOT NULL,
    `creator_id` CHAR(36) NULL,
    `month` DATE NOT NULL,
    `views_count` INTEGER NULL,
    `inscriptions_count` INTEGER NULL,
    `score` DECIMAL(20, 4) NULL,
    `pool_share_percentage` DECIMAL(20, 4) NULL,
    `estimated_earnings_fcfa` DECIMAL(20, 4) NULL,
    `final_earnings_fcfa` DECIMAL(20, 4) NULL,
    `status` TEXT NULL DEFAULT 'pending',
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `credits` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `amount_pi` DECIMAL(10, 2) NOT NULL,
    `amount_fcfa` DECIMAL(10, 2) NOT NULL,
    `country` VARCHAR(100) NULL,
    `city` VARCHAR(100) NULL,
    `status` VARCHAR(50) NULL DEFAULT 'active',
    `is_cancelled` BOOLEAN NULL,
    `cancelled_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `currency_rates` (
    `id` CHAR(36) NOT NULL,
    `base_currency` TEXT NOT NULL DEFAULT 'XAF',
    `target_currency` TEXT NOT NULL,
    `exchange_rate` DECIMAL(10, 4) NOT NULL,
    `is_active` BOOLEAN NULL DEFAULT true,
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_by` CHAR(36) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `earnings_transactions` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `category` TEXT NOT NULL,
    `brut_amount` INTEGER NOT NULL,
    `net_amount` INTEGER NOT NULL,
    `fees_amount` INTEGER NOT NULL,
    `description` TEXT NULL,
    `status` TEXT NULL DEFAULT 'pending',
    `transfer_id` CHAR(36) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `transferred_at` DATETIME(0) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `earnings_transfers` (
    `id` CHAR(36) NOT NULL,
    `organizer_id` CHAR(36) NOT NULL,
    `amount_coins` INTEGER NOT NULL,
    `amount_fcfa` DECIMAL(20, 4) NOT NULL,
    `transfer_type` TEXT NOT NULL,
    `status` TEXT NULL DEFAULT 'completed',
    `description` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `email_templates` (
    `id` CHAR(36) NOT NULL,
    `template_type` VARCHAR(100) NOT NULL,
    `subject` VARCHAR(255) NOT NULL,
    `html_content` TEXT NOT NULL,
    `text_content` TEXT NULL,
    `variables` LONGTEXT NULL DEFAULT '[]',
    `is_active` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `encouragement_messages` (
    `id` CHAR(36) NOT NULL,
    `message_type` TEXT NULL DEFAULT 'video_completion',
    `message_text` TEXT NOT NULL,
    `is_active` BOOLEAN NULL DEFAULT true,
    `display_order` INTEGER NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `error_logs` (
    `id` CHAR(36) NOT NULL,
    `function_name` TEXT NULL,
    `error_message` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_bookmarks` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_cancellations` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `cancelled_by_admin_id` CHAR(36) NOT NULL,
    `reason` TEXT NULL,
    `total_refunded` DECIMAL(20, 4) NULL,
    `participant_count` INTEGER NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `metadata` LONGTEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_categories` (
    `id` CHAR(36) NOT NULL,
    `name` TEXT NOT NULL,
    `slug` TEXT NOT NULL,
    `description` TEXT NULL,
    `icon_url` TEXT NULL,
    `color_hex` TEXT NULL,
    `display_order` INTEGER NULL,
    `is_active` BOOLEAN NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_comments` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `event_id` CHAR(36) NULL,
    `comment_text` TEXT NOT NULL,
    `rating` INTEGER NULL,
    `is_approved` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `content` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_community_verifications` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NULL,
    `user_id` CHAR(36) NULL,
    `verified_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `verification_type` TEXT NULL,
    `comment` TEXT NULL,
    `evidence_url` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_disputes` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `reporter_id` CHAR(36) NOT NULL,
    `reason` TEXT NOT NULL,
    `evidence_url` TEXT NULL,
    `status` TEXT NULL DEFAULT 'open',
    `resolution_notes` TEXT NULL,
    `resolved_by` CHAR(36) NULL,
    `resolved_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_fund_releases` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `organizer_id` CHAR(36) NOT NULL,
    `stage` INTEGER NOT NULL,
    `percentage_released` DECIMAL(20, 4) NOT NULL,
    `amount_released` DECIMAL(20, 4) NOT NULL,
    `conditions_met` LONGTEXT NULL DEFAULT '{}',
    `released_by` CHAR(36) NULL,
    `released_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_geocoding_results` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NULL,
    `input_address` TEXT NOT NULL,
    `formatted_address` TEXT NULL,
    `latitude` DECIMAL(10, 8) NULL,
    `longitude` DECIMAL(11, 8) NULL,
    `google_place_id` TEXT NULL,
    `location_type` TEXT NULL,
    `viewport_ne_lat` DECIMAL(10, 8) NULL,
    `viewport_ne_lng` DECIMAL(11, 8) NULL,
    `viewport_sw_lat` DECIMAL(10, 8) NULL,
    `viewport_sw_lng` DECIMAL(11, 8) NULL,
    `confidence_score` DECIMAL(3, 2) NULL,
    `geocoding_provider` TEXT NULL DEFAULT 'google',
    `raw_response` LONGTEXT NULL,
    `status` TEXT NULL DEFAULT 'success',
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_notifications` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NULL,
    `notification_type` TEXT NULL DEFAULT 'new_event',
    `send_to_all_users` BOOLEAN NULL DEFAULT true,
    `send_to_followers` BOOLEAN NULL,
    `send_to_city` BOOLEAN NULL DEFAULT true,
    `total_sent` INTEGER NULL,
    `total_delivered` INTEGER NULL,
    `status` TEXT NULL DEFAULT 'pending',
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `sent_at` DATETIME(0) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_participations` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `event_id` CHAR(36) NULL,
    `ticket_purchase_id` CHAR(36) NULL,
    `participation_type` VARCHAR(50) NULL DEFAULT 'attendee',
    `status` VARCHAR(50) NULL DEFAULT 'registered',
    `registration_date` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `attended_at` DATETIME(0) NULL,
    `check_in_time` DATETIME(0) NULL,
    `check_out_time` DATETIME(0) NULL,
    `notes` TEXT NULL,
    `rating` INTEGER NULL,
    `review_text` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_promo_config` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NULL,
    `enabled` BOOLEAN NULL,
    `discount_type` TEXT NULL,
    `discount_value` INTEGER NULL,
    `commission_rate` INTEGER NULL,
    `usage_limit` INTEGER NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_promotions` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NULL,
    `organizer_id` CHAR(36) NULL,
    `promotion_pack_id` CHAR(36) NULL,
    `start_date` DATETIME(0) NOT NULL,
    `event_end_at` DATETIME(0) NOT NULL,
    `cost_pi` INTEGER NOT NULL,
    `status` TEXT NULL DEFAULT 'pending',
    `payment_status` TEXT NULL DEFAULT 'pending',
    `used_free_coins` INTEGER NULL,
    `used_paid_coins` INTEGER NULL,
    `views_before` INTEGER NULL,
    `views_after` INTEGER NULL,
    `interactions_before` INTEGER NULL,
    `interactions_after` INTEGER NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `activated_at` DATETIME(0) NULL,
    `cancelled_at` DATETIME(0) NULL,
    `free_coins_used` INTEGER NULL,
    `paid_coins_used` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_protections` (
    `id` INTEGER NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `event_type` VARCHAR(100) NOT NULL,
    `is_unlocked` BOOLEAN NULL,
    `unlocked_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_raffles` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `raffle_name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `ticket_price_fcfa` DECIMAL(10, 2) NULL,
    `ticket_price_coins` INTEGER NULL,
    `total_tickets` INTEGER NOT NULL,
    `tickets_sold` INTEGER NULL,
    `prizes` LONGTEXT NOT NULL,
    `draw_date` DATETIME(0) NOT NULL,
    `is_active` BOOLEAN NULL DEFAULT true,
    `winner_user_id` CHAR(36) NULL,
    `winner_announced` BOOLEAN NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_reactions` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `event_id` CHAR(36) NULL,
    `reaction_type` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_refund_logs` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NULL,
    `admin_id` CHAR(36) NULL,
    `total_amount` DECIMAL(20, 4) NULL,
    `refunded_user_count` INTEGER NULL,
    `reason` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_revenues` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `organizer_id` CHAR(36) NOT NULL,
    `ticket_revenue_fcfa` DECIMAL(15, 2) NULL,
    `vote_revenue_fcfa` DECIMAL(15, 2) NULL,
    `interaction_revenue_fcfa` DECIMAL(15, 2) NULL,
    `stand_revenue_fcfa` DECIMAL(15, 2) NULL,
    `raffle_revenue_fcfa` DECIMAL(15, 2) NULL,
    `total_revenue_fcfa` DECIMAL(15, 2) NULL,
    `platform_fee_fcfa` DECIMAL(15, 2) NULL,
    `organizer_gain_fcfa` DECIMAL(15, 2) NULL,
    `organizer_gain_coins` INTEGER NULL,
    `organizer_gain_usd` DECIMAL(15, 2) NULL,
    `organizer_gain_eur` DECIMAL(15, 2) NULL,
    `calculation_date` DATE NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_settings` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NULL,
    `vote_price_fcfa` INTEGER NULL,
    `vote_price_pi` INTEGER NULL,
    `max_votes_per_user` INTEGER NULL,
    `show_live_results` BOOLEAN NULL DEFAULT true,
    `total_tickets` INTEGER NULL,
    `tickets_sold` INTEGER NULL,
    `ticket_price_fcfa` INTEGER NULL,
    `ticket_price_pi` INTEGER NULL,
    `total_stands` INTEGER NULL,
    `stands_rented` INTEGER NULL,
    `stand_price_fcfa` INTEGER NULL,
    `stand_price_pi` INTEGER NULL,
    `raffle_price_fcfa` INTEGER NULL,
    `raffle_price_pi` INTEGER NULL,
    `total_participants` INTEGER NULL,
    `start_date` DATETIME(0) NULL,
    `event_end_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `max_tickets_per_user` INTEGER NULL,
    `draw_date` DATETIME(0) NULL,
    `automatic_draw` BOOLEAN NULL DEFAULT true,
    `notify_winners` BOOLEAN NULL DEFAULT true,
    `winners_drawn` BOOLEAN NULL,
    `voting_enabled` BOOLEAN NULL,
    `raffle_enabled` BOOLEAN NULL,
    `ticketing_enabled` BOOLEAN NULL,
    `stands_enabled` BOOLEAN NULL,
    `notify_participants` BOOLEAN NULL,
    `show_participants` BOOLEAN NULL,
    `show_remaining_tickets` BOOLEAN NULL DEFAULT true,
    `allow_multiple_votes` BOOLEAN NULL,
    `voting_type` TEXT NULL DEFAULT 'paid',
    `commission_rate` DECIMAL(5, 2) NULL,
    `organizer_rate` DECIMAL(5, 2) NULL,
    `max_votes_per_phone` INTEGER NOT NULL DEFAULT 50,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_shares` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `share_platform` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_stands` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `stand_name` VARCHAR(255) NOT NULL,
    `stand_type` VARCHAR(100) NOT NULL,
    `location_description` TEXT NULL,
    `price_fcfa` DECIMAL(10, 2) NOT NULL,
    `price_coins` INTEGER NULL,
    `size_sqm` DECIMAL(5, 2) NULL,
    `is_available` BOOLEAN NULL DEFAULT true,
    `is_booked` BOOLEAN NULL,
    `booked_by` CHAR(36) NULL,
    `booking_start` DATETIME(0) NULL,
    `booking_end` DATETIME(0) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_validation_status` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `event_type` TEXT NOT NULL,
    `validation_step` TEXT NOT NULL,
    `status` TEXT NULL DEFAULT 'pending',
    `admin_notes` TEXT NULL,
    `evidence_files` LONGTEXT NULL DEFAULT '[]',
    `validated_by` CHAR(36) NULL,
    `validated_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_views` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `ip_address` TEXT NULL,
    `user_agent` TEXT NULL,
    `view_date` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `session_id` TEXT NULL,
    `device_type` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_votes` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `candidate_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `vote_count` INTEGER NOT NULL,
    `vote_price_pi` INTEGER NOT NULL,
    `vote_price_fcfa` INTEGER NOT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `events` (
    `id` CHAR(36) NOT NULL,
    `title` TEXT NOT NULL,
    `description` TEXT NULL,
    `city` TEXT NOT NULL,
    `country` TEXT NOT NULL DEFAULT 'C├┤te d''Ivoire',
    `location` TEXT NULL,
    `organizer_id` CHAR(36) NULL,
    `event_type` TEXT NULL DEFAULT 'protected',
    `is_active` BOOLEAN NULL DEFAULT true,
    `status` TEXT NULL DEFAULT 'draft',
    `is_promoted` BOOLEAN NULL,
    `promoted_until` DATETIME(0) NULL,
    `price_fcfa` INTEGER NULL,
    `price_pi` INTEGER NULL,
    `views_count` INTEGER NULL,
    `interactions_count` INTEGER NULL,
    `participants_count` INTEGER NULL,
    `promotion_views_count` INTEGER NULL,
    `cover_image` TEXT NULL,
    `tags` LONGTEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `contact_phone` TEXT NULL,
    `address` TEXT NULL,
    `google_maps_link` TEXT NULL,
    `latitude` DECIMAL(10, 8) NULL,
    `longitude` DECIMAL(11, 8) NULL,
    `full_address` TEXT NULL,
    `google_place_id` TEXT NULL,
    `location_instructions` TEXT NULL,
    `geocoding_status` TEXT NULL DEFAULT 'pending',
    `geocoding_attempts` INTEGER NULL,
    `geocoding_last_attempt` DATETIME(0) NULL,
    `promotion_start` DATETIME(0) NULL,
    `promotion_end` DATETIME(0) NULL,
    `promotion_type` TEXT NULL,
    `verification_enabled` BOOLEAN NULL,
    `max_verifications_per_ticket` INTEGER NULL,
    `verification_start_time` DATETIME(0) NULL,
    `verification_end_time` DATETIME(0) NULL,
    `category_id` CHAR(36) NULL,
    `cover_image_url` TEXT NULL,
    `cover_image_path` TEXT NULL,
    `is_online` BOOLEAN NULL,
    `is_public` BOOLEAN NULL DEFAULT true,
    `requires_approval` BOOLEAN NULL,
    `max_attendees` INTEGER NULL,
    `max_participants` INTEGER NULL,
    `allows_reentry` BOOLEAN NULL DEFAULT true,
    `max_reentry_interval` INTEGER NULL,
    `contract_accepted_at` DATETIME(0) NULL,
    `contract_version` TEXT NULL,
    `is_sales_closed` BOOLEAN NULL,
    `event_start_at` DATETIME(0) NOT NULL,
    `event_end_at` DATETIME(0) NULL,
    `is_cancelled` BOOLEAN NULL,
    `cancellation_reason` TEXT NULL,
    `cancelled_at` DATETIME(0) NULL,
    `cancelled_by_admin_id` CHAR(36) NULL,
    `is_completed` BOOLEAN NULL,
    `completed_at` DATETIME(0) NULL,
    `completion_notes` TEXT NULL,
    `requires_participant_confirmation` BOOLEAN NULL,
    `total_tickets_purchased` INTEGER NULL,
    `total_tickets_scanned` INTEGER NULL,
    `scan_threshold_percentage` INTEGER NULL,
    `is_scan_verified` BOOLEAN NULL,
    `scan_verified_at` DATETIME(0) NULL,
    `scan_verified_by_admin_id` CHAR(36) NULL,
    `fund_release_stage` INTEGER NULL,
    `validation_required` BOOLEAN NULL,
    `coins_refunded` BOOLEAN NULL,
    `start_date` DATETIME(0) NULL,
    `end_date` DATETIME(0) NULL,
    `category_slug` TEXT NULL,
    `image_url` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `home_page_data` (
    `id` CHAR(36) NOT NULL,
    `section_type` TEXT NULL,
    `title` TEXT NOT NULL,
    `subtitle` TEXT NULL,
    `description` TEXT NULL,
    `image_url` TEXT NULL,
    `button_text` TEXT NULL,
    `button_link` TEXT NULL,
    `display_order` INTEGER NULL,
    `is_active` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `influencer_commissions` (
    `id` CHAR(36) NOT NULL,
    `influencer_id` CHAR(36) NOT NULL,
    `promo_code_id` CHAR(36) NOT NULL,
    `amount` INTEGER NOT NULL,
    `status` TEXT NULL DEFAULT 'pending',
    `paid_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `promo_code_usage_id` CHAR(36) NULL,
    `commission_date` DATE NULL,
    `transaction_id` CHAR(36) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `licence_renewal_requests` (
    `id` CHAR(36) NOT NULL,
    `admin_id` CHAR(36) NOT NULL,
    `licence_id` CHAR(36) NOT NULL,
    `status` TEXT NOT NULL DEFAULT 'pending',
    `request_date` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `reviewed_by` CHAR(36) NULL,
    `reviewed_at` DATETIME(0) NULL,
    `notes` TEXT NULL,
    `renewal_type` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `license_renewal_requests` (
    `id` CHAR(36) NOT NULL,
    `admin_id` CHAR(36) NOT NULL,
    `requested_license_type` TEXT NOT NULL,
    `current_license_type` TEXT NULL,
    `renewal_status` TEXT NULL DEFAULT 'pending',
    `request_date` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `processed_date` DATETIME(0) NULL,
    `processed_by` CHAR(36) NULL,
    `notes` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `licenses` (
    `id` CHAR(36) NOT NULL,
    `name` TEXT NOT NULL,
    `commission_rate` DECIMAL(20, 4) NOT NULL,
    `price_fcfa` DECIMAL(20, 4) NULL,
    `duration_days` INTEGER NULL,
    `features` LONGTEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ligdicashtransactions` (
    `id` CHAR(36) NOT NULL,
    `token` TEXT NOT NULL,
    `external_id` TEXT NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NULL,
    `amount` INTEGER NOT NULL,
    `operator` TEXT NOT NULL,
    `phone` TEXT NOT NULL,
    `status` TEXT NOT NULL DEFAULT 'pending',
    `payment_data` LONGTEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `live_rankings` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `candidate_id` CHAR(36) NOT NULL,
    `candidate_name` VARCHAR(255) NOT NULL,
    `current_score` DECIMAL(10, 2) NULL,
    `current_votes` INTEGER NULL,
    `ranking_position` INTEGER NULL,
    `position_change` INTEGER NULL,
    `qualification_status` VARCHAR(50) NULL,
    `last_update` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `location_types` (
    `id` CHAR(36) NOT NULL,
    `name` TEXT NOT NULL,
    `slug` TEXT NOT NULL,
    `icon` TEXT NULL,
    `description` TEXT NULL,
    `is_active` BOOLEAN NULL DEFAULT true,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `locations` (
    `id` CHAR(36) NOT NULL,
    `name` TEXT NOT NULL,
    `description` TEXT NULL,
    `type_id` CHAR(36) NULL,
    `address` TEXT NOT NULL,
    `city` TEXT NOT NULL,
    `country` TEXT NOT NULL,
    `latitude` DECIMAL(10, 8) NULL,
    `longitude` DECIMAL(11, 8) NULL,
    `google_maps_link` TEXT NULL,
    `website` TEXT NULL,
    `phone_number` TEXT NULL,
    `email` TEXT NULL,
    `opening_hours` LONGTEXT NULL,
    `price_range` TEXT NULL,
    `images` LONGTEXT NULL,
    `features` LONGTEXT NULL,
    `user_id` CHAR(36) NULL,
    `is_verified` BOOLEAN NULL,
    `is_active` BOOLEAN NULL DEFAULT true,
    `views_count` INTEGER NULL,
    `rating` DECIMAL(3, 2) NULL,
    `total_reviews` INTEGER NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `mandatory_videos` (
    `id` CHAR(36) NOT NULL,
    `title` TEXT NOT NULL,
    `description` TEXT NULL,
    `video_url` TEXT NOT NULL,
    `video_duration` INTEGER NOT NULL,
    `thumbnail_url` TEXT NULL,
    `reward_coins` INTEGER NULL,
    `reward_message` TEXT NULL DEFAULT 'F├®licitations! Vous avez gagn├® 10¤Ç gratuits! ?',
    `is_active` BOOLEAN NULL DEFAULT true,
    `is_mandatory` BOOLEAN NULL DEFAULT true,
    `display_order` INTEGER NULL,
    `target_audience` TEXT NULL DEFAULT 'all',
    `min_app_version` TEXT NULL,
    `total_views` INTEGER NULL,
    `total_rewards_given` INTEGER NULL,
    `total_coins_distributed` INTEGER NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `expires_at` DATETIME(0) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `monthly_creator_pools` (
    `id` CHAR(36) NOT NULL,
    `month` DATE NOT NULL,
    `total_platform_revenue_fcfa` DECIMAL(20, 4) NULL,
    `pool_allocation_fcfa` DECIMAL(20, 4) NULL,
    `total_system_score` DECIMAL(20, 4) NULL,
    `is_distributed` BOOLEAN NULL,
    `distributed_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notification_settings` (
    `id` CHAR(36) NOT NULL,
    `push_notifications_enabled` BOOLEAN NULL DEFAULT true,
    `sound_enabled` BOOLEAN NULL DEFAULT true,
    `vibration_enabled` BOOLEAN NULL DEFAULT true,
    `announcements_enabled` BOOLEAN NULL DEFAULT true,
    `announcement_approval_required` BOOLEAN NULL DEFAULT true,
    `max_announcements_per_day` INTEGER NULL,
    `new_events_notification` BOOLEAN NULL DEFAULT true,
    `promoted_events_notification` BOOLEAN NULL DEFAULT true,
    `nearby_events_notification` BOOLEAN NULL DEFAULT true,
    `user_activity_notifications` BOOLEAN NULL DEFAULT true,
    `marketing_notifications` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `notifications` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `title` TEXT NOT NULL,
    `message` TEXT NOT NULL,
    `type` TEXT NULL DEFAULT 'system',
    `data` LONGTEXT NULL,
    `image_url` TEXT NULL,
    `sound_enabled` BOOLEAN NULL DEFAULT true,
    `vibration_enabled` BOOLEAN NULL DEFAULT true,
    `is_read` BOOLEAN NULL,
    `read_at` DATETIME(0) NULL,
    `push_sent` BOOLEAN NULL,
    `push_delivered` BOOLEAN NULL,
    `push_error` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `scheduled_for` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `sound_effect` TEXT NULL,
    `is_global` BOOLEAN NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organizer_balances` (
    `id` CHAR(36) NOT NULL,
    `organizer_id` CHAR(36) NULL,
    `interaction_earnings` INTEGER NULL,
    `event_revenues` INTEGER NULL,
    `subscription_earnings` INTEGER NULL,
    `total_earnings` INTEGER NULL,
    `total_withdrawn` INTEGER NULL,
    `available_balance` INTEGER NULL,
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organizer_earnings` (
    `id` CHAR(36) NOT NULL,
    `organizer_id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `transaction_id` CHAR(36) NOT NULL,
    `transaction_type` VARCHAR(50) NULL DEFAULT 'ticket_sale',
    `earnings_coins` INTEGER NOT NULL,
    `earnings_fcfa` DECIMAL(10, 2) NOT NULL,
    `status` VARCHAR(50) NULL DEFAULT 'pending',
    `paid_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `description` TEXT NULL,
    `platform_commission` INTEGER NULL,
    `amount_pi` DECIMAL(10, 2) NULL,
    `fee_percent` DECIMAL(5, 2) NULL,
    `net_amount` DECIMAL(10, 2) NULL,
    `ticket_count` INTEGER NULL,
    `earning_type` VARCHAR(50) NULL DEFAULT 'raffle',
    `raffle_event_id` CHAR(36) NULL,
    `platform_fee` DECIMAL(20, 4) NULL,
    `metadata` LONGTEXT NULL DEFAULT '{}',
    `event_type` TEXT NULL,
    `transferred_at` DATETIME(0) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organizer_interaction_earnings` (
    `id` CHAR(36) NOT NULL,
    `organizer_id` CHAR(36) NULL,
    `event_id` CHAR(36) NULL,
    `amount` INTEGER NOT NULL,
    `interaction_type` TEXT NOT NULL,
    `status` TEXT NULL DEFAULT 'available',
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organizer_prices` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NULL,
    `price_type` TEXT NOT NULL,
    `currency` TEXT NOT NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `calculated_coins` INTEGER NULL,
    `pricing_period` TEXT NULL DEFAULT 'regular',
    `is_active` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `start_date` DATETIME(0) NULL,
    `event_end_at` DATETIME(0) NULL,
    `ticket_type_id` CHAR(36) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organizer_scanners` (
    `id` CHAR(36) NOT NULL,
    `organizer_id` CHAR(36) NOT NULL,
    `scanner_name` TEXT NOT NULL,
    `scanner_code` TEXT NOT NULL,
    `device_id` TEXT NULL,
    `is_active` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `last_used` DATETIME(0) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organizer_transactions` (
    `id` CHAR(36) NOT NULL,
    `organizer_id` CHAR(36) NOT NULL,
    `transaction_type` TEXT NOT NULL,
    `source_type` TEXT NOT NULL,
    `amount_coins` INTEGER NOT NULL,
    `amount_fcfa` DECIMAL(20, 4) NOT NULL,
    `description` TEXT NULL,
    `reference_id` CHAR(36) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organizer_wallet` (
    `id` CHAR(36) NOT NULL,
    `organizer_id` CHAR(36) NOT NULL,
    `interaction_balance_coins` INTEGER NULL,
    `ticket_balance_coins` INTEGER NULL,
    `raffle_balance_coins` INTEGER NULL,
    `vote_balance_coins` INTEGER NULL,
    `stand_balance_coins` INTEGER NULL,
    `total_balance_coins` INTEGER NULL,
    `total_balance_fcfa` DECIMAL(20, 4) NULL,
    `total_earned_coins` INTEGER NULL,
    `total_withdrawn_coins` INTEGER NULL,
    `total_earned_fcfa` DECIMAL(20, 4) NULL,
    `total_withdrawn_fcfa` DECIMAL(20, 4) NULL,
    `last_updated` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organizer_wallets` (
    `id` CHAR(36) NOT NULL,
    `organizer_id` CHAR(36) NOT NULL,
    `total_collected` DECIMAL(20, 4) NULL,
    `total_unlocked` DECIMAL(20, 4) NULL,
    `verification_status` TEXT NULL DEFAULT 'pending',
    `fraud_flags` INTEGER NULL,
    `complaint_count` INTEGER NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `organizer_withdrawal_requests` (
    `id` CHAR(36) NOT NULL,
    `organizer_id` CHAR(36) NULL,
    `amount_pi` INTEGER NOT NULL,
    `amount_fcfa` INTEGER NOT NULL,
    `status` TEXT NULL DEFAULT 'pending',
    `admin_notes` TEXT NULL,
    `superadmin_notes` TEXT NULL,
    `requested_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `reviewed_by_admin` CHAR(36) NULL,
    `reviewed_by_superadmin` CHAR(36) NULL,
    `reviewed_at` DATETIME(0) NULL,
    `paid_at` DATETIME(0) NULL,
    `payment_details` LONGTEXT NULL,
    `fees` DECIMAL(20, 4) NULL,
    `net_amount` DECIMAL(20, 4) NULL,
    `validated_at` DATETIME(0) NULL,
    `validation_status` TEXT NULL DEFAULT 'pending',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `paiements_admin` (
    `id` CHAR(36) NOT NULL,
    `admin_id` CHAR(36) NOT NULL,
    `mois` DATE NOT NULL,
    `ca_zone` DECIMAL(20, 4) NOT NULL,
    `taux_commission` DECIMAL(20, 4) NOT NULL,
    `score` DECIMAL(20, 4) NOT NULL,
    `montant_a_payer` DECIMAL(20, 4) NOT NULL,
    `statut` TEXT NOT NULL DEFAULT 'en_attente',
    `paye_le` DATETIME(0) NULL,
    `created_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `country` TEXT NULL,
    `city` TEXT NULL,
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `paiements_secretary` (
    `id` CHAR(36) NOT NULL,
    `secretary_id` CHAR(36) NOT NULL,
    `month` DATE NOT NULL,
    `total_volume_fcfa` DECIMAL(20, 4) NULL,
    `commission_rate` DECIMAL(20, 4) NULL,
    `amount_earned` DECIMAL(20, 4) NULL,
    `status` TEXT NULL DEFAULT 'pending',
    `paid_at` DATETIME(0) NULL,
    `paid_by` CHAR(36) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `participant_refunds` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `amount` DECIMAL(20, 4) NOT NULL,
    `reason` TEXT NULL,
    `status` TEXT NULL DEFAULT 'pending',
    `processed_at` DATETIME(0) NULL,
    `processed_by` CHAR(36) NULL,
    `transaction_id` CHAR(36) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `participant_votes` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `candidate_id` CHAR(36) NOT NULL,
    `voter_id` CHAR(36) NOT NULL,
    `ticket_purchase_id` CHAR(36) NULL,
    `vote_value` INTEGER NULL,
    `vote_type` VARCHAR(50) NULL DEFAULT 'standard',
    `vote_weight` DECIMAL(5, 2) NULL,
    `voted_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `participation_payments` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `organizer_id` CHAR(36) NOT NULL,
    `transaction_type` TEXT NOT NULL,
    `reference_id` CHAR(36) NULL,
    `total_amount_coins` INTEGER NOT NULL,
    `platform_fee_coins` INTEGER NOT NULL,
    `organizer_earnings_coins` INTEGER NOT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `participations` (
    `id` CHAR(36) NOT NULL,
    `raffle_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `ticket_quantity` INTEGER NOT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partner_badges` (
    `id` CHAR(36) NOT NULL,
    `partner_id` CHAR(36) NOT NULL,
    `partner_name` VARCHAR(100) NOT NULL,
    `license_type` VARCHAR(20) NOT NULL,
    `zone` VARCHAR(100) NOT NULL,
    `badge_id` VARCHAR(50) NOT NULL,
    `is_active` BOOLEAN NULL,
    `display_order` INTEGER NULL,
    `custom_title` VARCHAR(100) NULL,
    `custom_description` TEXT NULL,
    `banner_color` VARCHAR(7) NULL DEFAULT '#000000',
    `created_by` CHAR(36) NOT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partner_earnings` (
    `id` CHAR(36) NOT NULL,
    `partner_id` CHAR(36) NOT NULL,
    `month` VARCHAR(7) NOT NULL,
    `total_sales_fcfa` DECIMAL(15, 2) NULL,
    `total_sales_coins` INTEGER NULL,
    `commission_rate` DECIMAL(5, 2) NULL,
    `earnings_fcfa` DECIMAL(15, 2) NULL,
    `earnings_coins` INTEGER NULL,
    `payout_status` VARCHAR(20) NULL DEFAULT 'pending',
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `paid_at` DATETIME(0) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partner_license_packs` (
    `id` INTEGER NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `licence_type` VARCHAR(100) NOT NULL,
    `fcfa_price` INTEGER NOT NULL,
    `duration_days` INTEGER NOT NULL,
    `revenue_share_percent` INTEGER NOT NULL,
    `description` TEXT NULL,
    `is_active` BOOLEAN NULL DEFAULT true,
    `display_order` INTEGER NULL,
    `badge` VARCHAR(50) NULL,
    `features` LONGTEXT NULL,
    `created_at` DATETIME(0) NULL,
    `duration_months` INTEGER NULL,
    `slug` TEXT NULL,
    `coverage_type` TEXT NULL,
    `benefits` TEXT NULL,
    `level` TEXT NULL,
    `duration_years` INTEGER NULL,
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partner_licenses` (
    `id` CHAR(36) NOT NULL,
    `name` VARCHAR(100) NOT NULL,
    `slug` VARCHAR(100) NOT NULL,
    `coverage_type` VARCHAR(20) NOT NULL,
    `commission_rate` DECIMAL(5, 2) NOT NULL,
    `duration_days` INTEGER NULL,
    `price_fcfa` DECIMAL(15, 2) NOT NULL,
    `is_active` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `partners` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `license_id` CHAR(36) NOT NULL,
    `coverage_zone` LONGTEXT NOT NULL,
    `activation_date` DATETIME(0) NULL,
    `expiration_date` DATETIME(0) NULL,
    `status` VARCHAR(20) NULL DEFAULT 'pending',
    `documents_submitted` BOOLEAN NULL,
    `documents_verified` BOOLEAN NULL,
    `contract_sent` BOOLEAN NULL,
    `total_earnings` DECIMAL(15, 2) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payment_intents` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `amount_fcfa` INTEGER NOT NULL,
    `pack_id` TEXT NULL,
    `status` TEXT NULL DEFAULT 'pending',
    `provider_transaction_id` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `expires_at` DATETIME(0) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `payments` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `coins_amount` INTEGER NOT NULL,
    `amount_fcfa` DECIMAL(20, 4) NOT NULL,
    `status` TEXT NOT NULL DEFAULT 'pending',
    `payment_method` TEXT NULL,
    `transaction_id` TEXT NOT NULL,
    `processed_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `pack_id` TEXT NULL,
    `coupon_code` TEXT NULL,
    `coupon_owner_id` CHAR(36) NULL,
    `coupon_commission` DECIMAL(20, 4) NULL,
    `credits_added` BOOLEAN NULL,
    `failed_at` DATETIME(0) NULL,
    `failure_reason` TEXT NULL,
    `validated_by` CHAR(36) NULL,
    `rejected_by` CHAR(36) NULL,
    `validated_at` DATETIME(0) NULL,
    `rejected_at` DATETIME(0) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pending_emails` (
    `id` CHAR(36) NOT NULL,
    `user_email` TEXT NOT NULL,
    `subject` TEXT NOT NULL,
    `template_name` TEXT NOT NULL,
    `template_data` LONGTEXT NOT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `sent_at` DATETIME(0) NULL,
    `error` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pending_withdrawals` (
    `id` CHAR(36) NOT NULL,
    `organizer_id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NULL,
    `amount_pi` INTEGER NOT NULL,
    `amount_fcfa` DECIMAL(20, 4) NOT NULL,
    `status` TEXT NULL DEFAULT 'PENDING',
    `withdrawal_request_id` CHAR(36) NULL,
    `admin_notes` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `validated_at` DATETIME(0) NULL,
    `paid_at` DATETIME(0) NULL,
    `processed_by` CHAR(36) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `personal_score` (
    `id` CHAR(36) NOT NULL,
    `admin_id` CHAR(36) NOT NULL,
    `score` DECIMAL(4, 3) NOT NULL,
    `calculation_date` DATE NOT NULL,
    `details` LONGTEXT NULL,
    `created_at` DATETIME(0) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pin_reset_requests` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `phone_number` TEXT NOT NULL,
    `id_photo_url` TEXT NULL DEFAULT 'en_attente.jpg',
    `status` TEXT NULL DEFAULT 'pending',
    `admin_notes` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `processed_at` DATETIME(0) NULL,
    `processed_by` CHAR(36) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_earnings` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NULL,
    `transaction_id` CHAR(36) NULL,
    `amount` DECIMAL(10, 2) NOT NULL,
    `earning_type` VARCHAR(50) NULL DEFAULT 'vote_fee',
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `deleted_at` DATETIME(0) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_fees` (
    `id` CHAR(36) NOT NULL,
    `organizer_id` CHAR(36) NOT NULL,
    `raffle_event_id` CHAR(36) NULL,
    `amount` DECIMAL(20, 4) NOT NULL,
    `percentage` INTEGER NOT NULL,
    `description` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `platform_wallet` (
    `id` CHAR(36) NOT NULL,
    `wallet_type` VARCHAR(50) NOT NULL,
    `balance_coins` INTEGER NULL,
    `balance_fcfa` DECIMAL(15, 2) NULL,
    `total_earned_coins` INTEGER NULL,
    `total_earned_fcfa` DECIMAL(15, 2) NULL,
    `last_updated` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `profiles` (
    `id` CHAR(36) NOT NULL,
    `username` TEXT NULL,
    `full_name` TEXT NULL,
    `email` TEXT NULL,
    `phone` TEXT NULL,
    `user_type` TEXT NULL DEFAULT 'user',
    `coin_balance` INTEGER NULL,
    `free_coin_balance` INTEGER NULL,
    `total_earnings` INTEGER NULL,
    `available_earnings` INTEGER NULL,
    `mandatory_videos_completed` INTEGER NULL,
    `total_video_rewards_earned` INTEGER NULL,
    `last_video_watched_at` DATETIME(0) NULL,
    `video_streak_count` INTEGER NULL,
    `last_video_streak_date` DATE NULL,
    `avatar_url` TEXT NULL,
    `bio` TEXT NULL,
    `city` TEXT NULL,
    `country` TEXT NULL DEFAULT 'C├┤te d''Ivoire',
    `date_of_birth` DATE NULL,
    `is_verified` BOOLEAN NULL,
    `is_active` BOOLEAN NULL DEFAULT true,
    `affiliate_code` TEXT NULL,
    `notification_radius` INTEGER NULL,
    `notification_settings` LONGTEXT NULL,
    `deleted_at` DATETIME(0) NULL,
    `admin_type` TEXT NULL,
    `commission_wallet` INTEGER NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `last_login` DATETIME(0) NULL,
    `region` TEXT NULL,
    `license_type` TEXT NULL,
    `license_status` TEXT NULL DEFAULT 'inactive',
    `license_expires_at` DATETIME(0) NULL,
    `appointed_by` CHAR(36) NULL,
    `appointed_by_super_admin` BOOLEAN NULL,
    `referral_count` INTEGER NULL,
    `referred_by` CHAR(36) NULL,
    `payment_details` LONGTEXT NULL DEFAULT '{}',
    `license_number` TEXT NULL,
    `total_pi_spent` INTEGER NULL,
    `identity_verified` BOOLEAN NULL,
    `identity_verified_at` DATETIME(0) NULL,
    `phone_verified` BOOLEAN NULL,
    `phone_verified_at` DATETIME(0) NULL,
    `is_blacklisted` BOOLEAN NULL,
    `blacklist_reason` TEXT NULL,
    `blacklist_date` DATETIME(0) NULL,
    `wallet_pin` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `promo_code_commissions` (
    `id` CHAR(36) NOT NULL,
    `promo_code_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `commission_amount` INTEGER NOT NULL,
    `order_id` TEXT NOT NULL,
    `status` TEXT NULL DEFAULT 'pending',
    `source` TEXT NULL DEFAULT 'moneyfusion_ticket',
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `promo_code_usages` (
    `id` CHAR(36) NOT NULL,
    `promo_code_id` CHAR(36) NULL,
    `user_id` CHAR(36) NOT NULL,
    `discount_amount` INTEGER NOT NULL,
    `commission_amount` INTEGER NOT NULL,
    `purchase_amount` INTEGER NOT NULL,
    `used_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `transaction_id` CHAR(36) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `promo_codes` (
    `id` CHAR(36) NOT NULL,
    `code` TEXT NOT NULL,
    `influencer_id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NULL,
    `is_active` BOOLEAN NULL DEFAULT true,
    `usage_count` INTEGER NULL,
    `usage_limit` INTEGER NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `promotion_packs` (
    `id` CHAR(36) NOT NULL,
    `name` TEXT NOT NULL,
    `slug` TEXT NOT NULL,
    `duration_days` INTEGER NOT NULL,
    `cost_pi` INTEGER NOT NULL,
    `description` TEXT NULL,
    `features` LONGTEXT NULL,
    `is_active` BOOLEAN NULL DEFAULT true,
    `display_order` INTEGER NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `protected_event_access` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NULL,
    `user_id` CHAR(36) NULL,
    `amount_paid_pi` INTEGER NOT NULL,
    `status` TEXT NULL DEFAULT 'active',
    `expires_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `push_tokens` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `token` TEXT NOT NULL,
    `endpoint` TEXT NOT NULL,
    `p256dh` TEXT NOT NULL DEFAULT 'pending',
    `auth` TEXT NOT NULL DEFAULT 'pending',
    `device_type` TEXT NULL DEFAULT 'desktop',
    `is_active` BOOLEAN NULL DEFAULT true,
    `device_info` LONGTEXT NULL,
    `last_used_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `pwa_installs` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `installed_at` DATETIME(0) NOT NULL DEFAULT CURRENT_TIMESTAMP(0),
    `device_type` TEXT NULL,
    `platform` TEXT NULL,
    `source` TEXT NULL,
    `user_agent` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `raffle_deposits` (
    `id` CHAR(36) NOT NULL,
    `raffle_id` CHAR(36) NOT NULL,
    `deposit_type` TEXT NOT NULL,
    `amount_or_value` DECIMAL(20, 4) NULL,
    `item_description` TEXT NULL,
    `photos` LONGTEXT NULL,
    `admin_validation_status` TEXT NULL DEFAULT 'pending',
    `validated_by` CHAR(36) NULL,
    `validated_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `raffle_draw_history` (
    `id` CHAR(36) NOT NULL,
    `raffle_event_id` CHAR(36) NULL,
    `draw_type` TEXT NULL,
    `participants_count` INTEGER NULL,
    `tickets_sold` INTEGER NULL,
    `winner_user_id` CHAR(36) NULL,
    `winning_ticket_number` TEXT NULL,
    `draw_date` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `raffle_draw_sessions` (
    `id` CHAR(36) NOT NULL,
    `raffle_event_id` CHAR(36) NULL,
    `displayed_number` INTEGER NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `started_at` DATETIME(0) NULL,
    `started_time` DATETIME(0) NULL,
    `started_by` CHAR(36) NULL,
    `status` TEXT NULL,
    `step` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `raffle_draw_status` (
    `id` CHAR(36) NOT NULL,
    `raffle_event_id` CHAR(36) NOT NULL,
    `draw_session_id` CHAR(36) NOT NULL,
    `status` TEXT NOT NULL,
    `round_number` INTEGER NULL,
    `displayed_number` INTEGER NULL,
    `broadcast_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `is_active` BOOLEAN NULL,
    `started_at` DATETIME(0) NULL,
    `broadcast_id` TEXT NULL,
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `raffle_earnings_transfers` (
    `id` BIGINT NOT NULL,
    `organizer_id` CHAR(36) NOT NULL,
    `amount` INTEGER NOT NULL,
    `transfer_type` TEXT NOT NULL,
    `description` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `raffle_events` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NULL,
    `base_currency` TEXT NULL DEFAULT 'XAF',
    `base_price` DECIMAL(10, 2) NOT NULL,
    `calculated_price_pi` INTEGER NULL,
    `total_tickets` INTEGER NOT NULL,
    `tickets_sold` INTEGER NULL,
    `winning_ticket_number` TEXT NULL,
    `winner_user_id` CHAR(36) NULL,
    `winner_announced_at` DATETIME(0) NULL,
    `draw_date` DATETIME(0) NOT NULL,
    `is_drawn` BOOLEAN NULL,
    `auto_draw` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `min_tickets_sold` INTEGER NULL,
    `status` TEXT NULL DEFAULT 'active',
    `max_tickets_per_user` INTEGER NULL,
    `min_tickets_required` INTEGER NULL,
    `is_draw_conducted` BOOLEAN NULL,
    `draw_conducted_at` DATETIME(0) NULL,
    `is_postponed` BOOLEAN NULL,
    `postponed_to` DATETIME(0) NULL,
    `postponed_reason` TEXT NULL,
    `organizer_id` CHAR(36) NULL,
    `revenue_transferred` BOOLEAN NULL,
    `earnings_transferred` BOOLEAN NULL,
    `transferred_at` DATETIME(0) NULL,
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `coin_to_fcfa_rate` DECIMAL(20, 4) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `raffle_live_numbers` (
    `id` CHAR(36) NOT NULL,
    `raffle_event_id` CHAR(36) NOT NULL,
    `draw_session_id` CHAR(36) NOT NULL,
    `displayed_number` INTEGER NOT NULL,
    `round_number` INTEGER NOT NULL,
    `broadcast_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `raffle_participants` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NULL,
    `user_id` CHAR(36) NULL,
    `ticket_number` TEXT NULL,
    `status` TEXT NULL DEFAULT 'active',
    `participated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `ticket_quantity` INTEGER NULL,
    `total_paid_pi` DECIMAL(15, 2) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `raffle_prizes` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `rank` INTEGER NOT NULL,
    `description` TEXT NOT NULL,
    `value_fcfa` INTEGER NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `raffle_event_id` CHAR(36) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `raffle_tickets` (
    `id` CHAR(36) NOT NULL,
    `raffle_event_id` CHAR(36) NULL,
    `user_id` CHAR(36) NULL,
    `ticket_number` INTEGER NOT NULL,
    `purchase_price_pi` INTEGER NOT NULL,
    `purchased_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `quantity` INTEGER NULL,
    `total_pi_paid` INTEGER NULL,
    `rank` INTEGER NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `raffle_winners` (
    `id` CHAR(36) NOT NULL,
    `raffle_event_id` CHAR(36) NULL,
    `user_id` CHAR(36) NULL,
    `ticket_number` TEXT NOT NULL,
    `prize_description` TEXT NULL,
    `prize_value_pi` INTEGER NULL,
    `prize_value_fcfa` INTEGER NULL,
    `claimed_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `rank` INTEGER NULL,
    `delivery_status` TEXT NULL DEFAULT 'pending',
    `delivery_proof_url` TEXT NULL,
    `organizer_confirmation` BOOLEAN NULL,
    `confirmed_at` DATETIME(0) NULL,
    `admin_notes` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `raffles` (
    `id` CHAR(36) NOT NULL,
    `title` VARCHAR(255) NOT NULL,
    `available_tickets` INTEGER NOT NULL,
    `total_participations` INTEGER NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `event_id` CHAR(36) NULL,
    `organizer_id` CHAR(36) NULL,
    `status` TEXT NULL DEFAULT 'active',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `reactivation_requests` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `request_message` TEXT NULL,
    `status` TEXT NULL DEFAULT 'pending',
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `reviewed_at` DATETIME(0) NULL,
    `reviewed_by` CHAR(36) NULL,
    `admin_notes` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `referral_program` (
    `id` CHAR(36) NOT NULL,
    `referrer_id` CHAR(36) NULL,
    `referred_id` CHAR(36) NULL,
    `bonus_coins` INTEGER NULL,
    `status` TEXT NULL DEFAULT 'pending',
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `completed_at` DATETIME(0) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `referral_rewards` (
    `id` INTEGER NOT NULL,
    `referrer_id` CHAR(36) NOT NULL,
    `referred_id` CHAR(36) NOT NULL,
    `referrer_reward` INTEGER NOT NULL,
    `referred_reward` INTEGER NOT NULL,
    `created_at` DATETIME(0) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `refund_appeals` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `event_id` CHAR(36) NULL,
    `original_refund_amount` DECIMAL(20, 4) NULL,
    `requested_amount` DECIMAL(20, 4) NULL,
    `reason` TEXT NULL,
    `status` TEXT NULL DEFAULT 'pending',
    `admin_notes` TEXT NULL,
    `reviewed_by` CHAR(36) NULL,
    `attachment_url` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `secretary_actions` (
    `id` CHAR(36) NOT NULL,
    `secretary_id` CHAR(36) NULL,
    `action_type` TEXT NOT NULL,
    `event_id` CHAR(36) NULL,
    `event_title` TEXT NULL,
    `participants_count` INTEGER NULL,
    `total_amount` INTEGER NULL,
    `reason` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `sponsors` (
    `id` CHAR(36) NOT NULL,
    `name` TEXT NOT NULL,
    `logo_url` TEXT NOT NULL,
    `website_url` TEXT NULL,
    `created_by` CHAR(36) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `description` TEXT NULL,
    `is_active` BOOLEAN NULL DEFAULT true,
    `display_order` INTEGER NULL,
    `category` TEXT NULL DEFAULT 'general',
    `show_in_footer` BOOLEAN NULL DEFAULT true,
    `level` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stand_bookings` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `stand_id` CHAR(36) NOT NULL,
    `vendor_id` CHAR(36) NOT NULL,
    `booking_number` VARCHAR(100) NOT NULL,
    `total_amount_fcfa` DECIMAL(10, 2) NULL,
    `total_amount_coins` INTEGER NULL,
    `booking_status` VARCHAR(50) NULL DEFAULT 'pending',
    `payment_status` VARCHAR(50) NULL DEFAULT 'pending',
    `booked_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `paid_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stand_events` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NULL,
    `base_currency` TEXT NULL DEFAULT 'XAF',
    `layout_image_url` TEXT NULL,
    `terms_conditions` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stand_rentals` (
    `id` CHAR(36) NOT NULL,
    `stand_event_id` CHAR(36) NULL,
    `user_id` CHAR(36) NULL,
    `stand_type_id` CHAR(36) NULL,
    `stand_number` TEXT NULL,
    `company_name` TEXT NULL,
    `contact_person` TEXT NULL,
    `contact_email` TEXT NULL,
    `contact_phone` TEXT NULL,
    `business_description` TEXT NULL,
    `rental_amount_pi` INTEGER NULL,
    `rental_amount_fcfa` DECIMAL(12, 2) NULL,
    `deposit_paid_pi` INTEGER NULL,
    `deposit_paid_fcfa` DECIMAL(12, 2) NULL,
    `rental_start_date` DATETIME(0) NULL,
    `rental_end_date` DATETIME(0) NULL,
    `status` TEXT NULL DEFAULT 'reserved',
    `reserved_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `confirmed_at` DATETIME(0) NULL,
    `cancelled_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `booking_code` TEXT NULL,
    `rental_type` TEXT NULL DEFAULT 'stand',
    `guest_name` TEXT NULL,
    `check_in_date` DATE NULL,
    `check_out_date` DATE NULL,
    `tent_size` TEXT NULL,
    `special_requests` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stand_reservations` (
    `id` CHAR(36) NOT NULL,
    `stand_id` CHAR(36) NULL,
    `user_id` CHAR(36) NULL,
    `company_name` TEXT NULL,
    `business_activity` TEXT NULL,
    `status` TEXT NULL DEFAULT 'pending',
    `reserved_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `payment_reference` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stand_types` (
    `id` CHAR(36) NOT NULL,
    `stand_event_id` CHAR(36) NULL,
    `event_id` CHAR(36) NULL,
    `name` TEXT NOT NULL,
    `description` TEXT NULL,
    `size` TEXT NULL,
    `amenities` LONGTEXT NULL,
    `base_currency` TEXT NULL DEFAULT 'XAF',
    `base_price` DECIMAL(12, 2) NOT NULL,
    `calculated_price_pi` INTEGER NULL,
    `quantity_available` INTEGER NOT NULL,
    `quantity_rented` INTEGER NULL,
    `is_active` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `rental_type` TEXT NULL DEFAULT 'stand',
    `capacity` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `stands` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NULL,
    `user_id` CHAR(36) NULL,
    `stand_number` TEXT NULL,
    `rental_amount_pi` INTEGER NULL,
    `rental_amount_fcfa` INTEGER NULL,
    `status` TEXT NULL DEFAULT 'available',
    `rented_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `is_available` BOOLEAN NULL DEFAULT true,
    `type` TEXT NULL,
    `price_fcfa` INTEGER NULL,
    `price_pi` INTEGER NULL,
    `reserved_by_company` TEXT NULL,
    `business_activity` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `support_tickets` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `subject` TEXT NOT NULL,
    `description` TEXT NOT NULL,
    `attachment_url` TEXT NULL,
    `status` TEXT NULL DEFAULT 'open',
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticket_commissions` (
    `id` CHAR(36) NOT NULL,
    `transaction_id` CHAR(36) NOT NULL,
    `transaction_type` VARCHAR(50) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `organizer_id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `total_amount_coins` INTEGER NOT NULL,
    `platform_commission` INTEGER NOT NULL,
    `organizer_earnings` INTEGER NOT NULL,
    `commission_rate` DECIMAL(5, 2) NULL,
    `status` VARCHAR(50) NULL DEFAULT 'completed',
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticket_designs` (
    `id` CHAR(36) NOT NULL,
    `ticket_type_id` CHAR(36) NULL,
    `name` VARCHAR(255) NOT NULL,
    `background_color` VARCHAR(7) NULL DEFAULT '#FFFFFF',
    `text_color` VARCHAR(7) NULL DEFAULT '#000000',
    `accent_color` VARCHAR(7) NULL DEFAULT '#3B82F6',
    `border_color` VARCHAR(7) NULL DEFAULT '#E5E7EB',
    `qr_color` VARCHAR(7) NULL DEFAULT '#000000',
    `header_image_url` TEXT NULL,
    `footer_text` TEXT NULL,
    `is_active` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticket_emails` (
    `id` CHAR(36) NOT NULL,
    `event_ticket_id` CHAR(36) NULL,
    `recipient_email` TEXT NOT NULL,
    `email_type` TEXT NOT NULL,
    `subject` TEXT NOT NULL,
    `content_html` TEXT NULL,
    `content_text` TEXT NULL,
    `attachments` LONGTEXT NULL,
    `sent_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `delivery_status` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticket_issues` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `ticket_id` CHAR(36) NOT NULL,
    `organizer_id` CHAR(36) NOT NULL,
    `issue_type` TEXT NOT NULL,
    `description` TEXT NULL,
    `status` TEXT NULL DEFAULT 'reported',
    `resolution` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `resolved_at` DATETIME(0) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticket_orders` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `event_id` CHAR(36) NULL,
    `order_number` VARCHAR(100) NOT NULL,
    `total_amount_fcfa` DECIMAL(10, 2) NULL,
    `total_amount_coins` INTEGER NULL,
    `ticket_count` INTEGER NOT NULL,
    `status` VARCHAR(50) NULL DEFAULT 'pending',
    `payment_method` VARCHAR(50) NULL,
    `payment_status` VARCHAR(50) NULL DEFAULT 'pending',
    `order_date` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `paid_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `whatsapp_number` TEXT NULL,
    `transaction_id` CHAR(36) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticket_purchases` (
    `id` CHAR(36) NOT NULL,
    `ticket_order_id` CHAR(36) NULL,
    `ticket_type_id` CHAR(36) NULL,
    `user_id` CHAR(36) NULL,
    `event_id` CHAR(36) NULL,
    `ticket_number` VARCHAR(100) NOT NULL,
    `qr_code_data` TEXT NULL,
    `price_fcfa` DECIMAL(10, 2) NULL,
    `price_coins` INTEGER NULL,
    `purchase_date` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `status` VARCHAR(50) NULL DEFAULT 'active',
    `used_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticket_scans` (
    `id` CHAR(36) NOT NULL,
    `ticket_purchase_id` CHAR(36) NULL,
    `event_id` CHAR(36) NULL,
    `scanner_user_id` CHAR(36) NULL,
    `scan_type` VARCHAR(50) NULL DEFAULT 'entry',
    `scan_location` VARCHAR(255) NULL,
    `scan_timestamp` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `scan_status` VARCHAR(50) NULL DEFAULT 'success',
    `notes` TEXT NULL,
    `device_info` TEXT NULL,
    `gps_coordinates` VARCHAR(100) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticket_scans_log` (
    `id` CHAR(36) NOT NULL,
    `ticket_id` CHAR(36) NULL,
    `event_id` CHAR(36) NULL,
    `scanned_by_user_id` CHAR(36) NULL,
    `scan_method` TEXT NULL,
    `scan_result` TEXT NULL,
    `scanned_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `device_info` LONGTEXT NULL DEFAULT '{}',
    `location_data` LONGTEXT NULL DEFAULT '{}',
    `notes` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticket_types` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NULL,
    `name` VARCHAR(255) NOT NULL,
    `description` TEXT NULL,
    `price` DECIMAL(10, 2) NOT NULL,
    `price_coins` INTEGER NULL,
    `quantity_available` INTEGER NOT NULL,
    `tickets_sold` INTEGER NULL,
    `sales_start` DATETIME(0) NULL,
    `sales_end` DATETIME(0) NULL,
    `is_active` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `quantity_sold` INTEGER NULL,
    `price_pi` INTEGER NOT NULL,
    `presale_price_pi` INTEGER NULL,
    `presale_price_fcfa` DECIMAL(20, 4) NULL,
    `color` TEXT NULL DEFAULT 'blue',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticket_verifications` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `ticket_id` CHAR(36) NOT NULL,
    `organizer_id` CHAR(36) NOT NULL,
    `scanner_id` CHAR(36) NULL,
    `verification_session_id` CHAR(36) NULL,
    `verification_time` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `verification_method` TEXT NULL,
    `verification_status` TEXT NULL,
    `scanned_data` LONGTEXT NULL,
    `location_latitude` DECIMAL(20, 4) NULL,
    `location_longitude` DECIMAL(20, 4) NULL,
    `notes` TEXT NULL,
    `action` TEXT NULL,
    `state` TEXT NULL,
    `exit_time` DATETIME(0) NULL,
    `exit_reason` TEXT NULL,
    `attendee_name` TEXT NULL,
    `attendee_email` TEXT NULL,
    `ticket_number` TEXT NULL,
    `previous_exit_id` CHAR(36) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticket_whatsapp_messages` (
    `id` CHAR(36) NOT NULL,
    `ticket_order_id` CHAR(36) NULL,
    `recipient_number` TEXT NOT NULL,
    `message_type` TEXT NOT NULL DEFAULT 'ticket_delivery',
    `content_params` LONGTEXT NULL,
    `status` TEXT NULL DEFAULT 'pending',
    `pdf_url` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `sent_at` DATETIME(0) NULL,
    `error_message` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `ticketing_events` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `total_tickets` INTEGER NOT NULL,
    `tickets_sold` INTEGER NULL,
    `max_tickets_per_user` INTEGER NULL,
    `early_bird_price_pi` INTEGER NULL,
    `early_bird_end_date` DATETIME(0) NULL,
    `vip_tickets_available` BOOLEAN NULL,
    `vip_ticket_price_pi` INTEGER NULL,
    `seating_plan_available` BOOLEAN NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `tickets` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NULL,
    `user_id` CHAR(36) NULL,
    `quantity` INTEGER NULL,
    `total_amount_pi` INTEGER NULL,
    `total_amount_fcfa` INTEGER NULL,
    `qr_code` TEXT NULL,
    `status` TEXT NULL DEFAULT 'active',
    `purchased_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `used_at` DATETIME(0) NULL,
    `ticket_type_id` CHAR(36) NULL,
    `purchase_price_pi` INTEGER NULL,
    `attendee_name` TEXT NULL,
    `check_in_time` DATETIME(0) NULL,
    `check_out_time` DATETIME(0) NULL,
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `ticket_number` TEXT NULL,
    `payment_method` TEXT NULL DEFAULT 'coins',
    `transaction_reference` TEXT NULL,
    `ticket_code_short` TEXT NULL,
    `reentry_count` INTEGER NULL,
    `last_reentry_time` DATETIME(0) NULL,
    `entry_count` INTEGER NULL,
    `phone` TEXT NULL,
    `email` TEXT NULL,
    `customer_name` TEXT NULL,
    `is_guest` BOOLEAN NULL,
    `ticket_date` DATE NULL,
    `valid_dates` LONGTEXT NULL,
    `is_multi_day` BOOLEAN NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `event_tickets` (
    `id` CHAR(36) NOT NULL,
    `order_id` TEXT NULL,
    `event_id` CHAR(36) NULL,
    `user_id` CHAR(36) NULL,
    `ticket_type_id` CHAR(36) NULL,
    `ticket_number` TEXT NULL,
    `qr_code` TEXT NULL,
    `status` TEXT NULL DEFAULT 'active',
    `purchase_amount_pi` INTEGER NULL,
    `purchase_amount_fcfa` INTEGER NULL,
    `purchase_price_pi` INTEGER NULL,
    `purchased_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `transaction_reference` TEXT NULL,
    `attendee_name` TEXT NULL,
    `email` TEXT NULL,
    `phone` TEXT NULL,
    `payment_method` TEXT NULL DEFAULT 'coins',
    `payment_status` TEXT NULL,
    `ticket_code` TEXT NULL,
    `ticket_code_short` TEXT NULL,
    `event_title` TEXT NULL,
    `event_start_at` DATETIME(0) NULL,
    `event_end_at` DATETIME(0) NULL,
    `location` TEXT NULL,
    `full_address` TEXT NULL,
    `address` TEXT NULL,
    `city` TEXT NULL,
    `country` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `transactions` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `event_id` CHAR(36) NULL,
    `transaction_type` TEXT NULL,
    `amount_pi` DECIMAL(20, 4) NOT NULL,
    `amount_fcfa` DECIMAL(20, 4) NOT NULL,
    `description` TEXT NULL,
    `status` TEXT NULL DEFAULT 'pending',
    `payment_gateway_data` LONGTEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `completed_at` DATETIME(0) NULL,
    `city` TEXT NULL,
    `region` TEXT NULL,
    `country` TEXT NULL,
    `metadata` LONGTEXT NULL,
    `amount_coins` INTEGER NULL,
    `escrow_status` TEXT NULL DEFAULT 'none',
    `release_stage` INTEGER NULL,
    `refund_reason` TEXT NULL,
    `deleted_at` DATETIME(0) NULL,
    `payment_method` TEXT NULL DEFAULT 'coins',
    `transaction_reference` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `trigger_debug_logs` (
    `id` INTEGER NOT NULL,
    `event_id` CHAR(36) NULL,
    `message` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `event_name` TEXT NULL,
    `payload` LONGTEXT NULL,
    `status` TEXT NULL,
    `error_message` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_balances` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `balance` DECIMAL(20, 4) NULL,
    `purchased_balance` DECIMAL(20, 4) NULL,
    `free_balance` DECIMAL(20, 4) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_coin_transactions` (
    `id` INTEGER NOT NULL,
    `user_id` CHAR(36) NULL,
    `transaction_id` VARCHAR(100) NOT NULL,
    `amount_fcfa` DECIMAL(10, 2) NOT NULL,
    `coin_amount` INTEGER NULL,
    `bonus_coins` INTEGER NULL,
    `total_coins` INTEGER NULL,
    `pack_id` INTEGER NULL,
    `license_pack_id` INTEGER NULL,
    `transaction_type` VARCHAR(20) NOT NULL,
    `status` VARCHAR(20) NULL DEFAULT 'pending',
    `conversion_rate` DECIMAL(10, 2) NULL,
    `user_email` VARCHAR(255) NULL,
    `moneyfusion_reference` VARCHAR(100) NULL,
    `payment_date` DATETIME(0) NULL,
    `verified_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NULL,
    `updated_at` DATETIME(0) NULL,
    `coin_balance` DECIMAL(20, 4) NULL,
    `free_coin_balance` DECIMAL(20, 4) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_contract_acceptances` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `event_id` CHAR(36) NULL,
    `contract_type` TEXT NOT NULL,
    `accepted_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `contract_version` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_earnings` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `earnings_type` TEXT NULL,
    `amount` INTEGER NOT NULL,
    `status` TEXT NULL DEFAULT 'pending',
    `description` TEXT NULL,
    `source_id` CHAR(36) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `withdrawn_at` DATETIME(0) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_interactions` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `event_id` CHAR(36) NULL,
    `interaction_type` TEXT NULL,
    `cost_paid` INTEGER NULL,
    `used_free_balance` BOOLEAN NULL,
    `organizer_earned` INTEGER NULL,
    `platform_commission` INTEGER NULL,
    `metadata` LONGTEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `comment_text` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_partner_licenses` (
    `id` INTEGER NOT NULL,
    `user_id` CHAR(36) NULL,
    `license_pack_id` INTEGER NULL,
    `transaction_id` VARCHAR(100) NULL,
    `purchase_date` DATETIME(0) NULL,
    `expiry_date` DATETIME(0) NULL,
    `status` VARCHAR(20) NULL DEFAULT 'active',
    `revenue_share_percent` INTEGER NULL,
    `created_at` DATETIME(0) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_profiles` (
    `id` CHAR(36) NOT NULL,
    `username` VARCHAR(100) NULL,
    `full_name` VARCHAR(255) NULL,
    `phone` VARCHAR(50) NULL,
    `city` VARCHAR(100) NULL,
    `country` VARCHAR(100) NULL DEFAULT 'C├┤te d''Ivoire',
    `coin_balance` DECIMAL(15, 2) NULL,
    `total_pi_earned` DECIMAL(15, 2) NULL,
    `total_pi_spent` DECIMAL(15, 2) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `available_earnings` INTEGER NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_push_tokens` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `fcm_token` TEXT NOT NULL,
    `device_type` TEXT NULL,
    `is_active` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_subscriptions` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `organizer_id` CHAR(36) NULL,
    `is_active` BOOLEAN NULL DEFAULT true,
    `subscribed_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `unsubscribe_at` DATETIME(0) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_video_views` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `video_id` CHAR(36) NULL,
    `watch_duration` INTEGER NOT NULL,
    `fully_watched` BOOLEAN NULL,
    `watch_started_at` DATETIME(0) NULL,
    `watch_completed_at` DATETIME(0) NULL,
    `reward_received` BOOLEAN NULL,
    `coins_awarded` INTEGER NULL,
    `reward_message` TEXT NULL,
    `device_info` LONGTEXT NULL,
    `app_version` TEXT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_video_watches` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `video_id` CHAR(36) NULL,
    `rewarded_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_votes` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NULL,
    `candidate_id` CHAR(36) NULL,
    `user_id` CHAR(36) NULL,
    `vote_count` INTEGER NOT NULL,
    `vote_cost_pi` INTEGER NOT NULL,
    `vote_cost_fcfa` INTEGER NOT NULL,
    `net_to_organizer` INTEGER NOT NULL,
    `fees` INTEGER NOT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `payment_method` TEXT NULL,
    `payment_status` TEXT NULL,
    `guest_id` TEXT NULL,
    `voter_name` TEXT NULL,
    `voter_phone` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `user_wallets` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `balance_pi` DECIMAL(15, 2) NULL,
    `balance_fcfa` DECIMAL(15, 2) NULL,
    `total_earned_pi` DECIMAL(15, 2) NULL,
    `total_spent_pi` DECIMAL(15, 2) NULL,
    `organizer_earnings_pi` DECIMAL(15, 2) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `commission_balance` DECIMAL(20, 4) NULL,
    `total_commission_earned` DECIMAL(20, 4) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `users` (
    `id` CHAR(36) NOT NULL,
    `email` VARCHAR(255) NULL,
    `full_name` VARCHAR(255) NULL,
    `phone` VARCHAR(50) NULL,
    `country` VARCHAR(100) NULL,
    `city` VARCHAR(100) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `user_type` TEXT NULL,
    `referral_code` TEXT NULL,
    `available_coins` INTEGER NULL,
    `total_coins_spent` DECIMAL(20, 4) NULL,
    `coin_balance` DECIMAL(20, 4) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `verification_sessions` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `organizer_id` CHAR(36) NOT NULL,
    `scanner_id` CHAR(36) NOT NULL,
    `session_start` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `session_end` DATETIME(0) NULL,
    `is_active` BOOLEAN NULL DEFAULT true,
    `tickets_verified` INTEGER NULL,
    `location` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `videos` (
    `id` CHAR(36) NOT NULL,
    `title` TEXT NOT NULL,
    `description` TEXT NULL,
    `video_url` TEXT NOT NULL,
    `thumbnail_url` TEXT NULL,
    `is_active` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `created_by` CHAR(36) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `vote_payments` (
    `id` CHAR(36) NOT NULL,
    `payment_id` CHAR(36) NULL,
    `user_id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NULL,
    `candidate_id` CHAR(36) NOT NULL,
    `vote_count` INTEGER NULL,
    `amount_pi` INTEGER NULL,
    `amount_fcfa` INTEGER NULL,
    `status` TEXT NULL DEFAULT 'pending',
    `transaction_id` TEXT NULL,
    `sms_reference` TEXT NULL,
    `proof_url` TEXT NULL,
    `organizer_id` CHAR(36) NULL,
    `validated_by` CHAR(36) NULL,
    `rejected_by` CHAR(36) NULL,
    `validated_at` DATETIME(0) NULL,
    `rejected_at` DATETIME(0) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `contest_id` CHAR(36) NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `votes` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NOT NULL,
    `candidate_id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `vote_count` INTEGER NOT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `voting_sessions` (
    `id` CHAR(36) NOT NULL,
    `event_id` CHAR(36) NOT NULL,
    `session_name` VARCHAR(255) NOT NULL,
    `session_type` VARCHAR(100) NULL DEFAULT 'public',
    `voting_start` DATETIME(0) NOT NULL,
    `voting_end` DATETIME(0) NOT NULL,
    `max_votes_per_user` INTEGER NULL,
    `allow_multiple_votes` BOOLEAN NULL,
    `is_active` BOOLEAN NULL,
    `results_public` BOOLEAN NULL DEFAULT true,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `webhook_errors` (
    `id` CHAR(36) NOT NULL,
    `error` TEXT NULL,
    `stack` TEXT NULL,
    `payload` TEXT NULL,
    `timestamp` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `source` TEXT NULL DEFAULT 'moneyfusion',

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `webhook_logs` (
    `id` CHAR(36) NOT NULL,
    `raw_payload` LONGTEXT NULL,
    `received_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `source` TEXT NULL DEFAULT 'moneyfusion',
    `transaction_id` TEXT NULL,
    `processed` BOOLEAN NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `welcome_popups` (
    `id` CHAR(36) NOT NULL,
    `image_url` TEXT NOT NULL,
    `alt_text` TEXT NULL,
    `is_active` BOOLEAN NULL DEFAULT true,
    `uploaded_by` CHAR(36) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `updated_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `withdrawal_requests` (
    `id` CHAR(36) NOT NULL,
    `user_id` CHAR(36) NULL,
    `request_type` TEXT NULL DEFAULT 'user_earnings',
    `amount_pi` INTEGER NOT NULL,
    `amount_fcfa` INTEGER NOT NULL,
    `bank_name` TEXT NULL,
    `account_number` TEXT NULL,
    `account_holder` TEXT NULL,
    `mobile_money_number` TEXT NULL,
    `mobile_money_operator` TEXT NULL,
    `status` TEXT NULL DEFAULT 'pending',
    `rejection_reason` TEXT NULL,
    `requested_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `processed_at` DATETIME(0) NULL,
    `processed_by` CHAR(36) NULL,
    `organizer_id` CHAR(36) NULL,
    `amount_coins` BIGINT NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),
    `withdrawal_method` TEXT NULL,
    `payment_details` LONGTEXT NULL,
    `community_verification_status` TEXT NULL DEFAULT 'pending',
    `reason_if_rejected` TEXT NULL,
    `admin_notes` TEXT NULL,

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `withdrawal_transactions` (
    `id` CHAR(36) NOT NULL,
    `request_id` CHAR(36) NULL,
    `user_id` CHAR(36) NULL,
    `amount` DECIMAL(20, 4) NULL,
    `balance_before` DECIMAL(20, 4) NULL,
    `balance_after` DECIMAL(20, 4) NULL,
    `deduction_status` TEXT NULL,
    `approval_timestamp` DATETIME(0) NULL,
    `processed_by` CHAR(36) NULL,
    `created_at` DATETIME(0) NULL DEFAULT CURRENT_TIMESTAMP(0),

    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

