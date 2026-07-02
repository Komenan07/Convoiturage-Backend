# 🧪 Guide des Tests - TrajetAutomationService

## 📋 Vue d'ensemble

Les tests unitaires vérifient que :
✅ Les notifications de retard ne sont envoyées **qu'une fois par seuil** (3, 5, 10, 15, 20, 25 min)
✅ Les notifications d'activation ne sont envoyées **qu'une fois**
✅ Les notifications de terminaison ne sont envoyées **qu'une fois**
✅ Les notifications d'expiration ne sont envoyées **qu'une fois**
✅ Les notifications d'oubli d'arrivée ne sont envoyées **qu'une fois**

## 🚀 Installation des dépendances

```bash
npm install --save-dev jest sinon chai
```

## ▶️ Lancer les tests

### 1️⃣ Lancer tous les tests
```bash
npm test
```

### 2️⃣ Lancer les tests en mode watch (re-lance auto à chaque modification)
```bash
npm run test:watch
```

### 3️⃣ Lancer avec coverage (voir les parties testées)
```bash
npm run test:coverage
```

### 4️⃣ Lancer uniquement les tests du service automation
```bash
npm test -- trajetAutomationService
```

## 📊 Tests inclus

### notifierRetardsDepart() - 4 tests
- ✅ Envoyer notification pour retard de 3 min
- ❌ NE PAS renvoyer si déjà envoyée au même seuil
- ✅ Envoyer pour différents seuils (3, 5, 10, 15, 20, 25)
- ✅ Gérer multiple trajets à différents retards

### activerTrajetsEnAttente() - 1 test
- ✅ Envoyer notification activation au 1er appel

### notifierOubliArrivee() - 2 tests
- ✅ Envoyer notification oubli arrivée si pas envoyée
- ❌ NE PAS renvoyer si déjà envoyée

### Autres
- terminerTrajetsEnCours()
- expirerTrajetsNonActives()

## 📈 Résultat attendu

Quand tu lances les tests, tu devrais voir :

```
✓ notifierRetardsDepart() (4 tests)
  ✓ Devrait envoyer une notification pour un retard de 3 min
  ✓ Devrait PAS envoyer 2x la notification au même seuil
  ✓ Envoyer des notifications pour différents seuils
  ✓ Reçoit tous les seuils au fil du temps

✓ activerTrajetsEnAttente() (1 test)
  ✓ Devrait envoyer notification activation au 1er appel

✓ notifierOubliArrivee() (2 tests)
  ✓ Devrait envoyer notification oubli arrivée si pas encore envoyée
  ✓ Devrait PAS renvoyer notification oubli si déjà envoyée

Tests:    7 passed, 7 total
```

## 🔍 Interpréter les résultats

### ✅ Si tous les tests passent
→ **Les corrections fonctionnent !** Les notifications ne sont envoyées qu'une fois.

### ❌ Si des tests échouent
→ Vérifier les logs pour identifier le problème

**Exemple d'erreur courante :**
```
Expected: function to have been called 0 times
Received: 1 call
```
→ Cela signifie qu'une notification a été envoyée alors qu'elle ne devrait pas l'être

## 🛠️ Debugging

### Voir tous les appels Firebase
```javascript
firebaseService.sendToMultipleTokens.mock.calls
```

### Voir tous les appels save()
```javascript
trajet.save.mock.calls
```

### Voir les arguments d'un appel
```javascript
firebaseService.sendToMultipleTokens.mock.calls[0]
```

## 📝 Ajouter un nouveau test

Exemple: Tester que le flag ne s'écrase pas

```javascript
test('✅ Initialiser les flags à false quand on crée un trajet', () => {
  const trajet = new Trajet({
    notificationsRetardSeuils: {
      seuil_3min: false,
      seuil_5min: false,
      // ...
    }
  });

  expect(trajet.notificationsRetardSeuils.seuil_3min).toBe(false);
});
```

## 🎯 Prochaines étapes

1. Lancer les tests
2. Vérifier que tout passe ✅
3. En production, les notifications ne seront envoyées qu'une fois

---

**Questions ?** Regarde les logs du test avec `-v` pour plus de détails :
```bash
npm test -- --verbose
```
