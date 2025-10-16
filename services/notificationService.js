// services/notificationService.js
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');

/**
 * Service pour gérer les notifications (email, push, etc.)
 */
class NotificationService {
  constructor() {
    this.emailTransporter = null;
    this.initEmailTransporter();
    console.log('✅ Service de notification initialisé');
  }

  /**
   * Initialise le transporteur d'emails
   */
  initEmailTransporter() {
    try {
      // Vérifier si les variables d'environnement sont définies
      if (!process.env.EMAIL_HOST || !process.env.EMAIL_USER || !process.env.EMAIL_PASS) {
        console.warn('⚠️ Configuration email incomplète - les notifications par email sont désactivées');
        return;
      }
      
      this.emailTransporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT || 587,
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASS
        }
      });
      
      // Vérifier la connexion
      this.emailTransporter.verify()
        .then(() => console.log('✅ Service de notification email prêt'))
        .catch(err => console.error('❌ Erreur de configuration email:', err.message));
    } catch (error) {
      console.error('❌ Erreur d\'initialisation du service de notification:', error.message);
      this.emailTransporter = null;
    }
  }

  /**
   * Envoie un email
   * @param {string} to - Adresse email du destinataire
   * @param {string} subject - Sujet de l'email
   * @param {string} text - Contenu texte de l'email
   * @param {string} html - Contenu HTML de l'email (optionnel)
   * @returns {Promise} - Résultat de l'envoi
   */
  async sendEmail(to, subject, text, html = null) {
    if (!this.emailTransporter) {
      throw new Error('Service de notification email non disponible');
    }
    
    const emailOptions = {
      from: `"${process.env.APP_NAME || 'Service de Covoiturage'}" <${process.env.EMAIL_FROM || process.env.EMAIL_USER}>`,
      to,
      subject,
      text
    };
    
    if (html) {
      emailOptions.html = html;
    }
    
    return this.emailTransporter.sendMail(emailOptions);
  }

  /**
   * Envoie une notification push
   * @param {string} userId - ID de l'utilisateur
   * @param {string} title - Titre de la notification
   * @param {string} body - Corps de la notification
   * @param {Object} data - Données supplémentaires
   * @returns {Promise} - Résultat de l'envoi
   */
  async sendPushNotification(userId, title, body, data = {}) {
    try {
      // Récupérer l'utilisateur avec ses tokens push
      const Utilisateur = mongoose.model('Utilisateur');
      const user = await Utilisateur.findById(userId).select('pushTokens');
      
      if (!user || !user.pushTokens || user.pushTokens.length === 0) {
        return { success: false, message: 'Aucun token de notification push disponible' };
      }
      
      // Implémenter l'envoi de notification push selon le service utilisé
      // (Firebase, OneSignal, etc.)
      
      // Vérifier si Firebase est configuré
      if (process.env.FIREBASE_ENABLED === 'true') {
        try {
          // Importer Firebase Admin SDK
          const admin = require('firebase-admin');
          
          // Initialiser Firebase si ce n'est pas déjà fait
          if (!admin.apps.length) {
            admin.initializeApp({
              credential: admin.credential.cert({
                projectId: process.env.FIREBASE_PROJECT_ID,
                clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
                privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n')
              })
            });
          }
          
          // Préparer la notification
          const message = {
            notification: {
              title,
              body
            },
            data: {
              ...data,
              click_action: 'FLUTTER_NOTIFICATION_CLICK'
            },
            tokens: user.pushTokens
          };
          
          // Envoyer la notification
          const response = await admin.messaging().sendMulticast(message);
          
          return {
            success: true,
            sent: response.successCount,
            failed: response.failureCount,
            results: response.responses
          };
        } catch (firebaseError) {
          console.error('Erreur Firebase:', firebaseError);
          return { success: false, error: firebaseError.message };
        }
      }
      
      // Si aucun service de notification push n'est configuré
      console.warn('⚠️ Aucun service de notification push configuré');
      return { success: false, message: 'Service de notification push non configuré' };
      
    } catch (error) {
      console.error('Erreur d\'envoi de notification push:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Envoie une notification à un utilisateur par les canaux disponibles
   * @param {string} userId - ID de l'utilisateur
   * @param {string} title - Titre de la notification
   * @param {string} body - Corps de la notification
   * @param {Object} data - Données supplémentaires
   * @returns {Promise} - Résultat de l'envoi
   */
  async sendNotification(userId, title, body, data = {}) {
    try {
      const Utilisateur = mongoose.model('Utilisateur');
      const user = await Utilisateur.findById(userId).select('email preferenceNotifications');
      
      if (!user) {
        return { success: false, message: 'Utilisateur non trouvé' };
      }
      
      const results = {
        email: null,
        push: null
      };
      
      // Vérifier les préférences de notification de l'utilisateur
      const preferences = user.preferenceNotifications || { email: true, push: true };
      
      // Envoyer par email si l'utilisateur a activé les notifications par email
      if (preferences.email && user.email) {
        try {
          results.email = await this.sendEmail(
            user.email,
            title,
            body
          );
        } catch (emailError) {
          console.error('Erreur d\'envoi d\'email:', emailError);
          results.email = { success: false, error: emailError.message };
        }
      }
      
      // Envoyer par notification push si l'utilisateur a activé les notifications push
      if (preferences.push) {
        try {
          results.push = await this.sendPushNotification(
            userId,
            title,
            body,
            data
          );
        } catch (pushError) {
          console.error('Erreur d\'envoi de notification push:', pushError);
          results.push = { success: false, error: pushError.message };
        }
      }
      
      return {
        success: results.email?.success || results.push?.success,
        results
      };
    } catch (error) {
      console.error('Erreur d\'envoi de notification:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Envoie une notification de message
   * @param {string} userId - ID de l'utilisateur
   * @param {string} senderName - Nom de l'expéditeur
   * @param {string} messageContent - Contenu du message
   * @param {Object} data - Données supplémentaires
   * @returns {Promise} - Résultat de l'envoi
   */
  async sendMessageNotification(userId, senderName, messageContent, data = {}) {
    const title = `Nouveau message de ${senderName}`;
    const body = messageContent.length > 100
      ? `${messageContent.substring(0, 97)}...`
      : messageContent;
    
    return this.sendNotification(userId, title, body, {
      type: 'MESSAGE',
      ...data
    });
  }

  /**
   * Envoie une notification de réservation
   * @param {string} userId - ID de l'utilisateur
   * @param {string} title - Titre de la notification
   * @param {string} body - Corps de la notification
   * @param {Object} data - Données supplémentaires
   * @returns {Promise} - Résultat de l'envoi
   */
  async sendReservationNotification(userId, title, body, data = {}) {
    return this.sendNotification(userId, title, body, {
      type: 'RESERVATION',
      ...data
    });
  }

  /**
   * Envoie une notification de trajet
   * @param {string} userId - ID de l'utilisateur
   * @param {string} title - Titre de la notification
   * @param {string} body - Corps de la notification
   * @param {Object} data - Données supplémentaires
   * @returns {Promise} - Résultat de l'envoi
   */
  async sendTrajetNotification(userId, title, body, data = {}) {
    return this.sendNotification(userId, title, body, {
      type: 'TRAJET',
      ...data
    });
  }

  /**
   * Envoie une notification d'urgence
   * @param {string} userId - ID de l'utilisateur
   * @param {string} title - Titre de la notification
   * @param {string} body - Corps de la notification
   * @param {Object} data - Données supplémentaires
   * @returns {Promise} - Résultat de l'envoi
   */
  async sendEmergencyNotification(userId, title, body, data = {}) {
    return this.sendNotification(userId, title, body, {
      type: 'EMERGENCY',
      priority: 'high',
      ...data
    });
  }

  /**
   * Envoie une notification de paiement
   * @param {string} userId - ID de l'utilisateur
   * @param {string} title - Titre de la notification
   * @param {string} body - Corps de la notification
   * @param {Object} data - Données supplémentaires
   * @returns {Promise} - Résultat de l'envoi
   */
  async sendPaymentNotification(userId, title, body, data = {}) {
    return this.sendNotification(userId, title, body, {
      type: 'PAYMENT',
      ...data
    });
  }
}

// Exporter une instance unique du service
module.exports = new NotificationService();