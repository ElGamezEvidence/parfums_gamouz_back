# Phase 1 — Audit GAAMOUZE (octobre 2026)

## Structure du dépôt

| Zone | État | Notes |
|------|------|--------|
| `frontend/` | React 18 + Vite 6 + Tailwind + react-i18next | Boutique publique + back-office `/admin/*` |
| racine du d�p�t | Express 4 + Prisma 6 + Zod + JWT cookies | API `/api/v1` |
| `docs/` | Guides Neon, Railway, provisioning admin | À compléter (Swagger, migrations) |
| Racine | `package.json` monorepo (scripts `dev:frontend`, `dev:backend`) | README racine à aligner sur GAAMOUZE |

## Frontend existant (à conserver)

- **Pages publiques** : Accueil, Shop, fiche produit, panier, checkout, contact, wishlist, à propos.
- **Multilingue** : FR / EN / AR avec `dir` RTL pour l’arabe.
- **WhatsApp** : +212 671-545193, bouton flottant et messages produit.
- **Contextes** : panier, wishlist, toasts, auth client/admin.
- **Services** : couche API (`api.js`, `productService`, `orderService`, `adminService`, `authService`).

### Écart API ↔ UI

L’API renvoie des noms localisés en **chaîne** ; les composants attendent `{ fr, en, ar }`.  
**Correctif** : `frontend/src/utils/productNormalizer.js` + intégration dans `productService`.

### Données mock

`frontend/src/data/products.js` sert de **fallback** si l’API est indisponible ou le catalogue vide côté réseau — pas de fausses commandes serveur (checkout corrigé).

## Backend existant

- **Schéma Prisma** : User, produits traduits, variantes, stock, commandes, coupons, avis, CMS, audit, etc.
- **Sécurité** : Helmet, CORS, rate limit, bcrypt, JWT HttpOnly, rôles staff, `mustChangePassword`.
- **Routes admin** protégées : dashboard, produits, catégories, commandes, inventaire, coupons, avis, contenu, clients, users, audit.
- **Manques identifiés** (phases suivantes) :
  - Modèles `CustomerAddress`, `Promotion` (distinct de `Coupon`), `StockReservation` — à ajouter sans migration destructive.
  - CRUD admin collections / promotions / analytics dédiés.
  - Upload médias (Cloudinary/S3) — non configuré par défaut.
  - Envoi email réel (reset password) — jetons en base, envoi conditionnel à la config.
  - Tests frontend / Playwright responsive.
  - Pages admin `/admin/collections`, `/admin/promotions`, `/admin/analytics` (routes UI).

## Base de données Neon

- Connexion via `DATABASE_URL` (SSL `sslmode=require`).
- **Migration initiale versionnée** : `prisma/migrations/0_init/migration.sql` + `migration_lock.toml`.
- **Ne jamais** `migrate reset` sur une base production existante sans analyse.
- **Seed idempotent** : `npm run prisma:seed` (catégories + produits démo + admin si `ADMIN_INITIAL_PASSWORD` défini).
- **Provision au démarrage** : `src/services/provisionAdmin.js` (ne réinitialise jamais un admin existant).

## Actions requises de votre part

1. Créer `.env` depuis `.env.example` avec votre `DATABASE_URL` Neon.
2. Définir `JWT_SECRET` (≥ 32 caractères) et `ADMIN_INITIAL_PASSWORD` pour le premier SUPER_ADMIN.
3. Appliquer les migrations : `cd backend && npx prisma migrate deploy` (ou `migrate dev` en local).
4. Optionnel : `npm run prisma:seed` pour données de démonstration.
5. Créer `frontend/.env` avec `VITE_API_URL=http://localhost:3000/api/v1`.

## Phases d’implémentation (suite)

| Phase | Focus | Statut |
|-------|--------|--------|
| 1 | Audit + architecture | En cours (ce document) |
| 2 | Migrations + health + docs API | Migration initiale + Swagger `/api/v1/docs` |
| 3 | Auth admin + provisionnement | Provision idempotent + secrets sans valeur par défaut en prod |
| 4 | CRUD produits / stock | Backend largement en place ; affiner médias & variantes |
| 5 | Frontend branché API | Normalizer produits ; collections API |
| 6 | Commandes / checkout | Backend orders ; frontend sans faux numéros de commande |
| 7–10 | CMS, analytics, tests, déploiement | À enchaîner |

## Validation responsive (§33)

Breakpoints et menu admin mobile : amorcés dans `AdminLayout`.  
Tests manuels / Playwright sur les résolutions listées dans le cahier des charges restent à automatiser.
