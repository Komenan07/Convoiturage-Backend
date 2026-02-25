// routes/notifications.js
const express = require('express');
const router = express.Router();
const Utilisateur = require('../models/Utilisateur');
const Trajet = require('../models/Trajet');  
const Reservation = require('../models/Reservation');
const firebaseService = require('../services/firebaseService');
const { authMiddleware } = require('../middlewares/authMiddleware');
const { logger } = require('../utils/logger');

/**
 * ═══════════════════════════════════════════════════════════════
 * 🔥 ROUTES NOTIFICATIONS FIREBASE - WAYZ-ECO Côte d'Ivoire
 * ═══════════════════════════════════════════════════════════════
 * 
 * Gestion complète des notifications push via Firebase Cloud Messaging
 * spécialement adaptée pour une application de covoiturage en CI
 * 
 * Fonctionnalités :
 * - Enregistrement/suppression des tokens FCM
 * - Gestion des préférences de notifications
 * - Notifications de proximité (conducteur proche)
 * - Alertes d'urgence (sécurité)
 * - Notifications de groupe (broadcast aux passagers)
 * - Support multilingue (FR, EN, Baoulé, Dioula)
 * - Tests et monitoring
 */

// ═══════════════════════════════════════════════════════════════
// 📝 GESTION DES TOKENS FCM
// ═══════════════════════════════════════════════════════════════

/**
 * @route   POST /api/notifications/register-token
 * @desc    Enregistrer un token FCM pour recevoir des notifications
 * @access  Private
 */
router.post('/register-token', authMiddleware, async (req, res) => {
  try {
    const { fcmToken, deviceType, deviceInfo } = req.body;
    const userId = req.user.userId || req.user.id;
    
    if (!fcmToken || typeof fcmToken !== 'string' || fcmToken.trim().length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Token FCM requis et doit être une chaîne valide',
        code: 'INVALID_FCM_TOKEN'
      });
    }
    
    const utilisateur = await Utilisateur.findById(userId);
    
    if (!utilisateur) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }
    
    const result = await utilisateur.enregistrerFCMToken(fcmToken, {
      deviceType: deviceType || 'android',
      model: deviceInfo?.model || 'Unknown',
      os: deviceInfo?.os || 'Unknown',
      appVersion: deviceInfo?.appVersion || '1.0.0'
    });
    
    if (!result.success) {
      logger.error('Échec enregistrement token FCM', {
        userId,
        error: result.message
      });
      
      return res.status(500).json({
        success: false,
        message: result.message || 'Erreur lors de l\'enregistrement du token',
        code: 'TOKEN_REGISTRATION_FAILED'
      });
    }
    
    logger.info('✅ Token FCM enregistré', {
      userId: utilisateur._id,
      email: utilisateur.email,
      deviceType: deviceType || 'android',
      tokensCount: utilisateur.fcmTokens.length
    });
    
    res.status(200).json({
      success: true,
      message: 'Token FCM enregistré avec succès',
      data: {
        tokensCount: utilisateur.fcmTokens.length,
        deviceType: deviceType || 'android'
      }
    });
    
  } catch (error) {
    logger.error('❌ Erreur enregistrement token FCM:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'enregistrement du token',
      code: 'SERVER_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/notifications/unregister-token
 * @desc    Désactiver un token FCM (lors de la déconnexion)
 * @access  Private
 */
router.post('/unregister-token', authMiddleware, async (req, res) => {
  try {
    const { fcmToken } = req.body;
    const userId = req.user.userId || req.user.id;
    
    if (!fcmToken) {
      return res.status(400).json({
        success: false,
        message: 'Token FCM requis',
        code: 'MISSING_FCM_TOKEN'
      });
    }
    
    const utilisateur = await Utilisateur.findById(userId);
    
    if (!utilisateur) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }
    
    const result = await utilisateur.desactiverFCMToken(fcmToken);
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.message || 'Erreur lors de la désactivation du token',
        code: 'TOKEN_DEACTIVATION_FAILED'
      });
    }
    
    logger.info('🗑️ Token FCM désactivé', {
      userId: utilisateur._id,
      activeTokensCount: utilisateur.fcmTokens.filter(t => t.actif).length
    });
    
    res.status(200).json({
      success: true,
      message: 'Token désactivé avec succès',
      data: {
        activeTokensCount: utilisateur.fcmTokens.filter(t => t.actif).length
      }
    });
    
  } catch (error) {
    logger.error('❌ Erreur désactivation token:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la désactivation du token',
      code: 'SERVER_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   DELETE /api/notifications/token/:token
 * @desc    Supprimer définitivement un token FCM
 * @access  Private
 */
router.delete('/token/:token', authMiddleware, async (req, res) => {
  try {
    const { token } = req.params;
    const userId = req.user.userId || req.user.id;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token requis dans l\'URL',
        code: 'MISSING_TOKEN_PARAM'
      });
    }
    
    const utilisateur = await Utilisateur.findById(userId);
    
    if (!utilisateur) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }
    
    const result = await utilisateur.supprimerFCMToken(token);
    
    if (!result.success) {
      return res.status(500).json({
        success: false,
        message: result.message || 'Erreur lors de la suppression du token',
        code: 'TOKEN_DELETION_FAILED'
      });
    }
    
    logger.info('🗑️ Token FCM supprimé définitivement', {
      userId: utilisateur._id,
      remainingTokens: utilisateur.fcmTokens.length
    });
    
    res.status(200).json({
      success: true,
      message: 'Token supprimé avec succès',
      data: {
        remainingTokens: utilisateur.fcmTokens.length
      }
    });
    
  } catch (error) {
    logger.error('❌ Erreur suppression token:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la suppression du token',
      code: 'SERVER_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/notifications/tokens
 * @desc    Récupérer la liste des tokens FCM de l'utilisateur
 * @access  Private
 */
router.get('/tokens', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const utilisateur = await Utilisateur.findById(userId)
      .select('fcmTokens');
    
    if (!utilisateur) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }
    
    const tokensFormatted = (utilisateur.fcmTokens || []).map(t => ({
      id: t._id,
      deviceType: t.deviceType,
      deviceInfo: t.deviceInfo,
      dateAjout: t.dateAjout,
      derniereActivite: t.derniereActivite,
      actif: t.actif,
      tokenPreview: t.token ? `${t.token.substring(0, 20)}...` : null
    }));
    
    res.status(200).json({
      success: true,
      data: {
        tokens: tokensFormatted,
        activeTokensCount: utilisateur.fcmTokens?.filter(t => t.actif).length || 0,
        totalTokensCount: utilisateur.fcmTokens?.length || 0
      }
    });
    
  } catch (error) {
    logger.error('❌ Erreur récupération tokens:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des tokens',
      code: 'SERVER_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// ⚙️ GESTION DES PRÉFÉRENCES
// ═══════════════════════════════════════════════════════════════

/**
 * @route   PUT /api/notifications/preferences
 * @desc    Mettre à jour les préférences de notifications
 * @access  Private
 */
router.put('/preferences', authMiddleware, async (req, res) => {
  try {
    const preferences = req.body;
    const userId = req.user.userId || req.user.id;
    
    if (!preferences || Object.keys(preferences).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Aucune préférence fournie',
        code: 'NO_PREFERENCES_PROVIDED'
      });
    }
    
    const clefsValides = ['activees', 'reservations', 'paiements', 'trajets', 'promotions', 'messages'];
    const clefsInvalides = Object.keys(preferences).filter(k => !clefsValides.includes(k));
    
    if (clefsInvalides.length > 0) {
      return res.status(400).json({
        success: false,
        message: `Clés invalides: ${clefsInvalides.join(', ')}`,
        code: 'INVALID_PREFERENCE_KEYS',
        validKeys: clefsValides
      });
    }
    
    const utilisateur = await Utilisateur.findById(userId);
    
    if (!utilisateur) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }
    
    if (!utilisateur.preferencesNotifications) {
      utilisateur.preferencesNotifications = {
        activees: true,
        reservations: true,
        paiements: true,
        trajets: true,
        promotions: true,
        messages: true
      };
    }
    
    utilisateur.preferencesNotifications = {
      ...utilisateur.preferencesNotifications,
      ...preferences
    };
    
    await utilisateur.save();
    
    logger.info('✅ Préférences notifications mises à jour', {
      userId: utilisateur._id,
      preferences: utilisateur.preferencesNotifications
    });
    
    res.status(200).json({
      success: true,
      message: 'Préférences mises à jour avec succès',
      data: {
        preferences: utilisateur.preferencesNotifications
      }
    });
    
  } catch (error) {
    logger.error('❌ Erreur mise à jour préférences:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la mise à jour des préférences',
      code: 'SERVER_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/notifications/preferences
 * @desc    Récupérer les préférences de notifications
 * @access  Private
 */
router.get('/preferences', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const utilisateur = await Utilisateur.findById(userId)
      .select('preferencesNotifications');
    
    if (!utilisateur) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }
    
    const preferences = utilisateur.preferencesNotifications || {
      activees: true,
      reservations: true,
      paiements: true,
      trajets: true,
      promotions: true,
      messages: true
    };
    
    res.status(200).json({
      success: true,
      data: {
        preferences
      }
    });
    
  } catch (error) {
    logger.error('❌ Erreur récupération préférences:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération des préférences',
      code: 'SERVER_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// 🚗 NOTIFICATIONS SPÉCIFIQUES AU COVOITURAGE
// ═══════════════════════════════════════════════════════════════

/**
 * @route   POST /api/notifications/proximity
 * @desc    Notifier quand le conducteur est proche du passager
 * @access  Private (Driver only)
 */
router.post('/proximity', authMiddleware, async (req, res) => {
  try {
    const { passengerId, distance, estimatedTime } = req.body;
    const driverId = req.user.userId || req.user.id;
    
    // Validation des paramètres
    if (!passengerId || distance === undefined) {
      return res.status(400).json({
        success: false,
        message: 'ID passager et distance requis',
        code: 'MISSING_PARAMETERS'
      });
    }
    
    // Récupérer le passager
    const passenger = await Utilisateur.findById(passengerId);
    
    if (!passenger) {
      return res.status(404).json({
        success: false,
        message: 'Passager non trouvé',
        code: 'PASSENGER_NOT_FOUND'
      });
    }
    
    // Vérifier les préférences de notification
    if (passenger.notificationsActivees && !passenger.notificationsActivees('conducteurProche')) {
      return res.status(200).json({
        success: true,
        message: 'Notification désactivée par les préférences utilisateur',
        data: {
          notificationsSent: false,
          reason: 'user_preferences_disabled'
        }
      });
    }
    
    // Envoyer la notification via Firebase
    const result = await firebaseService.sendToUser(
      passengerId,
      {
        title: '🚗 Votre conducteur arrive !',
        message: `Il est à ${distance}m de vous${estimatedTime ? ` (environ ${estimatedTime} min)` : ''}`,
        data: {
          type: 'CONDUCTEUR_PROCHE',
          driverId: driverId.toString(),
          distance: distance.toString(),
          estimatedTime: estimatedTime ? estimatedTime.toString() : null,
          timestamp: new Date().toISOString()
        },
        channelId: 'trajets',
        type: 'trajets'
      },
      Utilisateur
    );
    
    // ✅ CORRECTION : Vérifier le résultat avant de répondre
    if (result.success) {
      logger.info('🚗 Notification proximité envoyée avec succès', {
        driverId,
        passengerId,
        distance,
        tokensUsed: result.successCount || 1
      });
      
      return res.status(200).json({
        success: true,
        message: 'Notification de proximité envoyée',
        data: {
          notificationsSent: true,
          tokensUsed: result.successCount || 1,
          distance: distance,
          estimatedTime: estimatedTime
        }
      });
    } else {
      // ❌ Échec de l'envoi
      logger.warn('⚠️  Échec notification proximité', {
        driverId,
        passengerId,
        distance,
        reason: result.reason || result.error
      });
      
      // Identifier la raison spécifique
      const reason = result.reason || result.error || 'unknown';
      let message = 'Impossible d\'envoyer la notification';
      let helpMessage = null;
      let statusCode = 400;
      
      if (reason.includes('token') || reason.includes('Token') || reason === 'Aucun token FCM disponible') {
        message = 'Aucun token FCM disponible pour ce passager';
        helpMessage = 'Le passager doit d\'abord enregistrer un token FCM via l\'application mobile';
        statusCode = 404; // Not Found est plus approprié ici
      } else if (reason === 'disabled') {
        message = 'Service de notifications désactivé';
        statusCode = 503; // Service Unavailable
      }
      
      return res.status(statusCode).json({
        success: false,
        message: message,
        data: {
          notificationsSent: false,
          reason: reason,
          passengerId: passengerId.toString(),
          help: helpMessage
        },
        code: reason === 'Aucun token FCM disponible' ? 'NO_FCM_TOKEN' : 'NOTIFICATION_FAILED'
      });
    }
    
  } catch (error) {
    logger.error('❌ Erreur notification proximité:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'envoi de la notification',
      code: 'SERVER_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   POST /api/notifications/emergency
 * @desc    Envoyer une notification d'urgence (ignore les préférences)
 * @access  Private
 */
router.post('/emergency', authMiddleware, async (req, res) => {
  try {
    const { targetUserId, message, location, type } = req.body;
    const senderId = req.user.userId || req.user.id;
    
    const validTypes = ['ACCIDENT', 'AGRESSION', 'MALAISE', 'PANNE', 'AUTRE'];
    
    // Validation du type d'urgence
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Type d\'urgence invalide',
        code: 'INVALID_EMERGENCY_TYPE',
        validTypes
      });
    }
    
    // Validation de l'utilisateur cible
    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        message: 'ID utilisateur cible requis',
        code: 'MISSING_TARGET_USER'
      });
    }
    
    // Récupérer l'utilisateur cible
    const targetUser = await Utilisateur.findById(targetUserId);
    
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur cible non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }
    
    // Récupérer l'expéditeur pour le message
    const sender = await Utilisateur.findById(senderId).select('nom prenom');
    const senderName = sender ? `${sender.prenom} ${sender.nom}` : 'Un utilisateur';
    
    // Construire le message d'urgence
    const emergencyMessages = {
      'ACCIDENT': '🚨 ACCIDENT ! Besoin d\'aide immédiate',
      'AGRESSION': '🚨 AGRESSION ! Appeler la police',
      'MALAISE': '🚨 MALAISE ! Assistance médicale nécessaire',
      'PANNE': '🚨 PANNE ! Véhicule immobilisé',
      'AUTRE': '🚨 URGENCE ! Besoin d\'aide'
    };
    
    // 🚨 Envoyer SANS vérifier les préférences (urgence = priorité absolue)
    const result = await firebaseService.sendToUser(
      targetUserId,
      {
        title: '🚨 ALERTE D\'URGENCE',
        body: message || emergencyMessages[type],
        data: {
          type: 'EMERGENCY',
          emergencyType: type,
          senderId: senderId.toString(),
          senderName: senderName,
          message: message || emergencyMessages[type],
          location: location ? JSON.stringify(location) : null,
          timestamp: new Date().toISOString(),
          priority: 'high',
          screen: 'EmergencyAlert'
        },
        channelId: 'emergency', // Canal dédié pour les urgences
        priority: 'high',
        sound: 'emergency_alert' // Son d'alerte spécial
      },
      Utilisateur,
      { 
        ignorePreferences: true, // ✅ Toujours envoyer, même si préférences désactivées
        priority: 'high' 
      }
    );
    
    // ✅ CORRECTION : Vérifier le résultat avant de répondre
    if (result.success) {
      logger.warn('🚨 Alerte d\'urgence envoyée avec succès', {
        senderId,
        targetUserId,
        type,
        location,
        tokensUsed: result.successCount || 1
      });
      
      return res.status(200).json({
        success: true,
        message: 'Alerte d\'urgence envoyée',
        data: {
          emergencyAlertSent: true,
          tokensUsed: result.successCount || 1,
          emergencyType: type,
          timestamp: new Date().toISOString()
        }
      });
    } else {
      // ❌ Échec de l'envoi - CRITIQUE pour les urgences
      logger.error('❌ ÉCHEC CRITIQUE : Alerte d\'urgence non envoyée', {
        senderId,
        targetUserId,
        type,
        location,
        reason: result.reason || result.error
      });
      
      // Identifier la raison de l'échec
      const reason = result.reason || result.error || 'unknown';
      let message = 'ÉCHEC CRITIQUE : Impossible d\'envoyer l\'alerte d\'urgence';
      let helpMessage = null;
      let statusCode = 500; // 500 car c'est critique pour les urgences
      
      if (reason.includes('token') || reason.includes('Token') || reason === 'Aucun token FCM disponible') {
        message = 'ÉCHEC CRITIQUE : Aucun token FCM disponible pour cet utilisateur';
        helpMessage = 'L\'utilisateur cible doit enregistrer un token FCM. En attendant, contactez-le par téléphone.';
        statusCode = 424; // Failed Dependency
      } else if (reason === 'disabled') {
        message = 'ÉCHEC CRITIQUE : Service de notifications désactivé';
        helpMessage = 'Activez Firebase pour envoyer des alertes d\'urgence. Contactez l\'administrateur.';
        statusCode = 503; // Service Unavailable
      }
      
      return res.status(statusCode).json({
        success: false,
        message: message,
        data: {
          emergencyAlertSent: false,
          reason: reason,
          targetUserId: targetUserId.toString(),
          emergencyType: type,
          help: helpMessage,
          fallbackAction: 'Contactez immédiatement l\'utilisateur par téléphone',
          emergencyNumbers: {
            police: '170',
            pompiers: '180',
            samu: '185'
          }
        },
        code: reason === 'Aucun token FCM disponible' ? 'NO_FCM_TOKEN' : 'EMERGENCY_SEND_FAILED'
      });
    }
    
  } catch (error) {
    logger.error('❌ ERREUR CRITIQUE alerte urgence:', error);
    res.status(500).json({
      success: false,
      message: 'ERREUR CRITIQUE lors de l\'envoi de l\'alerte d\'urgence',
      code: 'EMERGENCY_SERVER_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined,
      fallbackAction: 'Contactez immédiatement l\'utilisateur par téléphone'
    });
  }
});

/**
 * @route   POST /api/notifications/trip-broadcast
 * @desc    Envoyer une notification à tous les passagers d'un trajet
 * @access  Private (Driver only)
 */
router.post('/trip-broadcast', authMiddleware, async (req, res) => {
  try {
    const { tripId, title, message, type } = req.body;
    const driverId = req.user.userId || req.user.id;
    
    // ✅ VALIDATION : ID du trajet
    if (!tripId) {
      return res.status(400).json({
        success: false,
        message: 'ID du trajet requis',
        code: 'MISSING_TRIP_ID'
      });
    }
    
    // ✅ VALIDATION : Message
    if (!message) {
      return res.status(400).json({
        success: false,
        message: 'Message requis',
        code: 'MISSING_MESSAGE'
      });
    }
    
    // ✅ CORRECTION 1 : Récupérer le trajet sans populate
    // (Les réservations sont dans un modèle séparé)
    const trip = await Trajet.findById(tripId)
      .select('conducteurId statutTrajet');
    
    if (!trip) {
      return res.status(404).json({
        success: false,
        message: 'Trajet non trouvé',
        code: 'TRIP_NOT_FOUND'
      });
    }
    
    // ✅ VÉRIFICATION : Autorisation (conducteur uniquement)
    if (trip.conducteurId.toString() !== driverId.toString()) {
      return res.status(403).json({
        success: false,
        message: 'Seul le conducteur peut envoyer cette notification',
        code: 'UNAUTHORIZED_SENDER'
      });
    }
    
    // Récupérer les réservations depuis le modèle Reservation
    const reservations = await Reservation.find({ 
      trajetId: tripId,
      statutReservation: { $in: ['CONFIRMEE', 'EN_ATTENTE'] }
    }).populate('passagerId', 'fcmTokens preferencesNotifications nom prenom');
    
    // ✅ VÉRIFICATION : Il y a des passagers
    if (!reservations || reservations.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Aucun passager confirmé dans ce trajet',
        code: 'NO_PASSENGERS'
      });
    }
    
    // ✅ CORRECTION 3 : Extraire les IDs des passagers
    const passengerIds = reservations.map(r => r.passagerId._id);
    
    // ✅ Envoyer à tous les passagers
    const results = await firebaseService.sendToMultipleUsers(
      passengerIds,
      {
        title: title || '🚗 Message du conducteur',
        message: message,
        data: {
          type: type || 'TRIP_UPDATE',
          tripId: tripId.toString(),
          driverId: driverId.toString(),
          timestamp: new Date().toISOString()
        }
      },
      Utilisateur
    );
    
    logger.info('📢 Notification groupe envoyée', {
      tripId,
      driverId,
      passengersCount: passengerIds.length,
      reservationsStatuts: reservations.map(r => r.statutReservation),
      results
    });
    
    res.status(200).json({
      success: true,
      message: 'Notifications envoyées aux passagers',
      data: {
        totalPassengers: passengerIds.length,
        successCount: results.successCount,
        failureCount: results.failureCount,
        details: reservations.map(r => ({
          passagerId: r.passagerId._id,
          nom: r.passagerId.nom,
          prenom: r.passagerId.prenom,
          statut: r.statutReservation
        }))
      }
    });
    
  } catch (error) {
    logger.error('❌ Erreur notification groupe:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'envoi des notifications',
      code: 'SERVER_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   PUT /api/notifications/language
 * @desc    Définir la langue des notifications
 * @access  Private
 */
router.put('/language', authMiddleware, async (req, res) => {
  try {
    const { language } = req.body;
    const userId = req.user.userId || req.user.id;
    
    // Langues supportées en Côte d'Ivoire
    const supportedLanguages = ['fr', 'en', 'baoule', 'dioula'];
    
    if (!language) {
      return res.status(400).json({
        success: false,
        message: 'Langue requise',
        code: 'MISSING_LANGUAGE'
      });
    }
    
    if (!supportedLanguages.includes(language)) {
      return res.status(400).json({
        success: false,
        message: 'Langue non supportée',
        code: 'UNSUPPORTED_LANGUAGE',
        supportedLanguages
      });
    }
    
    const utilisateur = await Utilisateur.findById(userId);
    
    if (!utilisateur) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }
    
    utilisateur.languePref = language;
    await utilisateur.save();
    
    logger.info('✅ Langue des notifications mise à jour', {
      userId,
      language
    });
    
    res.status(200).json({
      success: true,
      message: 'Langue des notifications mise à jour',
      data: { language }
    });
    
  } catch (error) {
    logger.error('❌ Erreur mise à jour langue:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur',
      code: 'SERVER_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

// ═══════════════════════════════════════════════════════════════
// 🧪 TESTS ET MONITORING
// ═══════════════════════════════════════════════════════════════

/**
 * @route   POST /api/notifications/test
 * @desc    Envoyer une notification de test à l'utilisateur
 * @access  Private
 */
router.post('/test', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const utilisateur = await Utilisateur.findById(userId);
    
    if (!utilisateur) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }
    
    if (!firebaseService.isEnabled()) {
      return res.status(503).json({
        success: false,
        message: 'Service Firebase Cloud Messaging non disponible',
        code: 'FCM_NOT_ENABLED'
      });
    }
    
    const tokens = utilisateur.getTokensActifs();
    
    if (tokens.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Aucun token FCM actif enregistré. Veuillez d\'abord enregistrer un token.',
        code: 'NO_ACTIVE_TOKENS'
      });
    }
    
    const result = await firebaseService.sendToUser(
      utilisateur._id,
      {
        title: '🧪 Test Notification WAYZ-ECO',
        body: `Bonjour ${utilisateur.prenom} ! Firebase FCM fonctionne parfaitement. 🎉`,
        data: {
          type: 'TEST',
          timestamp: new Date().toISOString(),
          userId: utilisateur._id.toString()
        }
      },
      Utilisateur
    );
    
    if (!result.success) {
      logger.error('Échec envoi notification test', {
        userId: utilisateur._id,
        error: result.error || result.reason
      });
      
      return res.status(500).json({
        success: false,
        message: 'Échec de l\'envoi de la notification de test',
        code: 'TEST_NOTIFICATION_FAILED',
        error: result.error || result.reason
      });
    }
    
    logger.info('✅ Notification de test envoyée', {
      userId: utilisateur._id,
      email: utilisateur.email,
      successCount: result.successCount,
      failureCount: result.failureCount
    });
    
    res.status(200).json({
      success: true,
      message: 'Notification de test envoyée avec succès',
      data: {
        successCount: result.successCount,
        failureCount: result.failureCount,
        totalTokens: tokens.length
      }
    });
    
  } catch (error) {
    logger.error('❌ Erreur test notification:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'envoi de la notification de test',
      code: 'SERVER_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});

/**
 * @route   GET /api/notifications/status
 * @desc    Récupérer le statut du service Firebase et de l'utilisateur
 * @access  Private
 */
router.get('/status', authMiddleware, async (req, res) => {
  try {
    const userId = req.user.userId || req.user.id;
    
    const firebaseStats = firebaseService.getStats();
    
    const utilisateur = await Utilisateur.findById(userId)
      .select('fcmTokens preferencesNotifications');
    
    if (!utilisateur) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }
    
    const tokensActifs = utilisateur.fcmTokens?.filter(t => t.actif) || [];
    
    res.status(200).json({
      success: true,
      data: {
        firebase: {
          enabled: firebaseStats.enabled,
          mode: firebaseStats.mode,
          status: firebaseStats.enabled ? 'opérationnel' : 'désactivé'
        },
        user: {
          userId: utilisateur._id,
          totalTokens: utilisateur.fcmTokens?.length || 0,
          activeTokens: tokensActifs.length,
          notificationsEnabled: utilisateur.preferencesNotifications?.activees !== false,
          preferences: utilisateur.preferencesNotifications
        },
        stats: firebaseStats.stats
      }
    });
    
  } catch (error) {
    logger.error('❌ Erreur status Firebase:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération du statut',
      code: 'SERVER_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
    });
  }
});
/**
 * @route   POST /api/notifications/test-fcm-token
 * @desc    Tester un token FCM spécifique (debug)
 * @access  Private
 */
router.post('/test-fcm-token', authMiddleware, async (req, res) => {
  try {
    const { token } = req.body;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token FCM requis',
        code: 'MISSING_TOKEN'
      });
    }
    
    // Vérifier que Firebase est activé
    if (!firebaseService.isEnabled()) {
      return res.status(503).json({
        success: false,
        message: 'Service Firebase Cloud Messaging non disponible',
        code: 'FCM_NOT_ENABLED'
      });
    }
    
    // Envoyer directement via Firebase Admin SDK
    const admin = require('firebase-admin');
    
    const message = {
      notification: {
        title: '🧪 Test de notification direct',
        body: 'Si vous voyez ceci, votre token fonctionne parfaitement !'
      },
      data: {
        type: 'TEST_TOKEN',
        timestamp: new Date().toISOString()
      },
      token: token,
      android: {
        priority: 'high',
        notification: {
          channelId: 'default',
          sound: 'default',
        }
      },
      apns: {
        payload: {
          aps: {
            sound: 'default',
            badge: 1
          }
        }
      }
    };
    
    const response = await admin.messaging().send(message);
    
    res.json({
      success: true,
      message: 'Notification envoyée avec succès',
      messageId: response
    });
    
  } catch (error) {
    res.json({
      success: false,
      error: error.message,
      errorCode: error.code
    });
  }
});


module.exports = router;