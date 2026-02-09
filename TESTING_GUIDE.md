# Tests Unitaires - Module Évaluation

Documentation complète des tests unitaires et d'intégration pour le module d'évaluation du backend Convoiturage.

## 📋 Vue d'ensemble

Ce projet inclut une suite de tests complète couvrant:
- **Tests unitaires du Service** (`evaluation.service.unit.test.js`)
- **Tests unitaires du Contrôleur** (`evaluation.controller.unit.test.js`)
- **Tests unitaires du Modèle** (`evaluation.model.unit.test.js`)
- **Tests d'intégration** (`evaluation.integration.test.js`)
- **Tests API existants** (`evaluation.test.js`)

## 🚀 Installation et Configuration

### Prérequis
```bash
# Node.js >= 16
node --version

# npm >= 8
npm --version
```

### Installation des dépendances
```bash
npm install
```

### Configuration des variables d'environnement

Créez un fichier `.env.test` ou utilisez `.env` avec les variables suivantes:

```env
# Base de données de test
MONGODB_TEST_URI=mongodb://localhost:27017/covoiturage_test
MONGODB_URI=mongodb://localhost:27017/covoiturage

# JWT
JWT_SECRET=your_jwt_secret_key_for_testing
JWT_EXPIRE=7d

# Autres configurations
NODE_ENV=test
```

## 🧪 Exécution des Tests

### Exécuter tous les tests
```bash
npm test
```

### Exécuter des tests spécifiques

**Tests unitaires du Service:**
```bash
npm test -- evaluation.service.unit.test.js
```

**Tests unitaires du Contrôleur:**
```bash
npm test -- evaluation.controller.unit.test.js
```

**Tests unitaires du Modèle:**
```bash
npm test -- evaluation.model.unit.test.js
```

**Tests d'intégration:**
```bash
npm test -- evaluation.integration.test.js
```

**Tests API:**
```bash
npm test -- evaluation.test.js
```

### Mode Watch (relance automatique lors des changements)
```bash
npm run test:watch
```

### Générer un rapport de couverture
```bash
npm run test:coverage
```

Le rapport sera généré dans le dossier `coverage/`.

## 📊 Structure des Tests

### 1. Tests Unitaires du Service (`evaluation.service.unit.test.js`)

Couvre les méthodes du service avec des mocks MongoDB:

#### Sections testées:
- ✅ **Workflow évaluation en attente**
  - `creerEvaluationEnAttente()`
  - `completerEvaluation()`
  - `obtenirEvaluationsEnAttente()`
  - `verifierDelaiEvaluation()`

- ✅ **Prise en charge (anti-fraude)**
  - `signalerPriseEnCharge()`
  - `obtenirPrisesEnChargeTrajet()`

- ✅ **Statistiques et badges**
  - `obtenirStatsPourBadges()`
  - `obtenirMeilleuresEvaluations()`
  - `obtenirStatistiquesGlobales()`

- ✅ **Modération admin**
  - `masquerEvaluation()`
  - `demasquerEvaluation()`

### 2. Tests Unitaires du Contrôleur (`evaluation.controller.unit.test.js`)

Couvre les endpoints HTTP avec des mocks du service:

#### Sections testées:
- ✅ Création d'évaluation en attente
- ✅ Complétion d'évaluation
- ✅ Récupération des évaluations en attente
- ✅ Vérification du délai
- ✅ Signalement de prise en charge
- ✅ Validation de langue française
- ✅ Gestion des prises en charge
- ✅ Statistiques et badges
- ✅ Modération admin
- ✅ Réponses aux évaluations
- ✅ Gestion des erreurs

### 3. Tests Unitaires du Modèle (`evaluation.model.unit.test.js`)

Couvre les méthodes d'instance et statiques du modèle:

#### Sections testées:
- ✅ **Méthodes d'instance**
  - `calculerDelaiRestant()`
  - `peutRepondre()`
  - `estRecente()`
  - `recalculerNoteGlobale()`
  - `getResumeNotes()`
  - `getLibelleNote()`
  - `estPositive()`
  - `estCritique()`
  - `validerLangueFrancaise()`

- ✅ **Méthodes statiques**
  - `calculerMoyenneUtilisateur()`
  - `getStatistiquesUtilisateur()`
  - `detecterLangue()`
  - `marquerEvaluationsExpirees()`
  - `getStatsForBadges()`
  - `detecterConducteursProches()`
  - `getMeilleuresEvaluations()`
  - `getEvaluationsEnAttente()`

- ✅ **Validations de schéma**
- ✅ **Indexes**
- ✅ **Hooks pre/post**
- ✅ **Gestion de la prise en charge**

### 4. Tests d'Intégration (`evaluation.integration.test.js`)

Couvre les flux complets avec une vraie base de données:

#### Scénarios testés:
- ✅ Workflow complet d'évaluation (création → attente → complétion)
- ✅ Gestion de l'idempotence
- ✅ Prise en charge anti-fraude
- ✅ Validation de langue française
- ✅ Signalement d'évaluations
- ✅ Réponses aux évaluations
- ✅ Statistiques et badges
- ✅ Modération admin
- ✅ Gestion des erreurs
- ✅ Validation des coordonnées GPS
- ✅ Récupération de l'historique

## 🎯 Cas de Test Clés

### Workflow Principal d'Évaluation

```
1. Créer évaluation en attente POST /api/evaluations/en-attente
   ↓
2. Vérifier délai GET /api/evaluations/:id/delai
   ↓
3. Compléter évaluation PUT /api/evaluations/:id/completer
   ↓
4. Répondre à l'évaluation PUT /api/evaluations/:id/reponse
```

### Anti-Fraude

```
1. Signaler prise en charge POST /api/evaluations/prise-en-charge
   ↓
2. Détecter conducteurs proches (géolocalisation)
   ↓
3. Récupérer historique GET /api/evaluations/trajet/:trajetId/prises-en-charge
```

### Validation Langue

```
POST /api/evaluations/valider-langue
- Accepte: Français
- Rejette: Anglais et autres langues
```

## 📈 Couverture des Tests

Couverture cible:
- **Service**: 90%+
- **Contrôleur**: 85%+
- **Modèle**: 80%+

Pour voir la couverture détaillée:
```bash
npm run test:coverage

# Ouvrir le rapport HTML
open coverage/lcov-report/index.html
```

## 🔧 Configuration Jest

Le fichier `jest.config.json` (ou section `jest` dans `package.json`):

```json
{
  "testEnvironment": "node",
  "collectCoverageFrom": [
    "**/*.js",
    "!node_modules/**",
    "!coverage/**",
    "!logs/**"
  ],
  "testMatch": [
    "**/__tests__/**/*.js",
    "**/?(*.)+(spec|test).js"
  ]
}
```

## 📝 Exemples de Cas de Test

### Test d'Évaluation Simple

```javascript
it('devrait créer une évaluation en attente avec succès', async () => {
  const response = await request(app)
    .post('/api/evaluations/en-attente')
    .set('Authorization', token)
    .send({
      trajetId: trajet._id,
      evalueId: conducteur._id,
      typeEvaluateur: 'PASSAGER'
    })
    .expect(201);

  expect(response.body.success).toBe(true);
  expect(response.body.data.statutEvaluation).toBe('EN_ATTENTE');
});
```

### Test de Validation de Langue

```javascript
it('devrait accepter un commentaire en français', async () => {
  const response = await request(app)
    .post('/api/evaluations/valider-langue')
    .set('Authorization', token)
    .send({
      commentaire: 'Merci beaucoup pour ce trajet!'
    })
    .expect(200);

  expect(response.body.data.estFrancais).toBe(true);
  expect(response.body.data.accepte).toBe(true);
});
```

### Test d'Anti-Fraude

```javascript
it('devrait détecter une alerte fraude', async () => {
  const response = await request(app)
    .post('/api/evaluations/prise-en-charge')
    .set('Authorization', tokenConducteur)
    .send({
      trajetId: trajet._id,
      passagerId: passager._id,
      localisation: {
        latitude: 5.3364,
        longitude: -4.0435
      }
    })
    .expect(200);

  expect(response.body.data.alerteFraude).toBeDefined();
  if (response.body.data.alerteFraude) {
    expect(response.body.alerte.type).toBe('FRAUDE_POTENTIELLE');
  }
});
```

## 🐛 Debugging

### Mode Debug

Exécutez les tests en mode debug:
```bash
node --inspect-brk node_modules/.bin/jest --runInBand evaluation.service.unit.test.js
```

Puis ouvrez `chrome://inspect` dans Chrome.

### Logs Détaillés

Activez les logs:
```bash
DEBUG=* npm test
```

### Exécuter un seul test

```javascript
// Utilisez it.only() pour exécuter un seul test
it.only('devrait créer une évaluation', async () => {
  // test
});
```

## 👤 Erreurs Courantes

### Erreur: "ECONNREFUSED 127.0.0.1:27017"
**Solution**: Assurez-vous que MongoDB est lancé
```bash
# macOS avec Homebrew
brew services start mongodb-community

# ou Docker
docker run -d -p 27017:27017 mongo
```

### Erreur: "Test timeout - Async callback was not invoked"
**Solution**: Augmentez le timeout dans le test
```javascript
jest.setTimeout(30000);
```

### Erreur: "Cannot find module"
**Solution**: Nettoyez node_modules et réinstallez
```bash
rm -rf node_modules package-lock.json
npm install
```

## 📚 Ressources

- [Jest Documentation](https://jestjs.io/)
- [Supertest Documentation](https://github.com/visionmedia/supertest)
- [MongoDB Testing Best Practices](https://docs.mongodb.com/manual/)
- [Express Testing Guide](https://expressjs.com/en/guide/testing.html)

## 🤝 Contribution

Pour ajouter des tests:

1. Créez un fichier `test/nom-du-test.test.js`
2. Suivez la structure existante
3. Utilisez des noms descriptifs
4. Ajoutez des commentaires pour les cas complexes
5. Exécutez `npm test` pour valider

## 📄 Scripts npm

```bash
npm test                  # Exécuter tous les tests
npm run test:watch       # Mode watch
npm run test:coverage    # Rapport de couverture
npm run lint             # Vérifier les erreurs de style
npm run lint:fix         # Corriger les erreurs de style
```

## ✅ Checklist de validation

Avant de commiter:
- [ ] Tous les tests passent (`npm test`)
- [ ] Pas de warnings
- [ ] Couverture >= 80% (pour les fichiers modifiés)
- [ ] Code linting valide (`npm run lint`)
- [ ] Pas de console.log en production
- [ ] Variables d'environnement correctes

---

**Dernière mise à jour**: février 2026
**Mainteneur**: Équipe DevOps Convoiturage
