// services/cinetPayService.js
const axios = require('axios');
const Paiement = require('../models/Paiement');

class CinetPayService {
  constructor() {
    this.apiUrl = process.env.CINETPAY_API_URL || 'https://api-checkout.cinetpay.com/v2';
    this.siteId = process.env.CINETPAY_SITE_ID;
    this.apiKey = process.env.CINETPAY_API_KEY;
    this.secretKey = process.env.CINETPAY_SECRET_KEY;
    this.environment = process.env.CINETPAY_ENV || 'sandbox';
    this.baseReturnUrl = process.env.BASE_URL || 'https://localhost:3000';
    
    if (!this.siteId || !this.apiKey || !this.secretKey) {
      console.warn('Configuration CinetPay incomplète');
    }
  }

  async initierPaiement(reservationId, montantTotal) {
    try {
      // Créer le paiement en base avec votre modèle existant
      const paiement = new Paiement({
        reservationId,
        payeurId: await this.getPayeurFromReservation(reservationId),
        beneficiaireId: await this.getBeneficiaireFromReservation(reservationId),
        montantTotal,
        methodePaiement: 'WAVE', // ou autre selon le choix
        statutPaiement: 'EN_ATTENTE'
      });

      // Calculer la commission (10% par défaut)
      paiement.calculerCommission(0.10);
      
      // Valider les règles de paiement
      const reglesValides = await paiement.validerReglesPaiement();
      if (!reglesValides) {
        throw new Error('Règles de paiement non respectées');
      }

      await paiement.save();

      // Préparer les données CinetPay
      const cinetPayData = {
        apikey: this.apiKey,
        site_id: this.siteId,
        transaction_id: paiement.referenceTransaction,
        amount: montantTotal,
        currency: 'XOF',
        description: `Paiement course - ${paiement.referenceTransaction}`,
        return_url: `${this.baseReturnUrl}/paiement/retour/${paiement.referenceTransaction}`,
        notify_url: `${this.baseReturnUrl}/api/webhook/cinetpay`,
        cancel_url: `${this.baseReturnUrl}/paiement/annule/${paiement.referenceTransaction}`,
        customer_phone_number: await this.getCustomerPhone(paiement.payeurId),
        customer_email: await this.getCustomerEmail(paiement.payeurId),
        customer_name: await this.getCustomerName(paiement.payeurId),
        channels: 'WAVE',
        metadata: JSON.stringify({
          paiementId: paiement._id,
          reservationId
        })
      };

      // Appel API CinetPay
      const response = await this.appellerAPICinetPay('/payment', cinetPayData);

      if (response.code === '201') {
        paiement.referencePaiementMobile = response.data.payment_token;
        paiement.ajouterLog('CINETPAY_INITIE', {
          paymentUrl: response.data.payment_url,
          token: response.data.payment_token
        });
        await paiement.save();

        return {
          success: true,
          paiementId: paiement._id,
          paymentUrl: response.data.payment_url,
          referenceTransaction: paiement.referenceTransaction
        };
      } else {
        paiement.statutPaiement = 'ECHEC';
        paiement.ajouterErreur('CINETPAY_INIT_ECHEC', response.message);
        await paiement.save();
        throw new Error(response.message);
      }

    } catch (error) {
      console.error('Erreur initiation CinetPay:', error);
      throw error;
    }
  }

  async verifierStatutTransaction(referenceTransaction) {
    try {
      const paiement = await Paiement.findOne({ referenceTransaction });
      if (!paiement) {
        throw new Error('Transaction introuvable');
      }

      const statusData = {
        apikey: this.apiKey,
        site_id: this.siteId,
        transaction_id: referenceTransaction
      };

      const response = await this.appellerAPICinetPay('/payment/check', statusData);

      if (response.code === '00') {
        paiement.statutPaiement = 'COMPLETE';
        paiement.mobileMoney.statutMobileMoney = 'SUCCESS';
        paiement.mobileMoney.transactionId = response.data.payment_id;
        await paiement.traiterCommissionApresPayement();
      } else if (response.code === '629') {
        // En attente
        paiement.ajouterLog('VERIFICATION_STATUS', { statut: 'en_attente' });
      } else {
        paiement.statutPaiement = 'ECHEC';
        paiement.mobileMoney.statutMobileMoney = 'FAILED';
      }

      await paiement.save();
      return paiement.obtenirResume();

    } catch (error) {
      console.error('Erreur vérification statut:', error);
      throw error;
    }
  }

  async traiterWebhook(webhookData) {
    try {
      const { cpm_trans_id, cpm_result } = webhookData;

      const paiement = await Paiement.findOne({ referenceTransaction: cpm_trans_id });
      if (!paiement) {
        return { success: false, message: 'Paiement introuvable' };
      }

      paiement.ajouterLog('WEBHOOK_RECU', webhookData);

      if (cpm_result === '00') {
        paiement.statutPaiement = 'COMPLETE';
        paiement.mobileMoney.statutMobileMoney = 'SUCCESS';
        paiement.mobileMoney.transactionId = webhookData.cpm_payid;
        await paiement.traiterCommissionApresPayement();
      } else {
        paiement.statutPaiement = 'ECHEC';
        paiement.mobileMoney.statutMobileMoney = 'FAILED';
      }

      await paiement.save();
      return { success: true, paiementId: paiement._id };

    } catch (error) {
      console.error('Erreur webhook:', error);
      throw error;
    }
  }

  async appellerAPICinetPay(endpoint, data) {
    try {
      const response = await axios.post(`${this.apiUrl}${endpoint}`, data, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 30000
      });

      return response.data;
    } catch (error) {
      if (error.response?.data) {
        return error.response.data;
      }
      throw new Error(`Erreur API CinetPay: ${error.message}`);
    }
  }

  async getPayeurFromReservation(reservationId) {
    const Reservation = require('../models/Reservation');
    const reservation = await Reservation.findById(reservationId);
    return reservation.passagerId;
  }

  async getBeneficiaireFromReservation(reservationId) {
    const Reservation = require('../models/Reservation');
    const reservation = await Reservation.findById(reservationId).populate('trajetId');
    return reservation.trajetId.conducteurId;
  }

  async getCustomerPhone(userId) {
    const Utilisateur = require('../models/Utilisateur');
    const user = await Utilisateur.findById(userId);
    return user.telephone;
  }

  async getCustomerEmail(userId) {
    const Utilisateur = require('../models/Utilisateur');
    const user = await Utilisateur.findById(userId);
    return user.email;
  }

  async getCustomerName(userId) {
    const Utilisateur = require('../models/Utilisateur');
    const user = await Utilisateur.findById(userId);
    return `${user.prenom} ${user.nom}`;
  }
}

module.exports = CinetPayService;