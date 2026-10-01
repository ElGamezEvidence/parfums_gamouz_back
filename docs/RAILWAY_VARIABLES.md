# Variables Railway — GAAMOUZE (sans secrets dans le code)

> **Ne mettez jamais `DATABASE_URL` dans un fichier JavaScript, React ou Git.**  
> Railway injecte les secrets au **runtime** via l’onglet **Variables** du service backend.

## Service backend (Root Directory : `backend`)

| Variable | Obligatoire | Où la mettre |
|----------|-------------|--------------|
| `DATABASE_URL` | Oui | **Railway → Variables** (coller l’URL Neon, pooler OK) |
| `NODE_ENV` | Oui | `production` |
| `JWT_SECRET` | Oui | Chaîne aléatoire ≥ 32 caractères |
| `FRONTEND_URL` | Oui | URL publique de la boutique (ex. Vercel) |
| `CORS_ORIGIN` | Oui | Même URL que le frontend (+ domaines admin si séparés) |
| `ADMIN_EMAIL` | Oui | `abdelaligamouz@1448` |
| `ADMIN_INITIAL_PASSWORD` | Recommandé | Uniquement au 1er déploiement, puis retirer |

`PORT` est en général **fourni par Railway** — ne pas le fixer en dur.

### Exemple (valeurs fictives)

```env
NODE_ENV=production
DATABASE_URL=postgresql://USER:PASS@ep-xxx-pooler.region.aws.neon.tech/neondb?sslmode=require
JWT_SECRET=remplacer_par_une_longue_cle_aleatoire_32_caracteres_minimum
FRONTEND_URL=https://votre-boutique.vercel.app
CORS_ORIGIN=https://votre-boutique.vercel.app
ADMIN_EMAIL=abdelaligamouz@1448
```

## Frontend (Vercel / Netlify / autre)

**Aucun `DATABASE_URL`.** Seulement :

| Variable | Exemple |
|----------|---------|
| `VITE_API_URL` | `https://votre-api.up.railway.app/api/v1` |

Voir `frontend/.env.production.example`.

## Après le 1er déploiement backend

1. Ouvrir `https://VOTRE-API.up.railway.app/api/v1/health`
2. Si la base est vide : une fois `npx prisma migrate deploy` (Railway shell) ou migrations déjà appliquées depuis Neon
3. Configurer `VITE_API_URL` sur le frontend avec l’URL Railway + `/api/v1`
4. Mettre à jour `FRONTEND_URL` et `CORS_ORIGIN` sur Railway avec l’URL réelle du frontend
