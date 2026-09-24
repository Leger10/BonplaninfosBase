# BonplaninfosBase

Application BonPlan Infos — front + serveur local (Express + Prisma, MySQL) émulant Supabase.

## Démarrage local

- `npm install` puis `npx prisma generate`
- Configurer `.env` (voir `.env` existant localement)
- `npm run build` pour générer `dist/`, puis `npm start` (serveur sur le port `8888`, sert l'API + le build)
- Dev : `npm run dev` (Vite, proxy vers :8888)

## Structure

- `server/` : serveur Express (query, auth, storage, rpc)
- `src/lib/localSupabaseClient.js` : client local compatible supabase-js
- `netlify/functions/_lib/` : client local pour les fonctions Netlify
- `prisma/schema.prisma` : schéma MySQL
- `db/` : dumps SQL locaux (ignorés par git)
- `storage/public/` : médias locaux (ignorés par git)