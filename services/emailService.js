const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs').promises;
const { logger } = require('../utils/logger');

/**
 * Service d'envoi d'emails complet avec support SMTP et templates HTML
 */
class EmailService {
  constructor() {
    // Configuration SMTP
    this.transporter = null;
    this.initialized = false;
    
    this.initTransporter();
  }

  /**
   * Initialiser le transporteur SMTP
   */
  async initTransporter() {
    try {
      // Vérifier si les variables d'environnement sont configurées
      if (!process.env.SMTP_HOST || !process.env.SMTP_USER || !process.env.SMTP_PASSWORD) {
        logger.warn('⚠️ Configuration SMTP manquante - Mode simulation activé');
        this.initialized = false;
        return;
      }

      this.transporter = nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: parseInt(process.env.SMTP_PORT) || 587,
        secure: process.env.SMTP_SECURE === 'true',
        auth: {
          user: process.env.SMTP_USER,
          pass: process.env.SMTP_PASSWORD
        }
      });

      // Vérifier la connexion
      await this.transporter.verify();
      this.initialized = true;
      logger.info('✅ Service email initialisé avec succès');
    } catch (error) {
      logger.error('❌ Erreur initialisation SMTP:', error);
      this.initialized = false;
    }
  }

  // =====================================================
  // NOUVELLE MÉTHODE PRINCIPALE AVEC TEMPLATES HTML
  // =====================================================

  /**
   * Envoyer un email avec template HTML avancé
   * @param {Object} options - Options d'envoi
   * @param {string} options.to - Destinataire
   * @param {string} options.subject - Sujet
   * @param {string} options.template - Nom du template HTML
   * @param {Object} options.data - Données pour le template
   * @param {string} options.html - HTML direct (si pas de template)
   * @param {string} options.text - Texte brut
   */
  async envoyerEmail({ to, subject, template, data, html, text }) {
    try {
      // Validation
      if (!to || !subject) {
        throw new Error('Destinataire et sujet requis');
      }

      let htmlContent = html;
      let textContent = text;

      // Si un template est spécifié, le charger
      if (template) {
        htmlContent = await this.chargerTemplate(template, data);
        textContent = this.genererTextePlain(template, data);
      }

      // Si SMTP configuré, envoyer vraiment
      if (this.initialized && this.transporter) {
        const mailOptions = {
          from: `"WAYZ-ECO" <${process.env.SMTP_FROM || process.env.SMTP_USER}>`,
          to,
          subject,
          html: htmlContent,
          text: textContent
        };

        const info = await this.transporter.sendMail(mailOptions);

        logger.info('✅ Email envoyé avec succès', {
          to,
          subject,
          messageId: info.messageId,
          template
        });

        return {
          success: true,
          messageId: info.messageId
        };
      } 
      // Sinon, simuler l'envoi
      else {
        return await this.simulerEnvoi(to, subject, template || 'custom');
      }
    } catch (error) {
      logger.error('❌ Erreur envoi email:', {
        to,
        subject,
        error: error.message
      });
      throw error;
    }
  }

  /**
   * Charger un template HTML
   */
  async chargerTemplate(templateName, data) {
    try {
      const templatePath = path.join(
        __dirname,
        '..',
        'templates',
        'emails',
        `${templateName}.html`
      );

      let template = await fs.readFile(templatePath, 'utf-8');

      // Remplacer les variables simples {{variable}}
      Object.keys(data).forEach(key => {
        if (typeof data[key] !== 'object') {
          const regex = new RegExp(`{{${key}}}`, 'g');
          template = template.replace(regex, data[key] || '');
        }
      });

      // Traitement spécial pour les listes de documents
      if (data.documentsManquants && Array.isArray(data.documentsManquants)) {
        const listeHtml = data.documentsManquants
          .map((doc, index) => `
            <li style="
              padding: 15px;
              margin-bottom: 12px;
              background: linear-gradient(135deg, #f8f9fa 0%, #e9ecef 100%);
              border-left: 4px solid #6A5ACD;
              border-radius: 8px;
              color: #333;
              font-size: 15px;
              font-weight: 500;
              list-style: none;
            ">
              <span style="
                display: inline-block;
                width: 28px;
                height: 28px;
                background: linear-gradient(135deg, #2E8B57 0%, #6A5ACD 100%);
                color: white;
                border-radius: 50%;
                text-align: center;
                line-height: 28px;
                font-size: 14px;
                font-weight: 700;
                margin-right: 15px;
              ">${index + 1}</span>
              ${doc}
            </li>
          `)
          .join('');
        template = template.replace('{{listeDocuments}}', listeHtml);
      }

      return template;
    } catch (error) {
      logger.error('❌ Erreur chargement template:', {
        templateName,
        error: error.message
      });
      // Fallback sur template simple
      return this.genererTemplateSimple(data);
    }
  }

  /**
   * Générer un template HTML simple en fallback
   */
  genererTemplateSimple(data) {
    const listeDocuments = data.documentsManquants 
      ? data.documentsManquants.map((doc, i) => `<li>${i + 1}. ${doc}</li>`).join('')
      : '';

    return `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; padding: 20px; }
          .container { max-width: 600px; margin: 0 auto; background: #f9f9f9; padding: 20px; border-radius: 8px; }
          .header { background: #2E8B57; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { padding: 20px; background: white; }
          ul { padding-left: 20px; }
          li { margin-bottom: 8px; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #777; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>WAYZ-ECO</h1>
          </div>
          <div class="content">
            <p>Bonjour ${data.nomComplet || 'Cher utilisateur'},</p>
            ${data.documentsManquants ? `
              <p>Documents manquants pour votre véhicule ${data.vehicule} (${data.immatriculation}) :</p>
              <ul>${listeDocuments}</ul>
              <p>Veuillez télécharger ces documents depuis votre application.</p>
            ` : ''}
            ${data.dateValidation ? `
              <p>Félicitations ! Votre véhicule ${data.vehicule} (${data.immatriculation}) a été validé le ${data.dateValidation}.</p>
            ` : ''}
          </div>
          <div class="footer">
            <p>© 2025 WAYZ-ECO - Côte d'Ivoire 🇨🇮</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }

  /**
   * Générer la version texte plain
   */
  genererTextePlain(templateName, data) {
    if (templateName === 'documents-manquants') {
      const listeDocuments = data.documentsManquants
        ? data.documentsManquants.map((doc, i) => `${i + 1}. ${doc}`).join('\n')
        : '';

      return `Bonjour ${data.nomComplet},

Votre véhicule ${data.vehicule} (${data.immatriculation}) ne peut pas être validé car les documents suivants sont manquants :

${listeDocuments}

Veuillez télécharger ces documents depuis votre application WAYZ-ECO.

Cordialement,
L'équipe WAYZ-ECO`;
    }

    if (templateName === 'vehicule-valide') {
      return `Félicitations ${data.nomComplet} !

Votre véhicule ${data.vehicule} (${data.immatriculation}) a été validé avec succès le ${data.dateValidation}.

Vous pouvez maintenant l'utiliser pour vos trajets sur WAYZ-ECO.

Bonne route !
L'équipe WAYZ-ECO`;
    }

    return data.message || '';
  }

  // =====================================================
  // MÉTHODES EXISTANTES (COMPATIBILITÉ)
  // =====================================================

  /**
   * Envoie un email simple (ancienne méthode)
   * @param {string} to - Destinataire
   * @param {string} subject - Sujet
   * @param {string} text - Contenu texte
   * @returns {Promise<object>} Résultat de l'envoi
   */
  async sendEmail(to, subject, text) {
    try {
      // Validation des paramètres
      if (!to || !subject || !text) {
        throw new Error('Paramètres d\'email manquants');
      }

      // Si SMTP configuré, utiliser la nouvelle méthode
      if (this.initialized && this.transporter) {
        return await this.envoyerEmail({
          to,
          subject,
          text,
          html: this.generateHtmlTemplate(subject, `<p>${text.replace(/\n/g, '<br>')}</p>`)
        });
      }

      // Sinon, simuler
      return await this.simulerEnvoi(to, subject, 'simple');
      
    } catch (error) {
      logger.error('Erreur envoi email:', error);
      
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
    const subject = 'Bienvenue sur WAYZ-ECO !';
    const text = `Bonjour ${userName},\n\nBienvenue sur WAYZ-ECO, la plateforme de covoiturage en Côte d'Ivoire !\n\nVous pouvez maintenant commencer à partager vos trajets ou rechercher des covoiturages.\n\nBonne route !\n\nL'équipe WAYZ-ECO`;
    
    return await this.sendEmail(userEmail, subject, text);
  }

  /**
   * Envoie un email de confirmation de réservation
   */
  async sendBookingConfirmation(userEmail, bookingDetails) {
    const subject = 'Confirmation de réservation - WAYZ-ECO';
    const text = `Bonjour,\n\nVotre réservation a été confirmée !\n\nDétails du trajet:\n- Départ: ${bookingDetails.departure}\n- Arrivée: ${bookingDetails.arrival}\n- Date: ${bookingDetails.date}\n- Heure: ${bookingDetails.time}\n\nBon voyage !\n\nL'équipe WAYZ-ECO`;
    
    return await this.sendEmail(userEmail, subject, text);
  }

  /**
   * Envoie un email de rappel
   */
  async sendReminder(userEmail, reminderDetails) {
    const subject = 'Rappel de trajet - WAYZ-ECO';
    const text = `Bonjour,\n\nRappel de votre trajet prévu ${reminderDetails.when} !\n\nN'oubliez pas votre trajet de ${reminderDetails.departure} vers ${reminderDetails.arrival}.\n\nBonne route !\n\nL'équipe WAYZ-ECO`;
    
    return await this.sendEmail(userEmail, subject, text);
  }

  /**
   * Envoie un email de notification de signalement
   */
  async sendReportNotification(adminEmail, reportDetails) {
    const subject = 'Nouveau signalement - WAYZ-ECO';
    const text = `Un nouveau signalement a été reçu.\n\nType: ${reportDetails.type}\nUtilisateur: ${reportDetails.reportedUser}\nMotif: ${reportDetails.reason}\n\nVeuillez traiter ce signalement dans l'interface d'administration.`;
    
    return await this.sendEmail(adminEmail, subject, text);
  }

  /**
   * Envoie un email de réinitialisation de mot de passe
   */
  async sendPasswordReset(userEmail, resetToken) {
    const subject = 'Réinitialisation de mot de passe - WAYZ-ECO';
    const resetUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/reset-password?token=${resetToken}`;
    const text = `Bonjour,\n\nVous avez demandé une réinitialisation de votre mot de passe.\n\nCliquez sur ce lien pour définir un nouveau mot de passe:\n${resetUrl}\n\nCe lien expire dans 1 heure.\n\nSi vous n'avez pas fait cette demande, ignorez cet email.\n\nL'équipe WAYZ-ECO`;
    
    return await this.sendEmail(userEmail, subject, text);
  }

  // =====================================================
  // MÉTHODES UTILITAIRES
  // =====================================================

  /**
   * Simule l'envoi d'un email avec un délai
   */
  async simulerEnvoi(to, subject, template) {
    logger.warn('⚠️ MODE SIMULATION - Email non envoyé réellement');
    console.log(`📧 Email simulé envoyé à: ${to}`);
    console.log(`📋 Sujet: ${subject}`);
    console.log(`📝 Template: ${template}`);
    
    // Simulation d'un délai d'envoi
    await new Promise((resolve) => {
      setTimeout(resolve, Math.random() * 500 + 200);
    });

    return {
      success: true,
      messageId: this.generateMessageId(),
      to,
      subject,
      timestamp: new Date().toISOString(),
      simulated: true
    };
  }

  /**
   * Simule l'envoi d'un email avec un délai (ancienne méthode)
   */
  async simulateEmailSending() {
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
   * Template HTML basique (ancienne méthode)
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
          .header { background-color: #2E8B57; color: white; padding: 20px; text-align: center; }
          .content { padding: 20px; background-color: #f9f9f9; }
          .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>WAYZ-ECO</h1>
          </div>
          <div class="content">
            ${content}
          </div>
          <div class="footer">
            <p>WAYZ-ECO - Plateforme de covoiturage en Côte d'Ivoire 🇨🇮</p>
          </div>
        </div>
      </body>
      </html>
    `;
  }
}

// Instance singleton
const emailService = new EmailService();

// Exports pour compatibilité avec l'ancien code ET le nouveau
module.exports = emailService;

// Alternative : exports nommés
module.exports.EmailService = EmailService;
module.exports.emailService = emailService;
module.exports.sendEmail = (to, subject, text) => emailService.sendEmail(to, subject, text);
module.exports.sendWelcomeEmail = (email, name) => emailService.sendWelcomeEmail(email, name);
module.exports.sendBookingConfirmation = (email, details) => emailService.sendBookingConfirmation(email, details);
module.exports.sendReminder = (email, details) => emailService.sendReminder(email, details);
module.exports.sendReportNotification = (email, details) => emailService.sendReportNotification(email, details);
module.exports.sendPasswordReset = (email, token) => emailService.sendPasswordReset(email, token);