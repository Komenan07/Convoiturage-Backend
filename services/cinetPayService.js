// services/CinetPayService.js
const axios = require('axios');
const crypto = require('crypto');
const Paiement = require('../models/Paiement');
const Reservation = require('../models/Reservation');
const Utilisateur = require('../models/Utilisateur');
const { logger } = require('../utils/logger');

class CinetPayService {
  constructor() {
    // Configuration CinetPay
    this.apiUrl = process.env.CINETPAY_API_URL || 'https://api-checkout.cinetpay.com/v2';
    this.siteId = process.env.CINETPAY_SITE_ID;
    this.apiKey = process.env.CINETPAY_API_KEY;
    this.secretKey = process.env.CINETPAY_SECRET_KEY;
    this.environment = process.env.CINETPAY_ENV || 'sandbox';
    
    // URLs de retour
    this.baseReturnUrl = process.env.BASE_URL || 'http://localhost:3000';
    this.notifyUrl = `${process.env.BACKEND_URL || 'http://localhost:5000'}/api/paiements/webhook/cinetpay`;
    
    // Vérification configuration
    if (!this.siteId || !this.apiKey || !this.secretKey) {
      logger.warn('⚠️ Configuration CinetPay incomplète - Certaines fonctionnalités peuvent ne pas fonctionner');
    } else {
      logger.info('✅ Service CinetPay initialisé', {
        environment: this.environment,
        siteId: this.siteId
      });
    }
  }

  /**
   * 🔐 Générer une signature sécurisée pour les requêtes CinetPay
   */
  genererSignature(transactionId, montant) {
    const signatureString = `${this.apiKey}${this.siteId}${transactionId}${montant}${this.secretKey}`;
    return crypto.createHash('sha256').update(signatureString).digest('hex');
  }

  /**
   * 🔐 Vérifier la signature d'un webhook
   */
  verifierSignatureWebhook(webhookData) {
    const { cpm_trans_id, cpm_amount, signature } = webhookData;
    const signatureCalculee = this.genererSignature(cpm_trans_id, cpm_amount);
    return signature === signatureCalculee;
  }

  /**
   * 🎯 Mapper les méthodes de paiement vers les canaux CinetPay
   */
  mapperMethodePaiement(methodePaiement) {
    const mapping = {
      'WAVE': 'WAVE',
      'ORANGE_MONEY': 'ORANGE',
      'MTN_MONEY': 'MTN',
      'MOOV_MONEY': 'MOOV',
      'ALL': 'ALL'
    };
    return mapping[methodePaiement] || 'ALL';
  }

  /**
   * 🚀 Initier un paiement avec CinetPay
   */
  async initierPaiement(reservationId, montantTotal, options = {}) {
    try {
      logger.info('🚀 Initiation paiement CinetPay', {
        reservationId,
        montantTotal,
        methodePaiement: options.methodePaiement,
        isRecharge: options.isRecharge
      });

      let passager, conducteur, trajet, description;

      // 🆕 Gérer les recharges (sans réservation)
      if (options.isRecharge) {
        const user = await Utilisateur.findById(options.userId)
          .select('nom prenom email telephone compteCovoiturage');
        
        if (!user) {
          throw new Error('Utilisateur introuvable');
        }

        passager = user;
        conducteur = null;
        trajet = null;
        description = `Recharge compte conducteur - ${montantTotal} FCFA`;
        
      } else {
        // Récupérer les informations de la réservation (paiement trajet)
        const reservation = await Reservation.findById(reservationId)
          .populate('passagerId')
          .populate({
            path: 'trajetId',
            populate: {
              path: 'conducteurId',
              select: 'nom prenom compteCovoiturage noteMoyenne'
            }
          });

        if (!reservation) {
          throw new Error('Réservation introuvable');
        }

        passager = reservation.passagerId;
        conducteur = reservation.trajetId.conducteurId;
        trajet = reservation.trajetId;
        description = `Paiement trajet ${trajet.pointDepart} → ${trajet.pointArrivee}`;
      }

      // Vérifier si le paiement existe déjà
      let paiement = await Paiement.findOne({
        referenceTransaction: options.referenceInterne
      });

      if (!paiement) {
        // Créer un nouveau paiement s'il n'existe pas déjà
        const paiementData = {
          payeurId: passager._id,
          montantTotal,
          methodePaiement: options.methodePaiement || 'WAVE',
          statutPaiement: 'EN_ATTENTE',
          
          securite: {
            ipAddress: options.ipAddress,
            userAgent: options.userAgent,
            deviceId: options.deviceId
          }
        };

        // 🆕 Données spécifiques selon le type (recharge vs trajet)
        if (options.isRecharge) {
          // RECHARGE : Pas de bénéficiaire ni réservation
          paiementData.beneficiaireId = passager._id;
          paiementData.commission = {
            taux: 0,
            tauxOriginal: 0,
            montant: 0,
            modePrelevement: 'paiement_mobile',
            statutPrelevement: 'preleve'
          };
          paiementData.reglesPaiement = {
            conducteurCompteRecharge: passager.compteCovoiturage?.estRecharge || false,
            modesAutorises: ['wave', 'orange_money', 'mtn_money', 'moov_money'],
            raisonValidation: 'Recharge de compte conducteur',
            verificationsPassees: true,
            soldeSuffisant: true
          };
        } else {
          // PAIEMENT TRAJET : Avec bénéficiaire et réservation
          paiementData.reservationId = reservationId;
          paiementData.beneficiaireId = conducteur._id;
          paiementData.commission = {
            taux: 0.10,
            tauxOriginal: 0.10,
            montant: 0,
            modePrelevement: 'paiement_mobile',
            statutPrelevement: 'en_attente'
          };
          paiementData.reglesPaiement = {
            conducteurCompteRecharge: conducteur.compteCovoiturage?.estRecharge || false,
            soldeConducteurAvant: conducteur.compteCovoiturage?.solde || 0,
            soldeMinimumRequis: 1000,
            verificationsPassees: false
          };
        }

        paiement = new Paiement(paiementData);

        // Calculer commission dynamique pour les trajets uniquement
        if (!options.isRecharge && trajet && conducteur) {
          const distanceKm = trajet.distanceKm || 0;
          const noteConducteur = conducteur.noteMoyenne || 0;
          await paiement.calculerCommissionDynamique(distanceKm, noteConducteur);

          // Appliquer bonus si applicable
          const nombreTrajetsMois = conducteur.statistiques?.trajetsEffectuesMois || 0;
          paiement.appliquerPrimePerformance(noteConducteur, nombreTrajetsMois);

          // Valider les règles
          const reglesValides = await paiement.validerReglesPaiement();
          if (!reglesValides) {
            throw new Error('Règles de paiement non respectées');
          }
        }

        // Initier paiement mobile si nécessaire
        if (options.numeroTelephone && options.operateur) {
          paiement.initierPaiementMobile(
            options.numeroTelephone,
            options.operateur
          );
        }

        await paiement.save();
      }

      // Préparer les données pour CinetPay
      const transactionId = paiement.referenceTransaction;
      
      // 🔧 Valider et formater le numéro de téléphone (obligatoire)
      const phoneNumber = options.numeroTelephone || passager.telephone;
      if (!phoneNumber) {
        throw new Error('Numéro de téléphone requis pour le paiement');
      }
      
      // 🔧 Valider l'email (obligatoire)
      const email = passager.email || `user${passager._id}@covoiturage.local`;
      
      // 🔧 Valider le nom (obligatoire)
      const customerName = passager.prenom && passager.nom 
        ? `${passager.prenom} ${passager.nom}` 
        : `Utilisateur ${passager._id.toString().substring(0, 8)}`;
      
      const customerSurname = passager.nom || 'Utilisateur';
      
      const cinetPayData = {
        apikey: this.apiKey,
        site_id: this.siteId,
        transaction_id: transactionId,
        amount: montantTotal,
        currency: 'XOF',
        description: description,
        
        // URLs de retour
        return_url: `${this.baseReturnUrl}/paiement/retour/${transactionId}`,
        notify_url: this.notifyUrl,
        cancel_url: `${this.baseReturnUrl}/paiement/annule/${transactionId}`,
        
        // Informations client (tous obligatoires)
        customer_phone_number: phoneNumber,
        customer_email: email,
        customer_name: customerName,
        customer_surname: customerSurname,
        customer_address: 'Abidjan, Côte d\'Ivoire',
        customer_city: 'Abidjan',
        customer_country: 'CI',
        customer_state: 'CI',
        customer_zip_code: '00225',
        
        // Canal de paiement
        channels: 'ALL',
        
        // Métadonnées
        metadata: JSON.stringify({
          paiementId: paiement._id.toString(),
          reservationId: reservationId ? reservationId.toString() : null,
          conducteurId: conducteur ? conducteur._id.toString() : null,
          passagerId: passager._id.toString(),
          methodePaiement: options.methodePaiement,
          isRecharge: options.isRecharge || false
        }),
        
        // 🔐 Signature pour sécuriser
        signature: this.genererSignature(transactionId, montantTotal)
      };

      logger.info('📤 Envoi requête CinetPay', {
        transaction_id: transactionId,
        amount: montantTotal,
        channels: cinetPayData.channels
      });

      // Appel API CinetPay
      const response = await this.appellerAPICinetPay('/payment', cinetPayData);

      if (response.code === '201' || response.code === '00') {
        // Succès
        paiement.referencePaiementMobile = response.data.payment_token;
        paiement.ajouterLog('CINETPAY_INITIE', {
          paymentUrl: response.data.payment_url,
          token: response.data.payment_token,
          channels: cinetPayData.channels
        });
        
        await paiement.save();

        logger.info('✅ Paiement CinetPay initié avec succès', {
          paiementId: paiement._id,
          referenceTransaction: transactionId,
          paymentUrl: response.data.payment_url
        });

        return {
          success: true,
          paiementId: paiement._id,
          referenceTransaction: transactionId,
          urlPaiement: response.data.payment_url,
          token: response.data.payment_token,
          message: 'Paiement initié avec succès'
        };

      } else {
        // Échec
        paiement.statutPaiement = 'ECHEC';
        paiement.ajouterErreur('CINETPAY_INIT_ECHEC', response.message || 'Erreur inconnue');
        await paiement.save();

        logger.error('❌ Échec initiation CinetPay', {
          code: response.code,
          message: response.message
        });

        throw new Error(response.message || 'Erreur lors de l\'initiation du paiement');
      }

    } catch (error) {
      logger.error('❌ Erreur initiation paiement CinetPay:', error);
      throw error;
    }
  }

  /**
   * 🔍 Vérifier le statut d'une transaction
   */
  async verifierStatutTransaction(referenceTransaction) {
    try {
      logger.info('🔍 Vérification statut transaction', { referenceTransaction });

      const paiement = await Paiement.findOne({ referenceTransaction })
        .populate('payeurId', 'nom prenom email')
        .populate('beneficiaireId', 'nom prenom email compteCovoiturage');

      if (!paiement) {
        throw new Error('Transaction introuvable');
      }

      const statusData = {
        apikey: this.apiKey,
        site_id: this.siteId,
        transaction_id: referenceTransaction
      };

      const response = await this.appellerAPICinetPay('/payment/check', statusData);

      logger.info('📥 Réponse vérification statut', {
        code: response.code,
        status: response.data?.status
      });

      // Traiter le statut
      if (response.code === '00') {
        const data = response.data;

        // Transaction réussie
        if (data.status === 'ACCEPTED' || data.status === '00') {
          paiement.statutPaiement = 'COMPLETE';
          paiement.dateCompletion = new Date();
          paiement.mobileMoney.statutMobileMoney = 'SUCCESS';
          paiement.mobileMoney.transactionId = data.payment_id;
          paiement.mobileMoney.dateTransaction = new Date(data.payment_date);

          paiement.ajouterLog('VERIFICATION_SUCCESS', {
            statutCinetPay: data.status,
            paymentId: data.payment_id,
            montant: data.amount
          });

          // Traiter la commission
          await paiement.traiterCommissionApresPayement();

          logger.info('✅ Transaction confirmée', {
            referenceTransaction,
            montant: data.amount
          });

        } else if (data.status === 'REFUSED' || data.status === 'CANCELLED') {
          // Transaction échouée
          paiement.statutPaiement = 'ECHEC';
          paiement.mobileMoney.statutMobileMoney = 'FAILED';
          
          paiement.ajouterErreur('PAIEMENT_REFUSE', 
            `Transaction refusée: ${data.status}`);

          logger.warn('⚠️ Transaction refusée', {
            referenceTransaction,
            statut: data.status
          });

        } else {
          // En attente
          paiement.ajouterLog('VERIFICATION_STATUS', { 
            statut: 'en_attente',
            statusCinetPay: data.status 
          });

          logger.info('⏳ Transaction en attente', {
            referenceTransaction,
            statut: data.status
          });
        }

      } else if (response.code === '629') {
        // Transaction en attente
        paiement.ajouterLog('VERIFICATION_STATUS', { 
          statut: 'en_attente',
          code: response.code 
        });

        logger.info('⏳ Transaction en attente de confirmation', {
          referenceTransaction
        });

      } else {
        // Erreur ou échec
        paiement.statutPaiement = 'ECHEC';
        paiement.mobileMoney.statutMobileMoney = 'FAILED';
        
        paiement.ajouterErreur('VERIFICATION_ECHEC', 
          response.message || 'Vérification échouée');

        logger.error('❌ Vérification échouée', {
          referenceTransaction,
          code: response.code,
          message: response.message
        });
      }

      await paiement.save();
      
      return {
        success: true,
        statutPaiement: paiement.statutPaiement,
        paiement: paiement.obtenirResume()
      };

    } catch (error) {
      logger.error('❌ Erreur vérification statut:', error);
      throw error;
    }
  }

  /**
   * 📨 Traiter un webhook CinetPay
   */
  async traiterWebhook(webhookData) {
    try {
      logger.info('📨 Webhook CinetPay reçu', {
        transaction_id: webhookData.cpm_trans_id,
        result: webhookData.cpm_result,
        amount: webhookData.cpm_amount
      });

      const {
        cpm_trans_id,
        cpm_result,
        cpm_payid,
        cpm_amount,
        signature,
        payment_method,
        cel_phone_num,
        cpm_phone_prefixe,
        cpm_payment_date,
        cpm_payment_time
      } = webhookData;

      // 🔐 Vérifier la signature
      if (signature && !this.verifierSignatureWebhook(webhookData)) {
        logger.error('❌ Signature webhook invalide', {
          transaction_id: cpm_trans_id
        });
        return {
          success: false,
          message: 'Signature invalide'
        };
      }

      // Trouver le paiement
      const paiement = await Paiement.findOne({ 
        referenceTransaction: cpm_trans_id 
      }).populate('beneficiaireId', 'compteCovoiturage nom prenom email');

      if (!paiement) {
        logger.error('❌ Paiement introuvable pour webhook', {
          transaction_id: cpm_trans_id
        });
        return {
          success: false,
          message: 'Paiement introuvable'
        };
      }

      // Enregistrer le webhook
      paiement.ajouterLog('WEBHOOK_RECU', {
        ...webhookData,
        dateReception: new Date()
      });

      // Traiter selon le résultat
      if (cpm_result === '00' || cpm_result === 'ACCEPTED') {
        // ✅ Paiement réussi
        paiement.statutPaiement = 'COMPLETE';
        paiement.dateCompletion = new Date();
        
        paiement.mobileMoney.statutMobileMoney = 'SUCCESS';
        paiement.mobileMoney.transactionId = cpm_payid;
        paiement.mobileMoney.operateur = payment_method;
        paiement.mobileMoney.numeroTelephone = `${cpm_phone_prefixe}${cel_phone_num}`;
        paiement.mobileMoney.dateTransaction = new Date(`${cpm_payment_date} ${cpm_payment_time}`);

        paiement.ajouterLog('WEBHOOK_SUCCESS', {
          paymentId: cpm_payid,
          montant: cpm_amount,
          operateur: payment_method,
          telephone: `${cpm_phone_prefixe}${cel_phone_num}`
        });

        // Traiter la commission
        await paiement.traiterCommissionApresPayement();

        logger.info('✅ Webhook traité - Paiement confirmé', {
          paiementId: paiement._id,
          referenceTransaction: cpm_trans_id,
          montant: cpm_amount
        });

      } else {
        // ❌ Paiement échoué
        paiement.statutPaiement = 'ECHEC';
        paiement.mobileMoney.statutMobileMoney = 'FAILED';
        
        paiement.ajouterErreur('WEBHOOK_ECHEC', 
          `Transaction échouée: ${cpm_result}`);

        logger.warn('⚠️ Webhook traité - Paiement échoué', {
          paiementId: paiement._id,
          referenceTransaction: cpm_trans_id,
          resultat: cpm_result
        });
      }

      await paiement.save();

      return {
        success: true,
        message: 'Webhook traité avec succès',
        paiementId: paiement._id,
        statutPaiement: paiement.statutPaiement
      };

    } catch (error) {
      logger.error('❌ Erreur traitement webhook:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * 🌐 Appeler l'API CinetPay
   */
  async appellerAPICinetPay(endpoint, data) {
    try {
      const url = `${this.apiUrl}${endpoint}`;
      
      logger.debug('🌐 Appel API CinetPay', {
        url,
        endpoint,
        transaction_id: data.transaction_id
      });

      const response = await axios.post(url, data, {
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 30000 // 30 secondes
      });

      logger.debug('📥 Réponse API CinetPay', {
        code: response.data.code,
        message: response.data.message
      });

      return response.data;

    } catch (error) {
      // Erreur réseau ou timeout
      if (error.code === 'ECONNABORTED') {
        logger.error('⏱️ Timeout API CinetPay', {
          endpoint,
          timeout: '30s'
        });
        throw new Error('Délai d\'attente dépassé pour l\'API CinetPay');
      }

      // Erreur HTTP avec réponse
      if (error.response?.data) {
        logger.error('❌ Erreur API CinetPay', {
          endpoint,
          status: error.response.status,
          data: error.response.data
        });
        return error.response.data;
      }

      // Autre erreur
      logger.error('❌ Erreur appel API CinetPay', {
        endpoint,
        message: error.message
      });
      throw new Error(`Erreur API CinetPay: ${error.message}`);
    }
  }

  /**
   * 👤 Récupérer le payeur depuis une réservation
   */
  async getPayeurFromReservation(reservationId) {
    const reservation = await Reservation.findById(reservationId);
    if (!reservation) {
      throw new Error('Réservation introuvable');
    }
    return reservation.passagerId;
  }

  /**
   * 👤 Récupérer le bénéficiaire depuis une réservation
   */
  async getBeneficiaireFromReservation(reservationId) {
    const reservation = await Reservation.findById(reservationId)
      .populate('trajetId');
    
    if (!reservation || !reservation.trajetId) {
      throw new Error('Réservation ou trajet introuvable');
    }
    
    return reservation.trajetId.conducteurId;
  }

  /**
   * 📱 Récupérer le téléphone d'un utilisateur
   */
  async getCustomerPhone(userId) {
    const user = await Utilisateur.findById(userId).select('telephone');
    return user?.telephone || '';
  }

  /**
   * 📧 Récupérer l'email d'un utilisateur
   */
  async getCustomerEmail(userId) {
    const user = await Utilisateur.findById(userId).select('email');
    return user?.email || '';
  }

  /**
   * 👤 Récupérer le nom d'un utilisateur
   */
  async getCustomerName(userId) {
    const user = await Utilisateur.findById(userId).select('prenom nom');
    return user ? `${user.prenom} ${user.nom}` : '';
  }

  /**
   * 📊 Obtenir les statistiques des transactions
   */
  async obtenirStatistiques(dateDebut, dateFin) {
    try {
      const stats = await Paiement.aggregate([
        {
          $match: {
            dateInitiation: {
              $gte: dateDebut,
              $lte: dateFin
            },
            methodePaiement: { $ne: 'ESPECES' }
          }
        },
        {
          $group: {
            _id: '$statutPaiement',
            count: { $sum: 1 },
            montantTotal: { $sum: '$montantTotal' }
          }
        }
      ]);

      return stats;
    } catch (error) {
      logger.error('❌ Erreur statistiques CinetPay:', error);
      throw error;
    }
  }
}

module.exports = CinetPayService;