-- Migration incrementale : affiche de couverture par type de stand.
--
-- A executer en PRODUCTION avant le deploiement (ou en inclusion dans la
-- procedure de deploiement). Idempotent si la colonne existe deja :
--
--   mysql -h HOTE -u UTILISATEUR -p NOM_BASE < migrations-prod/stand-types-cover-image.sql
--
-- Pourquoi : schema.prisma declare `stand_types.cover_image`, et le build
-- (`npm ci && npx prisma generate && npm run build`) regenere le client
-- Prisma mais n'applique aucun changement a la base. Sans cette colonne,
-- toute lecture de stand_types echoue en production.

ALTER TABLE `stand_types`
  ADD COLUMN `cover_image` TEXT NULL;
