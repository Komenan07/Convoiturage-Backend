// services/greenApiService.js
const axios = require('axios');

class GreenApiService {
  constructor() {
    this.idInstance = process.env.GREEN_API_INSTANCE_ID;
    this.apiTokenInstance = process.env.GREEN_API_TOKEN;
    this.baseUrl = `https://api.green-api.com/waInstance${this.idInstance}`;
    
    if (!this.idInstance || !this.apiTokenInstance) {
      console.error('❌ Green-API non configuré. Ajoutez GREEN_API_INSTANCE_ID et GREEN_API_TOKEN dans .env');
    }
  }

  /**
   * Formater le numéro de téléphone pour WhatsApp
   * @param {string} telephone - Numéro au format +225XXXXXXXX ou 07XXXXXXXX
   * @returns {string} Numéro au format WhatsApp (225XXXXXXXXX@c.us)
   */
  formaterNumeroWhatsApp(telephone) {
    // Retirer tous les espaces et caractères spéciaux
    let numero = telephone.replace(/[\s\-()]/g, '');

    
    // Si le numéro commence par +225, retirer le +
    if (numero.startsWith('+225')) {
      numero = numero.substring(1);
    }
    // Si le numéro commence par 0, remplacer par 225
    else if (numero.startsWith('0')) {
      numero = '225' + numero.substring(1);
    }
    // Si le numéro ne commence pas par 225, l'ajouter
    else if (!numero.startsWith('225')) {
      numero = '225' + numero;
    }
    
    return `${numero}@c.us`;
  }

  /**
   * Envoyer un message WhatsApp
   * @param {string} telephone - Numéro de téléphone
   * @param {string} message - Message à envoyer
   * @returns {Promise<Object>} Résultat de l'envoi
   */
  async envoyerMessage(telephone, message) {
    try {
      const chatId = this.formaterNumeroWhatsApp(telephone);
      
      const url = `${this.baseUrl}/sendMessage/${this.apiTokenInstance}`;
      
      const response = await axios.post(url, {
        chatId: chatId,
        message: message
      }, {
        headers: {
          'Content-Type': 'application/json'
        },
        timeout: 10000 // 10 secondes timeout
      });

      console.log('✅ Message WhatsApp envoyé:', {
        telephone: telephone,
        chatId: chatId,
        idMessage: response.data.idMessage
      });

      return {
        success: true,
        idMessage: response.data.idMessage,
        data: response.data
      };

    } catch (error) {
      console.error('❌ Erreur envoi WhatsApp:', {
        message: error.message,
        response: error.response?.data,
        status: error.response?.status
      });

      return {
        success: false,
        error: error.message,
        details: error.response?.data
      };
    }
  }

  /**
   * Envoyer un code de vérification
   * @param {string} telephone - Numéro de téléphone
   * @param {string} code - Code de vérification
   * @param {string} nomComplet - Nom complet de l'utilisateur
   * @returns {Promise<Object>}
   */
  async envoyerCodeVerification(telephone, code, nomComplet) {
    const message = `🚗 *Bienvenue ${nomComplet} !*

Votre code de vérification pour l'application Covoiturage est :

🔐 *${code}*

Ce code est valide pendant *10 minutes*.

⚠️ Ne partagez ce code avec personne.

Merci de votre confiance ! 🙏`;

    return this.envoyerMessage(telephone, message);
  }

  /**
   * Envoyer une notification de bienvenue
   * @param {string} telephone - Numéro de téléphone
   * @param {string} prenom - Prénom de l'utilisateur
   * @returns {Promise<Object>}
   */
  async envoyerMessageBienvenue(telephone, prenom) {
    const message = `✅ *Compte vérifié avec succès !*

Félicitations ${prenom} ! 🎉

Votre compte Covoiturage est maintenant actif.

Vous pouvez commencer à :
🚗 Proposer des trajets
🧳 Réserver des places
💬 Échanger avec la communauté

Bon voyage ! 🛣️`;

    return this.envoyerMessage(telephone, message);
  }

  /**
   * 🔐 NOUVEAU - Envoyer un code de réinitialisation de mot de passe
   * @param {string} telephone - Numéro de téléphone
   * @param {string} code - Code de réinitialisation (6 chiffres)
   * @param {string} nomComplet - Nom complet de l'utilisateur
   * @returns {Promise<Object>}
   */
  async envoyerCodeResetMotDePasse(telephone, code, nomComplet) {
    const message = `🔐 *Réinitialisation de mot de passe*

Bonjour ${nomComplet},

Votre code de réinitialisation Covoiturage est :

🔑 *${code}*

Ce code est valide pendant *10 minutes*.

⚠️ Si vous n'avez pas demandé cette réinitialisation, ignorez ce message et contactez le support.

Sécurité avant tout ! 🛡️`;

    const resultat = await this.envoyerMessage(telephone, message);

    if (resultat.success) {
      console.log('✅ Code réinitialisation envoyé:', {
        telephone: telephone,
        code: code.substring(0, 2) + '****' // Masquer partiellement le code dans les logs
      });
    }

    return resultat;
  }

  /**
   * 🔐 NOUVEAU - Envoyer une confirmation de réinitialisation réussie
   * @param {string} telephone - Numéro de téléphone
   * @param {string} prenom - Prénom de l'utilisateur
   * @returns {Promise<Object>}
   */
  async envoyerConfirmationResetMotDePasse(telephone, prenom) {
    const message = `✅ *Mot de passe réinitialisé avec succès !*

Bonjour ${prenom},

Votre mot de passe Covoiturage a été modifié avec succès. 🎉

Vous pouvez maintenant vous connecter avec votre nouveau mot de passe.

🔒 *Conseils de sécurité :*
- Ne partagez jamais votre mot de passe
- Utilisez un mot de passe unique et complexe
- Changez-le régulièrement

Si vous n'êtes pas à l'origine de cette modification, contactez immédiatement notre support.

Bon covoiturage ! 🚗`;

    const resultat = await this.envoyerMessage(telephone, message);

    if (resultat.success) {
      console.log('✅ Confirmation réinitialisation envoyée:', {
        telephone: telephone,
        prenom: prenom
      });
    }

    return resultat;
  }

  /**
   * Vérifier l'état de l'instance Green-API
   * @returns {Promise<Object>}
   */
  async verifierEtatInstance() {
    try {
      const url = `${this.baseUrl}/getStateInstance/${this.apiTokenInstance}`;
      const response = await axios.get(url, { timeout: 5000 });
      
      console.log('📱 État instance Green-API:', response.data);
      
      return {
        success: true,
        etat: response.data.stateInstance,
        data: response.data
      };
    } catch (error) {
      console.error('❌ Erreur vérification instance:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  /**
   * Obtenir les paramètres de l'instance
   * @returns {Promise<Object>}
   */
  async obtenirParametresInstance() {
    try {
      const url = `${this.baseUrl}/getSettings/${this.apiTokenInstance}`;
      const response = await axios.get(url, { timeout: 5000 });
      
      return {
        success: true,
        parametres: response.data
      };
    } catch (error) {
      console.error('❌ Erreur récupération paramètres:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }
}

// Exporter une instance unique (singleton)
module.exports = new GreenApiService();