// services/infobipService.js
const https = require('follow-redirects').https;
const { logger } = require('../utils/logger');

class InfobipService {
  constructor() {
    this.apiKey = process.env.INFOBIP_API_KEY;
    this.baseUrl = process.env.INFOBIP_BASE_URL || 'z3xnw6.api.infobip.com';
    this.smsSender = process.env.INFOBIP_SMS_SENDER || 'InfoSMS';
    this.whatsappSender = process.env.INFOBIP_WHATSAPP_SENDER || '447860099299';
    
    this.mockMode = process.env.INFOBIP_MOCK_MODE === 'false';
    this.showCodes = process.env.SHOW_VERIFICATION_CODES === 'true';

    console.log('🔥🔥🔥 DEBUG INFOBIP CONSTRUCTOR 🔥🔥🔥');
    console.log('  INFOBIP_MOCK_MODE (env):', process.env.INFOBIP_MOCK_MODE);
    console.log('  this.mockMode:', this.mockMode);
    console.log('  Type:', typeof this.mockMode);
    console.log('  API Key present:', !!this.apiKey);
    console.log('  API Key length:', this.apiKey ? this.apiKey.length : 0);
    console.log('🔥🔥🔥 FIN DEBUG 🔥🔥🔥');

    if (!this.apiKey && !this.mockMode) {
      logger.warn('⚠️ InfoBip API Key manquante - Mode mock activé');
      this.mockMode = true;
    } else if (this.apiKey) {
      logger.info('✅ InfoBip Service initialisé', {
        baseUrl: this.baseUrl,
        smsSender: this.smsSender,
        mockMode: this.mockMode
      });
    }
  }

  /**
   * 📧 Envoyer un SMS via InfoBip
   */
  async envoyerSMS(telephone, message) {
    return new Promise((resolve, reject) => {
      if (this.mockMode) {
        logger.info('📱 Mode MOCK - SMS non envoyé', { telephone });
        resolve({
          success: true,
          messageId: 'mock_' + Date.now(),
          provider: 'infobip-mock'
        });
        return;
      }

      logger.info('📤 Envoi SMS InfoBip', { 
        to: telephone,
        sender: this.smsSender 
      });

      const options = {
        method: 'POST',
        hostname: this.baseUrl,
        path: '/sms/2/text/advanced',
        headers: {
          'Authorization': `App ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        maxRedirects: 20
      };

      const request = https.request(options, (response) => {
        let chunks = [];

        response.on('data', (chunk) => {
          chunks.push(chunk);
        });

        response.on('end', () => {
          try {
            const body = Buffer.concat(chunks).toString();
            const data = JSON.parse(body);

            if (response.statusCode >= 200 && response.statusCode < 300) {
              logger.info('✅ SMS InfoBip envoyé', {
                messageId: data.messages?.[0]?.messageId,
                status: data.messages?.[0]?.status?.groupName
              });

              resolve({
                success: true,
                messageId: data.messages?.[0]?.messageId,
                status: data.messages?.[0]?.status?.groupName,
                provider: 'infobip-sms',
                response: data
              });
            } else {
              logger.error('❌ Erreur InfoBip SMS', {
                status: response.statusCode,
                body: body
              });

              reject(new Error(`InfoBip SMS Error: ${body}`));
            }
          } catch (parseError) {
            logger.error('❌ Erreur parsing réponse InfoBip', parseError);
            reject(parseError);
          }
        });
      });

      request.on('error', (error) => {
        logger.error('❌ Erreur réseau InfoBip SMS', error);
        reject(error);
      });

      // Timeout safety
      request.setTimeout(10000, () => {
        const err = new Error('Timeout InfoBip SMS');
        logger.error('⏱️ ' + err.message);
        try { request.abort(); } catch(e) {}
        reject(err);
      });

      const postData = JSON.stringify({
        messages: [
          {
            destinations: [{ to: telephone }],
            from: this.smsSender,
            text: message
          }
        ]
      });

      request.write(postData);
      request.end();
    });
  }

  /**
   * 💬 Envoyer un message WhatsApp via InfoBip
   */
  async envoyerWhatsApp(telephone, message) {
    return new Promise((resolve, reject) => {
      if (this.mockMode) {
        logger.info('📱 Mode MOCK - WhatsApp non envoyé', { telephone });
        resolve({
          success: true,
          messageId: 'mock_whatsapp_' + Date.now(),
          provider: 'infobip-mock'
        });
        return;
      }

      logger.info('📤 Envoi WhatsApp InfoBip', { 
        to: telephone,
        sender: this.whatsappSender 
      });

      const options = {
        method: 'POST',
        hostname: this.baseUrl,
        path: '/whatsapp/1/message/text',
        headers: {
          'Authorization': `App ${this.apiKey}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        maxRedirects: 20
      };

      const request = https.request(options, (response) => {
        let chunks = [];

        response.on('data', (chunk) => {
          chunks.push(chunk);
        });

        response.on('end', () => {
          try {
            const body = Buffer.concat(chunks).toString();
            const data = JSON.parse(body);

            if (response.statusCode >= 200 && response.statusCode < 300) {
              logger.info('✅ WhatsApp InfoBip envoyé', {
                messageId: data.messageId,
                status: data.status
              });

              resolve({
                success: true,
                messageId: data.messageId,
                status: data.status,
                provider: 'infobip-whatsapp',
                response: data
              });
            } else {
              logger.error('❌ Erreur InfoBip WhatsApp', {
                status: response.statusCode,
                body: body
              });

              reject(new Error(`InfoBip WhatsApp Error: ${body}`));
            }
          } catch (parseError) {
            logger.error('❌ Erreur parsing réponse WhatsApp', parseError);
            reject(parseError);
          }
        });
      });

      request.on('error', (error) => {
        logger.error('❌ Erreur réseau InfoBip WhatsApp', error);
        reject(error);
      });

      // Timeout safety
      request.setTimeout(10000, () => {
        const err = new Error('Timeout InfoBip WhatsApp');
        logger.error('⏱️ ' + err.message);
        try { request.abort(); } catch(e) {}
        reject(err);
      });

      const postData = JSON.stringify({
        from: this.whatsappSender,
        to: telephone,
        messageId: `whatsapp_${Date.now()}`,
        content: {
          text: message
        }
      });

      request.write(postData);
      request.end();
    });
  }

  /**
   * 🎯 MÉTHODE PRINCIPALE : Code de vérification avec fallback SMS
   * Compatible avec la signature de twilioService
   */
  async envoyerCodeVerification(telephone, code, nomComplet = '') {
    try {
      const message = `[WAYZ-ECO] Bonjour ${nomComplet},\n\nVotre code de vérification est : ${code}\n\nCe code expire dans ${process.env.OTP_EXPIRATION_MINUTES || 10} minutes.\n\n⚠️ Ne partagez jamais ce code.`;

      if (this.showCodes) {
        console.log(`\n🔑 CODE OTP: ${code} pour ${telephone}\n`);
      }

      if (this.mockMode) {
        console.log(`📱 [MOCK] Code pour ${telephone}: ${code}`);
        return {
          success: true,
          messageId: 'mock_' + Date.now(),
          provider: 'infobip-mock'
        };
      }

      logger.info('🎯 Stratégie: WhatsApp -> SMS (fallback)');

      // Essayer WhatsApp d'abord
      try {
        const waResult = await this.envoyerWhatsApp(telephone, message);
        if (waResult && waResult.success) {
          logger.info('✅ ✅ Code envoyé via WhatsApp InfoBip', { messageId: waResult.messageId });
          return waResult;
        }
      } catch (waErr) {
        logger.warn('⚠️ Échec envoi WhatsApp, tentative SMS', { error: waErr.message || waErr });
      }

      // Fallback vers SMS
      try {
        const smsResult = await this.envoyerSMS(telephone, message);
        if (smsResult && smsResult.success) {
          logger.info('✅ ✅ Code envoyé via SMS InfoBip', { messageId: smsResult.messageId });
          return smsResult;
        }
      } catch (smsErr) {
        logger.error('❌ Échec envoi SMS lors du fallback', { error: smsErr.message || smsErr });
      }

      logger.error('❌ Échec envoi code InfoBip (WhatsApp + SMS)');
      return {
        success: false,
        error: 'Impossible d\'envoyer le code par WhatsApp ou SMS',
        provider: 'infobip-failed'
      };

    } catch (error) {
      logger.error('❌ Erreur envoi code InfoBip:', error);
      return {
        success: false,
        error: error.message,
        provider: 'infobip-error'
      };
    }
  }

  /**
   * 💬 Message de bienvenue
   */
  async envoyerMessageBienvenue(telephone, prenom) {
    try {
      const message = `🎉 Bienvenue ${prenom} sur WAYZ-ECO !\n\nVotre compte est maintenant actif. Vous pouvez commencer à utiliser la plateforme de covoiturage.\n\nBon voyage ! 🚗`;

      if (this.mockMode) {
        logger.info('📱 Mode MOCK - Message bienvenue non envoyé');
        return { success: true, provider: 'infobip-mock' };
      }

      const result = await this.envoyerSMS(telephone, message);
      return result;

    } catch (error) {
      logger.error('❌ Erreur message bienvenue:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * 🔐 Code de réinitialisation mot de passe
   */
  async envoyerCodeResetMotDePasse(telephone, code, nomComplet = '') {
    try {
      const message = `[WAYZ-ECO] Bonjour ${nomComplet},\n\nVotre code de réinitialisation de mot de passe est : ${code}\n\nCe code expire dans 10 minutes.\n\n⚠️ Si vous n'avez pas demandé cette réinitialisation, ignorez ce message.`;

      if (this.showCodes) {
        console.log(`\n🔐 CODE RESET: ${code} pour ${telephone}\n`);
      }

      if (this.mockMode) {
        console.log(`📱 [MOCK] Code reset pour ${telephone}: ${code}`);
        return { success: true, provider: 'infobip-mock' };
      }

      const result = await this.envoyerSMS(telephone, message);
      return result;

    } catch (error) {
      logger.error('❌ Erreur code reset:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * ✅ Confirmation réinitialisation
   */
  async envoyerConfirmationResetMotDePasse(telephone, prenom) {
    try {
      const message = `✅ [WAYZ-ECO] Bonjour ${prenom},\n\nVotre mot de passe a été réinitialisé avec succès.\n\nVous pouvez maintenant vous connecter avec votre nouveau mot de passe.\n\n⚠️ Si ce n'était pas vous, contactez-nous immédiatement.`;

      if (this.mockMode) {
        logger.info('📱 Mode MOCK - Confirmation non envoyée');
        return { success: true, provider: 'infobip-mock' };
      }

      const result = await this.envoyerSMS(telephone, message);
      return result;

    } catch (error) {
      logger.error('❌ Erreur confirmation reset:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = new InfobipService();