# Guide de Provisionnement & Sécurité Administrateur — GAAMOUZE

Ce document explique le cycle de vie du compte administrateur initial, les rôles disponibles et la procédure obligatoire de changement de mot de passe.

---

## 1. Compte Administrateur Initial

- **Email / Identifiant** : `abdelaligamouz@1448`
- **Rôle attribué** : `SUPER_ADMIN`
- **Mot de passe initial** : Défini via la variable d'environnement `ADMIN_INITIAL_PASSWORD`.

### Principe d'Idempotence
Le script `npm run prisma:seed` vérifie systématiquement si le compte `abdelaligamouz@1448` existe déjà dans PostgreSQL. S'il existe, **son mot de passe et son statut ne sont jamais écrasés ni réinitialisés**, garantissant ainsi la pérennité des accès de production à chaque redémarrage ou nouveau déploiement.

---

## 2. Obligation de Changement de Mot de Passe à la Première Connexion

1. L'administrateur accède à `/admin/login` et renseigne :
   - Email : `abdelaligamouz@1448`
   - Mot de passe : Valeur initiale de `ADMIN_INITIAL_PASSWORD`
2. Le backend vérifie l'attribut `mustChangePassword: true`.
3. L'application redirige automatiquement l'administrateur vers l'écran sécurisé :
   - `/admin/change-password`
4. L'accès à tous les autres endpoints d'administration (`/api/v1/admin/*`) reste bloqué avec le code HTTP `403 (PASSWORD_CHANGE_REQUIRED)` tant que l'administrateur n'a pas enregistré un nouveau mot de passe fort conforme aux règles de complexité :
   - Minimum 8 caractères
   - Au moins une majuscule
   - Au moins une minuscule
   - Au moins un chiffre
   - Au moins un symbole spécial
5. Une fois le mot de passe modifié, `mustChangePassword` passe à `false` et l'accès au tableau de bord complet est immédiatement déverrouillé.

---

## 3. Hiérarchie des Rôles (RBAC)

Le système GAAMOUZE implémente 6 rôles distincts :

1. **SUPER_ADMIN** : Accès illimité à l'ensemble du back-office, gestion des collaborateurs et consultation du journal d'audit.
2. **ADMIN** : Gestion complète du catalogue, des commandes, des promotions, des avis et des paramètres de boutique.
3. **MANAGER** : Gestion quotidienne des fiches parfums, ajustements de stocks et suivi des expéditions de commandes.
4. **EDITOR** : Gestion des bannières éditoriales, descriptions de la page d'accueil et réponses aux avis clients.
5. **SUPPORT** : Traitement des commandes, vérification des paiements à la livraison et contact client WhatsApp.
6. **CUSTOMER** : Client final de la boutique avec accès à son historique personnel.
