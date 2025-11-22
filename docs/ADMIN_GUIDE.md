# 🔐 Système d'Authentification Administrateur

## 📖 Vue d'ensemble

Le système administrateur est complètement séparé du système utilisateur avec :
- 🔑 Authentification JWT distincte (type: 'admin')
- 👥 Modèle de données dédié (`Administrateur`)
- 🛡️ Middleware d'authentification spécifique
- 📊 Gestion fine des rôles et permissions

---

## 🚀 Démarrage rapide

### 1. Créer un administrateur de test

```bash
node test/creer-admin-test.js
```

Cela créera un admin avec :
- **Email :** `admin@covoiturage.com`
- **Mot de passe :** `Admin@2024!`
- **Rôle :** `SUPER_ADMIN`

### 2. Se connecter

```bash
POST /api/admin/auth/login
Content-Type: application/json

{
  "email": "admin@covoiturage.com",
  "motDePasse": "Admin@2024!"
}
```

**Réponse :**
```json
{
  "success": true,
  "message": "Connexion réussie",
  "data": {
    "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
    "admin": {
      "id": "...",
      "email": "admin@covoiturage.com",
      "nom": "Admin",
      "prenom": "Principal",
      "role": "SUPER_ADMIN",
      "permissions": ["ALL"],
      "nomComplet": "Principal Admin"
    }
  }
}
```

### 3. Utiliser le token

Ajoutez le token dans le header `Authorization` pour toutes les requêtes admin :

```
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

---

## 👥 Rôles et Permissions

### Rôles disponibles

| Rôle | Description | Niveau d'accès |
|------|-------------|----------------|
| `SUPER_ADMIN` | Administrateur principal | Accès total |
| `MODERATEUR` | Modérateur de contenu | Modération, analytics |
| `SUPPORT` | Support client | Consultation limitée |

### Permissions disponibles

| Permission | Description |
|-----------|-------------|
| `ALL` | Toutes les permissions (SUPER_ADMIN uniquement) |
| `GESTION_UTILISATEURS` | Gérer les utilisateurs |
| `MODERATION` | Modérer les contenus |
| `ANALYTICS` | Accéder aux statistiques |
| `RAPPORTS_FINANCIERS` | Accéder aux rapports financiers |
| `CONFIGURATION_SYSTEME` | Configurer le système |

---

## 🛣️ Routes disponibles

### Authentification

#### Connexion
```
POST /api/admin/auth/login
Public
```

#### Profil
```
GET /api/admin/auth/profil
Private (Admin)
```

### Gestion des administrateurs

#### Créer un admin
```
POST /api/admin/admins
Private (SUPER_ADMIN uniquement)
```

#### Lister les admins
```
GET /api/admin/admins
Private (Admin avec GESTION_UTILISATEURS)
Query params: page, limit, sort, email, nom, role, statutCompte
```

#### Obtenir un admin
```
GET /api/admin/admins/:id
Private (Admin avec GESTION_UTILISATEURS)
```

#### Modifier un admin
```
PUT /api/admin/admins/:id
Private (SUPER_ADMIN uniquement)
```

⚠️ **Restrictions :**
- Impossible de modifier son propre compte
- Un MODERATEUR ne peut pas modifier un SUPER_ADMIN

#### Changer le statut
```
PATCH /api/admin/admins/:id/statut
Private (SUPER_ADMIN uniquement)
```

⚠️ **Restrictions :**
- Impossible de suspendre son propre compte
- Un MODERATEUR ne peut pas suspendre un SUPER_ADMIN

#### Désactiver un admin
```
DELETE /api/admin/admins/:id
Private (SUPER_ADMIN uniquement)
```

⚠️ **Restrictions :**
- Impossible de supprimer son propre compte
- Un MODERATEUR ne peut pas supprimer un SUPER_ADMIN

### Analytics

#### Dashboard
```
GET /api/admin/dashboard
Private (Admin avec ANALYTICS)
```

#### Statistiques détaillées
```
GET /api/admin/statistiques
Private (Admin avec ANALYTICS)
Query params: periode (1-365 jours)
```

---

## 📝 Exemples de requêtes

### Créer un nouveau modérateur

```bash
POST /api/admin/admins
Authorization: Bearer <TOKEN_SUPER_ADMIN>
Content-Type: application/json

{
  "email": "moderateur@covoiturage.com",
  "motDePasse": "Modo@2024!",
  "nom": "Modérateur",
  "prenom": "Test",
  "role": "MODERATEUR",
  "permissions": ["MODERATION", "ANALYTICS"]
}
```

### Modifier un administrateur

```bash
PUT /api/admin/admins/507f1f77bcf86cd799439011
Authorization: Bearer <TOKEN_SUPER_ADMIN>
Content-Type: application/json

{
  "nom": "Nouveau Nom",
  "permissions": ["MODERATION", "GESTION_UTILISATEURS"]
}
```

### Suspendre un administrateur

```bash
PATCH /api/admin/admins/507f1f77bcf86cd799439011/statut
Authorization: Bearer <TOKEN_SUPER_ADMIN>
Content-Type: application/json

{
  "statutCompte": "SUSPENDU"
}
```

### Obtenir les statistiques

```bash
GET /api/admin/statistiques?periode=30
Authorization: Bearer <TOKEN_ADMIN>
```

---

## 🔒 Sécurité

### Token JWT

Les tokens admin ont une structure spécifique :

```javascript
{
  id: "507f1f77bcf86cd799439011",
  type: "admin",  // ⚠️ Important : identifie le token comme admin
  iat: 1637856000,
  exp: 1637942400
}
```

### Validation du token

Le middleware `protectAdmin` vérifie :
1. ✅ Présence du token
2. ✅ Validité du token (signature, expiration)
3. ✅ Type de token = "admin"
4. ✅ Existence de l'administrateur en DB
5. ✅ Statut du compte = "ACTIF"

### Séparation utilisateur/admin

❌ **Un token utilisateur NE PEUT PAS accéder aux routes admin**
```
GET /api/admin/dashboard
Authorization: Bearer <TOKEN_UTILISATEUR>

→ 403 Forbidden : "Ce token n'est pas valide pour l'espace administrateur"
```

✅ **Un token admin ne peut accéder qu'aux routes admin**

### Logging des actions sensibles

Toutes les actions administratives sont loggées dans `logs/security-audit.json` :
- Connexions admin
- Création/modification/suppression d'admins
- Changements de statut
- Accès aux rapports financiers

---

## 🧪 Tests avec Postman

### Collection Postman

Importer le fichier `Convoiturage.postman_collection.json` dans Postman.

### Variables d'environnement

Créer une variable `adminToken` :
1. Se connecter avec `POST /api/admin/auth/login`
2. Copier le token de la réponse
3. Créer une variable `adminToken` dans Postman
4. Utiliser `{{adminToken}}` dans les headers

---

## 🐛 Dépannage

### Erreur : "Token administrateur invalide"

- Vérifier que le token n'a pas expiré
- Vérifier que le token provient de `/api/admin/auth/login`
- Vérifier la variable `JWT_SECRET` dans `.env`

### Erreur : "Ce token n'est pas valide pour l'espace administrateur"

- Vous essayez d'utiliser un token utilisateur sur une route admin
- Connectez-vous avec un compte admin via `/api/admin/auth/login`

### Erreur : "Compte administrateur suspendu"

- Le compte a été suspendu par un autre admin
- Demander à un SUPER_ADMIN de réactiver le compte

### Erreur : "Impossible de modifier son propre compte"

- C'est normal, les middlewares empêchent l'auto-modification
- Demander à un autre SUPER_ADMIN de faire les modifications

---

## 📊 Architecture

```
┌─────────────────┐
│   Client/App    │
└────────┬────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  POST /api/admin/auth/login         │
│  (génère token avec type: 'admin')  │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Toutes les routes /api/admin/*     │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Middleware: protectAdmin()         │
│  - Vérifie le token                 │
│  - Vérifie type = 'admin'           │
│  - Charge l'admin depuis DB         │
│  - Vérifie statut = ACTIF           │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Middleware: authorize()            │
│  - Vérifie le rôle                  │
│  - Vérifie les permissions          │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Middleware: preventSelfModification│
│  (sur routes de modification)       │
└────────┬────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────┐
│  Contrôleur                         │
│  - req.user = { id, type, role }    │
│  - req.admin = admin complet        │
└─────────────────────────────────────┘
```

---

## 📞 Support

Pour toute question ou problème :
1. Consulter les logs : `logs/security-audit.json`
2. Vérifier le fichier `CORRECTIONS_ADMIN.md`
3. Tester avec le script : `node test/creer-admin-test.js`

---

**Version :** 1.0.0  
**Dernière mise à jour :** 22 novembre 2025
