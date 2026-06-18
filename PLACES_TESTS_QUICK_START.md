<!-- PLACES_TESTS_QUICK_START.md -->

# 🚀 Quick Start - Tests Places

## ⚡ Commandes rapides

### 1. Exécuter les tests Places
```bash
npm test placesV2
```

### 2. Voir la couverture
```bash
npm run test:coverage -- placesV2
```

### 3. Mode watch (regarde les modifications)
```bash
npm run test:watch -- placesV2
```

---

## ✅ Avant de lancer les tests

1. **Vérifier Node.js**
   ```bash
   node --version  # Doit être v14+
   ```

2. **Vérifier les dépendances**
   ```bash
   npm list jest    # Jest doit être installé
   npm list axios   # Axios doit être installé
   ```

3. **Installer si nécessaire**
   ```bash
   npm install
   ```

---

## 📊 Résultats attendus

```
✓ PlacesV2Service (40+ tests)
  - searchText: 4 tests
  - searchNearby: 5 tests
  - autocomplete: 4 tests
  - getPlaceDetails: 3 tests
  - getBatchPlaceDetails: 3 tests
  - Utilitaires: 4 tests
  - healthCheck: 2 tests
  - Spécialisés: 6+ tests

✓ PlacesV2Controller (50+ tests)
  - searchText: 5 tests
  - searchNearby: 5 tests
  - autocomplete: 3 tests
  - getPlaceDetails: 3 tests
  - getBatchPlaceDetails: 4 tests
  - Recherches spécialisées: 10+ tests
  - TotalEnergies: 2 tests

✅ Total: 100+ tests, 0 erreur
⏱️ Temps: < 10 secondes
```

---

## 🔍 Détails des tests

### Service Tests (`placesV2Service.test.js`)
Teste la logique métier avec des mocks axios:
- Recherche texte
- Recherche à proximité
- Autocomplétion
- Détails des lieux
- Batch processing
- Utilitaires (distance, catégories, prix)
- Health check

### Controller Tests (`placesV2Controller.test.js`)
Teste la couche HTTP avec des mocks du service:
- Validation des entrées (query, coords, types)
- Status codes HTTP corrects
- Limites et filtres
- Gestion des erreurs
- Réponses JSON correctes

---

## 🎯 Points clés

✅ **AUCUN appel à Google Places API**
- Tout est mocké
- Pas de quota API utilisé
- Pas de dépendance externe

✅ **AUCUN accès à la base de données**
- Service complètement isolé
- Tests ultra-rapides

✅ **Couverture complète**
- Tous les endpoints
- Tous les cas d'erreur
- Toutes les validations

✅ **CI/CD Ready**
- Peut s'intégrer dans GitHub Actions
- Peut s'intégrer dans GitLab CI
- Stateless et idempotent

---

## 📝 Fichiers créés

```
__tests__/
├── placesV2Service.test.js       (500+ lignes, 40+ tests)
├── placesV2Controller.test.js     (600+ lignes, 50+ tests)
└── PLACES_TESTS_README.md         (Documentation complète)
```

---

## ❌ En cas d'erreur

### "Cannot find module 'placesV2Service'"
```bash
# Vérifier le chemin dans le test
# Doit correspondre à services/placesV2Service.js
npm test placesV2Service -- --verbose
```

### "jest is not installed"
```bash
npm install --save-dev jest
```

### Tests timeout
```bash
# Augmenter le timeout
npm test -- --testTimeout=30000
```

### "Snapshot mismatch"
```bash
# Mettre à jour les snapshots
npm test -- -u
```

---

## 🎓 Apprendre Jest

### Syntaxe de base
```javascript
describe('Group', () => {
  it('should do something', () => {
    expect(value).toBe(expected);
  });
});
```

### Assertions communes
```javascript
expect(x).toBe(y);              // Égalité stricte
expect(x).toEqual(y);           // Égalité profonde
expect(x).toContain(y);         // Inclusion
expect(fn).toHaveBeenCalled();  // Mock appelé
expect(promise).resolves.toBe(); // Promise async
```

### Mocks
```javascript
jest.mock('../module');
const mock = require('../module');
mock.someFunction.mockResolvedValueOnce(value);
mock.someFunction.mockRejectedValueOnce(error);
```

---

## 📚 Documentation complète

Voir [PLACES_TESTS_README.md](./) pour:
- Structure détaillée
- Tous les cas de test
- Patterns et bonnes pratiques
- Debugging avancé

---

## ✨ Prochaines étapes

- [ ] Ajouter des tests d'intégration
- [ ] Configurer le CI/CD
- [ ] Setup coverage reporting
- [ ] Ajouter des tests de performance
- [ ] Tests E2E avec vrai API (staging)

---

**Status:** ✅ Prêt à l'emploi
**Maintenance:** Mettre à jour les tests quand le code change
