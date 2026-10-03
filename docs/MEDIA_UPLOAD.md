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

## Affichage depuis Netlify

L’API envoie `Cross-Origin-Resource-Policy: cross-origin` sur les réponses (Helmet) pour que les balises `<img>` de la boutique et de l’admin puissent charger `https://VOTRE-API/uploads/...`.

## Railway / production (persistance des fichiers)

Le disque Railway est **éphémère** : après un redeploy, les URLs  
`https://….railway.app/uploads/products/…` renvoient **404** (images cassées).

### Solution recommandée : Cloudinary (gratuit)

Dans **Railway → Variables** :

```env
CLOUDINARY_CLOUD_NAME=votre_cloud
CLOUDINARY_API_KEY=...
CLOUDINARY_API_SECRET=...
```

Créez un compte sur [cloudinary.com](https://cloudinary.com), copiez les 3 valeurs du dashboard.  
Redeploy → réimportez les images en admin → **Enregistrer le produit**.

Les URLs deviennent du type `https://res.cloudinary.com/...` (permanentes).

### Alternative : volume Railway

Monter un volume persistant sur `/app/uploads` dans le service Railway (les fichiers locaux survivent aux redeploys).
