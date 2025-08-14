// =====================================================
// SERVICE D'ENVOI D'EMAILS
// =====================================================

const logger = require('../utils/logger');

/**
 * Service d'envoi d'emails (version basique)
 * TODO: Intégrer avec un provider comme SendGrid, Mailgun, etc.
 */
class EmailService {
  
  /**
   * Envoie un email simple
   * @param {string} to - Destinataire
   * @param {string} subject - Sujet
   * @param {string} text - Contenu texte
   * @param {string} html - Contenu HTML (optionnel)
   * @returns {Promise<object>} Résultat de l'envoi
   */
  async sendEmail(to, subject, text) {
    try {
      // Validation des paramètres
      if (!to || !subject || !text) {
        throw new Error('Paramètres d\'email manquants');
      }

      // Log pour le développement
      console.log(`📧 Email simulé envoyé à: ${to}`);
      console.log(`📋 Sujet: ${subject}`);
      console.log(`📝 Contenu: ${text.substring(0, 50)}...`);
      
      // Simulation d'envoi réussi
      // TODO: Remplacer par vraie intégration email
      await this.simulateEmailSending();
      
      const result = {
        success: true,
        messageId: this.generateMessageId(),
        to,
        subject,
        timestamp: new Date().toISOString()
      };
      
      // Log du succès
      if (logger && logger.info) {
        logger.info('Email envoyé avec succès', result);
      }
      
      return result;
      
    } catch (error) {
      console.error('Erreur envoi email:', error.message);
      
      if (logger && logger.error) {
        logger.error('Erreur envoi email:', error);
      }
      
      return {
        success: false,
        error: error.message,
        to,
        subject,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Envoie un email de bienvenue
   */
  async sendWelcomeEmail(userEmail, userName) {
    const subject = 'Bienvenue sur CovoiCI !';
    const text = `Bonjour ${userName},\n\nBienvenue sur CovoiCI, la plateforme de covoiturage en Côte d'Ivoire !\n\nVous pouvez maintenant commencer à partager vos trajets ou rechercher des covoiturages.\n\nBonne route !\n\nL'équipe CovoiCI`;
    
    return await this.sendEmail(userEmail, subject, text);
  }

  /**
   * Envoie un email de confirmation de réservation
   */
  async sendBookingConfirmation(userEmail, bookingDetails) {
    const subject = 'Confirmation de réservation - CovoiCI';
    const text = `Bonjour,\n\nVotre réservation a été confirmée !\n\nDétails du trajet:\n- Départ: ${bookingDetails.departure}\n- Arrivée: ${bookingDetails.arrival}\n- Date: ${bookingDetails.date}\n- Heure: ${bookingDetails.time}\n\nBon voyage !\n\nL'équipe CovoiCI`;
    
    return await this.sendEmail(userEmail, subject, text);
  }

  /**
   * Envoie un email de rappel
   */
  async sendReminder(userEmail, reminderDetails) {
    const subject = 'Rappel de trajet - CovoiCI';
    const text = `Bonjour,\n\nRappel de votre trajet prévu ${reminderDetails.when} !\n\nN'oubliez pas votre trajet de ${reminderDetails.departure} vers ${reminderDetails.arrival}.\n\nBonne route !\n\nL'équipe CovoiCI`;
    
    return await this.sendEmail(userEmail, subject, text);
  }

  /**
   * Envoie un email de notification de signalement
   */
  async sendReportNotification(adminEmail, reportDetails) {
    const subject = 'Nouveau signalement - CovoiCI';
    const text = `Un nouveau signalement a été reçu.\n\nType: ${reportDetails.type}\nUtilisateur: ${reportDetails.reportedUser}\nMotif: ${reportDetails.reason}\n\nVeuillez traiter ce signalement dans l'interface d'administration.`;
    
    return await this.sendEmail(adminEmail, subject, text);
  }

  /**
   * Envoie un email de réinitialisation de mot de passe
   */
  async sendPasswordReset(userEmail, resetToken) {
    const subject = 'Réinitialisation de mot de passe - CovoiCI';
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    const text = `Bonjour,\n\nVous avez demandé une réinitialisation de votre mot de passe.\n\nCliquez sur ce lien pour définir un nouveau mot de passe:\n${resetUrl}\n\nCe lien expire dans 1 heure.\n\nSi vous n'avez pas fait cette demande, ignorez cet email.\n\nL'équipe CovoiCI`;
    
    return await this.sendEmail(userEmail, subject, text);
  }

  // =====================================================
  // MÉTHODES UTILITAIRES
  // =====================================================

  /**
   * Simule l'envoi d'un email avec un délai
   */
  async simulateEmailSending() {
    // Simulation d'un délai d'envoi
    return new Promise((resolve) => {
      setTimeout(resolve, Math.random() * 1000 + 500);
    });
  }

  /**
   * Génère un ID de message unique
   */
  generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Valide un format d'email
   */
  isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  /**
   * Template HTML basique
   */
  generateHtmlTemplate(title, content) {
    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <title>${title}</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background-color: #007bff; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>CovoiCI</h1>
          </div>
          <div class="content">
            ${content}
          </div>
          <div class="footer">
            <p>CovoiCI - Plateforme de covoiturage en Côte d'Ivoire</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

// Instance singleton
const emailService = new EmailService();

// Exports pour compatibilité
module.exports = {
  EmailService,
  emailService,
  sendEmail: (to, subject, text, html) => emailService.sendEmail(to, subject, text, html),
  sendWelcomeEmail: (email, name) => emailService.sendWelcomeEmail(email, name),
  sendBookingConfirmation: (email, details) => emailService.sendBookingConfirmation(email, details),
  sendReminder: (email, details) => emailService.sendReminder(email, details),
  sendReportNotification: (email, details) => emailService.sendReportNotification(email, details),
  sendPasswordReset: (email, token) => emailService.sendPasswordReset(email, token)
};