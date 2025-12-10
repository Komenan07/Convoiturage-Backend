const axios = require('axios');
const { logger } = require('../utils/logger');

class WhatsAppService {
  constructor() {
    this.apiUrl = process.env.WHATSAPP_API_URL || 'https://waba.360dialog.io/v1';
    this.apiKey = process.env.WHATSAPP_API_KEY;
    
    if (!this.apiKey) {
      logger.warn('⚠️ WHATSAPP_API_KEY non configurée');
    }
  }

  /**
   * Formater le numéro de téléphone au format international
   */
  formaterNumero(telephone) {
    if (!telephone) return null;

    // Retirer les espaces, tirets, parenthèses, points
    let numero = telephone.replace(/[\s\-()]/g, '');

    // Si le numéro commence par 0, remplacer par l'indicatif ivoirien +225
    if (numero.startsWith('0')) {
      numero = '225' + numero.substring(1);
    }

    // Si le numéro ne commence pas déjà par 225, l'ajouter
    if (!numero.startsWith('225') && !numero.startsWith('+225')) {
      numero = '225' + numero;
    }

    // Si le numéro ne commence pas par +, l'ajouter
    if (!numero.startsWith('+')) {
      numero = '+' + numero;
    }

    logger.debug('Numéro formaté:', { original: telephone, formate: numero });
    
    return numero;
  }

  /**
   * Envoyer un message WhatsApp
   */
  async envoyerMessage(telephone, message) {
    try {
      if (!this.apiKey) {
        throw new Error('WHATSAPP_API_KEY non configurée');
      }

      const numeroFormate = this.formaterNumero(telephone);
      
      if (!numeroFormate) {
        throw new Error('Numéro de téléphone invalide');
      }

      logger.info('📱 Envoi message WhatsApp', {
        to: numeroFormate,
        longueurMessage: message.length
      });

      const response = await axios.post(
        `${this.apiUrl}/messages`,
        {
          to: numeroFormate,
          type: 'text',
          text: {
            body: message
          }
        },
        {
          headers: {
            'D360-API-KEY': this.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 10000 // 10 secondes
        }
      );

      logger.info('✅ Message WhatsApp envoyé', {
        to: numeroFormate,
        messageId: response.data.messages?.[0]?.id
      });

      return {
        success: true,
        messageId: response.data.messages?.[0]?.id
      };
    } catch (error) {
      logger.error('❌ Erreur envoi WhatsApp:', {
        telephone,
        error: error.message,
        response: error.response?.data,
        status: error.response?.status
      });
      throw error;
    }
  }

  /**
   * Envoyer un message WhatsApp avec template
   */
  async envoyerMessageTemplate(telephone, templateName, parameters) {
    try {
      if (!this.apiKey) {
        throw new Error('WHATSAPP_API_KEY non configurée');
      }

      const numeroFormate = this.formaterNumero(telephone);

      logger.info('📱 Envoi template WhatsApp', {
        to: numeroFormate,
        template: templateName
      });

      const response = await axios.post(
        `${this.apiUrl}/messages`,
        {
          to: numeroFormate,
          type: 'template',
          template: {
            name: templateName,
            language: {
              code: 'fr'
            },
            components: [
              {
                type: 'body',
                parameters: parameters.map(param => ({
                  type: 'text',
                  text: param
                }))
              }
            ]
          }
        },
        {
          headers: {
            'D360-API-KEY': this.apiKey,
            'Content-Type': 'application/json'
          },
          timeout: 10000
        }
      );

      logger.info('✅ Template WhatsApp envoyé', {
        to: numeroFormate,
        template: templateName,
        messageId: response.data.messages?.[0]?.id
      });

      return {
        success: true,
        messageId: response.data.messages?.[0]?.id
      };
    } catch (error) {
      logger.error('❌ Erreur envoi template WhatsApp:', {
        telephone,
        templateName,
        error: error.message,
        response: error.response?.data
      });
      throw error;
    }
  }
}

module.exports = new WhatsAppService();