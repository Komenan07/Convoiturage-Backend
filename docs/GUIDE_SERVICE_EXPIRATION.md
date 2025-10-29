# 📚 Guide d'utilisation - Service d'Expiration des Trajets

## 🔄 Améliorations apportées

### 1. ✅ Constantes de configuration
```javascript
const CONFIG = {
  JOURS_CONSERVATION_DEFAUT: 30,      // Durée de conservation
  HEURES_NOTIFICATION_DEFAUT: 2,      // Délai de notification
  TIMEOUT_MAINTENANCE_MS: 15 * 60 * 1000,  // Timeout de 15 min
  MAX_RETRY_ATTEMPTS: 3,              // Tentatives max
  RETRY_DELAY_MS: 2000                // Délai entre tentatives
};
```

### 2. ✅ Validation des paramètres
```javascript
_validateNumber(value, min, max, paramName) {
  // Validation stricte des paramètres numériques
}
```

### 3. ✅ Protection contre le blocage
```javascript
_checkMaintenanceTimeout() {
  // Détecte et réinitialise les maintenances bloquées
}
```

### 4. ✅ Système de retry
```javascript
_executeWithRetry(operation, operationName, maxRetries = 3) {
  // Réessaye automatiquement en cas d'échec
}
```

### 5. ✅ Statistiques enrichies
```javascript
stats: {
  totalExpired: 0,
  totalRecurrencesExpired: 0,
  totalCleaned: 0,
  totalNotifications: 0,        // ⭐ NOUVEAU
  lastRun: null,
  successfulRuns: 0,            // ⭐ NOUVEAU
  failedRuns: 0                 // ⭐ NOUVEAU
}
```

### 6. ✅ Options de maintenance
```javascript
executerMaintenance({
  verifierExpiration: true,      // ⭐ NOUVEAU
  notifier: true,                // ⭐ NOUVEAU
  nettoyer: true,                // ⭐ NOUVEAU
  joursConservation: 30,
  heuresNotification: 2
})
```

### 7. ✅ Health check
```javascript
healthCheck() {
  // Vérification de la santé du service
}
```

### 8. ✅ Planification automatique
```javascript
planifierMaintenance(intervalMs) {
  // Planifier des maintenances périodiques
}
```

---

## 📖 Utilisation

### 1. Installation

```javascript
const trajetExpirationService = require('./services/trajetService');
```

### 2. Exécution manuelle de la maintenance

```javascript
// Maintenance complète
const result = await trajetExpirationService.executerMaintenance();
console.log(result);
```

### 3. Maintenance personnalisée

```javascript
// Maintenance personnalisée
const result = await trajetExpirationService.executerMaintenance({
  verifierExpiration: true,   // Vérifier les expirations
  notifier: false,            // Ne pas notifier
  nettoyer: true,             // Nettoyer
  joursConservation: 60,      // Garder 60 jours
  heuresNotification: 4       // Notifier 4h avant
});
```

### 4. Opérations individuelles

```javascript
// Vérifier uniquement les trajets expirés
await trajetExpirationService.verifierTrajetsExpires();

// Nettoyer les vieux trajets (garder 30 jours)
await trajetExpirationService.nettoyerVieuxTrajets(30);

// Notifier les trajets qui expirent dans 2h
await trajetExpirationService.notifierTrajetsAExpirer(2);

// Trouver les trajets qui vont expirer
const trajets = await trajetExpirationService.trouverTrajetsAExpirer(2);

// Obtenir les statistiques
const stats = await trajetExpirationService.obtenirStatistiques();
```

### 5. Planification automatique

```javascript
// Exécuter la maintenance toutes les heures
const intervalId = trajetExpirationService.planifierMaintenance(60 * 60 * 1000);

// Pour arrêter la planification
clearInterval(intervalId);
```

### 6. Monitoring

```javascript
// Obtenir le statut du service
const status = trajetExpirationService.getStatus();
console.log('Status:', status);

// Vérifier la santé du service
const health = trajetExpirationService.healthCheck();
console.log('Health:', health);

// Réinitialiser les statistiques
const oldStats = trajetExpirationService.resetStats();
```

---

## 🚀 Intégration dans Express

### Option 1 : Middleware de démarrage

```javascript
// server.js ou app.js
const trajetExpirationService = require('./services/trajetService');

// Démarrer la maintenance automatique au démarrage du serveur
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  
  // Planifier la maintenance toutes les heures
  trajetExpirationService.planifierMaintenance(60 * 60 * 1000);
  
  console.log('✅ Service d\'expiration des trajets démarré');
});
```

### Option 2 : Routes d'administration

```javascript
// routes/admin.js
const express = require('express');
const router = express.Router();
const trajetExpirationService = require('../services/trajetService');
const { authMiddleware, adminMiddleware } = require('../middlewares/auth');

// Exécuter la maintenance manuellement
router.post('/maintenance/trajets', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const result = await trajetExpirationService.executerMaintenance(req.body);
    res.json(result);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Obtenir le statut du service
router.get('/maintenance/trajets/status', authMiddleware, adminMiddleware, (req, res) => {
  const status = trajetExpirationService.getStatus();
  res.json(status);
});

// Health check
router.get('/maintenance/trajets/health', authMiddleware, adminMiddleware, (req, res) => {
  const health = trajetExpirationService.healthCheck();
  res.json(health);
});

// Obtenir les statistiques
router.get('/maintenance/trajets/stats', authMiddleware, adminMiddleware, async (req, res) => {
  try {
    const stats = await trajetExpirationService.obtenirStatistiques();
    res.json(stats);
  } catch (error) {
    res.status(500).json({ 
      success: false, 
      error: error.message 
    });
  }
});

// Réinitialiser les statistiques
router.post('/maintenance/trajets/reset', authMiddleware, adminMiddleware, (req, res) => {
  const oldStats = trajetExpirationService.resetStats();
  res.json({ 
    success: true, 
    message: 'Statistiques réinitialisées',
    oldStats 
  });
});

module.exports = router;
```

### Option 3 : Tâche Cron (recommandé)

```javascript
// utils/cron.js
const cron = require('node-cron');
const trajetExpirationService = require('../services/trajetService');

/**
 * Planifier les tâches de maintenance
 */
function setupCronJobs() {
  // Toutes les heures : vérifier et notifier
  cron.schedule('0 * * * *', async () => {
    console.log('🕐 Exécution de la maintenance horaire');
    await trajetExpirationService.executerMaintenance({
      verifierExpiration: true,
      notifier: true,
      nettoyer: false
    });
  });

  // Tous les jours à 3h du matin : nettoyage complet
  cron.schedule('0 3 * * *', async () => {
    console.log('🌙 Exécution de la maintenance nocturne');
    await trajetExpirationService.executerMaintenance({
      verifierExpiration: true,
      notifier: false,
      nettoyer: true,
      joursConservation: 30
    });
  });

  // Toutes les 30 minutes : notifications
  cron.schedule('*/30 * * * *', async () => {
    console.log('📧 Vérification des notifications');
    await trajetExpirationService.notifierTrajetsAExpirer(2);
  });

  console.log('✅ Tâches cron configurées');
}

module.exports = { setupCronJobs };
```

```javascript
// server.js
const { setupCronJobs } = require('./utils/cron');

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
  setupCronJobs();
});
```

---

## 📊 Exemples de réponses

### Maintenance complète

```json
{
  "success": true,
  "executionTime": 1234,
  "timestamp": "2025-10-28T10:30:00.000Z",
  "resultats": {
    "expiration": {
      "success": true,
      "trajetsExpires": 5,
      "recurrencesExpirees": 2,
      "timestamp": "2025-10-28T10:30:00.000Z"
    },
    "notification": {
      "success": true,
      "notificationsSent": 3,
      "trajetsNotifies": 8,
      "heuresAvantExpiration": 2,
      "timestamp": "2025-10-28T10:30:01.000Z"
    },
    "nettoyage": {
      "success": true,
      "trajetsSupprimés": 12,
      "joursAGarder": 30,
      "timestamp": "2025-10-28T10:30:02.000Z"
    },
    "statistiques": {
      "database": {
        "expiresDansUnJour": 15,
        "dejaExpires": 0,
        "recurrencesExpirees": 0,
        "trajetsExpires": 45
      },
      "service": {
        "totalExpired": 50,
        "totalRecurrencesExpired": 10,
        "totalCleaned": 120,
        "totalNotifications": 35,
        "successfulRuns": 48,
        "failedRuns": 2,
        "isRunning": false,
        "lastRunTime": "2025-10-28T10:30:00.000Z"
      }
    }
  }
}
```

### Statut du service

```json
{
  "isRunning": false,
  "lastRunTime": "2025-10-28T10:30:00.000Z",
  "maintenanceStartTime": null,
  "uptime": 0,
  "stats": {
    "totalExpired": 50,
    "totalRecurrencesExpired": 10,
    "totalCleaned": 120,
    "totalNotifications": 35,
    "successfulRuns": 48,
    "failedRuns": 2
  },
  "config": {
    "JOURS_CONSERVATION_DEFAUT": 30,
    "HEURES_NOTIFICATION_DEFAUT": 2,
    "TIMEOUT_MAINTENANCE_MS": 900000,
    "MAX_RETRY_ATTEMPTS": 3,
    "RETRY_DELAY_MS": 2000
  },
  "timestamp": "2025-10-28T11:00:00.000Z"
}
```

### Health Check

```json
{
  "healthy": true,
  "status": "OK",
  "isRunning": false,
  "lastRunTime": "2025-10-28T10:30:00.000Z",
  "timeSinceLastRun": 1800000,
  "stats": {
    "totalExpired": 50,
    "totalRecurrencesExpired": 10,
    "totalCleaned": 120,
    "totalNotifications": 35,
    "successfulRuns": 48,
    "failedRuns": 2
  },
  "timestamp": "2025-10-28T11:00:00.000Z"
}
```

---

## ⚙️ Configuration recommandée

### Production

```javascript
// Planification recommandée en production
const PRODUCTION_SCHEDULE = {
  // Vérification des expirations : toutes les heures
  verificationExpiration: '0 * * * *',
  
  // Notifications : toutes les 30 minutes
  notifications: '*/30 * * * *',
  
  // Nettoyage complet : tous les jours à 3h du matin
  nettoyageComplet: '0 3 * * *'
};
```

### Développement

```javascript
// Planification recommandée en développement
const DEV_SCHEDULE = {
  // Vérification manuelle uniquement
  automatic: false
};
```

---

## 🐛 Gestion des erreurs

### Erreurs de validation

```javascript
try {
  await trajetExpirationService.nettoyerVieuxTrajets(400);
} catch (error) {
  // Error: joursAGarder doit être entre 1 et 365
  console.error(error.message);
}
```

### Erreurs de timeout

```javascript
// Le service détecte automatiquement les maintenances bloquées
// et les réinitialise après 15 minutes
```

### Erreurs de base de données

```javascript
// Le service réessaye automatiquement 3 fois
// avec un délai croissant entre chaque tentative
```

---

## 📈 Monitoring

### Métriques à surveiller

1. **successfulRuns / failedRuns** : Taux de réussite
2. **lastRunTime** : Dernière exécution (< 24h)
3. **timeSinceLastRun** : Temps depuis dernière exec
4. **isRunning + uptime** : Détection de blocages
5. **totalExpired** : Nombre de trajets expirés
6. **totalNotifications** : Notifications envoyées

### Alertes recommandées

- ⚠️ `failedRuns > 3` : Problème persistant
- ⚠️ `timeSinceLastRun > 24h` : Service arrêté
- ⚠️ `isRunning + uptime > 15min` : Maintenance bloquée
- ⚠️ `totalExpired > 100` : Accumulation anormale

---

## 🔐 Sécurité

### Routes d'administration

```javascript
// Toujours protéger les routes d'administration
router.use(authMiddleware);
router.use(adminMiddleware);
```

### Logs sensibles

```javascript
// Ne pas logger de données sensibles
logger.info('Trajet expiré', { 
  trajetId: trajet._id,
  // Ne pas logger: conducteur, passagers, etc.
});
```

---

## 🎯 Checklist de déploiement

- [ ] Service installé et testé
- [ ] Planification cron configurée
- [ ] Routes d'administration protégées
- [ ] Monitoring configuré
- [ ] Alertes configurées
- [ ] Logs vérifiés
- [ ] Tests de charge effectués
- [ ] Documentation à jour
- [ ] Backup des données configuré

---

## 📚 Ressources

- [node-cron documentation](https://www.npmjs.com/package/node-cron)
- [Winston logger](https://www.npmjs.com/package/winston)
- [PM2 process manager](https://pm2.keymetrics.io/)

---

**Version** : 2.0.0  
**Date** : 28 octobre 2025  
**Auteur** : Équipe Covoiturage