# parfums_gamouz_back — API GAAMOUZE

API REST **Express + Prisma + PostgreSQL (Neon)** pour la boutique parfumerie GAAMOUZE.

- Préfixe : `/api/v1`
- Health : `/api/v1/health`
- Swagger : `/api/v1/docs`

Ce dépôt est **autonome** : déployable seul sur Railway (racine du repo = racine Node, sans sous-dossier).

## Démarrage local

```bash
cp .env.example .env
# DATABASE_URL, JWT_SECRET, ADMIN_INITIAL_PASSWORD, PUBLIC_API_URL

npm install
npx prisma generate
npm run prisma:deploy   # ou npm run migrate:neon-ws si Neon bloque le TCP local
npm run dev
```

## Scripts utiles

| Script | Usage |
|--------|--------|
| `npm run dev` | API avec nodemon |
| `npm start` | Production |
| `npm run test:db` | Test connexion Neon (WebSocket si besoin) |
| `npm run migrate:neon-ws` | Migrations via Neon WebSocket |
| `npm run admin:reset-password` | Réinitialiser le mot de passe admin |

## Documentation

Voir le dossier [`docs/`](docs/) (Neon, Railway, migrations, médias, admin).

## Frontend

La boutique React **n’est pas dans ce dépôt**. En local ou sur Vercel/Netlify, configurez :

```env
VITE_API_URL=https://votre-api.railway.app/api/v1
```

© GAAMOUZE
