-- Migration corrective : profils dont le pays a ete remplace par le defaut
-- SQL "Cote d'Ivoire" lors de l'inscription.
--
-- Pourquoi : /api/auth/signup creait le profil sans copier `country`, `city` et
-- `phone` depuis options.data. La colonne profiles.country ayant un defaut
-- "Cote d'Ivoire", un inscrit ayant choisi "Burkina Faso" se retrouvait avec
-- "Cote d'Ivoire" dans son profil. Le correctif applicatif (commit cb1a3a66)
-- empeche que cela se reproduise ; cette migration repare les comptes deja
-- crees.
--
-- Execution en production :
--   mysql -h HOTE -u UTILISATEUR -p NOM_BASE < migrations-prod/repair-profile-country.sql
-- Ou coller le SQL dans hPanel > phpMyAdmin > SQL.
--
-- Garde-fous :
--   - pays : modifie UNIQUEMENT les profils ou le pays est encore le defaut
--     (ou vide). Si l'utilisateur a deja change son pays, on ne l'ecrase pas ;
--   - ville / telephone : remplis uniquement s'ils sont vides cote profil ;
--   - ignore les metadonnees JSON invalides ;
--   - idempotent : relancer le script ne change plus rien.
--
-- APERCU (optionnel, avant l'UPDATE) :
-- SELECT p.id, p.email, p.country AS pays_actuel,
--        JSON_UNQUOTE(JSON_EXTRACT(u.raw_user_meta_data, '$.country')) AS pays_inscription,
--        p.city AS ville_actuelle,
--        JSON_UNQUOTE(JSON_EXTRACT(u.raw_user_meta_data, '$.city')) AS ville_inscription
-- FROM profiles p
-- JOIN auth_users u ON u.id = p.id
-- WHERE JSON_VALID(u.raw_user_meta_data)
--   AND (
--     (p.country IS NULL OR TRIM(p.country) = '' OR p.country IN (
--       'Côte d''Ivoire', 'Cote d''Ivoire', 'Côte d’Ivoire', 'Cote d’Ivoire'
--     ))
--     AND NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(u.raw_user_meta_data, '$.country'))), '') IS NOT NULL
--     AND JSON_UNQUOTE(JSON_EXTRACT(u.raw_user_meta_data, '$.country')) <> p.country
--   )
--   OR NULLIF(TRIM(COALESCE(p.city, '')), '') = ''
--      AND NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(u.raw_user_meta_data, '$.city'))), '') IS NOT NULL
--   OR NULLIF(TRIM(COALESCE(p.phone, '')), '') = ''
--      AND NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(u.raw_user_meta_data, '$.phone'))), '') IS NOT NULL;

UPDATE `profiles` p
JOIN `auth_users` u ON u.id = p.id
SET
  p.country = CASE
    WHEN JSON_VALID(u.raw_user_meta_data)
     AND (p.country IS NULL OR TRIM(p.country) = '' OR p.country IN (
            'Côte d''Ivoire', 'Cote d''Ivoire', 'Côte d’Ivoire', 'Cote d’Ivoire'
          ))
     AND NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(u.raw_user_meta_data, '$.country'))), '') IS NOT NULL
      THEN JSON_UNQUOTE(JSON_EXTRACT(u.raw_user_meta_data, '$.country'))
    ELSE p.country
  END,
  p.city = CASE
    WHEN JSON_VALID(u.raw_user_meta_data)
     AND NULLIF(TRIM(COALESCE(p.city, '')), '') IS NULL
     AND NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(u.raw_user_meta_data, '$.city'))), '') IS NOT NULL
      THEN JSON_UNQUOTE(JSON_EXTRACT(u.raw_user_meta_data, '$.city'))
    ELSE p.city
  END,
  p.phone = CASE
    WHEN JSON_VALID(u.raw_user_meta_data)
     AND NULLIF(TRIM(COALESCE(p.phone, '')), '') IS NULL
     AND NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(u.raw_user_meta_data, '$.phone'))), '') IS NOT NULL
      THEN JSON_UNQUOTE(JSON_EXTRACT(u.raw_user_meta_data, '$.phone'))
    ELSE p.phone
  END,
  p.updated_at = CURRENT_TIMESTAMP(0)
WHERE JSON_VALID(u.raw_user_meta_data)
  AND (
    (
      (p.country IS NULL OR TRIM(p.country) = '' OR p.country IN (
        'Côte d''Ivoire', 'Cote d''Ivoire', 'Côte d’Ivoire', 'Cote d’Ivoire'
      ))
      AND NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(u.raw_user_meta_data, '$.country'))), '') IS NOT NULL
      AND JSON_UNQUOTE(JSON_EXTRACT(u.raw_user_meta_data, '$.country')) <> p.country
    )
    OR (
      NULLIF(TRIM(COALESCE(p.city, '')), '') IS NULL
      AND NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(u.raw_user_meta_data, '$.city'))), '') IS NOT NULL
    )
    OR (
      NULLIF(TRIM(COALESCE(p.phone, '')), '') IS NULL
      AND NULLIF(TRIM(JSON_UNQUOTE(JSON_EXTRACT(u.raw_user_meta_data, '$.phone'))), '') IS NOT NULL
    )
  );
