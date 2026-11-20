-- Migration corrective : taux de commission des licences partenaires legacy.
--
-- Constat : en production, partner_licenses.commission_rate vaut 0 pour
-- Starter / Business / Premium, alors que le catalogue partner_license_packs
-- porte les taux contractuels (20 % / 30 % / 40 %). Le resolver de salaire
-- lit partners.license_id -> partner_licenses.commission_rate : avec 0 %, le
-- salaire vaut 0 et l'UI affichait à tort « aucune licence rattachée ».
--
-- Execution :
--   mysql -h HOTE -u UTILISATEUR -p NOM_BASE < migrations-prod/repair-partner-license-rates.sql
-- Ou coller ce SQL dans hPanel > phpMyAdmin > SQL.
--
-- Garde-fous : ne modifie QUE les licences dont le taux est vide ou nul.
-- Un taux deja renseigne (ex. negocie avec le super admin) n'est jamais
-- ecrase. Idempotent : relancer le script ne change plus rien.
--
-- APERCU optionnel :
-- SELECT pl.name, pl.slug, pl.commission_rate AS taux_actuel,
--        pp.name AS pack, pp.revenue_share_percent AS taux_catalogue
-- FROM partner_licenses pl
-- JOIN partner_license_packs pp
--   ON LOWER(REPLACE(pl.slug, 'licence-', '')) = LOWER(pp.licence_type)
--   OR LOWER(REPLACE(LOWER(pl.name), 'licence ', '')) = LOWER(pp.licence_type)
-- WHERE (pl.commission_rate IS NULL OR pl.commission_rate = 0)
--   AND pp.revenue_share_percent > 0;

UPDATE `partner_licenses` pl
JOIN `partner_license_packs` pp
  ON LOWER(REPLACE(pl.slug, 'licence-', '')) = LOWER(pp.licence_type)
  OR LOWER(REPLACE(LOWER(pl.name), 'licence ', '')) = LOWER(pp.licence_type)
SET pl.commission_rate = pp.revenue_share_percent
WHERE (pl.commission_rate IS NULL OR pl.commission_rate = 0)
  AND pp.revenue_share_percent > 0;
