// =====================================================
// SERVICES DE PAIEMENT
// =====================================================

const axios = require('axios');
const crypto = require('crypto');
const EventEmitter = require('events');

/**
 * Service de notification pour les événements de paiement
 */
class NotificationService extends EventEmitter {
  constructor() {
    super();
    this.setupEventListeners();
  }

  setupEventListeners() {
    // Écouter les événements de paiement
    this.on('paiement_complete', this.handlePaiementComplete.bind(this));
    this.on('paiement_echec', this.handlePaiementEchec.bind(this));
    this.on('remboursement_complete', this.handleRemboursementComplete.bind(this));
  }

  async envoyerNotificationPaiementComplete(paiement) {
    try {
      const notifications = [
        // Notifier le payeur
        this.envoyerSMS(paiement.payeurId.telephone, {
          type: 'PAIEMENT_COMPLETE_PAYEUR',
          data: {
            montant: paiement.montantTotal,
            reference: paiement.referenceTransaction,
            beneficiaire: `${paiement.beneficiaireId.prenom} ${paiement.beneficiaireId.nom}`
          }
        }),
        
        // Notifier le bénéficiaire
        this.envoyerSMS(paiement.beneficiaireId.telephone, {
          type: 'PAIEMENT_COMPLETE_BENEFICIAIRE',
          data: {
            montant: paiement.montantConducteur,
            reference: paiement.referenceTransaction,
            payeur: `${paiement.payeurId.prenom} ${paiement.payeurId.nom}`
          }
        }),
        
        // Notifier par email si disponible
        ...(paiement.payeurId.email ? [this.envoyerEmail(paiement.payeurId.email, 'RECU_PAIEMENT', paiement)] : []),
        ...(paiement.beneficiaireId.email ? [this.envoyerEmail(paiement.beneficiaireId.email, 'NOTIFICATION_RECEPTION', paiement)] : [])
      ];

      await Promise.allSettled(notifications);
      this.emit('paiement_complete', paiement);
      
    } catch (error) {
      console.error('Erreur envoi notifications paiement complet:', error);
    }
  }

  async envoyerNotificationPaiementEchec(paiement) {
    try {
      await this.envoyerSMS(paiement.payeurId.telephone, {
        type: 'PAIEMENT_ECHEC',
        data: {
          montant: paiement.montantTotal,
          reference: paiement.referenceTransaction,
          methodePaiement: paiement.methodePaiement
        }
      });

      this.emit('paiement_echec', paiement);
      
    } catch (error) {
      console.error('Erreur envoi notification échec:', error);
    }
  }

  async envoyerNotificationRemboursement(paiement) {
    try {
      const montantRembourse = paiement.callbackData.get('refundData')?.montant || paiement.montantTotal;
      
      await this.envoyerSMS(paiement.payeurId.telephone, {
        type: 'REMBOURSEMENT_COMPLETE',
        data: {
          montant: montantRembourse,
          reference: paiement.referenceTransaction,
          motif: paiement.callbackData.get('refundData')?.motif
        }
      });

      this.emit('remboursement_complete', paiement);
      
    } catch (error) {
      console.error('Erreur envoi notification remboursement:', error);
    }
  }

  async envoyerSMS(numeroTelephone, contenu) {
    try {
      const messages = {
        'PAIEMENT_COMPLETE_PAYEUR': `Paiement confirmé! ${contenu.data.montant} FCFA versés à ${contenu.data.beneficiaire}. Réf: ${contenu.data.reference}`,
        'PAIEMENT_COMPLETE_BENEFICIAIRE': `Paiement reçu! ${contenu.data.montant} FCFA de ${contenu.data.payeur}. Réf: ${contenu.data.reference}`,
        'PAIEMENT_ECHEC': `Échec paiement ${contenu.data.montant} FCFA via ${contenu.data.methodePaiement}. Réf: ${contenu.data.reference}. Réessayez.`,
        'REMBOURSEMENT_COMPLETE': `Remboursement effectué: ${contenu.data.montant} FCFA. Réf: ${contenu.data.reference}. Motif: ${contenu.data.motif}`
      };

      const message = messages[contenu.type] || 'Notification de paiement';

      // Simulation d'envoi SMS (remplacer par vraie intégration)
      if (process.env.NODE_ENV === 'development') {
        console.log(`SMS simulé vers ${numeroTelephone}: ${message}`);
        return { success: true, messageId: `sim_${Date.now()}` };
      }

      // Intégration avec service SMS réel
      const response = await axios.post(process.env.SMS_API_URL, {
        to: numeroTelephone,
        message,
        from: process.env.SMS_SENDER_NAME || 'VotrePlateforme'
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.SMS_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 10000
      });

      return { success: true, messageId: response.data.messageId };
      
    } catch (error) {
      console.error('Erreur envoi SMS:', error);
      return { success: false, error: error.message };
    }
  }

  async envoyerEmail(emailDestinataire, typeEmail, paiement) {
    try {
      const templates = {
        'RECU_PAIEMENT': {
          subject: `Reçu de paiement - ${paiement.referenceTransaction}`,
          template: 'receipt',
          data: paiement
        },
        'NOTIFICATION_RECEPTION': {
          subject: `Paiement reçu - ${paiement.referenceTransaction}`,
          template: 'payment_received',
          data: paiement
        }
      };

      const emailConfig = templates[typeEmail];
      if (!emailConfig) return;

      // Simulation d'envoi email (remplacer par vraie intégration)
      if (process.env.NODE_ENV === 'development') {
        console.log(`Email simulé vers ${emailDestinataire}: ${emailConfig.subject}`);
        return { success: true, emailId: `sim_${Date.now()}` };
      }

      // Intégration avec service email réel (ex: SendGrid, Mailgun)
      const response = await axios.post(process.env.EMAIL_API_URL, {
        to: emailDestinataire,
        subject: emailConfig.subject,
        template: emailConfig.template,
        data: emailConfig.data
      }, {
        headers: {
          'Authorization': `Bearer ${process.env.EMAIL_API_KEY}`,
          'Content-Type': 'application/json'
        },
        timeout: 15000
      });

      return { success: true, emailId: response.data.emailId };
      
    } catch (error) {
      console.error('Erreur envoi email:', error);
      return { success: false, error: error.message };
    }
  }

  // Gestionnaires d'événements
  handlePaiementComplete(paiement) {
    console.log(`Paiement ${paiement.referenceTransaction} complété avec succès`);
    // Logique supplémentaire post-paiement
  }

  handlePaiementEchec(paiement) {
    console.log(`Échec paiement ${paiement.referenceTransaction}`);
    // Logique de gestion d'échec
  }

  handleRemboursementComplete(paiement) {
    console.log(`Remboursement ${paiement.referenceTransaction} complété`);
    // Logique post-remboursement
  }
}

/**
 * Service de gestion des providers Mobile Money
 */
class MobileMoneyService {
  constructor() {
    this.providers = {
      'WAVE': new WaveProvider(),
      'ORANGE_MONEY': new OrangeMoneyProvider(),
      'MTN_MONEY': new MTNProvider(),
      'MOOV_MONEY': new MoovProvider()
    };
  }

  async initierPaiement(methodePaiement, donneesTransaction) {
    const provider = this.providers[methodePaiement];
    if (!provider) {
      throw new Error(`Provider non supporté: ${methodePaiement}`);
    }

    return await provider.initierPaiement(donneesTransaction);
  }

  async verifierStatutTransaction(methodePaiement, referenceTransaction) {
    const provider = this.providers[methodePaiement];
    if (!provider) {
      throw new Error(`Provider non supporté: ${methodePaiement}`);
    }

    return await provider.verifierStatut(referenceTransaction);
  }

  async initierRemboursement(methodePaiement, donneesRemboursement) {
    const provider = this.providers[methodePaiement];
    if (!provider) {
      throw new Error(`Provider non supporté: ${methodePaiement}`);
    }

    if (!provider.supporteRemboursement()) {
      throw new Error(`Remboursement non supporté par ${methodePaiement}`);
    }

    return await provider.initierRemboursement(donneesRemboursement);
  }
}

/**
 * Classe abstraite pour les providers Mobile Money
 */
class MobileMoneyProvider {
  constructor(config) {
    this.config = config;
    this.baseURL = config.baseURL;
    this.apiKey = config.apiKey;
    this.timeout = config.timeout || 30000;
  }

  async initierPaiement(donnees) {
    throw new Error('Méthode initierPaiement doit être implémentée');
  }

  async verifierStatut(reference) {
    throw new Error('Méthode verifierStatut doit être implémentée');
  }

  async initierRemboursement(donnees) {
    throw new Error('Méthode initierRemboursement doit être implémentée');
  }

  supporteRemboursement() {
    return false; // Par défaut, remboursement non supporté
  }

  genererSignature(donnees, secret) {
    const payload = typeof donnees === 'string' ? donnees : JSON.stringify(donnees);
    return crypto.createHmac('sha256', secret).update(payload).digest('hex');
  }

  async faireRequeteAPI(endpoint, donnees, methode = 'POST') {
    try {
      const config = {
        method: methode,
        url: `${this.baseURL}${endpoint}`,
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${this.apiKey}`,
          'User-Agent': 'VotrePlateforme-API/1.0'
        },
        timeout: this.timeout
      };

      if (donnees && methode !== 'GET') {
        config.data = donnees;
      }

      const response = await axios(config);
      return { success: true, data: response.data };

    } catch (error) {
      console.error(`Erreur API ${this.constructor.name}:`, error.message);
      return { 
        success: false, 
        error: error.response?.data?.message || error.message,
        code: error.response?.status 
      };
    }
  }
}

/**
 * Provider Wave
 */
class WaveProvider extends MobileMoneyProvider {
  constructor() {
    super({
      baseURL: process.env.WAVE_API_URL || 'https://api.wave.com/v1',
      apiKey: process.env.WAVE_API_KEY,
      timeout: 25000
    });
  }

  async initierPaiement(donnees) {
    const payload = {
      amount: donnees.montant,
      currency: 'XOF',
      phone_number: donnees.numeroTelephone,
      merchant_reference: donnees.referenceTransaction,
      description: `Paiement course - ${donnees.referenceTransaction}`,
      webhook_url: `${process.env.BASE_URL}/api/paiements/callback/mobile-money`,
      return_url: `${process.env.FRONTEND_URL}/paiement/retour`
    };

    const resultat = await this.faireRequeteAPI('/payments/initiate', payload);
    
    if (resultat.success) {
      return {
        success: true,
        reference: resultat.data.payment_id,
        data: {
          transactionId: resultat.data.payment_id,
          statut: resultat.data.status,
          urlPaiement: resultat.data.payment_url,
          instructions: resultat.data.instructions
        }
      };
    }

    return resultat;
  }

  async verifierStatut(reference) {
    const resultat = await this.faireRequeteAPI(`/payments/${reference}`, null, 'GET');
    
    if (resultat.success) {
      return {
        success: true,
        statut: resultat.data.status,
        montant: resultat.data.amount,
        frais: resultat.data.fees,
        dateCompletion: resultat.data.completed_at
      };
    }

    return resultat;
  }

  supporteRemboursement() {
    return true;
  }

  async initierRemboursement(donnees) {
    const payload = {
      payment_id: donnees.referenceOriginale,
      amount: donnees.montant,
      reason: donnees.motif,
      merchant_reference: `REFUND_${donnees.referenceTransaction}`
    };

    const resultat = await this.faireRequeteAPI('/refunds/initiate', payload);
    
    if (resultat.success) {
      return {
        success: true,
        referenceRemboursement: resultat.data.refund_id,
        statut: resultat.data.status,
        dateTraitement: new Date()
      };
    }

    return resultat;
  }
}

/**
 * Provider Orange Money
 */
class OrangeMoneyProvider extends MobileMoneyProvider {
  constructor() {
    super({
      baseURL: process.env.ORANGE_MONEY_API_URL || 'https://api.orange.com/orange-money-webpay/v1',
      apiKey: process.env.ORANGE_MONEY_API_KEY,
      timeout: 30000
    });
    this.merchantId = process.env.ORANGE_MONEY_MERCHANT_ID;
  }

  async initierPaiement(donnees) {
    const payload = {
      merchant_key: this.merchantId,
      currency: 'OUV',
      order_id: donnees.referenceTransaction,
      amount: donnees.montant,
      customer_phone: donnees.numeroTelephone,
      description: `Paiement course ${donnees.referenceTransaction}`,
      notification_url: `${process.env.BASE_URL}/api/paiements/callback/mobile-money`,
      return_url: `${process.env.FRONTEND_URL}/paiement/retour`
    };

    const resultat = await this.faireRequeteAPI('/webpayment', payload);
    
    if (resultat.success) {
      return {
        success: true,
        reference: resultat.data.pay_token,
        data: {
          transactionId: resultat.data.pay_token,
          urlPaiement: resultat.data.payment_url,
          statut: 'PENDING'
        }
      };
    }

    return resultat;
  }

  async verifierStatut(reference) {
    const payload = {
      merchant_key: this.merchantId,
      pay_token: reference
    };

    const resultat = await this.faireRequeteAPI('/transaction/status', payload);
    
    if (resultat.success) {
      return {
        success: true,
        statut: resultat.data.status,
        montant: resultat.data.amount,
        frais: resultat.data.fees,
        dateCompletion: resultat.data.transaction_date
      };
    }

    return resultat;
  }
}

/**
 * Provider MTN Mobile Money
 */
class MTNProvider extends MobileMoneyProvider {
  constructor() {
    super({
      baseURL: process.env.MTN_API_URL || 'https://sandbox.momodeveloper.mtn.com',
      apiKey: process.env.MTN_API_KEY,
      timeout: 35000
    });
    this.subscriptionKey = process.env.MTN_SUBSCRIPTION_KEY;
  }

  async obtenirTokenAccess() {
    try {
      const auth = Buffer.from(`${process.env.MTN_USER_ID}:${process.env.MTN_API_SECRET}`).toString('base64');
      
      const response = await axios.post(`${this.baseURL}/collection/token/`, {}, {
        headers: {
          'Authorization': `Basic ${auth}`,
          'Ocp-Apim-Subscription-Key': this.subscriptionKey,
          'Content-Type': 'application/json'
        }
      });

      return response.data.access_token;
    } catch (error) {
      throw new Error(`Échec obtention token MTN: ${error.message}`);
    }
  }

  async initierPaiement(donnees) {
    const token = await this.obtenirTokenAccess();
    const referenceId = crypto.randomUUID();

    const payload = {
      amount: donnees.montant.toString(),
      currency: 'EUR', // À adapter selon la région
      externalId: donnees.referenceTransaction,
      payer: {
        partyIdType: 'MSISDN',
        partyId: donnees.numeroTelephone
      },
      payerMessage: `Paiement course ${donnees.referenceTransaction}`,
      payeeNote: `Paiement reçu pour ${donnees.referenceTransaction}`
    };

    const config = {
      method: 'POST',
      url: `${this.baseURL}/collection/v1_0/requesttopay`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Reference-Id': referenceId,
        'X-Target-Environment': process.env.MTN_ENVIRONMENT || 'sandbox',
        'Ocp-Apim-Subscription-Key': this.subscriptionKey,
        'Content-Type': 'application/json'
      },
      data: payload
    };

    try {
      await axios(config);
      
      return {
        success: true,
        reference: referenceId,
        data: {
          transactionId: referenceId,
          statut: 'PENDING'
        }
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }

  async verifierStatut(reference) {
    const token = await this.obtenirTokenAccess();

    const config = {
      method: 'GET',
      url: `${this.baseURL}/collection/v1_0/requesttopay/${reference}`,
      headers: {
        'Authorization': `Bearer ${token}`,
        'X-Target-Environment': process.env.MTN_ENVIRONMENT || 'sandbox',
        'Ocp-Apim-Subscription-Key': this.subscriptionKey
      }
    };

    try {
      const response = await axios(config);
      
      return {
        success: true,
        statut: response.data.status,
        montant: parseFloat(response.data.amount),
        dateCompletion: response.data.finishedTimestamp
      };
    } catch (error) {
      return {
        success: false,
        error: error.response?.data?.message || error.message
      };
    }
  }
}

/**
 * Provider Moov Money
 */
class MoovProvider extends MobileMoneyProvider {
  constructor() {
    super({
      baseURL: process.env.MOOV_API_URL || 'https://api.moov-africa.com/v1',
      apiKey: process.env.MOOV_API_KEY,
      timeout: 30000
    });
  }

  async initierPaiement(donnees) {
    const payload = {
      amount: donnees.montant,
      currency: 'XOF',
      phone_number: donnees.numeroTelephone,
      reference: donnees.referenceTransaction,
      description: `Paiement course - ${donnees.referenceTransaction}`,
      webhook_url: `${process.env.BASE_URL}/api/paiements/callback/mobile-money`
    };

    const resultat = await this.faireRequeteAPI('/payments/request', payload);
    
    if (resultat.success) {
      return {
        success: true,
        reference: resultat.data.transaction_id,
        data: {
          transactionId: resultat.data.transaction_id,
          statut: resultat.data.status,
          instructions: resultat.data.payment_instructions
        }
      };
    }

    return resultat;
  }

  async verifierStatut(reference) {
    const resultat = await this.faireRequeteAPI(`/payments/status/${reference}`, null, 'GET');
    
    if (resultat.success) {
      return {
        success: true,
        statut: resultat.data.status,
        montant: resultat.data.amount,
        frais: resultat.data.transaction_fee,
        dateCompletion: resultat.data.completed_at
      };
    }

    return resultat;
  }
}

/**
 * Service de gestion des réservations (interface)
 */
class ReservationService {
  static async marquerCommePayee(reservationId) {
    try {
      const Reservation = require('../models/Reservation');
      
      const reservation = await Reservation.findByIdAndUpdate(
        reservationId,
        { 
          statutPaiement: 'PAYE',
          datePaiement: new Date()
        },
        { new: true }
      );

      if (!reservation) {
        throw new Error('Réservation introuvable');
      }

      console.log(`Réservation ${reservationId} marquée comme payée`);
      return reservation;

    } catch (error) {
      console.error('Erreur marquage réservation payée:', error);
      throw error;
    }
  }

  static async obtenirStatutReservation(reservationId) {
    try {
      const Reservation = require('../models/Reservation');
      const reservation = await Reservation.findById(reservationId).select('statut statutPaiement');
      
      return reservation ? {
        statut: reservation.statut,
        statutPaiement: reservation.statutPaiement
      } : null;

    } catch (error) {
      console.error('Erreur récupération statut réservation:', error);
      return null;
    }
  }
}

/**
 * Service de gestion des utilisateurs (interface)
 */
class UtilisateurService {
  static async mettreAJourSolde(utilisateurId, montant, typeOperation) {
    try {
      const Utilisateur = require('../models/Utilisateur');
      
      const utilisateur = await Utilisateur.findByIdAndUpdate(
        utilisateurId,
        { 
          $inc: { solde: montant },
          $push: {
            historiqueTransactions: {
              montant,
              type: typeOperation,
              date: new Date()
            }
          }
        },
        { new: true }
      );

      if (!utilisateur) {
        throw new Error('Utilisateur introuvable');
      }

      console.log(`Solde utilisateur ${utilisateurId} mis à jour: ${montant} FCFA (${typeOperation})`);
      return utilisateur;

    } catch (error) {
      console.error('Erreur mise à jour solde:', error);
      throw error;
    }
  }
}

/**
 * Service de génération de rapports
 */
class RapportService {
  static async genererRapportPaiements(filtres, format = 'JSON') {
    try {
      const Paiement = require('../models/Paiement');
      
      const pipeline = [
        // Filtres de base
        {
          $match: {
            dateInitiation: {
              $gte: filtres.dateDebut,
              $lte: filtres.dateFin
            },
            ...(filtres.statutPaiement && { statutPaiement: filtres.statutPaiement }),
            ...(filtres.methodePaiement && { methodePaiement: filtres.methodePaiement })
          }
        },
        
        // Groupement par jour et méthode
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$dateInitiation' } },
              methode: '$methodePaiement'
            },
            nombreTransactions: { $sum: 1 },
            chiffreAffaires: { $sum: '$montantTotal' },
            commissionsPerçues: { $sum: '$commissionPlateforme' },
            montantVerseConducteurs: { $sum: '$montantConducteur' },
            fraisTransactionTotal: { $sum: '$fraisTransaction' }
          }
        },
        
        // Tri par date
        { $sort: { '_id.date': 1, '_id.methode': 1 } }
      ];

      const resultats = await Paiement.aggregate(pipeline);

      if (format === 'CSV') {
        return this.convertirEnCSV(resultats);
      }

      return resultats;

    } catch (error) {
      console.error('Erreur génération rapport:', error);
      throw error;
    }
  }

  static convertirEnCSV(donnees) {
    if (!donnees.length) return '';

    const headers = ['Date', 'Méthode', 'Nombre Transactions', 'Chiffre Affaires', 'Commissions', 'Montant Conducteurs', 'Frais Transaction'];
    
    const lignes = donnees.map(item => [
      item._id.date,
      item._id.methode,
      item.nombreTransactions,
      item.chiffreAffaires,
      item.commissionsPerçues,
      item.montantVerseConducteurs,
      item.fraisTransactionTotal
    ]);

    return [headers, ...lignes]
      .map(ligne => ligne.join(','))
      .join('\n');
  }
}

// Instances globales des services
const notificationService = new NotificationService();
const mobileMoneyService = new MobileMoneyService();

module.exports = {
  NotificationService,
  MobileMoneyService,
  ReservationService,
  UtilisateurService,
  RapportService,
  
  // Instances
  notificationService,
  mobileMoneyService
};