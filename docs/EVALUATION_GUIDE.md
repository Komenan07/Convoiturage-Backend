# Guide d'utilisation du modèle EVALUATION

## Vue d'ensemble

Le modèle EVALUATION gère les évaluations mutuelles entre conducteurs et passagers dans le système de covoiturage. Il inclut un système de calcul automatique de la note globale basé sur 5 critères d'évaluation.

## Structure des notes

### Critères d'évaluation
Chaque évaluation comprend 5 critères notés de 1 à 5 :

- **ponctualite** : Respect des horaires
- **proprete** : Propreté du véhicule et de l'environnement
- **qualiteConduite** : Qualité de la conduite et respect du code de la route
- **respect** : Respect mutuel et courtoisie
- **communication** : Qualité de la communication et de l'échange

### Calcul automatique de la note globale
La `noteGlobale` est calculée automatiquement comme la moyenne arithmétique des 5 critères :

```
noteGlobale = (ponctualite + proprete + qualiteConduite + respect + communication) / 5
```

**Exemple :**
- ponctualite: 5
- proprete: 4  
- qualiteConduite: 5
- respect: 4
- communication: 5

**Calcul :** (5 + 4 + 5 + 4 + 5) / 5 = **4.6**

## Fonctionnalités automatiques

### 1. Calcul automatique lors de la sauvegarde
```javascript
// La note globale est calculée automatiquement
const evaluation = new Evaluation({
  trajetId: trajetId,
  evaluateurId: userId,
  evalueId: conducteurId,
  typeEvaluateur: 'PASSAGER',
  notes: {
    ponctualite: 5,
    proprete: 4,
    qualiteConduite: 5,
    respect: 4,
    communication: 5
  }
});

// noteGlobale sera automatiquement 4.6
await evaluation.save();
```

### 2. Recalcul automatique lors des modifications
```javascript
// Modifier une note
evaluation.notes.ponctualite = 3;

// La note globale est recalculée automatiquement
await evaluation.save();
```

### 3. Mise à jour via findOneAndUpdate
```javascript
// Mise à jour avec recalcul automatique
await Evaluation.findOneAndUpdate(
  { _id: evaluationId },
  { 
    $set: { 
      'notes.ponctualite': 3,
      'notes.proprete': 4 
    } 
  }
);
// La note globale sera automatiquement mise à jour
```

## Méthodes d'instance

### `recalculerNoteGlobale()`
Recalcule manuellement la note globale et la met à jour.

```javascript
const nouvelleNote = evaluation.recalculerNoteGlobale();
console.log('Nouvelle note globale:', nouvelleNote);
```

### `getResumeNotes()`
Retourne un résumé détaillé de toutes les notes avec leurs libellés.

```javascript
const resume = evaluation.getResumeNotes();
console.log(resume);
// Résultat :
// {
//   ponctualite: { note: 5, libelle: 'EXCELLENT' },
//   proprete: { note: 4, libelle: 'TRÈS BIEN' },
//   qualiteConduite: { note: 5, libelle: 'EXCELLENT' },
//   respect: { note: 4, libelle: 'TRÈS BIEN' },
//   communication: { note: 5, libelle: 'EXCELLENT' },
//   noteGlobale: { note: 4.6, libelle: 'TRÈS BIEN' }
// }
```

### `getLibelleNote(note)`
Convertit une note numérique en libellé textuel.

```javascript
const libelle = evaluation.getLibelleNote(4.6);
console.log(libelle); // 'TRÈS BIEN'
```

**Échelle des libellés :**
- 4.5 - 5.0 : **EXCELLENT**
- 4.0 - 4.4 : **TRÈS BIEN**
- 3.5 - 3.9 : **BIEN**
- 3.0 - 3.4 : **ASSEZ BIEN**
- 2.5 - 2.9 : **MOYEN**
- 2.0 - 2.4 : **PASSABLE**
- 1.5 - 1.9 : **INSUFFISANT**
- 1.0 - 1.4 : **TRÈS INSUFFISANT**

### `estPositive()`
Vérifie si l'évaluation est positive (note ≥ 4.0).

```javascript
if (evaluation.estPositive()) {
  console.log('Évaluation positive');
}
```

### `estCritique()`
Vérifie si l'évaluation est critique (note ≤ 2.0).

```javascript
if (evaluation.estCritique()) {
  console.log('Évaluation critique - attention requise');
}
```

## Méthodes statiques

### `calculerMoyenneUtilisateur(userId)`
Calcule les moyennes de toutes les évaluations d'un utilisateur.

```javascript
const moyennes = await Evaluation.calculerMoyenneUtilisateur(userId);
console.log('Moyenne globale:', moyennes.moyenneGlobale);
console.log('Nombre d\'évaluations:', moyennes.nombreEvaluations);
```

### `getStatistiquesUtilisateur(userId)`
Obtient des statistiques détaillées d'un utilisateur.

```javascript
const stats = await Evaluation.getStatistiquesUtilisateur(userId);
console.log('Total évaluations:', stats.totalEvaluations);
console.log('Moyenne globale:', stats.moyenneGlobale);
console.log('Moyennes par critère:', stats.moyennesParCritere);
console.log('Tendance:', stats.tendance);
```

### `analyserTendance(evaluations)`
Analyse la tendance des évaluations d'un utilisateur.

**Résultats possibles :**
- **AMELIORATION** : Progression positive (> 0.5)
- **STABLE** : Stabilité (-0.5 à +0.5)
- **DEGRADATION** : Dégradation (> -0.5)
- **INSUFFISANT_DE_DONNEES** : Moins de 3 évaluations

### `detecterEvaluationsSuspectes(userId)`
Détecte des patterns suspects dans les évaluations.

```javascript
const detection = await Evaluation.detecterEvaluationsSuspectes(userId);
if (detection.suspect) {
  console.log('Utilisateur suspect:', detection.recommandations);
}
```

### `getMeilleuresEvaluations(limit)`
Récupère les meilleures évaluations du système.

```javascript
const meilleures = await Evaluation.getMeilleuresEvaluations(10);
console.log('Top 10 des évaluations');
```

### `getEvaluationsParPeriode(userId, periode)`
Récupère les évaluations d'un utilisateur sur une période donnée.

**Périodes disponibles :**
- `'7j'` : 7 jours
- `'30j'` : 30 jours (défaut)
- `'90j'` : 90 jours
- `'1an'` : 1 an

```javascript
const evaluations30j = await Evaluation.getEvaluationsParPeriode(userId, '30j');
const evaluations1an = await Evaluation.getEvaluationsParPeriode(userId, '1an');
```

## Validation des données

### Contraintes de validation
- **Notes** : Entiers de 1 à 5 uniquement
- **Commentaire** : Maximum 500 caractères
- **Réponse** : Maximum 300 caractères
- **Unicité** : Une seule évaluation par trajet/évaluateur

### Exemple de validation
```javascript
try {
  const evaluation = new Evaluation({
    // ... autres champs
    notes: {
      ponctualite: 6, // ❌ Erreur : note > 5
      proprete: 4,
      qualiteConduite: 4,
      respect: 4,
      communication: 4
    }
  });
  
  await evaluation.save();
} catch (error) {
  console.log('Erreur de validation:', error.message);
}
```

## Utilisation dans les contrôleurs

### Création d'évaluation
```javascript
const creerEvaluation = async (req, res) => {
  try {
    const { trajetId, evalueId, notes, commentaire } = req.body;
    
    const evaluation = new Evaluation({
      trajetId,
      evaluateurId: req.user.id,
      evalueId,
      typeEvaluateur: req.user.role === 'CONDUCTEUR' ? 'CONDUCTEUR' : 'PASSAGER',
      notes,
      commentaire
    });
    
    // La note globale est calculée automatiquement
    await evaluation.save();
    
    res.status(201).json({
      success: true,
      data: evaluation,
      message: 'Évaluation créée avec succès'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la création de l\'évaluation',
      error: error.message
    });
  }
};
```

### Mise à jour d'évaluation
```javascript
const modifierEvaluation = async (req, res) => {
  try {
    const { notes } = req.body;
    
    const evaluation = await Evaluation.findOneAndUpdate(
      { _id: req.params.id, evaluateurId: req.user.id },
      { $set: { notes } },
      { new: true, runValidators: true }
    );
    
    // La note globale est automatiquement recalculée
    res.json({
      success: true,
      data: evaluation,
      message: 'Évaluation modifiée avec succès'
    });
    
  } catch (error) {
    res.status(500).json({
      success: false,
      message: 'Erreur lors de la modification',
      error: error.message
    });
  }
};
```

## Gestion des erreurs

### Erreurs courantes
1. **ValidationError** : Notes invalides ou champs manquants
2. **CastError** : ID de trajet ou utilisateur invalide
3. **DuplicateKeyError** : Évaluation déjà existante pour ce trajet

### Exemple de gestion d'erreur
```javascript
try {
  await evaluation.save();
} catch (error) {
  if (error.name === 'ValidationError') {
    return res.status(400).json({
      success: false,
      message: 'Données d\'évaluation invalides',
      details: error.message
    });
  }
  
  if (error.code === 11000) {
    return res.status(409).json({
      success: false,
      message: 'Vous avez déjà évalué ce trajet'
    });
  }
  
  throw error;
}
```

## Tests

### Exécuter les tests
```bash
node test/evaluation-test.js
```

### Tests disponibles
- ✅ Calcul automatique de la note globale
- ✅ Méthodes utilitaires
- ✅ Méthodes statiques
- ✅ Validation des notes
- ✅ Mise à jour avec recalcul automatique

## Performance

### Index optimisés
- `{ trajetId: 1, evaluateurId: 1 }` : Unicité et recherche rapide
- `{ evalueId: 1, dateEvaluation: -1 }` : Historique des évaluations
- `{ 'notes.noteGlobale': -1 }` : Tri par note globale
- `{ estSignalement: 1, gravite: 1 }` : Gestion des signalements

### Optimisations recommandées
1. **Pagination** : Utiliser `limit()` et `skip()` pour les listes
2. **Projection** : Sélectionner uniquement les champs nécessaires
3. **Agrégation** : Utiliser les pipelines MongoDB pour les calculs complexes

## Maintenance

### Nettoyage des données
- Supprimer les évaluations des trajets supprimés
- Archiver les anciennes évaluations (> 2 ans)
- Nettoyer les évaluations orphelines

### Surveillance
- Vérifier la cohérence des notes globales
- Détecter les évaluations suspectes
- Analyser les tendances par utilisateur

## Support

Pour toute question ou problème :
- Vérifier les logs du serveur
- Tester avec le fichier `test/evaluation-test.js`
- Consulter la documentation Mongoose
- Vérifier la cohérence des données en base
