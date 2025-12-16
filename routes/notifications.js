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
    
    if (!passengerId || distance === undefined) {
      return res.status(400).json({
        success: false,
        message: 'ID passager et distance requis',
        code: 'MISSING_PARAMETERS'
      });
    }
    
    const passenger = await Utilisateur.findById(passengerId);
    
    if (!passenger) {
      return res.status(404).json({
        success: false,
        message: 'Passager non trouvé',
        code: 'PASSENGER_NOT_FOUND'
      });
    }
    
    // Vérifier les préférences
    if (passenger.notificationsActivees && !passenger.notificationsActivees('conducteurProche')) {
      return res.status(200).json({
        success: true,
        message: 'Notification désactivée par l\'utilisateur'
      });
    }
    
    const result = await firebaseService.sendToUser(
      passengerId,
      {
        title: '🚗 Votre conducteur arrive !',
        body: `Il est à ${distance}m de vous${estimatedTime ? ` (environ ${estimatedTime} min)` : ''}`,
        data: {
          type: 'CONDUCTEUR_PROCHE',
          driverId: driverId.toString(),
          distance: distance.toString(),
          estimatedTime: estimatedTime ? estimatedTime.toString() : null,
          timestamp: new Date().toISOString()
        }
      },
      Utilisateur
    );
    
    logger.info('🚗 Notification proximité envoyée', {
      driverId,
      passengerId,
      distance,
      result
    });
    
    res.status(200).json({
      success: true,
      message: 'Notification de proximité envoyée',
      data: result
    });
    
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
    
    if (!type || !validTypes.includes(type)) {
      return res.status(400).json({
        success: false,
        message: 'Type d\'urgence invalide',
        code: 'INVALID_EMERGENCY_TYPE',
        validTypes
      });
    }
    
    if (!targetUserId) {
      return res.status(400).json({
        success: false,
        message: 'ID utilisateur cible requis',
        code: 'MISSING_TARGET_USER'
      });
    }
    
    const targetUser = await Utilisateur.findById(targetUserId);
    
    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur cible non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }
    
    // 🚨 Envoyer SANS vérifier les préférences (urgence)
    const result = await firebaseService.sendToUser(
      targetUserId,
      {
        title: '🚨 ALERTE D\'URGENCE',
        body: message || 'Un utilisateur a besoin d\'aide',
        data: {
          type: 'EMERGENCY',
          emergencyType: type,
          senderId: senderId.toString(),
          location: location ? JSON.stringify(location) : null,
          timestamp: new Date().toISOString(),
          priority: 'high'
        }
      },
      Utilisateur,
      { 
        ignorePreferences: true,
        priority: 'high' 
      }
    );
    
    logger.warn('🚨 Alerte d\'urgence envoyée', {
      senderId,
      targetUserId,
      type,
      location,
      result
    });
    
    res.status(200).json({
      success: true,
      message: 'Alerte d\'urgence envoyée',
      data: result
    });
    
  } catch (error) {
    logger.error('❌ Erreur alerte urgence:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur lors de l\'envoi de l\'alerte',
      code: 'SERVER_ERROR',
      error: process.env.NODE_ENV === 'development' ? error.message : undefined
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
        body: message,
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

module.exports = router;