# Guide de Connexion & Gestion Neon PostgreSQL — GAAMOUZE

Ce document récapitule la gestion de la base de données relationnelle Neon PostgreSQL, les exigences SSL, les optimisations de pooling et les migrations Prisma versionnées.

---

## 1. Chaîne de Connexion Sécurisée

Neon exige une connexion sécurisée par TLS/SSL. Votre chaîne de connexion doit obligatoirement inclure le paramètre `sslmode=require` :

```text
DATABASE_URL="postgresql://[USER]:[PASSWORD]@[HOST]/[DATABASE]?sslmode=require"
```

### Exemple de configuration :
```text
DATABASE_URL="postgresql://alex:Abc123xyz@ep-fragrant-pond-987654.eu-central-1.aws.neon.tech/gaamouze?sslmode=require"
```

> [!WARNING]
> Ne committez **jamais** votre variable `DATABASE_URL` dans Git. Elle doit uniquement être consignée dans le fichier local `.env` (qui est exclu par `.gitignore`) ou dans les variables d'environnement de Railway.

---

## 2. Neon Connection Pooling

Neon propose deux types d'adresses d'hôtes :
1. **Direct Connection** (`ep-xyz.region.neon.tech`) :
   Recommandé pour les commandes de migration Prisma (`prisma migrate dev`, `prisma migrate deploy`).
2. **Pooled Connection** (`ep-xyz-pooler.region.neon.tech`) :
   Idéal pour l'exécution d'applications web avec fort trafic concurrent afin d'optimiser le nombre de connexions ouvertes.

Si vous utilisez le mode pooler Neon avec Prisma, ajoutez le flag `?pgbouncer=true` à la fin de votre chaîne :
```text
DATABASE_URL="postgresql://USER:PASSWORD@HOST-pooler.neon.tech/gaamouze?sslmode=require&pgbouncer=true"
```

---

## 3. Gestion des Migrations Prisma Sans Perte de Données

Les données des commandes et des clients doivent être préservées en permanence. Ne lancez jamais de commande destructive telle que `prisma migrate reset` sur une base existante.

### En environnement de développement :
```bash
cd backend
npx prisma migrate dev --name <nom_de_la_modification>
```

### En environnement de production (Railway ou Neon) :
```bash
cd backend
npx prisma migrate deploy
```

La commande `migrate deploy` applique strictement les migrations en attente sans demander de confirmation interactive et sans réinitialiser la base.

### Erreur P1001 (« Can't reach database server »)

1. Réveiller le projet dans le dashboard Neon (bases free tier peuvent être suspendues).
2. Utiliser l’hôte **direct** (sans `-pooler`) pour `migrate deploy`.
3. Vérifier pare-feu, antivirus ou VPN bloquant le port **5432** sortant.
4. Tester depuis PowerShell : `Test-NetConnection HOST -Port 5432` — `TcpTestSucceeded` doit être `True`.
5. Si le port répond mais Prisma échoue encore : réveillez la base via **SQL Editor** Neon (`SELECT 1`), ajoutez `&connect_timeout=60` à l’URL, autorisez **Node.js** dans le pare-feu Windows, puis `node scripts/test-db-connection.js`.
6. Copiez une **nouvelle** connection string depuis Neon (mot de passe régénéré si l’ancienne a fuité).

### Port 5432 bloqué mais Neon accessible (Windows / FAI)

Si `npm run test:db:http` réussit mais `npx prisma migrate deploy` renvoie **P1001**, le trafic PostgreSQL direct est filtré alors que Neon répond en HTTPS.

1. Appliquer le schéma : `npm run migrate:neon-ws` (WebSocket, port 443).
2. L’API utilise automatiquement le **driver Neon WebSocket** pour les hôtes `*.neon.tech` (`src/config/db.js`).
3. Vérifier : `npm run test:db` puis `npm run prisma:seed`.

Sur Railway ou un serveur où le port 5432 est ouvert, `npx prisma migrate deploy` reste la méthode standard.

---

## 4. Sauvegardes & Restauration (Neon Point-in-Time Recovery)

Neon intègre une fonctionnalité native de **Point-in-Time Recovery (PITR)** permettant de restaurer l'état de la base de données à la seconde près.
Pour exporter une sauvegarde ponctuelle manuelle :

```bash
pg_dump "postgresql://USER:PASS@HOST/gaamouze?sslmode=require" -F c -b -v -f gaamouze_backup.dump
```
