<!-- __tests__/PLACES_TESTS_README.md -->

# Tests Unitaires - Module Places V2

## 📋 Overview

Ce dossier contient les tests unitaires complets pour le module **Places V2** (recherche de lieux, géocodage, autocomplétion via Google Places API).

### Fichiers de test
- `placesV2Service.test.js` - Tests du service (logique métier)
- `placesV2Controller.test.js` - Tests du contrôleur (couche HTTP)

---

## 🎯 Couverture des tests

### PlacesV2Service Tests (50+ tests)

#### ✅ Recherche texte (`searchText`)
- Retourne les résultats avec succès
- Filtre par types de lieu
- Gère les erreurs API
- Retourne une erreur quand aucun résultat

#### ✅ Recherche à proximité (`searchNearby`)
- Retourne les lieux avec distance
- Filtre par rayon et limite
- Filtre par évaluation minimale
- Rejette les coordonnées invalides

#### ✅ Autocomplétion (`autocomplete`)
- Retourne les suggestions
- Valide la longueur minimale
- Utilise le bon code de région (CI)
- Supporte la localisation

#### ✅ Détails d'un lieu (`getPlaceDetails`)
- Retourne les détails complets
- Normalise les IDs de lieu
- Applique le fieldMask personnalisé

#### ✅ Batch (`getBatchPlaceDetails`)
- Traite plusieurs lieux en parallèle
- Gère les erreurs partielles
- Retourne les statistiques (success/failed)

#### ✅ Recherches spécialisées
- Communes
- Gares routières
- Stations proches (bus, train, etc.)
- Stations de police
- POI (restaurants, hôtels, etc.)
- Stations TotalEnergies

#### ✅ Utilitaires
- Calcul de distance (Haversine)
- Extraction des catégories
- Extraction des prix du carburant
- Parsing des adresses

### PlacesV2Controller Tests (50+ tests)

#### ✅ Validation des entrées
- Query minimum 2 caractères
- Coordonnées valides (y compris zéro)
- PlaceIds en tableau
- Types de lieux valides

#### ✅ Limites et filtres
- Rayon par défaut de 5000m
- MaxResults limité à 20
- Batch limité à 50 éléments
- Filtres optionnels (minRating, excludedTypes, etc.)

#### ✅ Gestion des erreurs
- Erreurs API
- Erreurs serveur (500)
- Aucun résultat (404)
- Validations échouées (400)

#### ✅ Status codes HTTP
- 200: Succès
- 400: Requête invalide
- 404: Aucun résultat
- 500: Erreur serveur
- 503: Service offline (healthCheck)

---

## 🚀 Comment exécuter les tests

### 1️⃣ Lancer tous les tests
```bash
npm test
```

### 2️⃣ Lancer uniquement les tests Places
```bash
npm test placesV2
```

### 3️⃣ Lancer les tests en mode watch (regarde les modifications)
```bash
npm run test:watch -- placesV2
```

### 4️⃣ Lancer avec couverture de code
```bash
npm run test:coverage -- placesV2
```

### 5️⃣ Lancer un test spécifique
```bash
npm test -- placesV2Service.test.js
npm test -- placesV2Controller.test.js
```

### 6️⃣ Lancer avec verbosité
```bash
npm test -- placesV2 --verbose
```

---

## 📊 Résultats attendus

```
PASS  __tests__/placesV2Service.test.js
  PlacesV2Service
    searchText
      ✓ devrait retourner les résultats de recherche texte (45ms)
      ✓ devrait retourner une erreur si la requête échoue (12ms)
      ✓ devrait retourner une erreur si aucun résultat trouvé (10ms)
      ✓ devrait inclure les types filtrés dans la requête (8ms)
    searchNearby
      ✓ devrait retourner les lieux à proximité avec distance (40ms)
      ✓ devrait utiliser les paramètres de rayon et limite (15ms)
      ✓ devrait retourner une erreur si les coordonnées sont invalides (5ms)
      ✓ devrait filtrer par évaluation minimale (12ms)
    [... 40+ tests supplémentaires ...]

PASS  __tests__/placesV2Controller.test.js
  PlacesV2Controller
    searchText
      ✓ devrait retourner les résultats de recherche avec succès (32ms)
      ✓ devrait retourner une erreur si la requête échoue (10ms)
      ✓ devrait valider que la query a au moins 2 caractères (8ms)
      ✓ devrait retourner une erreur serveur en cas d'exception (15ms)
    searchNearby
      ✓ devrait retourner les lieux à proximité (38ms)
      ✓ devrait valider les coordonnées (latitude et longitude valides) (10ms)
      ✓ devrait accepter latitude et longitude égales à zéro (12ms)
    [... 40+ tests supplémentaires ...]

Test Suites: 2 passed, 2 total
Tests:       100 passed, 100 total
Snapshots:   0 total
Time:        8.234 s
```

---

## 🔍 Structure des tests

### Pattern des tests

Chaque test suit ce pattern:

```javascript
describe('Groupe de tests', () => {
  beforeEach(() => {
    // Setup - Initialiser les mocks et objets
    jest.clearAllMocks();
  });

  it('devrait faire quelque chose', async () => {
    // Arrange - Préparer les données d'entrée
    req.body = { query: 'restaurant' };

    // Mock le service
    mockService.searchText.mockResolvedValueOnce({
      success: true,
      data: []
    });

    // Act - Appeler la fonction
    await placesV2Controller.searchText(req, res);

    // Assert - Vérifier les résultats
    expect(res.status).toHaveBeenCalledWith(200);
    expect(mockService.searchText).toHaveBeenCalled();
  });
});
```

### Mocking

**Les tests utilisent des mocks pour:**
- ✅ Éviter les appels réels à l'API Google Places
- ✅ Éviter l'accès à la base de données
- ✅ Tester des scénarios d'erreur
- ✅ Isoler les unités de code

**Exemples:**

```javascript
// Mock du service
jest.mock('../services/placesV2Service');

// Mock d'une méthode
mockService.searchText.mockResolvedValueOnce({
  success: true,
  data: []
});

// Mock d'une erreur
mockService.searchText.mockRejectedValueOnce(
  new Error('Quota API dépassé')
);

// Vérifier qu'une méthode a été appelée avec certains paramètres
expect(mockService.searchText).toHaveBeenCalledWith(
  'restaurant',
  expect.any(Object)
);
```

---

## 🧪 Cas de test clés

### ✅ Cas de succès
- Recherche avec résultats
- Autocomplétion avec suggestions
- Détails de lieu complets
- Batch processing réussi

### ⚠️ Cas d'erreur
- Aucun résultat trouvé
- Coordonnées invalides
- Quota API dépassé
- Erreur de connexion API

### 🔐 Cas limites
- Latitude/longitude = 0
- Query avec 2 caractères (minimum)
- 50 placeIds en batch (maximum)
- Rayon de recherche très grand (100000m)

---

## 📝 Notes importantes

### ⚡ Zéro appels externes
- ✅ **Pas d'appels à Google Places API** (tout est mocké)
- ✅ **Pas d'accès à la base de données** (service mocké)
- ✅ **Pas de dépendances réseau**
- ✅ **Tests ultra-rapides** (< 10 secondes)

### 🎯 Validation robuste
- Tous les status codes HTTP sont testés
- Tous les chemins d'erreur sont couverts
- Toutes les validations d'entrée sont testées
- Tous les filtres et options sont vérifiés

### 🚀 CI/CD Ready
Les tests peuvent s'intégrer dans:
- GitHub Actions
- GitLab CI/CD
- Jenkins
- Any CI/CD pipeline

```yaml
# Exemple pour GitHub Actions
- name: Run tests
  run: npm test placesV2 -- --coverage
  
- name: Check coverage
  run: npm run test:coverage -- --threshold=80
```

---

## 🐛 Debugging des tests

### Afficher les logs des mocks

```javascript
// Dans un test
it('devrait faire quelque chose', async () => {
  // ...
  
  // Voir tous les appels
  console.log(mockService.searchText.mock.calls);
  
  // Voir les arguments du dernier appel
  console.log(mockService.searchText.mock.calls[0][0]);
});
```

### Exécuter un seul test

```bash
# Utiliser .only
it.only('devrait faire quelque chose', async () => {
  // ...
});

# Puis lancer
npm test placesV2
```

### Mode verbose

```bash
npm test -- placesV2 --verbose --no-coverage
```

---

## 📚 Ressources

- [Jest Documentation](https://jestjs.io/)
- [Express Testing](https://expressjs.com/en/guide/testing.html)
- [Node.js Testing](https://nodejs.org/en/docs/guides/testing/)

---

## ✨ Améliorations futures

- [ ] Ajouter des snapshots pour les structures de données complexes
- [ ] Ajouter des tests de performance
- [ ] Ajouter des tests d'intégration avec une fausse API
- [ ] Coverage target: 90%+
- [ ] Tests E2E avec le vrai API en environnement de test

---

## 📞 Support

Si les tests échouent:
1. Vérifier que Jest est installé: `npm list jest`
2. Vérifier les mocks: `console.log(mockService.mock.calls)`
3. Vérifier les erreurs: `npm test -- placesV2 --verbose`
4. Nettoyer et réinstaller: `npm ci`

---

**Dernière mise à jour:** 2026-06-18
**Status:** ✅ Production-ready
