# Migrations Prisma — GAAMOUZE

## Principes

- Ne **jamais** exécuter `prisma migrate reset` sur une base Neon partagée ou production sans sauvegarde.
- Toujours inspecter le SQL généré avant `migrate deploy` sur un environnement distant.
- Les migrations sont versionnées sous `prisma/migrations/`.

## Première installation (base vide)

```bash
cd backend
cp .env.example .env
# Renseigner DATABASE_URL (Neon, sslmode=require)

npm install
npx prisma generate
npx prisma migrate deploy
npm run prisma:seed   # optionnel — données démo + catégories
```

## Développement local

```bash
npx prisma migrate dev --name describe_change
```

## Production (Railway)

Configurer `DATABASE_URL` dans Railway, puis au déploiement :

```bash
npm run prisma:deploy
```

Le seed **n’est pas** lancé automatiquement en production.

## Base déjà existante

Si des tables ont été créées via `db push` :

1. `npx prisma db pull` pour comparer l’état réel.
2. `npx prisma migrate diff` entre la base et `schema.prisma` pour produire une migration additive.
3. Appliquer avec `migrate deploy` après revue.
