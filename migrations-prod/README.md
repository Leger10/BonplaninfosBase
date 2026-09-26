# Migrations MySQL de PRODUCTION

Scripts SQL à appliquer manuellement sur la base MySQL de production (`DATABASE_URL` de la prod, serveur Express + Prisma qui sert `/api/*`).

## Pourquoi ces migrations

Le projet n'utilise plus Supabase. Toutes les données passent par le serveur Express + Prisma/MySQL :

```
Navigateur / Netlify Functions  ->  POST /api/query  ->  server/queryEngine.mjs  ->  Prisma  ->  MySQL
```

Le schéma de référence est `prisma/schema.prisma`. Chaque modèle Prisma doit correspondre à une table MySQL existante en prod, sinon `/api/query` échoue (`Unknown argument` / `Table ... doesn't exist`).

## `event-tickets.sql`

Crée la table `event_tickets` : le miroir des billets achetés, lu par l'onglet **Mes billets** et alimenté par l'achat de billets, le paiement USSD et le scan organisateur.

En local, la table existe déjà (créée par `npx prisma db push`). En prod, elle est absente : sans elle, l'achat échoue silencieusement (le miroir est en `try/catch`) et « Mes billets » affiche zéro billet.

### Méthode recommandée : Prisma (garantit la correspondance avec le schéma)

Sur la machine qui héberge la prod, avec le `.env` de prod (`DATABASE_URL` = base MySQL de prod) :

```bash
npm install
npx prisma db push
```

`db push` aligne toute la base sur `prisma/schema.prisma` : il crée `event_tickets` et signale les autres tables manquantes ou divergentes. Précisez `--accept-data-loss` uniquement après avoir lu ce qu'il annonce.

### Méthode alternative : SQL direct

Si vous n'avez pas Node sur le serveur MySQL, exécutez le script dans un client SQL (phpMyAdmin, MySQL Workbench, HeidiSQL, `mysql < event-tickets.sql`) :

```sql
SOURCE migrations-prod/event-tickets.sql;
```

Le script est idempotent (`CREATE TABLE IF NOT EXISTS`) : le rejouer ne fait rien et ne perd aucune donnée.

### Vérification après application

```sql
DESCRIBE event_tickets;
SELECT COUNT(*) FROM event_tickets;
```

Puis, sur l'API de prod :

```bash
curl -X POST https://<domaine-api>/api/query \
  -H "Content-Type: application/json" \
  -d '{"table":"event_tickets","method":"select","select":"id,status","limit":1}'
```

Une réponse JSON contenant `data` (tableau, éventuellement vide) confirme que la table est lisible. Une erreur `Unknown argument` ou `doesn't exist` signifie que la table n'a pas été créée sur la base utilisée par la prod.

## Ajouter une migration

Après modification de `prisma/schema.prisma`, régénérez le SQL sans jamais éditer le modèle à la main :

```bash
npx prisma migrate diff \
  --from-schema-datamodel <ancien-schema.prisma> \
  --to-schema-datamodel prisma/schema.prisma \
  --script
```

## Modèles sans clé primaire unique

`prisma/schema.prisma` contient des modèles (ex. `admin_balances`) dépourvus de clé primaire unique : Prisma ne peut pas les générer. Ce n'est pas bloquant tant que le code n'interroge pas ces tables via Prisma. Si `/api/query` échoue sur l'une d'elles,vez `server/queryEngine.mjs` pour le traitement des tables sans identifiant.
