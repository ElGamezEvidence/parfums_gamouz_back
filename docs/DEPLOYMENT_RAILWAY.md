# Guide de Déploiement Railway — GAAMOUZE REST API

Ce guide détaille la mise en production du backend GAAMOUZE sur la plateforme Railway en synergie avec la base de données PostgreSQL hébergée sur Neon.

---

## 1. Prérequis

- Un compte sur [Railway.app](https://railway.app)
- Une instance PostgreSQL configurée sur [Neon.tech](https://neon.tech)
- L'URL de production du frontend (ex: Vercel, Netlify ou domaine personnalisé)

---

## 2. Configuration du Projet Railway

1. Connectez-vous sur votre dashboard Railway et cliquez sur **New Project** > **Deploy from GitHub repo**.
2. Sélectionnez le dépôt **`parfums_gamouz_back`** (racine = ce projet API, pas de sous-dossier).
3. **Root Directory** : laissez vide (`.`).
4. Dans l'onglet **Settings** (ou `railway.json`) :
   - **Build Command** : `npm ci && npx prisma generate`
   - **Start Command** : `node src/server.js`
   - **Healthcheck Path** : `/api/v1/health`
   - **Healthcheck Timeout** : `100`

---

## 3. Variables d'Environnement Railway

Dans l'onglet **Variables** de votre service backend sur Railway, renseignez :

| Variable | Description | Exemple |
| :--- | :--- | :--- |
| `NODE_ENV` | Environnement d'exécution | `production` |
| `PORT` | Port d'écoute du serveur | Géré automatiquement par Railway (défaut `3000`) |
| `DATABASE_URL` | Chaîne de connexion Neon avec SSL | `postgresql://USER:PASS@HOST/neondb?sslmode=require` |
| `FRONTEND_URL` | URL de la boutique en ligne | `https://gaamouze.com` |
| `CORS_ORIGIN` | Origine(s) autorisées pour CORS | `https://gaamouze.com,https://admin.gaamouze.com` |
| `JWT_SECRET` | Clé secrète robuste (min. 32 caractères) | Générez une clé avec `openssl rand -hex 32` |
| `JWT_EXPIRES_IN` | Durée de vie des tokens | `7d` |
| `ADMIN_EMAIL` | Identifiant administrateur initial | `abdelaligamouz@1448` |
| `ADMIN_INITIAL_PASSWORD` | Mot de passe initial sécurisé | Définissez votre mot de passe temporaire |

---

## 4. Initialisation des Migrations Prisma en Production

Lors du premier déploiement, appliquez les migrations versionnées Prisma sans perdre de données :

```bash
# Depuis la console Railway CLI ou le terminal Railway :
npx prisma migrate deploy
```

Puis exécutez le script de provisionnement idempotent :

```bash
npm run prisma:seed
```

Ce script créera le compte administrateur `abdelaligamouz@1448`, les catégories (Homme, Femme, Unisexe), les paramètres de livraison au Maroc et le catalogue de haute parfumerie.

---

## 5. Lier le frontend (URL publique)

Le **`DATABASE_URL` ne va jamais dans le frontend** ni dans le dépôt Git.

1. Déployez le backend Railway et notez l’URL publique, par ex. `https://gaamouze-api.up.railway.app`.
2. Sur **Vercel / Netlify** (dossier `frontend`), définissez :
   ```env
   VITE_API_URL=https://gaamouze-api.up.railway.app/api/v1
   ```
3. Sur **Railway (backend)**, mettez à jour :
   ```env
   FRONTEND_URL=https://votre-boutique.vercel.app
   CORS_ORIGIN=https://votre-boutique.vercel.app
   ```
4. Rebuild / redeploy frontend et backend après changement CORS.

Liste complète : [RAILWAY_VARIABLES.md](./RAILWAY_VARIABLES.md).

---

## 6. Vérification du Déploiement

Accédez à l'URL fournie par Railway :
- `https://votre-backend.up.railway.app/api/v1/health`
- Réponse attendue :
  ```json
  {
    "status": "HEALTHY",
    "environment": "production",
    "database": {
      "status": "CONNECTED",
      "latencyMs": 45,
      "provider": "Neon PostgreSQL"
    }
  }
  ```
