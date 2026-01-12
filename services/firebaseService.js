const admin = require('firebase-admin');
const path = require('path');

/**
 * 🔥 SERVICE FIREBASE CLOUD MESSAGING POUR WAYZ-ECO
 * 
 * Gère l'envoi des notifications push via Firebase FCM
 * - Notifications individuelles et groupées
 * - Gestion automatique des tokens invalides
 * - 12 types de notifications prédéfinies
 * - Vérification des préférences utilisateur
 * 
 * @requires firebase-admin
 * @requires FIREBASE_ENABLED dans .env
 * @requires serviceAccountKey.json dans config/
 */

class FirebaseService {
  constructor() {
    this.enabled = process.env.FIREBASE_ENABLED === 'true';
    this.messaging = null;
    
    if (!this.enabled) {
      console.log('⚠️  Firebase Service désactivé - Mode: DÉVELOPPEMENT');
      return;
    }
    
    try {
      // 🔧 Chemin vers le fichier de configuration
      const serviceAccountPath = path.resolve(
        process.env.FIREBASE_SERVICE_ACCOUNT_PATH || './config/serviceAccountKey.json'
      );
      
      console.log('🔧 Chargement Firebase config depuis:', serviceAccountPath);
      
      const serviceAccount = require(serviceAccountPath);
      
      // 🚀 Initialiser Firebase Admin SDK
      admin.initializeApp({
        credential: admin.credential.cert(serviceAccount),
        databaseURL: process.env.FIREBASE_DATABASE_URL
      });
      
      this.messaging = admin.messaging();
      
      console.log('✅ Firebase Cloud Messaging initialisé - Mode: PRODUCTION');
      console.log('   - Project ID:', serviceAccount.project_id);
      
    } catch (error) {
      console.error('❌ Erreur initialisation Firebase:', error.message);
      console.error('   - Vérifiez que serviceAccountKey.json existe dans config/');
      this.enabled = false;
    }
  }

  /**
   * ===============================================
   * MÉTHODES D'ENVOI DE BASE
   * ===============================================
   */

  /**
   * Envoyer une notification à un token FCM spécifique
   * 
   * @param {String} token - Token FCM du device
   * @param {Object} notification - Objet notification
   * @param {String} notification.title - Titre
   * @param {String} notification.message - Message
   * @param {Object} notification.data - Données additionnelles
   * @param {String} notification.imageUrl - URL image (optionnel)
   * @param {String} notification.channelId - Channel Android (optionnel)
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async sendToToken(token, notification) {
    if (!this.enabled) {
      console.log('⚠️  Firebase désactivé - Notification simulée:', {
        token: token.substring(0, 20) + '...',
        title: notification.title
      });
      return { success: false, reason: 'disabled' };
    }

    try {
      // 📦 Construction du message FCM
      const message = {
        notification: {
          title: notification.title,
          body: notification.message
        },
        data: this._convertDataToStrings(notification.data || {}),
        token: token
      };

      // 🖼️ Ajouter l'image si présente
      if (notification.imageUrl) {
        message.notification.imageUrl = notification.imageUrl;
      }

      // 🤖 Configuration Android
      message.android = {
        priority: 'high',
        notification: {
          channelId: notification.channelId || 'default',
          sound: 'default',
          priority: 'high',
          defaultSound: true,
          defaultVibrateTimings: true
        }
      };

      // 🍎 Configuration iOS
      message.apns = {
        payload: {
          aps: {
            sound: 'default',
            badge: 1,
            contentAvailable: true,
            mutableContent: true
          }
        }
      };

      // 📤 Envoi
      const response = await this.messaging.send(message);
      
      console.log('✅ Notification Firebase envoyée:', {
        messageId: response,
        token: token.substring(0, 20) + '...',
        title: notification.title
      });
      
      return { 
        success: true, 
        messageId: response 
      };
      
    } catch (error) {
      console.error('❌ Erreur envoi notification Firebase:', {
        error: error.message,
        code: error.code,
        token: token.substring(0, 20) + '...'
      });
      
      return { 
        success: false, 
        error: error.message,
        code: error.code,
        isInvalidToken: this.isInvalidToken(error)
      };
    }
  }

  /**
   * Envoyer une notification à plusieurs tokens
   * 
   * @param {Array<String>} tokens - Array de tokens FCM
   * @param {Object} notification - Objet notification
   * @returns {Promise<Object>} Résultat avec tokens invalides
   */
  async sendToMultipleTokens(tokens, notification) {
    if (!this.enabled) {
      console.log('⚠️  Firebase désactivé - Notifications multiples simulées:', tokens.length);
      return { success: false, reason: 'disabled' };
    }

    if (!tokens || tokens.length === 0) {
      return { 
        success: false, 
        error: 'Aucun token fourni' 
      };
    }

    // Limiter à 500 tokens par batch (limite FCM)
    const batchSize = 500;
    if (tokens.length > batchSize) {
      console.warn(`⚠️  ${tokens.length} tokens - Envoi par batches de ${batchSize}`);
    }

    try {
      // 📦 Construction du message
      const message = {
        notification: {
          title: notification.title,
          body: notification.message
        },
        data: this._convertDataToStrings(notification.data || {}),
        android: {
          priority: 'high',
          notification: {
            channelId: notification.channelId || 'default',
            sound: 'default',
            priority: 'high'
          }
        },
        apns: {
          payload: {
            aps: {
              sound: 'default',
              badge: 1,
              contentAvailable: true
            }
          }
        }
      };

      if (notification.imageUrl) {
        message.notification.imageUrl = notification.imageUrl;
      }

      // 📤 Envoi multicast
      const response = await this.messaging.sendEachForMulticast({
        tokens: tokens.slice(0, batchSize),
        ...message
      });

      console.log('✅ Notifications multiples envoyées:', {
        successCount: response.successCount,
        failureCount: response.failureCount,
        totalTokens: tokens.length
      });

      // 🗑️ Collecter les tokens invalides pour nettoyage
      const invalidTokens = [];
      if (response.responses) {
        response.responses.forEach((resp, idx) => {
          if (!resp.success && this.isInvalidToken(resp.error)) {
            invalidTokens.push(tokens[idx]);
          }
        });
      }

      if (invalidTokens.length > 0) {
        console.log('🗑️  Tokens invalides détectés:', invalidTokens.length);
      }

      return {
        success: true,
        successCount: response.successCount,
        failureCount: response.failureCount,
        invalidTokens: invalidTokens
      };

    } catch (error) {
      console.error('❌ Erreur notifications multiples:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Envoyer à un utilisateur (gère plusieurs tokens automatiquement)
   * 
   * @param {String} userId - ID MongoDB de l'utilisateur
   * @param {Object} notification - Objet notification
   * @param {Model} Utilisateur - Modèle Mongoose Utilisateur
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async sendToUser(userId, notification, Utilisateur) {
    try {
      const utilisateur = await Utilisateur.findById(userId);
      
      if (!utilisateur) {
        return { 
          success: false, 
          error: 'Utilisateur non trouvé' 
        };
      }

      // ✅ Vérifier les préférences de notifications
      const type = notification.type || 'general';
      if (!utilisateur.notificationsActivees(type)) {
        console.log('⚠️  Notifications désactivées pour:', {
          userId: userId,
          type: type
        });
        return { 
          success: false, 
          reason: 'notifications_disabled' 
        };
      }

      // 📱 Récupérer tous les tokens actifs
      const tokens = utilisateur.getTokensActifs();
      
      if (tokens.length === 0) {
        console.log('⚠️  Aucun token FCM actif pour user:', userId);
        return { 
          success: false, 
          error: 'Aucun token FCM disponible' 
        };
      }

      console.log(`📤 Envoi notification à ${tokens.length} device(s)`);

      // 📤 Envoyer à tous les tokens
      const result = await this.sendToMultipleTokens(tokens, notification);

      // 🗑️ Nettoyer automatiquement les tokens invalides
      if (result.invalidTokens && result.invalidTokens.length > 0) {
        console.log('🗑️  Nettoyage automatique:', result.invalidTokens.length, 'tokens invalides');
        
        for (const token of result.invalidTokens) {
          await utilisateur.supprimerFCMToken(token);
        }
      }

      return result;

    } catch (error) {
      console.error('❌ Erreur sendToUser:', error);
      return { 
        success: false, 
        error: error.message 
      };
    }
  }

  /**
 * Envoyer une notification à plusieurs utilisateurs
 * 
 * @param {Array<String>} userIds - IDs MongoDB des utilisateurs
 * @param {Object} notification - Objet notification
 * @param {Model} Utilisateur - Modèle Mongoose
 * @returns {Promise<Object>} Résultats agrégés
 */
async sendToMultipleUsers(userIds, notification, Utilisateur) {
  if (!this.enabled) {
    console.log('⚠️  Firebase désactivé - Notifications multiples simulées');
    return { 
      success: false, 
      reason: 'disabled',
      successCount: 0,
      failureCount: 0
    };
  }

  if (!userIds || userIds.length === 0) {
    return { 
      success: false, 
      error: 'Aucun utilisateur fourni',
      successCount: 0,
      failureCount: 0
    };
  }

  try {
    const results = {
      successCount: 0,
      failureCount: 0,
      details: []
    };

    console.log(`📤 Envoi notification à ${userIds.length} utilisateur(s)`);

    // Traiter chaque utilisateur séquentiellement
    for (const userId of userIds) {
      try {
        const result = await this.sendToUser(userId, notification, Utilisateur);
        
        if (result.success) {
          results.successCount += result.successCount || 1;
        } else {
          results.failureCount += result.failureCount || 1;
        }

        results.details.push({
          userId: userId.toString(),
          success: result.success,
          reason: result.reason || result.error,
          tokensUsed: result.successCount || 0
        });
        
      } catch (userError) {
        console.error(`❌ Erreur pour userId ${userId}:`, userError.message);
        results.failureCount++;
        results.details.push({
          userId: userId.toString(),
          success: false,
          reason: userError.message
        });
      }
    }

    console.log(`✅ Notifications multiples terminées:`, {
      total: userIds.length,
      success: results.successCount,
      failed: results.failureCount
    });

    return {
      success: results.successCount > 0,
      ...results
    };

  } catch (error) {
    console.error('❌ Erreur sendToMultipleUsers:', error);
    return {
      success: false,
      error: error.message,
      successCount: 0,
      failureCount: userIds.length
    };
  }
}
  /**
   * ===============================================
   * NOTIFICATIONS PRÉDÉFINIES POUR WAYZ-ECO
   * ===============================================
   */

  /**
   * 🚗 NOUVEAU TRAJET - Pour conducteur
   */
  async notifyNewRide(driverId, rideData, Utilisateur) {
    return this.sendToUser(
      driverId,
      {
        title: '🚗 Nouvelle course disponible',
        message: `De ${rideData.depart} vers ${rideData.arrivee}`,
        data: {
          type: 'NEW_RIDE',
          rideId: rideData.rideId,
          depart: rideData.depart,
          arrivee: rideData.arrivee,
          screen: 'RideDetails'
        },
        channelId: 'trajets',
        type: 'trajets'
      },
      Utilisateur
    );
  }

  /**
   * ✅ RÉSERVATION CONFIRMÉE - Pour passager
   */
  async notifyReservationConfirmed(userId, reservationData, Utilisateur) {
    return this.sendToUser(
      userId,
      {
        title: '✅ Réservation confirmée',
        message: `Votre trajet vers ${reservationData.destination} est confirmé`,
        data: {
          type: 'RESERVATION_CONFIRMED',
          reservationId: reservationData.reservationId,
          trajetId: reservationData.trajetId,
          destination: reservationData.destination,
          screen: 'ReservationDetails'
        },
        channelId: 'reservations',
        type: 'reservations'
      },
      Utilisateur
    );
  }

  /**
   * 💳 PAIEMENT RÉUSSI
   */
  async notifyPaymentSuccess(userId, paymentData, Utilisateur) {
    return this.sendToUser(
      userId,
      {
        title: '💳 Paiement réussi',
        message: `Votre paiement de ${paymentData.montant} FCFA a été effectué`,
        data: {
          type: 'PAYMENT_SUCCESS',
          transactionId: paymentData.transactionId,
          montant: String(paymentData.montant),
          methode: paymentData.methode,
          screen: 'PaymentHistory'
        },
        channelId: 'paiements',
        type: 'paiements'
      },
      Utilisateur
    );
  }

  /**
   * ❌ PAIEMENT ÉCHOUÉ
   */
  async notifyPaymentFailed(userId, paymentData, Utilisateur) {
    return this.sendToUser(
      userId,
      {
        title: '❌ Paiement échoué',
        message: `Le paiement de ${paymentData.montant} FCFA a échoué`,
        data: {
          type: 'PAYMENT_FAILED',
          transactionId: paymentData.transactionId,
          montant: String(paymentData.montant),
          reason: paymentData.reason || 'Erreur de traitement',
          screen: 'Recharge'
        },
        channelId: 'paiements',
        type: 'paiements'
      },
      Utilisateur
    );
  }

  /**
   * 🎉 CONDUCTEUR VALIDÉ
   */
  async notifyDriverValidated(userId, Utilisateur) {
    return this.sendToUser(
      userId,
      {
        title: '🎉 Compte conducteur validé !',
        message: 'Félicitations ! Vous pouvez maintenant créer des trajets',
        data: {
          type: 'DRIVER_VALIDATED',
          screen: 'DriverDashboard'
        },
        channelId: 'trajets',
        type: 'trajets'
      },
      Utilisateur
    );
  }

  /**
   * ❌ CONDUCTEUR REJETÉ
   */
  async notifyDriverRejected(userId, reason, Utilisateur) {
    return this.sendToUser(
      userId,
      {
        title: '❌ Demande conducteur refusée',
        message: `Raison: ${reason}`,
        data: {
          type: 'DRIVER_REJECTED',
          reason: reason,
          screen: 'Profile'
        },
        channelId: 'trajets',
        type: 'trajets'
      },
      Utilisateur
    );
  }

  /**
   * ⚠️ COURSE ANNULÉE
   */
  async notifyRideCancelled(userId, rideData, Utilisateur) {
    return this.sendToUser(
      userId,
      {
        title: '⚠️ Course annulée',
        message: `La course vers ${rideData.destination} a été annulée`,
        data: {
          type: 'RIDE_CANCELLED',
          rideId: rideData.rideId,
          reason: rideData.reason || 'Non spécifié',
          destination: rideData.destination
        },
        channelId: 'reservations',
        type: 'reservations'
      },
      Utilisateur
    );
  }

  /**
   * 🕐 COURSE BIENTÔT - Rappel 1h avant
   */
  async notifyRideStartingSoon(userId, rideData, Utilisateur) {
    return this.sendToUser(
      userId,
      {
        title: '🕐 Course dans 1 heure',
        message: `N'oubliez pas ! Course vers ${rideData.destination} à ${rideData.heureDepart}`,
        data: {
          type: 'RIDE_REMINDER',
          rideId: rideData.rideId,
          destination: rideData.destination,
          heureDepart: rideData.heureDepart,
          screen: 'RideDetails'
        },
        channelId: 'trajets',
        type: 'trajets'
      },
      Utilisateur
    );
  }

  /**
   * ⚠️ SOLDE FAIBLE
   */
  async notifyLowBalance(userId, balance, Utilisateur) {
    return this.sendToUser(
      userId,
      {
        title: '⚠️ Solde faible',
        message: `Votre solde est de ${balance} FCFA. Pensez à recharger`,
        data: {
          type: 'LOW_BALANCE',
          balance: String(balance),
          screen: 'Recharge'
        },
        channelId: 'paiements',
        type: 'paiements'
      },
      Utilisateur
    );
  }

  /**
   * 🎁 CODE PROMO
   */
  async notifyPromoCode(userId, promoData, Utilisateur) {
    return this.sendToUser(
      userId,
      {
        title: '🎁 Code promo disponible !',
        message: `Utilisez ${promoData.code} pour ${promoData.reduction}% de réduction`,
        data: {
          type: 'PROMO_CODE',
          code: promoData.code,
          reduction: String(promoData.reduction),
          dateExpiration: promoData.dateExpiration,
          screen: 'PromoCode'
        },
        channelId: 'promotions',
        type: 'promotions'
      },
      Utilisateur
    );
  }

  /**
   * ⭐ NOUVELLE NOTE
   */
  async notifyNewRating(userId, ratingData, Utilisateur) {
    const starsEmoji = '⭐'.repeat(ratingData.stars);
    
    return this.sendToUser(
      userId,
      {
        title: '⭐ Nouvelle évaluation',
        message: `${starsEmoji} (${ratingData.stars}/5)${ratingData.comment ? ': ' + ratingData.comment : ''}`,
        data: {
          type: 'NEW_RATING',
          rating: String(ratingData.stars),
          comment: ratingData.comment || '',
          trajetId: ratingData.trajetId,
          screen: 'Ratings'
        },
        channelId: 'trajets',
        type: 'trajets'
      },
      Utilisateur
    );
  }

  /**
   * 💬 NOUVEAU MESSAGE
   */
  async notifyNewMessage(userId, messageData, Utilisateur) {
    return this.sendToUser(
      userId,
      {
        title: '💬 Nouveau message',
        message: `${messageData.senderName}: ${messageData.preview}`,
        data: {
          type: 'NEW_MESSAGE',
          conversationId: messageData.conversationId,
          senderId: messageData.senderId,
          senderName: messageData.senderName,
          screen: 'Chat'
        },
        channelId: 'messages',
        type: 'messages'
      },
      Utilisateur
    );
  }

  /**
   * ===============================================
   * MÉTHODES UTILITAIRES
   * ===============================================
   */

  /**
   * Vérifier si une erreur indique un token invalide
   */
  isInvalidToken(error) {
    if (!error) return false;
    
    const invalidCodes = [
      'messaging/invalid-registration-token',
      'messaging/registration-token-not-registered',
      'messaging/invalid-argument'
    ];
    
    return invalidCodes.includes(error.code);
  }

  /**
   * Convertir les données en strings (requis par FCM)
   */
  _convertDataToStrings(data) {
    const stringData = {};
    
    for (const [key, value] of Object.entries(data)) {
      if (value !== null && value !== undefined) {
        stringData[key] = String(value);
      }
    }
    
    return stringData;
  }

  /**
   * Vérifier si Firebase est activé
   */
  isEnabled() {
    return this.enabled;
  }

  /**
   * Obtenir les statistiques du service
   */
  getStats() {
    return {
      enabled: this.enabled,
      service: 'Firebase Cloud Messaging',
      sdk: this.enabled ? 'Initialisé' : 'Non initialisé'
    };
  }
}

// 📤 Export du service en singleton
module.exports = new FirebaseService();