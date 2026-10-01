# Import d'images produit (admin)

## Fonctionnement

- **Admin** → Produit → section **4. Galerie Visuelle & Photos** → **Importer des fichiers**
- API : `POST /api/v1/admin/media/upload` (1 fichier) ou `upload-many` (jusqu'à 10)
- Stockage local : `uploads/products/` servi via `https://VOTRE-API/uploads/products/...`

Formats : JPEG, PNG, WebP, GIF — **5 Mo max** par fichier.

## Configuration

Dans `.env` (local) ou Railway :

```env
PUBLIC_API_URL=http://localhost:3000
```

En production Railway, définir `PUBLIC_API_URL` sur l'URL publique du service (sans `/api/v1`).

## Railway / production

Le disque Railway est **éphémère** : les fichiers peuvent disparaître au redéploiement.  
Pour la production durable, configurez **Cloudinary** ou S3 (variables dans `.env.example`) — à brancher ultérieurement.
