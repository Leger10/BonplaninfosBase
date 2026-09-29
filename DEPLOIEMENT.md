# Deploiement production sur Hostinger (VPS / Business avec SSH)

Le site est servi par **un seul processus Node** : `server/index.mjs` sert l'API
(`/api/*`), les fonctions qui emulent Netlify (`/.netlify/functions/*`), les
medias (`/media`, `/storage/...`) et le build statique Vite (`dist/`) avec
fallback SPA. Il n'y a donc pas besoin de Netlify.

Ce guide couvre les deux hebergeurs possibles qui reposent sur la meme
architecture : **Hostinger** (VPS / Business, § 0-9) et **Render** (§ 10).

## 0. Prerequis

- Offre Hostinger **VPS** ou **Business** (l'offre mutualisee classique n'a pas
  SSH ni deploiement Git automatique).
- Acces SSH actif, Node.js 20 installe (le projet demande Node 20.19.1, voir `.nvmrc`).
- Un nom de domaine pointe vers l'IP du VPS (A/AAAA dans hPanel > DNS).

## 1. Creer la base de donnees (hPanel)

1. hPanel > **Bases de donnees MySQL** > **Creer une base de donnees**.
2. Noter le prefixe genere par Hostinger (ex. `u123456789`), il sera prependu au
   nom de la base et de l'utilisateur.
3. Creer ensuite un **utilisateur MySQL** avec les memes prefixe et nom, lui
   donner **tous les droits** sur cette base, et **definir un mot de passe fort**.
4. Retenir l'hote de la base (ex. `srvXXX.mysql.hostinger.com`), le port `3306`,
   le nom d'utilisateur et le nom de la base. Ne jamais utiliser `root`.
5. L'utilisateur doit etre autorise a se connecter **depuis localhost** (par
   defaut sur hPanel), c'est ce que fait le processus Node.

## 2. Creer le schema de la base

Deux possibilites, choisir l'une des deux.

**Option A - `prisma db push` (simple, pas d'historique de migration)**
```bash
npx prisma db push --accept-data-loss
```

**Option B - SQL manuel (recommande en prod, tout est versionne)**

Importer `migrations-prod/full-schema.sql` (188 tables) via
hPanel > phpMyAdmin > **Importer**, puis `migrations-prod/event-tickets.sql`.
```bash
mysql -u <utilisateur> -p -h <hote> <base> < migrations-prod/full-schema.sql
mysql -u <utilisateur> -p -h <hote> <base> < migrations-prod/event-tickets.sql
```

## 3. Recuperer le code par Git

hPanel > **Advanced > Git** : connecter le depot GitHub
`https://github.com/Leger10/BonplaninfosBase.git`, branche `main`,
dossier `/home/uXXXXXXXX/domains/bonplaninfos.net/public_html`, puis **Pull**.

En SSH, equivalent :
```bash
cd /home/uXXXXXXXX/domains/bonplaninfos.net/public_html
git clone https://github.com/Leger10/BonplaninfosBase.git .
```

## 4. Installer et construire

```bash
npm ci
npx prisma generate
npm run build
```

`npm run build` genere `dist/`. Les variables `VITE_*` sont figees dans le build :
elles doivent etre presentes dans `.env` **avant** cette etape.

## 5. Configurer le `.env` de production

```bash
cp .env.example .env
nano .env
```

Renseigner au minimum `DATABASE_URL`, `JWT_SECRET`, `PORT`, `VITE_SITE_URL`,
`MEDIA_ROOT`. Le fichier `.env` est ignore par git, il ne sera jamais pousse.

> **Obligatoire : `INTERNAL_RPC_KEY`**
> `POST /api/rpc` et `POST /api/query` exigent une identité. Les requêtes
> navigateur portent le jeton de session (`Authorization: Bearer`), mais les
> **fonctions Netlify n'ont pas de session** : elles s'identifient avec cette
> clé partagée (en-tête `X-Internal-Key`). Sans elle, tout ce qui passe par une
> fonction est coupé : validation des paiements USSD, crédits du webhook
> MoneyFusion, vote gratuit, activation des billets.
>
> Générée avec :
> `node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"`
>
> Elle doit être présente **dans le `.env` du serveur Express et dans les
> variables d'environnement de la fonction** :
> `netlify env:set INTERNAL_RPC_KEY <valeur>`
>
> Si elle est absente d'un des deux côtés, l'appel est refusé en `401` — c'est
> voulu : mieux vaut une erreur visible qu'un stock faux.

### Qui a le droit d'appeler quoi

La clé interne est une confiance de service : elle contourne la politique de
rôles, par construction. Les permissions des appels navigateur sont, elles,
definies dans `server/rpcPolicy.mjs` et appliquees **avant** le dispatch :

| Catégorie | Restriction |
| --- | --- |
| Lectures `/api/query` (`select`, `head`) | aucune |
| Écritures `/api/query` | authentification obligatoire |
| RPC publics | `track_event_view`, `validate_promo_code_simple` |
| Administration des comptes | `admin` / `super_admin` |
| Argent, retraits, statistiques d'audit, annonces | `admin` / `super_admin` |
| Promouvoir un compte en `super_admin` | `super_admin` seulement |
| Achats, votes, gains, profil | le compte appelant, ou un rôle admin |

Le `user_id` transmis par le navigateur n'est jamais fiable : il est remplacé
par l'identifiant du jeton. Un utilisateur ne peut donc pas agir au nom d'un
autre, et ne peut pas s'auto-attribuer un rôle.

### Ecritures `/api/query` : liste blanche et refus par defaut

Avant la brique 3, toute ecriture `/api/query` arrivait dans Prisma : un
utilisateur pouvait se nommer `super_admin` ou ecrire `profiles.coin_balance`.
`server/queryPolicy.mjs` est applique **avant** le moteur de requete et repond
`403` des la reception, sans atteindre la base.

| Regle | Effet |
| --- | --- |
| Table absente de `OWNER_SCOPES` | refuse aux comptes ordinaires |
| Perimetre `id` (son compte) | le `id` du client est remplace par celui du jeton |
| Perimetre colonne (`user_id`, `organizer_id`, ...) | la colonne est forcee a l'identifiant du jeton |
| Perimetre evenement | les lignes visees doivent appartenir a un evenement de l'appelant |
| Colonnes protegees (`user_type`, `coin_balance`, `wallet_pin`, `is_verified`, ...) | refusees aux comptes ordinaires |
| `admin` / `secretary` | acces conserve, sauf nomination d'un `super_admin`, ecriture sur son propre role et `appointed_by` |
| `super_admin` | acces conserve pour les tables d'exploitation |
| Cle interne | contournement conserve (fonctions Netlify, jobs) |

Les tables d'ecriture declarees par le front (53) sont toutes classees :
inconnue = refusee. Une nouvelle table ajoutee au front apparaitra donc refusee
jusqu'a son inscription dans `OWNER_SCOPES` : c'est le comportement voulu, mais
il faut le savoir avant d'ajouter un parcours d'ecriture.

LesNotifications, `user_interactions`, `contract_submissions`, `support_tickets`,
`events` et les tables de billetterie restent accessibles a leur proprietaire.
`partners`, les remboursements et les tables d'exploitation financiere sont
refuses aux comptes ordinaires : ces flux passent par un RPC metier ou par un
role admin.

### Depense de pieces

`CoinService.debitCoins` n'ecrit plus la base depuis le navigateur. Il appelle le
RPC serveur `spend_user_coins`, qui :

- refuse un montant negatif ou nul, un motif vide, un solde insuffisant ;
- compare puis echange `coin_balance` **et** `bonus_coins` en une seule ecriture
  conditionnelle, donc deux depenses simultanees ne peuvent pas expendre le
  solde ;
- journalise la depense dans `transactions` avec la reference de l'action.

L'ancien RPC admin `debit_user_coins` reste reserve aux administrateurs et
renvoie maintenant une erreur explicite au lieu de `{ success: false }`, que le
front interpretait comme une reussite et laissait l'action gratuite.

Point connu : `spend_user_coins` debite et journalise en deux ecritures. Si le
journal echoue apres le debit, le solde est baisse sans trace. A traiter avec les
RPC metiers atomiques (promotion, boost, votes), qui doivent reunir
`: debit + creation de l'action + journal` dans une seule transaction Prisma.

Verifier la brique 3 :

```bash
node scripts/test-autorisations.mjs   # matrice RPC
node scripts/test-spend-coins.mjs     # depense, concurrence, autorisations
node scripts/test-auth-admin.mjs      # routes d'administration des comptes
node scripts/test-query-policy.mjs    # ecritures /api/query
```

Les quatre scripts creent des comptes jetables, verifient la matrice puis
suppriment tout. Ils demandent une base locale : **ne jamais les lancer en
production.**

### Scanné billets et agents terrain (brique 4)

Un organisateur peut déléguer des comptes « agents de terrain » qui scannent
(entrée/sortie) **tous** ses événements. La délégation est stockée dans une
table dédiée, un agent pouvant être délégué par plusieurs organisateurs.

| Table / donnée | Rôle |
| --- | --- |
| `organizer_scan_agents` (`organizer_id`, `user_id`, `granted_by`, `is_active`) | qui peut scanner les événements de qui |
| `ticket_verifications` | journal des scans : `event_id`, `ticket_id`, `organizer_id`, `scanner_id`, `verification_method`, `verification_status`, `action` |

Créer la table en production (une seule fois) :

```bash
node scripts/create-table-scan-agents.mjs
```

Règles appliquées dans `server/rpcPolicy.mjs`, avant le handler :

- `verify_ticket_direct` : organisateur du billet **ou** agent délégué actif.
- `reset_ticket` : organisateur **seulement** (un agent ne réinitialise pas).
- billet sans événement : refus ferme, on ne devine pas l'organisateur.
- la clé interne contourne (service), mais aucun handler agent n'est visé par
  une fonction Netlify : elle reçoit `NO_ORGANIZER`.

Le journal de scan a été réparé : il visait `ticket_scans` avec des colonnes
(`ticket_id`, `scanned_at`, `verification_method`) qui n'existent pas dans cette
table, et l'erreur était avalée par `.catch()` — **aucun scan n'était enregistré
et `scanner_user_id` restait toujours vide.** Le journal passe par
`ticket_verifications`, qui porte enfin l'identité de l'agent et de
l'organisateur. `get_verification_stats` compte désormais sur cette table, le
« total scanné » affiché aux organisateurs n'était jamais monté au-dessus de 0.

Tester la brique 4 :

```bash
node scripts/test-scan-tickets.mjs   # 39 assertions, comptes/événements jetables
```

## 6. Transferer les medias

Les images vivent dans `storage/public/`, **ignore par git** (250 Mo, 740
fichiers). Elles doivent etre transferees une seule fois, puis le dossier doit
etre hors du projet pour survivre aux redeloiements :
```bash
mkdir -p /home/uXXXXXXXX/medias
rsync -avz --progress storage/public/ user@srv:/home/uXXXXXXXX/medias/
chmod -R 755 /home/uXXXXXXXX/medias
```
et dans `.env` : `MEDIA_ROOT=/home/uXXXXXXXX/medias`.

## 7. Demarrer le service

```bash
mkdir -p logs
pm2 start ecosystem.config.cjs
pm2 save
pm2 startup      # execute la commande affichee pour survivre a un redemarrage
pm2 logs bonplaninfos
```

## 8. Relier le domaine (reverse proxy Nginx)

Dans hPanel > **Sites > Domains > Reverse Proxy**, ajouter :
- domaine `bonplaninfos.net` (+ `www`)
- cible `http://127.0.0.1:3000`

Puis forcer HTTPS (Let's Encrypt) dans **SSL**.

## 9. Verifications

```bash
curl -s https://bonplaninfos.net/api/db/health
curl -sI https://bonplaninfos.net/media/<un-fichier-existant>   # doit répondre 200
pm2 logs bonplaninfos --lines 50
```

Puis test manuel : page d'accueil, images des lieux (/discover), une demande de
retrait, un paiement pieces.

## Pieges connus avant la mise en ligne

- Le build doit etre refait apres chaque modification de `.env` (variables `VITE_*` figees).
- `/.netlify/functions/*` n'est servi que par le processus Node : ne pas derouter
  ces URL vers Apache/Nginx.
- Non fonctionne en prod tant que ce n'est pas corrige : paiement par carte
  MoneyFusion (`process_moneyfusion_success`), coupons, codes promo. Ces RPC
  repondent `NOT_IMPLEMENTED`.
- Les boutons USSD (stand, tombola, evenement protege) et le tirage de tombola
  (`conduct_raffle_draw`) côte serveur sont implementés.
- `DATABASE_URL` dans le `.env` ne doit jamais etre committe ni partage.

---

# Deploiement alternatif : Render

Render est un PaaS : pas de SSH, pas de reverse proxy a gerer — le service est
durectement accessible en HTTPS. Les deux contraintes a connaitre :

1. **Render n'heberge pas MySQL.** `DATABASE_URL` doit pointer vers un MySQL
   externe (base MySQL Hostinger, Aiven, PlanetScale-equivalent…).
2. **Filesystem ephemere.** Tout fichier ecrit dans le conteneur disparait au
   prochain deploiement. Les images doivent vivre sur un **disque persistant**.

Le depot contient deja `render.yaml` (Blueprint). Deux facons de deployer :

## 10.1 Blueprint (recommande)

hPanel / dashboard ne sert a rien ici : tout se passe dans le dashboard Render.

1. Push du depot : `git push origin main`.
2. dashboard Render > **New** > **Blueprint** > connecter
   `https://github.com/Leger10/BonplaninfosBase.git` (branche `main`).
3. Render lit `render.yaml`, cree le service web `bonplaninfos` + un disque
   persistant monte sur `/var/data` (`MEDIA_ROOT=/var/data/media`).
4. Renseigner les variables `sync: false` dans le service (onglet **Environment**) :
   `DATABASE_URL`, `VITE_SITE_URL`, `DEPLOY_URL`, `LOGIN_URL`,
   `VITE_SUPABASE_URL` (URL publique du service, figee dans le build),
   `VITE_VAPID_PUBLIC_KEY`, `VITE_VAPID_PRIVATE_KEY`,
   `VITE_SUPABASE_SERVICE_ROLE_KEY`.
   `JWT_SECRET` et `INTERNAL_RPC_KEY` sont generes automatiquement
   (regenerables depuis l'onglet Environment si besoin).
5. **Deploy** : build = `npm ci && npx prisma generate && npm run build`,
   start = `node server/index.mjs`, health check = `/api/db/health`.
6. Transferer une fois les medias existants sur le disque (S3/upload) ou les
   re-uploader via l'interface ; desormais ils survivent aux redeloiements.
7. Tester : `curl -I https://<service>.onrender.com/api/db/health` → 200.

## 10.2 Service Web manuel (equivalent)

Build   : `npm ci && npx prisma generate && npm run build`
Start   : `node server/index.mjs`
Disque  : onglet **Disks** > `bonplaninfos-media` monte sur `/var/data`
Vars    : identiques a la liste ci-dessus (`PORT` est injecte par Render).

## Rappels communs aux deux plates-formes

- `INTERNAL_RPC_KEY` doit exister une seule fois (le processus sert aussi les
  fonctions emulees : meme environnement). Sans elle, la validation USSD et
  l'ajustement du stock sont refuses.
- Les variables `VITE_*` sont compilees dans `dist/` : changer l'URL du service
  (ou de domaine) impose un nouveau deploy.
- Les suites de tests contenues dans `scripts/*` creent des donnees jetables
  en base locale : **ne pas les lancer contre la base de production.**
- Apres chaque deploiement, lancer le diagnostic (lecture seule) :
  `node scripts/deploy-check.mjs https://<votre-domaine> --key <INTERNAL_RPC_KEY>`.
  Il verifie health, build Vite servi, fonctions emulees, refus de lecture
  sensible (RIB 403) et cle interne (200).
