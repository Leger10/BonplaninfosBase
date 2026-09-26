# Deploiement production sur Hostinger (VPS / Business avec SSH)

Le site est servi par **un seul processus Node** : `server/index.mjs` sert l'API
(`/api/*`), les fonctions qui emulent Netlify (`/.netlify/functions/*`), les
medias (`/media`, `/storage/...`) et le build statique Vite (`dist/`) avec
fallback SPA. Il n'y a donc pas besoin de Netlify.

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
  MoneyFusion (`process_moneyfusion_success`), coupons, codes promo, tirage de
  tombola (`conduct_raffle_draw`). Ces RPC repondent `NOT_IMPLEMENTED`.
- L'interface n'a pas encore de bouton USSD pour stand, tombola et evenement
  protege.
- `DATABASE_URL` dans le `.env` ne doit jamais etre committe ni partage.
