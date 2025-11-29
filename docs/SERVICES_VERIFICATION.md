# 🔍 Vérification des Services et Controllers - Refactoring Schémas

**Date** : 29 novembre 2024  
**Status** : ⚠️ VÉRIFICATION EN COURS - ADAPTATIONS NÉCESSAIRES

---

## 📋 Vue d'ensemble

Suite au refactoring des modèles Mongoose avec les schémas réutilisables, ce document identifie les **adaptations nécessaires** dans les services et controllers pour assurer la compatibilité.

---

## ✅ Services vérifiés (Aucune adaptation requise)

### 1. trajetService.js ✅
**Status** : **COMPATIBLE** - Aucune modification nécessaire

**Raison** :
- Service gère uniquement l'expiration des trajets
- N'accède pas directement aux champs `vehiculeUtilise`, `pointDepart`, `pointArrivee`
- Utilise uniquement les méthodes statiques du modèle :
  - `Trajet.marquerTrajetsExpires()`
  - `Trajet.marquerRecurrencesExpirees()`
  - `Trajet.nettoyerVieuxTrajetsExpires()`
  - `Trajet.getStatistiquesExpiration()`

**Lignes vérifiées** : 1-470

---

## ⚠️ Controllers nécessitant adaptations

### 1. trajetController.js ⚠️
**Status** : **ADAPTATION REQUISE** - Création trajet avec véhicule

**Problème identifié** :
Le controller crée des trajets en passant directement `req.body` au modèle, mais ne gère pas la création du snapshot véhicule avec `vehiculeReferenceSchema`.

**Code actuel (ligne 84, 168)** :
```javascript
const trajetData = {
  ...req.body,
  conducteurId: req.user.id,
  typeTrajet: 'PONCTUEL' // ou 'RECURRENT'
};

const nouveauTrajet = new Trajet(trajetData);
await nouveauTrajet.save();
```

**Problème** :
- `req.body.vehiculeUtilise` contient probablement uniquement `{ marque, modele, couleur, immatriculation, nombrePlaces }`
- **Manque** : `vehiculeId` (référence), `snapshotDate`, `annee`, `carburant`, `photoVehicule`

**Solution recommandée** :

#### Option 1 : Créer snapshot depuis Vehicule existant (RECOMMANDÉE)

```javascript
const Vehicule = require('../models/Vehicule');
const { vehiculeReferenceSchema } = require('../models/schemas');

async creerTrajetPonctuel(req, res, next) {
  try {
    // ... validations ...

    // 1. Récupérer le véhicule principal du conducteur
    const utilisateur = await Utilisateur.findById(req.user.id)
      .populate('vehiculePrincipalId');
    
    if (!utilisateur.vehiculePrincipalId) {
      return res.status(400).json({
        success: false,
        message: 'Vous devez enregistrer un véhicule avant de créer un trajet'
      });
    }

    // 2. Créer le snapshot depuis le véhicule complet
    const vehiculeSnapshot = vehiculeReferenceSchema.statics.depuisVehicule(
      utilisateur.vehiculePrincipalId
    );

    // 3. Créer le trajet avec le snapshot
    const trajetData = {
      ...req.body,
      conducteurId: req.user.id,
      typeTrajet: 'PONCTUEL',
      vehiculeUtilise: vehiculeSnapshot  // ✅ Snapshot complet
    };

    const nouveauTrajet = new Trajet(trajetData);
    await nouveauTrajet.save();

    // ... reste du code ...
  } catch (error) {
    // ... gestion erreurs ...
  }
}
```

#### Option 2 : Permettre sélection véhicule (multi-véhicules)

```javascript
async creerTrajetPonctuel(req, res, next) {
  try {
    // ... validations ...

    // 1. Vérifier si vehiculeId fourni dans body
    const vehiculeId = req.body.vehiculeId || req.body.vehiculeUtilise?.vehiculeId;
    
    if (!vehiculeId) {
      return res.status(400).json({
        success: false,
        message: 'Vous devez spécifier un véhicule (vehiculeId)'
      });
    }

    // 2. Récupérer le véhicule sélectionné
    const vehicule = await Vehicule.findOne({
      _id: vehiculeId,
      proprietaireId: req.user.id,  // Vérifier propriété
      statut: 'ACTIF'
    });

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé ou inactif'
      });
    }

    // 3. Créer snapshot
    const { vehiculeReferenceSchema } = require('../models/schemas');
    const vehiculeSnapshot = vehiculeReferenceSchema.statics.depuisVehicule(vehicule);

    // 4. Créer trajet
    const trajetData = {
      ...req.body,
      conducteurId: req.user.id,
      typeTrajet: 'PONCTUEL',
      vehiculeUtilise: vehiculeSnapshot
    };

    // Supprimer vehiculeId du body pour éviter duplication
    delete trajetData.vehiculeId;

    const nouveauTrajet = new Trajet(trajetData);
    await nouveauTrajet.save();

    // ... reste du code ...
  } catch (error) {
    // ... gestion erreurs ...
  }
}
```

**Fichiers à modifier** :
- [x] Identifier problème : `controllers/trajetController.js` lignes 84, 168
- [ ] Implémenter solution Option 1 ou 2
- [ ] Mettre à jour méthode `creerTrajetPonctuel()` (ligne 33-104)
- [ ] Mettre à jour méthode `creerTrajetRecurrent()` (ligne 110-200)
- [ ] Tester création trajet avec snapshot véhicule

---

### 2. authController.js / utilisateurController.js ⚠️
**Status** : **ADAPTATION REQUISE** - Création conducteur avec véhicule

**Problème identifié** :
Lors de l'inscription d'un conducteur, le véhicule est probablement créé comme objet embarqué dans l'ancien format.

**Ancien code (probable dans authValidator.js ligne 313-342)** :
```javascript
body('vehicule.marque').notEmpty().withMessage('Marque requise'),
body('vehicule.modele').notEmpty().withMessage('Modèle requis'),
body('vehicule.immatriculation').notEmpty().withMessage('Immatriculation requise'),
body('vehicule.couleur').notEmpty().withMessage('Couleur requise'),
body('vehicule.nombrePlaces').isInt({ min: 1, max: 8 }).withMessage('Nombre places invalide'),
body('vehicule.annee').optional().isInt({ min: 1990 }).withMessage('Année invalide')
```

**Solution recommandée** :

#### 1. Créer modèle Vehicule séparé lors inscription conducteur

**Fichier** : `controllers/authController.js` ou `utilisateurController.js`

```javascript
const Vehicule = require('../models/Vehicule');

async inscrireConducteur(req, res, next) {
  try {
    // ... validations utilisateur ...

    // 1. Créer le document Vehicule séparé
    const vehiculeData = req.body.vehicule;
    const nouveauVehicule = new Vehicule({
      ...vehiculeData,
      proprietaireId: nouvelUtilisateur._id,  // Référence vers utilisateur
      statut: 'ACTIF',
      dateAjout: new Date()
    });
    await nouveauVehicule.save();

    // 2. Ajouter référence dans Utilisateur
    nouvelUtilisateur.vehicules = [nouveauVehicule._id];
    nouvelUtilisateur.vehiculePrincipalId = nouveauVehicule._id;
    await nouvelUtilisateur.save();

    // ... reste du code ...
  } catch (error) {
    // ... gestion erreurs ...
  }
}
```

#### 2. Mettre à jour endpoint ajout véhicule

**Endpoint** : `POST /utilisateurs/:id/vehicules` (à créer si n'existe pas)

```javascript
async ajouterVehicule(req, res, next) {
  try {
    const utilisateurId = req.params.id || req.user.id;
    
    // Vérifier droits
    if (req.user.id !== utilisateurId && req.user.role !== 'admin') {
      return res.status(403).json({
        success: false,
        message: 'Non autorisé'
      });
    }

    // Créer véhicule
    const nouveauVehicule = new Vehicule({
      ...req.body,
      proprietaireId: utilisateurId,
      statut: 'ACTIF',
      dateAjout: new Date()
    });
    await nouveauVehicule.save();

    // Ajouter référence dans utilisateur
    const utilisateur = await Utilisateur.findById(utilisateurId);
    utilisateur.vehicules.push(nouveauVehicule._id);
    
    // Si premier véhicule, définir comme principal
    if (!utilisateur.vehiculePrincipalId) {
      utilisateur.vehiculePrincipalId = nouveauVehicule._id;
    }
    
    await utilisateur.save();

    res.status(201).json({
      success: true,
      message: 'Véhicule ajouté avec succès',
      data: nouveauVehicule
    });
  } catch (error) {
    next(error);
  }
}
```

**Fichiers à modifier** :
- [ ] Vérifier `validators/authValidator.js` lignes 313-342
- [ ] Modifier inscription conducteur (authController ou utilisateurController)
- [ ] Créer endpoint `POST /utilisateurs/:id/vehicules`
- [ ] Créer endpoint `PUT /utilisateurs/:id/vehicules/:vehiculeId` (modifier véhicule)
- [ ] Créer endpoint `DELETE /utilisateurs/:id/vehicules/:vehiculeId` (supprimer véhicule)
- [ ] Créer endpoint `PUT /utilisateurs/:id/vehicule-principal/:vehiculeId` (changer véhicule principal)

---

## ✅ Services sans adaptation (confirmés)

### 1. reservationService.js ✅
**Status** : **PROBABLEMENT COMPATIBLE**

**Raison** :
- Les réservations utilisent `localisationSimpleSchema` pour `pointPriseEnCharge` et `pointDepose`
- Format coordonnées reste identique : `{ type: 'Point', coordinates: [lon, lat] }`
- Pas d'accès direct au véhicule (via populate si besoin)

**À vérifier** :
- [ ] Lecture fichier `services/reservationService.js`
- [ ] Confirmer aucun accès direct aux champs localisations
- [ ] Vérifier calculs distance (devrait utiliser méthode `distanceVers()` maintenant)

---

### 2. evenementService.js ✅
**Status** : **PROBABLEMENT COMPATIBLE**

**Raison** :
- Les événements utilisent `localisationSimpleSchema` pour `lieu`
- Pas de véhicule impliqué

**À vérifier** :
- [ ] Lecture fichier `services/evenementService.js`
- [ ] Confirmer aucun accès direct au champ lieu
- [ ] Vérifier recherches géospatiales (index 2dsphere automatique)

---

### 3. alerteUrgenceService.js ✅
**Status** : **PROBABLEMENT COMPATIBLE**

**Raison** :
- Les alertes utilisent `coordonneesSchema` pour `position`
- Format identique, juste schéma centralisé

**À vérifier** :
- [ ] Lecture fichier `services/alerteUrgenceService.js`
- [ ] Confirmer aucun accès direct au champ position
- [ ] Vérifier utilisation virtuals (`position.estEnCoteDIvoire`, etc.)

---

### 4. messageService.js ✅
**Status** : **PROBABLEMENT COMPATIBLE**

**Raison** :
- Les messages utilisent `coordonneesSchema` pour `pieceJointe.coordonnees`
- Format identique

**À vérifier** :
- [ ] Lecture fichier `services/messageService.js`
- [ ] Confirmer aucun accès direct aux coordonnées
- [ ] Vérifier partage localisation

---

## 🎯 Priorités d'adaptation

### Priorité 1 : CRITIQUE (Bloquant création trajets)
1. **trajetController.js** - Adapter `creerTrajetPonctuel()` et `creerTrajetRecurrent()`
   - Implémenter création snapshot véhicule
   - Tester avec Postman/API

### Priorité 2 : IMPORTANTE (Bloquant inscription conducteurs)
2. **authController.js / utilisateurController.js** - Adapter inscription conducteur
   - Créer Vehicule séparé
   - Ajouter références dans Utilisateur

### Priorité 3 : MOYENNE (Amélioration gestion véhicules)
3. **Endpoints gestion véhicules** - Créer CRUD complet
   - POST `/utilisateurs/:id/vehicules` (ajouter)
   - PUT `/utilisateurs/:id/vehicules/:vehiculeId` (modifier)
   - DELETE `/utilisateurs/:id/vehicules/:vehiculeId` (supprimer)
   - PUT `/utilisateurs/:id/vehicule-principal/:vehiculeId` (définir principal)
   - GET `/utilisateurs/:id/vehicules` (lister)

### Priorité 4 : BASSE (Vérification)
4. **Autres services** - Vérifier compatibilité
   - reservationService.js
   - evenementService.js
   - alerteUrgenceService.js
   - messageService.js

---

## 📝 Checklist de vérification

### Controllers

#### trajetController.js
- [x] Problème identifié : Création snapshot véhicule manquante
- [ ] Solution implémentée : Option 1 ou Option 2
- [ ] Tests création trajet ponctuel
- [ ] Tests création trajet récurrent
- [ ] Tests avec véhicule inexistant
- [ ] Tests avec véhicule inactif
- [ ] Tests multi-véhicules

#### authController.js / utilisateurController.js
- [x] Problème identifié : Véhicule objet embarqué
- [ ] Solution implémentée : Création Vehicule séparé
- [ ] Tests inscription conducteur
- [ ] Tests ajout véhicule
- [ ] Tests modification véhicule
- [ ] Tests suppression véhicule
- [ ] Tests changement véhicule principal

#### reservationController.js
- [ ] Vérification accès localisations
- [ ] Tests création réservation
- [ ] Tests affichage adresses courtes

#### evenementController.js
- [ ] Vérification accès lieu
- [ ] Tests création événement
- [ ] Tests validation villes CI

#### alerteUrgenceController.js
- [ ] Vérification accès position
- [ ] Tests création alerte
- [ ] Tests virtuals (estEnCoteDIvoire)

### Services

#### trajetService.js
- [x] Vérification complète : COMPATIBLE
- [x] Aucune adaptation nécessaire

#### reservationService.js
- [ ] Lecture fichier complet
- [ ] Vérification calculs distance
- [ ] Tests intégration

#### evenementService.js
- [ ] Lecture fichier complet
- [ ] Vérification recherches géospatiales
- [ ] Tests intégration

#### alerteUrgenceService.js
- [ ] Lecture fichier complet
- [ ] Vérification virtuals
- [ ] Tests intégration

#### messageService.js
- [ ] Lecture fichier complet
- [ ] Vérification partage position
- [ ] Tests intégration

---

## 🧪 Tests recommandés

### Tests API (Postman/Thunder Client)

#### 1. Création trajet avec snapshot véhicule

**Endpoint** : `POST /trajets/ponctuel`

**Body (nouveau format)** :
```json
{
  "vehiculeId": "6475a8b9c123456789abcdef",  // ID véhicule existant
  "pointDepart": {
    "nom": "Plateau",
    "adresse": "Avenue Chardy",
    "ville": "Abidjan",
    "coordonnees": {
      "type": "Point",
      "coordinates": [-4.0293, 5.3205]
    }
  },
  "pointArrivee": {
    "nom": "Abobo",
    "adresse": "Rue 12",
    "ville": "Abidjan",
    "coordonnees": {
      "type": "Point",
      "coordinates": [-4.0167, 5.4167]
    }
  },
  "dateDepart": "2024-12-15T08:00:00Z",
  "heureDepart": "08:00",
  "nombrePlacesDisponibles": 3,
  "nombrePlacesTotal": 4,
  "prixParPassager": 1000
}
```

**Vérifications** :
- ✅ Trajet créé avec `vehiculeUtilise.vehiculeId` = vehiculeId fourni
- ✅ `vehiculeUtilise.snapshotDate` défini automatiquement
- ✅ `vehiculeUtilise.marque`, `modele`, etc. copiés depuis Vehicule
- ❌ Erreur 404 si vehiculeId inexistant
- ❌ Erreur 403 si vehiculeId ne appartient pas au conducteur

#### 2. Inscription conducteur avec véhicule

**Endpoint** : `POST /auth/inscription-conducteur`

**Body (nouveau format)** :
```json
{
  "nom": "Kouassi",
  "prenom": "Jean",
  "email": "jean.kouassi@example.com",
  "telephone": "+2250123456789",
  "motDePasse": "SecurePass123!",
  "role": "conducteur",
  "vehicule": {
    "marque": "Toyota",
    "modele": "Corolla",
    "couleur": "Blanche",
    "immatriculation": "AB-123-CD",
    "nombrePlaces": 4,
    "annee": 2020,
    "carburant": "Essence"
  }
}
```

**Vérifications** :
- ✅ Utilisateur créé avec `role: "conducteur"`
- ✅ Vehicule créé séparément dans collection `vehicules`
- ✅ `utilisateur.vehicules[0]` = ID véhicule créé
- ✅ `utilisateur.vehiculePrincipalId` = ID véhicule créé
- ✅ Populate possible : `populate('vehicules')`, `populate('vehiculePrincipalId')`

---

## 📚 Documentation à mettre à jour

### 1. API Documentation (Swagger/OpenAPI)

**Endpoints à documenter** :

#### POST /trajets/ponctuel
```yaml
requestBody:
  required: true
  content:
    application/json:
      schema:
        type: object
        required:
          - vehiculeId  # ⚠️ NOUVEAU : Remplace vehiculeUtilise
          - pointDepart
          - pointArrivee
          - dateDepart
          - heureDepart
        properties:
          vehiculeId:
            type: string
            format: objectId
            description: ID du véhicule à utiliser (doit appartenir au conducteur)
          pointDepart:
            $ref: '#/components/schemas/LocalisationComplet'
          pointArrivee:
            $ref: '#/components/schemas/LocalisationComplet'
          # ... autres champs ...
```

#### Réponse trajet
```yaml
responses:
  201:
    description: Trajet créé avec succès
    content:
      application/json:
        schema:
          type: object
          properties:
            vehiculeUtilise:
              type: object
              properties:
                vehiculeId:
                  type: string
                  format: objectId
                marque:
                  type: string
                modele:
                  type: string
                # ... snapshot complet ...
                snapshotDate:
                  type: string
                  format: date-time
                  description: Date de création du snapshot
```

### 2. README.md

**Section à ajouter** :

```markdown
## Architecture Véhicules (Post-Refactoring)

### Modèle Vehicule (séparé)
Les véhicules sont maintenant gérés dans une collection dédiée `vehicules`.

### Utilisateur.vehicules
Les utilisateurs ont un array de références vers leurs véhicules :
```javascript
{
  vehicules: [ObjectId, ObjectId, ...],
  vehiculePrincipalId: ObjectId  // Véhicule par défaut
}
```

### Trajet.vehiculeUtilise (snapshot)
Les trajets stockent un **snapshot** du véhicule au moment de la création :
```javascript
{
  vehiculeId: ObjectId,       // Référence
  marque: "Toyota",           // Snapshot pour performance
  modele: "Corolla",
  snapshotDate: Date          // Date snapshot
}
```

**Avantages** :
- ✅ Multi-véhicules par utilisateur
- ✅ Performance (pas de populate pour 90% des requêtes)
- ✅ Historique immuable (snapshot préservé même si véhicule modifié/supprimé)
```

---

## 🔄 Migration données existantes

### Script migration à exécuter APRÈS adaptations controllers

**Fichier** : `scripts/migrate-schemas.js`

**Ordre d'exécution** :

1. **Migrer Utilisateur.vehicule → vehicules**
   - Créer documents Vehicule depuis objets embarqués
   - Ajouter références dans Utilisateur.vehicules
   - Définir vehiculePrincipalId

2. **Migrer Trajet.vehiculeUtilise**
   - Rechercher vehiculeId correspondant (conducteurId + immatriculation)
   - Ajouter vehiculeId, snapshotDate
   - Préserver données snapshot existantes

3. **Valider coordonnées** (tous modèles)
   - Vérifier format GeoJSON
   - Normaliser si nécessaire

**Commande** :
```bash
node scripts/migrate-schemas.js --dry-run  # Simulation
node scripts/migrate-schemas.js --execute  # Exécution réelle
```

---

## 📞 Support

**Documentation complète** :
- `AUDIT.md` : Problèmes identifiés
- `REFACTORING_COMPLETE.md` : Résumé refactoring modèles
- `SERVICES_VERIFICATION.md` : Ce document (vérification services/controllers)

**Prochaines étapes** :
1. Adapter `trajetController.js` (PRIORITÉ 1)
2. Adapter inscription conducteur (PRIORITÉ 2)
3. Créer endpoints gestion véhicules (PRIORITÉ 3)
4. Vérifier autres services (PRIORITÉ 4)
5. Exécuter tests API complets
6. Exécuter script migration données

---

**Status** : ⚠️ **VÉRIFICATION EN COURS**  
**Phase** : Adaptations controllers nécessaires  
**Bloquants** : Création trajet, Inscription conducteur  
**Prochaine action** : Implémenter solutions recommandées

**Date** : 29 novembre 2024  
**Auteur** : GitHub Copilot
