// services/CinetPayService.js
// ✅ Nouvelle API CinetPay v1.0 — https://api.cinetpay.net
const axios = require('axios');
const Paiement = require('../models/Paiement');
const Reservation = require('../models/Reservation');
const Utilisateur = require('../models/Utilisateur');
const { logger } = require('../utils/logger');

/**
 * Codes de statut CinetPay v1.0
 * 200  = OK              — Opération réussie (non final)
 * 100  = SUCCESS         — Transaction traitée avec succès (FINAL ✅)
 * -1   = OPERATION_ERROR — Une erreur s'est produite
 * 404  = NOT_FOUND       — Introuvable
 * 1002 = INVALID_TOKEN   — Jeton invalide → se reconnecter
 * 1003 = EXPIRED_TOKEN   — Jeton expiré  → se reconnecter
 * 1004 = INVALID_PARAMS  — Paramètres invalides
 * 1005 = INVALID_CREDENTIALS — Identifiants invalides
 * 1200 = TRANSACTION_EXIST   — Transaction déjà existante (FINAL ✅)
 * 2001 = INITIATED       — En attente d'action utilisateur
 * 2002 = PENDING         — Utilisateur a commencé le paiement
 * 2003 = EXPIRED         — Opération expirée
 * 2004 = OTP_ERROR       — Code OTP incorrect
 * 2005 = INSUFFICIENT_BALANCE — Solde insuffisant (FINAL ✅)
 * 2006 = USER_NOT_FOUND  — Utilisateur inexistant
 * 2007 = USER_IS_BLOCKED — Utilisateur bloqué
 * 2008 = OTP_EXPIRED     — Code OTP expiré
 * 2010 = FAILED          — Paiement échoué (FINAL ✅)
 * 2011 = NOT_ALLOWED     — IP non autorisée
 */

/**
 * Méthodes de paiement disponibles (Côte d'Ivoire)
 * OM_CI   → Orange Money  (préfixe 07)
 * MOOV_CI → Moov Money    (préfixe 01)
 * MTN_CI  → MTN Money     (préfixe 05)
 * WAVE_CI → Wave          (préfixes 01, 05, 07)
 *
 * Limites de dépôt CI : min 300 FCFA / max 2 000 000 FCFA
 */

class CinetPayService {
  constructor() {
    this.apiUrl      = process.env.CINETPAY_API_URL || 'https://api.cinetpay.net';
    this.apiKey      = process.env.CINETPAY_API_KEY;       // sk_test_...
    this.apiPassword = process.env.CINETPAY_SECRET_KEY;    // mot de passe API
    this.environment = process.env.CINETPAY_ENV || 'sandbox';
    this.notifyUrl   = process.env.CINETPAY_NOTIFY_URL
      || `${process.env.BACKEND_URL || 'http://localhost:3000'}/api/paiements/webhook/cinetpay`;
    this.successUrl  = process.env.CINETPAY_SUCCESS_URL
      || `${process.env.BASE_URL || 'http://localhost:3000'}/paiement/succes`;
    this.failedUrl   = process.env.CINETPAY_FAILED_URL
      || `${process.env.BASE_URL || 'http://localhost:3000'}/paiement/echec`;

    // Cache du token OAuth (évite un login à chaque appel)
    this._accessToken    = null;
    this._tokenExpiresAt = null;

    if (!this.apiKey || !this.apiPassword) {
      logger.warn('⚠️ Configuration CinetPay incomplète — CINETPAY_API_KEY ou CINETPAY_SECRET_KEY manquant');
    } else {
      logger.info('✅ Service CinetPay v1.0 initialisé', {
        environment: this.environment,
        apiUrl: this.apiUrl
      });
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 🔐 AUTHENTIFICATION OAUTH
  // ─────────────────────────────────────────────────────────────

  /**
   * Obtenir (ou renouveler) le token d'accès OAuth
   * POST /v1/oauth/login → { api_key, api_password }
   * Réponse : { code: 200, status: "OK", access_token: "eyJ..." }
   */
  async obtenirToken() {
    // Réutiliser le token s'il est encore valide (marge 60s)
    if (this._accessToken && this._tokenExpiresAt && Date.now() < this._tokenExpiresAt - 60000) {
      return this._accessToken;
    }

    try {
      logger.info('🔑 Obtention token OAuth CinetPay...');

      const response = await axios.post(`${this.apiUrl}/v1/oauth/login`, {
        api_key:      this.apiKey,
        api_password: this.apiPassword
      }, {
        headers: { 'Content-Type': 'application/json' },
        timeout: 15000
      });

      const data = response.data;

      if (data.code === 200 && data.access_token) {
        this._accessToken    = data.access_token;
        // Les tokens JWT expirent généralement après 1h — on met 55 min par sécurité
        this._tokenExpiresAt = Date.now() + 55 * 60 * 1000;

        logger.info('✅ Token OAuth CinetPay obtenu');
        return this._accessToken;
      }

      throw new Error(`Authentification CinetPay échouée — code: ${data.code}, status: ${data.status}`);

    } catch (error) {
     logger.error('❌ Erreur authentification CinetPay:', {
      message:      error.message,
      status:       error.response?.status,
      responseData: error.response?.data,   // ← réponse exacte de CinetPay
      apiKey:       this.apiKey?.substring(0, 15) + '...',
      passwordDefined: !!this.apiPassword
  });
  throw new Error(`Impossible de s'authentifier auprès de CinetPay: ${error.message}`);
    }
  }

  /**
   * Invalider le token en cache (forcera un nouveau login au prochain appel)
   */
  _invaliderToken() {
    this._accessToken    = null;
    this._tokenExpiresAt = null;
  }

  // ─────────────────────────────────────────────────────────────
  // 🎯 MAPPING MÉTHODE DE PAIEMENT
  // ─────────────────────────────────────────────────────────────

 /**
 * Mapper la méthode de paiement vers le code CinetPay v1.0
 * Si operateurExplicite est fourni, il a la priorité absolue.
 * Si null → CinetPay affiche tous les opérateurs disponibles.
 */
  mapperMethodePaiement(methodePaiement, operateurExplicite = null) {
    const mapping = {
      'WAVE':         'WAVE_CI',
      'WAVE_CI':      'WAVE_CI',
      'ORANGE':       'OM_CI',
      'ORANGE_MONEY': 'OM_CI',
      'OM_CI':        'OM_CI',
      'MTN':          'MTN_CI',
      'MTN_MONEY':    'MTN_CI',
      'MTN_CI':       'MTN_CI',
      'MOOV':         'MOOV_CI',
      'MOOV_MONEY':   'MOOV_CI',
      'MOOV_CI':      'MOOV_CI',
    };

    // 1. Opérateur explicitement fourni → priorité absolue
    if (operateurExplicite) {
      const code = mapping[operateurExplicite.toUpperCase()];
      if (code) return code;
      logger.warn('⚠️ Opérateur explicite non reconnu, fallback null', { operateurExplicite });
    }

    // 2. Méthode directement mappable (ex: ORANGE_MONEY, WAVE...)
    if (mapping[methodePaiement]) return mapping[methodePaiement];

    // 3. MOBILE_MONEY générique → retourner null
    // CinetPay affichera TOUS les opérateurs disponibles
    // ⚠️ On ne détecte plus par préfixe car Wave partage 01, 05, 07
    if (methodePaiement === 'MOBILE_MONEY') {
      logger.info('ℹ️ MOBILE_MONEY générique — CinetPay affichera tous les opérateurs');
      return null;
    }

    logger.warn('⚠️ Méthode non reconnue, fallback null', { methodePaiement });
    return null;
  }

  // ─────────────────────────────────────────────────────────────
  // 🚀 INITIER UN PAIEMENT
  // ─────────────────────────────────────────────────────────────

  /**
   * Initier un paiement mobile via CinetPay v1.0
   * POST /v1/payment  (Authorization: Bearer {token})
   */
  async initierPaiement(reservationId, montantTotal, options = {}) {
    try {
      logger.info('🚀 Initiation paiement CinetPay v1.0', {
        reservationId,
        montantTotal,
        methodePaiement: options.methodePaiement,
        isRecharge: options.isRecharge
      });

      // ── 1. Charger les données métier ──────────────────────────
      let passager, conducteur, trajet, designation;

      if (options.isRecharge) {
        const user = await Utilisateur.findById(options.userId)
          .select('nom prenom email telephone compteCovoiturage');
        if (!user) throw new Error('Utilisateur introuvable');

        passager    = user;
        conducteur  = null;
        trajet      = null;
        designation = `Recharge compte conducteur - ${montantTotal} FCFA`;

      } else {
        const reservation = await Reservation.findById(reservationId)
          .populate('passagerId')
          .populate({
            path: 'trajetId',
            populate: { path: 'conducteurId', select: 'nom prenom compteCovoiturage noteMoyenne statistiques' }
          });
        if (!reservation) throw new Error('Reservation introuvable');

        passager   = reservation.passagerId;
        conducteur = reservation.trajetId.conducteurId;
        trajet     = reservation.trajetId;

        const nomDepart  = trajet.pointDepart?.nom  || trajet.pointDepart?.adresse  || 'Depart';
        const nomArrivee = trajet.pointArrivee?.nom || trajet.pointArrivee?.adresse || 'Arrivee';
        designation = `Paiement trajet ${nomDepart} - ${nomArrivee}`.substring(0, 100);
      }

      // ── 2. Créer ou récupérer l'enregistrement Paiement ───────
      let paiement = null;
      if (options.referenceInterne) {
        paiement = await Paiement.findOne({ referenceTransaction: options.referenceInterne });
      }

      if (!paiement) {
        const paiementData = {
          payeurId:        passager._id,
          montantTotal,
          methodePaiement: options.methodePaiement || 'MOBILE_MONEY',
          statutPaiement:  'EN_ATTENTE',
          securite: {
            ipAddress: options.ipAddress,
            userAgent: options.userAgent,
            deviceId:  options.deviceId
          }
        };

        if (options.isRecharge) {
          paiementData.beneficiaireId = passager._id;
          paiementData.commission = {
            taux: 0, tauxOriginal: 0, montant: 0,
            modePrelevement:   'paiement_mobile',
            statutPrelevement: 'preleve'
          };
          paiementData.reglesPaiement = {
            conducteurCompteRecharge: passager.compteCovoiturage?.estRecharge || false,
            modesAutorises:           ['MOBILE_MONEY'],
            raisonValidation:         'Recharge de compte conducteur',
            verificationsPassees:     true,
            soldeSuffisant:           true
          };
        } else {
          paiementData.reservationId  = reservationId;
          paiementData.beneficiaireId = conducteur._id;
          paiementData.commission = {
            taux: 0.10, tauxOriginal: 0.10, montant: 0,
            modePrelevement:   'paiement_mobile',
            statutPrelevement: 'en_attente'
          };
          paiementData.reglesPaiement = {
            conducteurCompteRecharge: conducteur.compteCovoiturage?.estRecharge || false,
            soldeConducteurAvant:     conducteur.compteCovoiturage?.solde || 0,
            soldeMinimumRequis:       1000,
            verificationsPassees:     false
          };
        }

        paiement = new Paiement(paiementData);

        if (!options.isRecharge && trajet && conducteur) {
          const distanceKm     = trajet.distanceKm || 0;
          const noteConducteur = conducteur.noteMoyenne || 0;
          await paiement.calculerCommissionDynamique(distanceKm, noteConducteur);

          const nombreTrajetsMois = conducteur.statistiques?.trajetsEffectuesMois || 0;
          paiement.appliquerPrimePerformance(noteConducteur, nombreTrajetsMois);

          const reglesValides = await paiement.validerReglesPaiement();
          if (!reglesValides) throw new Error('Regles de paiement non respectees');
        }

        if (options.numeroTelephone && options.operateur) {
          paiement.initierPaiementMobile(options.numeroTelephone, options.operateur);
        }

        await paiement.save();
      }

      // ── 3. Préparer le payload CinetPay v1.0 ──────────────────
      const transactionId = paiement.referenceTransaction;
      const phoneNumber   = options.numeroTelephone || passager.telephone;
      if (!phoneNumber) throw new Error('Numero de telephone requis pour le paiement');

      const paymentMethod = this.mapperMethodePaiement(
        options.methodePaiement || 'MOBILE_MONEY',
        options.operateur || null
      );

      const cinetPayData = {
        currency:                'XOF',
        // payment_method omis si null → CinetPay affiche tous les opérateurs
        ...(paymentMethod && { payment_method: paymentMethod }),
        merchant_transaction_id: transactionId,
        amount:                  Math.round(montantTotal),
        success_url:             this.successUrl,
        failed_url:              this.failedUrl,
        notify_url:              this.notifyUrl,
        lang:                    'fr',
        designation:             designation,
        client_first_name:       passager.prenom || 'Client',
        client_last_name:        passager.nom    || 'Utilisateur',
        client_phone_number:     phoneNumber,
        client_email:            passager.email  || `user${passager._id}@wayz-eco.local`,
        direct_pay:              false
      };

      logger.info('📤 Envoi requête CinetPay v1.0 /v1/payment', {
      merchant_transaction_id: transactionId,
      amount:         montantTotal,
      payment_method: paymentMethod || 'non spécifié (tous opérateurs)'
    });

      // ── 4. Appel API avec token OAuth ──────────────────────────
      const response = await this.appellerAPICinetPay('/v1/payment', cinetPayData);

      // ── 5. Traiter la réponse ──────────────────────────────────
      // code 100  = SUCCESS (immédiat)
      // code 200  = OK (initié, attente confirmation)
      // code 2001 = INITIATED (attente action utilisateur)
      // code 1200 = TRANSACTION_EXIST (déjà existante)
      if ([100, 200, 2001, 1200].includes(Number(response.code))) {
        paiement.referencePaiementMobile = response.transaction_id || transactionId;
        paiement.ajouterLog('CINETPAY_INITIE', {
          cinetpayTransactionId: response.transaction_id,
          merchantTransactionId: response.merchant_transaction_id,
          code:   response.code,
          status: response.status
        });
        await paiement.save();

        // Si paiement immédiatement confirmé → traiter commission
        if (Number(response.code) === 100) {
          await paiement.traiterCommissionApresPayement();
          logger.info('✅ Paiement immédiatement confirmé (code 100)', { transactionId });
        }

        logger.info('✅ Paiement CinetPay v1.0 initié avec succès', {
          paiementId:           paiement._id,
          referenceTransaction: transactionId,
          code:   response.code,
          status: response.status
        });

        return {
          success:               true,
          paiementId:            paiement._id,
          referenceTransaction:  transactionId,
          cinetpayTransactionId: response.transaction_id,
          urlPaiement:           response.payment_url, 
          token:                 response.payment_token,  
          statut:                response.status,
          message:               'Paiement initie — confirmez sur votre telephone mobile'
        };

      } else {
        paiement.statutPaiement = 'ECHEC';
        paiement.ajouterErreur('CINETPAY_INIT_ECHEC', response.message || response.status || 'Erreur inconnue');
        await paiement.save();

        logger.error('❌ Échec initiation CinetPay v1.0', {
          code:    response.code,
          status:  response.status,
          message: response.message
        });

        throw new Error(this._traduireCodeErreur(response.code, response.status));
      }

    } catch (error) {
      logger.error('❌ Erreur initiation paiement CinetPay:', { message: error.message });
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 🔍 VÉRIFIER LE STATUT D'UNE TRANSACTION
  // ─────────────────────────────────────────────────────────────

  /**
   * Vérifier le statut d'une transaction
   * GET /v1/payment/{merchant_transaction_id}  (Authorization: Bearer {token})
   */
  async verifierStatutTransaction(referenceTransaction) {
    try {
      logger.info('🔍 Vérification statut transaction CinetPay v1.0', { referenceTransaction });

      const paiement = await Paiement.findOne({ referenceTransaction })
        .populate('payeurId', 'nom prenom email')
        .populate('beneficiaireId', 'nom prenom email compteCovoiturage');

      if (!paiement) throw new Error('Transaction introuvable');

      const token = await this.obtenirToken();

      const response = await axios.get(
        `${this.apiUrl}/v1/payment/${referenceTransaction}`,
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/json'
          },
          timeout: 20000
        }
      );

      const data = response.data;
      logger.info('📥 Réponse vérification statut', { code: data.code, status: data.status });

      await this._mettreAJourStatutPaiement(paiement, data);
      await paiement.save();

      return {
        success:        true,
        statutPaiement: paiement.statutPaiement,
        paiement:       paiement.obtenirResume ? paiement.obtenirResume() : { _id: paiement._id, statut: paiement.statutPaiement }
      };

    } catch (error) {
      logger.error('❌ Erreur vérification statut CinetPay v1.0:', { message: error.message });
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 📨 TRAITER UN WEBHOOK
  // ─────────────────────────────────────────────────────────────

  /**
   * Traiter une notification webhook reçue de CinetPay
   *
   * Format reçu :
   * {
   *   "notify_token":            "4bbd93ce...",
   *   "merchant_transaction_id": "PAY_xxx",
   *   "transaction_id":          "50901a80...",
   *   "user": { name, email, phone_number }
   * }
   *
   * Selon la doc : après réception, vérifier le statut final via l'API
   */
  async traiterWebhook(webhookData) {
    try {
      logger.info('📨 Webhook CinetPay v1.0 reçu', {
        merchant_transaction_id: webhookData.merchant_transaction_id,
        transaction_id:          webhookData.transaction_id
      });

      const { merchant_transaction_id, transaction_id, notify_token, user } = webhookData;

      if (!merchant_transaction_id) {
        logger.error('❌ Webhook invalide — merchant_transaction_id manquant');
        return { success: false, message: 'merchant_transaction_id manquant' };
      }

      const paiement = await Paiement.findOne({ referenceTransaction: merchant_transaction_id })
        .populate('beneficiaireId', 'compteCovoiturage nom prenom email');

      if (!paiement) {
        logger.error('❌ Paiement introuvable pour webhook', { merchant_transaction_id });
        return { success: false, message: 'Paiement introuvable' };
      }

      paiement.ajouterLog('WEBHOOK_RECU', {
        notify_token,
        transaction_id,
        user,
        dateReception: new Date()
      });

      // ⚠️ Selon doc CinetPay : vérifier le statut final via l'API après réception du webhook
      try {
        const token = await this.obtenirToken();
        const statusResponse = await axios.get(
          `${this.apiUrl}/v1/payment/${merchant_transaction_id}`,
          {
            headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
            timeout: 15000
          }
        );

        logger.info('🔍 Statut vérifié après webhook', {
          code:   statusResponse.data.code,
          status: statusResponse.data.status
        });

        await this._mettreAJourStatutPaiement(paiement, statusResponse.data);

      } catch (verifyError) {
        // Fallback si la vérification échoue : notify_token présent = succès probable
        logger.warn('⚠️ Vérification statut impossible après webhook — fallback', {
          message: verifyError.message
        });

        if (notify_token) {
          paiement.statutPaiement = 'COMPLETE';
          paiement.dateCompletion = new Date();
          if (paiement.mobileMoney) {
            paiement.mobileMoney.statutMobileMoney = 'SUCCESS';
            paiement.mobileMoney.transactionId     = transaction_id;
            if (user?.phone_number) paiement.mobileMoney.numeroTelephone = user.phone_number;
            paiement.mobileMoney.dateTransaction   = new Date();
          }
          paiement.ajouterLog('WEBHOOK_SUCCESS_FALLBACK', { notify_token, transaction_id });
          await paiement.traiterCommissionApresPayement();
        }
      }

      await paiement.save();

      logger.info('✅ Webhook CinetPay v1.0 traité', {
        merchant_transaction_id,
        statutFinal: paiement.statutPaiement
      });

      return {
        success:        true,
        message:        'Webhook traite avec succes',
        paiementId:     paiement._id,
        statutPaiement: paiement.statutPaiement
      };

    } catch (error) {
      logger.error('❌ Erreur traitement webhook CinetPay v1.0:', { message: error.message });
      return { success: false, message: error.message };
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 🌐 APPEL API GÉNÉRIQUE (avec gestion token + retry)
  // ─────────────────────────────────────────────────────────────

  /**
   * Effectuer un appel POST vers l'API CinetPay v1.0
   * Gère automatiquement : obtention du token, retry si token expiré
   */
  async appellerAPICinetPay(endpoint, data, tentative = 1) {
    try {
      const token = await this.obtenirToken();
      const url   = `${this.apiUrl}${endpoint}`;

      logger.debug('🌐 Appel API CinetPay v1.0', {
        url,
        endpoint,
        merchant_transaction_id: data.merchant_transaction_id
      });

      const response = await axios.post(url, data, {
        headers: {
          'Content-Type':  'application/json',
          'Accept':        'application/json',
          'Authorization': `Bearer ${token}`
        },
        timeout: 30000
      });

      logger.info('📥 Réponse complète CinetPay', {
        fullResponse: response.data
      });

      logger.debug('📥 Réponse API CinetPay v1.0', {
        code:   response.data.code,
        status: response.data.status
      });

      return response.data;

    } catch (error) {
      if (error.response?.data) {
        const code = Number(error.response.data.code);

        // Token expiré/invalide → se reconnecter et réessayer une fois
        if ((code === 1003 || code === 1002) && tentative === 1) {
          logger.warn('🔄 Token expiré/invalide — renouvellement et retry...');
          this._invaliderToken();
          return this.appellerAPICinetPay(endpoint, data, 2);
        }

        logger.error('❌ Erreur API CinetPay v1.0', {
          endpoint,
          status: error.response.status,
          data:   error.response.data
        });

        return error.response.data;
      }

      if (error.code === 'ECONNABORTED') {
        logger.error('⏱️ Timeout API CinetPay v1.0', { endpoint });
        throw new Error('Delai d attente depasse pour l API CinetPay');
      }

      logger.error('❌ Erreur appel API CinetPay v1.0', { endpoint, message: error.message });
      throw new Error(`Erreur API CinetPay: ${error.message}`);
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 🔧 MÉTHODES PRIVÉES
  // ─────────────────────────────────────────────────────────────

  /**
   * Mettre à jour le statut d'un paiement selon la réponse CinetPay
   */
  async _mettreAJourStatutPaiement(paiement, data) {
    const code = Number(data.code);

    if (code === 100) {
      // ✅ SUCCESS — statut final positif
      paiement.statutPaiement = 'COMPLETE';
      paiement.dateCompletion = new Date();
      if (paiement.mobileMoney) {
        paiement.mobileMoney.statutMobileMoney = 'SUCCESS';
        paiement.mobileMoney.transactionId     = data.transaction_id;
        if (data.user?.phone_number) paiement.mobileMoney.numeroTelephone = data.user.phone_number;
        paiement.mobileMoney.dateTransaction   = new Date();
      }
      paiement.ajouterLog('PAIEMENT_CONFIRME', { code, status: data.status, transactionId: data.transaction_id });
      await paiement.traiterCommissionApresPayement();
      logger.info('✅ Paiement confirmé SUCCESS', { referenceTransaction: paiement.referenceTransaction });

    } else if (code === 1200) {
      // Transaction déjà existante et traitée — succès
      paiement.statutPaiement = 'COMPLETE';
      paiement.dateCompletion = paiement.dateCompletion || new Date();
      paiement.ajouterLog('TRANSACTION_EXISTANTE', { code, status: data.status });

    } else if ([2010, 2005].includes(code)) {
      // ❌ FAILED / INSUFFICIENT_BALANCE — statuts finaux négatifs
      paiement.statutPaiement = 'ECHEC';
      if (paiement.mobileMoney) paiement.mobileMoney.statutMobileMoney = 'FAILED';
      paiement.ajouterErreur('PAIEMENT_ECHOUE', this._traduireCodeErreur(code, data.status));
      logger.warn('⚠️ Paiement échoué', { code, status: data.status });

    } else if ([2001, 2002].includes(code)) {
      // ⏳ En attente (non final)
      paiement.ajouterLog('PAIEMENT_EN_ATTENTE', { code, status: data.status });
      logger.info('⏳ Paiement en attente', { code, status: data.status });

    } else if ([2003, 2004, 2008].includes(code)) {
      // ⏰ Expiré ou erreur OTP
      paiement.ajouterLog('PAIEMENT_EXPIRE_OTP', { code, status: data.status });
      logger.warn('⚠️ Paiement expiré ou OTP invalide', { code, status: data.status });

    } else {
      paiement.ajouterLog('STATUT_INCONNU', { code, status: data.status });
      logger.warn('⚠️ Code statut CinetPay non géré', { code, status: data.status });
    }
  }

  /**
   * Traduire un code d'erreur CinetPay en message lisible
   */
  _traduireCodeErreur(code, status) {
    const messages = {
      '-1':   'Une erreur s est produite (OPERATION_ERROR)',
      '404':  'Transaction introuvable (NOT_FOUND)',
      '1002': 'Jeton d authentification invalide (INVALID_TOKEN)',
      '1003': 'Jeton d authentification expire (EXPIRED_TOKEN)',
      '1004': 'Parametres invalides (INVALID_PARAMS)',
      '1005': 'Identifiants invalides (INVALID_CREDENTIALS)',
      '2003': 'Operation expiree — l utilisateur n a pas confirme (EXPIRED)',
      '2004': 'Code OTP incorrect (OTP_ERROR)',
      '2005': 'Solde insuffisant (INSUFFICIENT_BALANCE)',
      '2006': 'Utilisateur inexistant (USER_NOT_FOUND)',
      '2007': 'Utilisateur bloque (USER_IS_BLOCKED)',
      '2008': 'Code OTP expire (OTP_EXPIRED)',
      '2010': 'Paiement echoue (FAILED)',
      '2011': 'Adresse IP non autorisee (NOT_ALLOWED)'
    };
    return messages[String(code)] || status || `Erreur inconnue (code: ${code})`;
  }

  // ─────────────────────────────────────────────────────────────
  // 📊 STATISTIQUES
  // ─────────────────────────────────────────────────────────────

  async obtenirStatistiques(dateDebut, dateFin) {
    try {
      const stats = await Paiement.aggregate([
        {
          $match: {
            dateInitiation:  { $gte: dateDebut, $lte: dateFin },
            methodePaiement: { $ne: 'ESPECES' }
          }
        },
        {
          $group: {
            _id:          '$statutPaiement',
            count:        { $sum: 1 },
            montantTotal: { $sum: '$montantTotal' }
          }
        }
      ]);
      return stats;
    } catch (error) {
      logger.error('❌ Erreur statistiques CinetPay:', { message: error.message });
      throw error;
    }
  }

  // ─────────────────────────────────────────────────────────────
  // 🔄 MÉTHODES DE COMPATIBILITÉ
  // ─────────────────────────────────────────────────────────────

  async getPayeurFromReservation(reservationId) {
    const reservation = await Reservation.findById(reservationId);
    if (!reservation) throw new Error('Reservation introuvable');
    return reservation.passagerId;
  }

  async getBeneficiaireFromReservation(reservationId) {
    const reservation = await Reservation.findById(reservationId).populate('trajetId');
    if (!reservation?.trajetId) throw new Error('Reservation ou trajet introuvable');
    return reservation.trajetId.conducteurId;
  }

  async getCustomerPhone(userId) {
    const user = await Utilisateur.findById(userId).select('telephone');
    return user?.telephone || '';
  }

  async getCustomerEmail(userId) {
    const user = await Utilisateur.findById(userId).select('email');
    return user?.email || '';
  }

  async getCustomerName(userId) {
    const user = await Utilisateur.findById(userId).select('prenom nom');
    return user ? `${user.prenom} ${user.nom}` : '';
  }
}

module.exports = CinetPayService;