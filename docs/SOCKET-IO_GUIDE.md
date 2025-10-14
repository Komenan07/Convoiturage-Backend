# Guide d'intégration Socket.IO pour l'application de Covoiturage

Ce guide explique comment installer, configurer et utiliser Socket.IO dans votre application de covoiturage pour les communications en temps réel.

## Installation

### 1. Installer les dépendances

```bash
npm install socket.io jsonwebtoken nodemailer
```

Si vous souhaitez utiliser les notifications push via Firebase:

```bash
npm install firebase-admin
```

### 2. Structure des fichiers

Voici la structure des fichiers à créer:

```
votre-projet/
├── realtime/
│   ├── socket.js                # Initialisation de Socket.IO
│   └── socketEventService.js    # Service d'événements (OPTIONNEL - intégré dans socket.js)
├── services/
│   ├── presenceService.js       # Service de gestion de la présence en ligne
│   ├── locationService.js       # Service de gestion des positions en temps réel
│   └── notificationService.js   # Service de gestion des notifications
└── examples/
    └── clientSocketExample.js   # Exemple d'utilisation côté client
```

### 3. Configuration des variables d'environnement

Ajoutez ces variables à votre fichier `.env`:

```
# Socket.IO
CORS_ORIGIN=*                # Utilisez un domaine spécifique en production

# Email (optionnel)
EMAIL_HOST=smtp.example.com
EMAIL_PORT=587
EMAIL_USER=your-email@example.com
EMAIL_PASSWORD=your-password
EMAIL_SECURE=false
EMAIL_FROM=noreply@example.com
APP_NAME=Covoiturage CI

# Firebase (optionnel)
FIREBASE_ENABLED=false
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=your-client-email
FIREBASE_PRIVATE_KEY="your-private-key"
```

## Utilisation

### 1. Intégration dans votre application

Votre fichier `server.js` contient déjà le code pour initialiser Socket.IO:

```javascript
// Initialiser Socket.io
try {
  const { initSocket } = require('./realtime/socket');
  initSocket(server, app);
  console.log('✅ Socket.io initialisé');
} catch (e) {
  console.warn('⚠️ Socket.io non initialisé:', e.message);
}
```

### 2. Utilisation côté serveur

Vous pouvez accéder à l'instance Socket.IO depuis n'importe quelle route Express:

```javascript
// Dans une route Express
router.post('/api/example', (req, res) => {
  const io = req.app.get('io');
  
  // Émettre un événement à un utilisateur spécifique
  const userId = 'user-id';
  const userRoom = `user:${userId}`;
  io.to(userRoom).emit('notification', { message: 'Nouvelle notification' });
  
  res.json({ success: true });
});
```

### 3. Utilisation côté client

#### Web (JavaScript)

```html
<script src="https://cdn.socket.io/4.5.4/socket.io.min.js"></script>
<script>
  // Initialisation
  const socket = io('http://localhost:3000', {
    auth: {
      token: 'votre-token-jwt'
    }
  });
  
  // Gérer la connexion
  socket.on('connect', () => {
    console.log('Connecté au serveur');
  });
  
  // Écouter les événements
  socket.on('new_message', (data) => {
    console.log('Nouveau message:', data);
  });
  
  // Émettre des événements
  socket.emit('send_message', {
    conversationId: 'id-conversation',
    destinataireId: 'id-destinataire',
    contenu: 'Bonjour',
    typeMessage: 'TEXTE'
  }, (response) => {
    console.log('Réponse:', response);
  });
</script>
```

#### Mobile (React Native)

Installez la bibliothèque:

```bash
npm install socket.io-client
```

Utilisez-la dans votre application:

```javascript
import { io } from 'socket.io-client';
import { getAuthToken } from './auth'; // Votre fonction pour récupérer le token

// Initialisation
const initSocket = async () => {
  const token = await getAuthToken();
  
  const socket = io('http://votre-api-url.com', {
    auth: { token },
    transports: ['websocket'],
    reconnection: true
  });
  
  // Configurer les écouteurs d'événements
  socket.on('connect', () => {
    console.log('Connecté au serveur');
  });
  
  socket.on('new_message', (data) => {
    console.log('Nouveau message:', data);
    // Mettre à jour l'état de l'application
  });
  
  return socket;
};

// Utilisation
const sendMessage = (socket, conversationId, destinataireId, message) => {
  return new Promise((resolve, reject) => {
    socket.emit('send_message', {
      conversationId,
      destinataireId,
      contenu: message,
      typeMessage: 'TEXTE'
    }, (response) => {
      if (response.success) {
        resolve(response);
      } else {
        reject(new Error(response.error || 'Erreur inconnue'));
      }
    });
  });
};
```

## Événements disponibles

### Événements de chat
- `send_message` (client → serveur) : Envoyer un message
- `new_message` (serveur → client) : Recevoir un nouveau message
- `typing_start` (client → serveur) : Indiquer qu'on commence à taper
- `typing_end` (client → serveur) : Indiquer qu'on a arrêté de taper
- `user_typing` (serveur → client) : Notification qu'un utilisateur est en train de taper
- `user_stopped_typing` (serveur → client) : Notification qu'un utilisateur a arrêté de taper
- `mark_as_read` (client → serveur) : Marquer un message comme lu
- `message_read` (serveur → client) : Notification qu'un message a été lu

### Événements de réservation
- `create_reservation` (client → serveur) : Créer une réservation
- `reservation_created` (serveur → client) : Notification d'une nouvelle réservation
- `confirm_reservation` (client → serveur) : Confirmer une réservation
- `reservation_confirmed` (serveur → client) : Notification de confirmation de réservation
- `reject_reservation` (client → serveur) : Refuser une réservation
- `reservation_rejected` (serveur → client) : Notification de refus de réservation
- `cancel_reservation` (client → serveur) : Annuler une réservation
- `reservation_cancelled` (serveur → client) : Notification d'annulation de réservation

### Événements de trajet
- `trajet:join` (client → serveur) : Rejoindre le suivi d'un trajet
- `trajet:leave` (client → serveur) : Quitter le suivi d'un trajet
- `start_trajet` (client → serveur) : Démarrer un trajet
- `trajet_started` (serveur → client) : Notification de démarrage de trajet
- `update_location` (client → serveur) : Mettre à jour la position
- `trajet_location_update` (serveur → client) : Notification de mise à jour de position
- `pickup_passenger` (client → serveur) : Indiquer la prise en charge d'un passager
- `passenger_pickup` (serveur → client) : Notification de prise en charge d'un passager
- `dropoff_passenger` (client → serveur) : Indiquer la dépose d'un passager
- `passenger_dropoff` (serveur → client) : Notification de dépose d'un passager
- `complete_trajet` (client → serveur) : Terminer un trajet
- `trajet_completed` (serveur → client) : Notification de fin de trajet

### Événements d'urgence
- `trigger_emergency` (client → serveur) : Déclencher une alerte d'urgence
- `emergency_alert` (serveur → client) : Notification d'alerte d'urgence
- `resolve_emergency` (client → serveur) : Résoudre une alerte d'urgence
- `emergency_resolved` (serveur → client) : Notification de résolution d'urgence

### Événements de paiement
- `update_payment` (client → serveur) : Mettre à jour un paiement
- `payment_updated` (serveur → client) : Notification de mise à jour de paiement
- `payment_completed` (client → serveur) : Finaliser un paiement
- `payment_completed` (serveur → client) : Notification de finalisation de paiement

### Événements système
- `ping` (client → serveur) : Maintenir la connexion active
- `pong` (serveur → client) : Réponse au ping
- `users:online` (client → serveur) : Demander les utilisateurs en ligne
- `user_online` (serveur → client) : Notification qu'un utilisateur est en ligne
- `user_offline` (serveur → client) : Notification qu'un utilisateur est hors ligne

## Salles (Rooms)

Socket.IO utilise des "salles" pour regrouper les connexions. Voici les salles utilisées dans cette implémentation:

- `user:{userId}` : Salle personnelle de l'utilisateur (pour les messages directs)
- `conversation:{conversationId}` : Salle de conversation
- `trajet:{trajetId}` : Salle de trajet (pour les mises à jour en temps réel)

## Dépannage

### Problèmes de connexion

1. **Vérifiez les CORS** : Assurez-vous que les paramètres CORS sont correctement configurés.
2. **Vérifiez l'authentification** : Assurez-vous que le token JWT est valide.
3. **Vérifiez les logs serveur** : Les erreurs sont souvent visibles dans les logs.

### Messages non reçus

1. **Vérifiez que l'utilisateur a rejoint la bonne salle** : Utilisez `socket.rooms` pour vérifier.
2. **Vérifiez les émetteurs et récepteurs** : Assurez-vous que les IDs sont corrects.
3. **Vérifiez la connexion** : Assurez-vous que la connexion est établie.

## Sécurité

Quelques bonnes pratiques de sécurité:

1. **Limitez l'origine CORS** en production: Utilisez `CORS_ORIGIN=https://votre-domaine.com`.
2. **Validez toutes les entrées** : Ne faites jamais confiance aux données client.
3. **Limitez les requêtes** : Implémentez un système de limitation de requêtes pour éviter les abus.
4. **Gardez les tokens JWT sécurisés** : Stockez-les de manière sécurisée côté client (par exemple, dans le stockage sécurisé sur mobile).
5. **Chiffrez les données sensibles** : Utilisez HTTPS pour toutes les communications.

## Évolution

Pour faire évoluer cette implémentation:

1. **Ajoutez des événements spécifiques** à votre application
2. **Implémentez un système de notifications push** plus avancé
3. **Utilisez Redis comme adaptateur** pour le scaling horizontal
4. **Ajoutez des statistiques en temps réel** pour les administrateurs
5. **Implémentez un système de présence plus sophistiqué** avec des statuts personnalisés

## Ressources supplémentaires

- [Documentation Socket.IO](https://socket.io/docs/v4/)
- [Documentation Socket.IO Client](https://socket.io/docs/v4/client-api/)
- [JWT Authentication](https://jwt.io/introduction/)
- [Firebase Cloud Messaging](https://firebase.google.com/docs/cloud-messaging)