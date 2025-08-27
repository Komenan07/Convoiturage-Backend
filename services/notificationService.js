// services/notificationService.js
const nodemailer = require('nodemailer');

/**
 * Service pour gérer les notifications (email principalement)
 * Simplifié pour correspondre au contexte des messages
 */
class NotificationService {
  constructor() {
    this.emailTransporter = null;
    this.initEmailTransporter();
  }

  /**
   * Initialise le transporteur d'emails
   */
  initEmailTransporter() {
    try {
      // Configuration SMTP basique avec les variables d'environnement
      const smtpConfig = {
        host: process.env.SMTP_HOST || 'smtp.gmail.com',
        port: process.env.SMTP_PORT || 587,
        secure: process.env.SMTP_PORT == 465, // true pour 465, false pour d'autres ports
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASS
        }
      };

      // Vérifier si les variables sont définies
      if (!process.env.SMTP_USER || !process.env.SMTP_PASS) {
        console.warn('Configuration SMTP manquante - notifications email désactivées');
        return;
      }

      this.emailTransporter = nodemailer.createTransporter(smtpConfig);
      
      // Test de connexion optionnel (sans bloquer)
      this.emailTransporter.verify()
        .then(() => console.log('Service email configuré'))
        .catch(err => console.warn('Problème configuration email:', err.message));

    } catch (error) {
      console.error('Erreur initialisation service email:', error.message);
      this.emailTransporter = null;
    }
  }

  /**
   * Envoie un email simple
   * @param {string} to - Adresse email du destinataire
   * @param {string} subject - Sujet de l'email
   * @param {string} text - Contenu texte
   * @param {string} html - Contenu HTML optionnel
   * @returns {Promise} - Résultat de l'envoi
   */
  async sendEmail(to, subject, text, html = null) {
    try {
      // Si le service email n'est pas configuré, simuler l'envoi
      if (!this.emailTransporter) {
        console.log('Email simulé:', { to, subject, text });
        return { 
          success: true, 
          simulated: true,
          message: 'Email simulé (configuration SMTP manquante)'
        };
      }

      const mailOptions = {
        from: process.env.SMTP_FROM || process.env.SMTP_USER,
        to,
        subject,
        text,
        ...(html && { html })
      };

      const result = await this.emailTransporter.sendMail(mailOptions);
      
      return {
        success: true,
        messageId: result.messageId,
        message: 'Email envoyé avec succès'
      };

    } catch (error) {
      console.error('Erreur envoi email:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Envoie une notification de nouveau message
   * @param {string} to - Email du destinataire
   * @param {string} senderName - Nom de l'expéditeur
   * @param {string} messageContent - Contenu du message
   * @param {string} conversationId - ID de la conversation
   * @returns {Promise} - Résultat de l'envoi
   */
  async sendNewMessageNotification(to, senderName, messageContent, conversationId = null) {
    const subject = `Nouveau message de ${senderName}`;
    
    // Tronquer le message si trop long
    const shortContent = messageContent.length > 150 
      ? `${messageContent.substring(0, 147)}...`
      : messageContent;

    const textContent = `
Bonjour,

Vous avez reçu un nouveau message de ${senderName} :

"${shortContent}"

${conversationId ? `Conversation ID: ${conversationId}` : ''}

Connectez-vous à l'application pour répondre.

Cordialement,
L'équipe Covoiturage
    `;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Nouveau message</h2>
        <p>Bonjour,</p>
        <p>Vous avez reçu un nouveau message de <strong>${senderName}</strong> :</p>
        <div style="background: #f8f9fa; padding: 15px; border-left: 4px solid #007bff; margin: 15px 0;">
          <em>"${shortContent}"</em>
        </div>
        ${conversationId ? `<p><small>Conversation ID: ${conversationId}</small></p>` : ''}
        <p>Connectez-vous à l'application pour répondre.</p>
        <hr>
        <p style="color: #666; font-size: 12px;">L'équipe Covoiturage</p>
      </div>
    `;

    return this.sendEmail(to, subject, textContent, htmlContent);
  }

  /**
   * Envoie une notification de position partagée
   * @param {string} to - Email du destinataire
   * @param {string} senderName - Nom de l'expéditeur
   * @returns {Promise} - Résultat de l'envoi
   */
  async sendLocationSharedNotification(to, senderName) {
    const subject = `${senderName} a partagé sa position`;
    
    const textContent = `
Bonjour,

${senderName} a partagé sa position avec vous.

Consultez l'application pour voir sa localisation.

Cordialement,
L'équipe Covoiturage
    `;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">Position partagée</h2>
        <p>Bonjour,</p>
        <p><strong>${senderName}</strong> a partagé sa position avec vous.</p>
        <div style="background: #e8f5e8; padding: 15px; border-left: 4px solid #28a745; margin: 15px 0;">
          <p style="margin: 0;">📍 Consultez l'application pour voir sa localisation.</p>
        </div>
        <hr>
        <p style="color: #666; font-size: 12px;">L'équipe Covoiturage</p>
      </div>
    `;

    return this.sendEmail(to, subject, textContent, htmlContent);
  }

  /**
   * Envoie une notification générique
   * @param {string} to - Email du destinataire
   * @param {string} subject - Sujet
   * @param {string} message - Message
   * @param {string} type - Type de notification (info, success, warning, error)
   * @returns {Promise} - Résultat de l'envoi
   */
  async sendGenericNotification(to, subject, message, type = 'info') {
    const colors = {
      info: '#007bff',
      success: '#28a745',
      warning: '#ffc107',
      error: '#dc3545'
    };

    const textContent = `
Bonjour,

${message}

Cordialement,
L'équipe Covoiturage
    `;

    const htmlContent = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #2c3e50;">${subject}</h2>
        <div style="background: #f8f9fa; padding: 15px; border-left: 4px solid ${colors[type]}; margin: 15px 0;">
          <p style="margin: 0;">${message}</p>
        </div>
        <hr>
        <p style="color: #666; font-size: 12px;">L'équipe Covoiturage</p>
      </div>
    `;

    return this.sendEmail(to, subject, textContent, htmlContent);
  }

  /**
   * Teste la configuration email
   * @returns {Promise} - Résultat du test
   */
  async testEmailConfiguration() {
    if (!this.emailTransporter) {
      return {
        success: false,
        message: 'Service email non configuré'
      };
    }

    try {
      await this.emailTransporter.verify();
      return {
        success: true,
        message: 'Configuration email valide'
      };
    } catch (error) {
      return {
        success: false,
        message: `Erreur configuration: ${error.message}`
      };
    }
  }

  /**
   * Notification push simulée (placeholder pour future implémentation)
   * @param {string} userId - ID utilisateur
   * @param {string} title - Titre
   * @param {string} body - Corps
   * @returns {Promise} - Résultat simulé
   */
  async sendPushNotification(userId, title, body) {
    // Simulation - à remplacer par vraie implémentation Firebase/OneSignal
    console.log('Push notification simulée:', { userId, title, body });
    
    return {
      success: true,
      simulated: true,
      message: 'Notification push simulée (pas encore implémentée)'
    };
  }

  /**
   * Vérifie si le service est opérationnel
   * @returns {boolean} - État du service
   */
  isOperational() {
    return this.emailTransporter !== null;
  }

  /**
   * Obtient les statistiques du service
   * @returns {Object} - Statistiques
   */
  getStats() {
    return {
      emailConfigured: this.emailTransporter !== null,
      pushConfigured: false, // Pas encore implémenté
      lastCheck: new Date().toISOString()
    };
  }
}

// Exporter une instance unique
module.exports = new NotificationService();