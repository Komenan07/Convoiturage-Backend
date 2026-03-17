// controllers/authController.js
const User = require('../models/Utilisateur');
const Vehicule = require('../models/Vehicule');
const crypto = require('crypto');
const sendEmail = require('../utils/emailService');
const { sendSMS } = require('../services/smsService');
const { logger } = require('../utils/logger');
const AppError = require('../utils/AppError');
const twilioService = require('../services/twilioService');
const fs = require('fs');
const path = require('path');


// ===================================
// FONCTIONS UTILITAIRES
// ===================================

/**
 * Fonction utilitaire pour charger et remplacer les variables dans un template
 */
const chargerTemplate = (nomTemplate, variables = {}) => {
  try {
    const templatePath = path.join(process.cwd(), 'views', nomTemplate);
    let htmlTemplate = fs.readFileSync(templatePath, 'utf8');
    
    // Remplacer les variables dans le template
    Object.keys(variables).forEach(key => {
      const regex = new RegExp(`\\$\\{${key}\\}`, 'g');
      htmlTemplate = htmlTemplate.replace(regex, variables[key]);
    });
    
    return htmlTemplate;
  } catch (error) {
    logger.error(`Erreur chargement template ${nomTemplate}:`, error);
    throw new Error(`Impossible de charger le template ${nomTemplate}`);
  }
};

/**
 * 🔥 FONCTION CENTRALISÉE DE NORMALISATION DU TÉLÉPHONE POUR LA CÔTE D'IVOIRE
 * Cette fonction doit être utilisée PARTOUT où on manipule un numéro de téléphone
 */
const normaliserTelephoneCI = (tel) => {
  if (!tel) return null;
  
  // Supprimer tous les caractères non numériques sauf le +
  let telClean = tel.replace(/[\s\-().{}]/g, '');
  
  // Cas 1: Numéro commence par +225 (déjà international)
  if (telClean.startsWith('+225')) {
    const numero = telClean.substring(4); // Enlever +225
    // Vérifier que le numéro fait exactement 10 chiffres
    if (numero.length === 10 && /^\d{10}$/.test(numero)) {
      return '+225' + numero;
    }
    return null; // Format invalide
  }
  
  // Cas 2: Numéro commence par 00225
  if (telClean.startsWith('00225')) {
    const numero = telClean.substring(5); // Enlever 00225
    if (numero.length === 10 && /^\d{10}$/.test(numero)) {
      return '+225' + numero;
    }
    return null;
  }
  
  // Cas 3: Numéro commence par 225 (sans indicateur international)
  if (telClean.startsWith('225')) {
    const numero = telClean.substring(3); // Enlever 225
    if (numero.length === 10 && /^\d{10}$/.test(numero)) {
      return '+225' + numero;
    }
    return null;
  }
  
  // Enlever le + initial s'il existe pour traitement uniforme
  telClean = telClean.replace(/^\+/, '');
  
  // Cas 4: Numéro commence par 0 (format national)
  if (telClean.startsWith('0')) {
    const numero = telClean.substring(1); // Enlever le 0
    if (numero.length === 9 && /^\d{9}$/.test(numero)) {
      return '+2250' + numero; // Ajouter +225 + 0
    }
    return null;
  }
  
  // Cas 5: Numéro de 10 chiffres (format national sans 0 initial)
  if (telClean.length === 10 && /^\d{10}$/.test(telClean)) {
    return '+225' + telClean;
  }
  
  // Cas 6: Numéro de 9 chiffres (format local sans 0)
  if (telClean.length === 9 && /^\d{9}$/.test(telClean)) {
    return '+2250' + telClean;
  }
  
  // Cas 7: Numéro de 8 chiffres (ancien format mobile)
  if (telClean.length === 8 && /^\d{8}$/.test(telClean)) {
    // Ajouter 0 pour faire 10 chiffres au format national
    return '+22507' + telClean;
  }
  
  return null; // Format non reconnu
};

// ✨ Détecter le type d'appareil
const detectDeviceType = (userAgent) => {
  if (!userAgent) return 'unknown';
  if (/mobile/i.test(userAgent)) return 'mobile';
  if (/tablet/i.test(userAgent)) return 'tablet';
  return 'desktop';
};

// ✨Détecter le système d'exploitation
const detectOS = (userAgent) => {
  if (!userAgent) return 'Unknown';
  if (/windows/i.test(userAgent)) return 'Windows';
  if (/android/i.test(userAgent)) return 'Android';
  if (/iphone|ipad/i.test(userAgent)) return 'iOS';
  if (/mac/i.test(userAgent)) return 'macOS';
  if (/linux/i.test(userAgent)) return 'Linux';
  return 'Unknown';
};

// ✨ Détecter le navigateur
const detectBrowser = (userAgent) => {
  if (!userAgent) return 'Unknown';
  if (/chrome/i.test(userAgent) && !/edge/i.test(userAgent)) return 'Chrome';
  if (/firefox/i.test(userAgent)) return 'Firefox';
  if (/safari/i.test(userAgent) && !/chrome/i.test(userAgent)) return 'Safari';
  if (/edge/i.test(userAgent)) return 'Edge';
  if (/opera/i.test(userAgent)) return 'Opera';
  return 'Unknown';
};


// ===================================
// INSCRIPTION CONDUCTEUR 
// ===================================

// controllers/authController.js - passerConducteur

/**
 * @desc    Passage passager → conducteur 
 * @route   POST /api/auth/passer-conducteur
 * @access  Private (passager vérifié)
 */
  const passerConducteur = async (req, res, next) => {
  try {
    // ===== VÉRIFICATIONS =====
    if (!req.user || !req.user.userId) {
      return res.status(401).json({
        success: false,
        message: 'Authentification requise',
        code: 'AUTHENTICATION_REQUIRED'
      });
    }

    // Vérifier que c'est un passager
    if (req.user.role !== 'passager') {
      return res.status(400).json({
        success: false,
        message: 'Seuls les passagers peuvent devenir conducteurs',
        code: 'INVALID_ROLE',
        currentRole: req.user.role
      });
    }

    const utilisateur = await User.findById(req.user.userId);
    
    if (!utilisateur) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

    // Vérifier si déjà en attente de validation
    if (utilisateur.statutCompte === 'CONDUCTEUR_EN_ATTENTE_VERIFICATION') {
      return res.status(400).json({
        success: false,
        message: 'Votre demande pour devenir conducteur est déjà en cours de traitement',
        code: 'ALREADY_PENDING',
        data: {
          statutActuel: utilisateur.statutCompte,
          dateDemandeInitiale: utilisateur.historiqueStatuts
            .filter(h => h.nouveauStatut === 'CONDUCTEUR_EN_ATTENTE_VERIFICATION')
            .sort((a, b) => b.dateModification - a.dateModification)[0]?.dateModification
        }
      });
    }

    // Vérifier vérification d'identité
    if (!utilisateur.estVerifie && 
        (utilisateur.documentIdentite?.statutVerification !== 'VERIFIE' && utilisateur.documentIdentite?.statutVerification !== 'EN_ATTENTE')) {
      return res.status(403).json({
        success: false,
        message: 'Votre identité doit être vérifiée avant de devenir conducteur',
        code: 'IDENTITY_NOT_VERIFIED',
        currentStatus: utilisateur.documentIdentite?.statutVerification || 'NON_SOUMIS',
        action: 'Veuillez soumettre vos documents d\'identité pour vérification'
      });
    }

    // ===== PASSAGE EN ATTENTE DE VALIDATION =====
    const ancienStatut = utilisateur.statutCompte;
    
    // NE PAS changer le rôle immédiatement - il reste "passager"
    // Le rôle sera changé à "conducteur" uniquement après validation admin
    
    // Changer le statut pour indiquer qu'il est en attente de validation
    utilisateur.statutCompte = 'CONDUCTEUR_EN_ATTENTE_VERIFICATION';

    // Initialiser compte covoiturage (pour préparer le futur rôle conducteur)
    if (!utilisateur.compteCovoiturage) {
      utilisateur.compteCovoiturage = {
        solde: 0,
        estRecharge: false,
        seuilMinimum: 0,
        historiqueRecharges: [],
        historiqueCommissions: [],
        totalCommissionsPayees: 0,
        totalGagnes: 0,
        modeAutoRecharge: {
          active: false
        },
        parametresRetrait: {},
        limites: {
          retraitJournalier: 1000000,
          retraitMensuel: 5000000,
          montantRetireAujourdhui: 0,
          montantRetireCeMois: 0
        }
      };
    }

    // Historique de changement de statut
    utilisateur.historiqueStatuts.push({
      ancienStatut: ancienStatut,
      nouveauStatut: 'CONDUCTEUR_EN_ATTENTE_VERIFICATION',
      raison: 'Demande de passage en conducteur - En attente de validation administrative',
      dateModification: new Date()
    });

    await utilisateur.save({ validateBeforeSave: false });

    logger.info('📝 Demande passage conducteur soumise', { 
      userId: utilisateur._id,
      email: utilisateur.email,
      statutActuel: utilisateur.statutCompte
    });

    // ===== RÉPONSE =====
    res.status(200).json({
      success: true,
      message: '📝 Votre demande pour devenir conducteur a été enregistrée.',
      data: {
        utilisateur: {
          id: utilisateur._id,
          nom: utilisateur.nom,
          prenom: utilisateur.prenom,
          email: utilisateur.email,
          role: utilisateur.role, // Reste "passager" jusqu'à validation
          statutCompte: utilisateur.statutCompte, // CONDUCTEUR_EN_ATTENTE_VERIFICATION
          badges: utilisateur.badges,
          estVerifie: utilisateur.estVerifie,
          compteCovoiturage: {
            solde: utilisateur.compteCovoiturage.solde,
            estRecharge: utilisateur.compteCovoiturage.estRecharge
          }
        },
        demande: {
          statut: 'EN_ATTENTE',
          dateDemande: new Date(),
          etapeActuelle: 'AJOUT_VEHICULE',
          prochainEtape: 'VALIDATION_ADMINISTRATIVE'
        }
      },
      nextSteps: {
        etapes: [
          {
            numero: 1,
            statut: 'EN_COURS',
            action: 'AJOUTER_VEHICULE',
            titre: '🚗 Étape 1 : Ajoutez votre véhicule',
            description: 'Vous devez ajouter au moins un véhicule avec tous les documents requis',
            route: '/api/vehicules',
            method: 'POST',
            required: true,
            documentsNecessaires: [
              'Photos du véhicule (avant, arrière, intérieur)',
              'Carte grise (numéro, date d\'émission, numéro de châssis)',
              'Assurance valide (type transport de personnes)',
              'Visite technique valide',
              'Vignette à jour',
              'Carte de transport',
              'Équipements de sécurité obligatoires'
            ]
          },
          {
            numero: 2,
            statut: 'EN_ATTENTE',
            action: 'VALIDATION_ADMINISTRATIVE',
            titre: '✅ Étape 2 : Validation administrative',
            description: 'Un administrateur vérifiera vos documents et votre véhicule avant de valider votre compte conducteur',
            delaiEstime: '24-48 heures',
            required: true,
            criteres: [
              'Identité vérifiée',
              'Véhicule conforme aux normes',
              'Documents valides et à jour',
              'Équipements de sécurité présents'
            ]
          },
          {
            numero: 3,
            statut: 'A_VENIR',
            action: 'ACTIVATION_COMPTE_CONDUCTEUR',
            titre: '🎉 Étape 3 : Activation du compte conducteur',
            description: 'Une fois validé, vous pourrez proposer des trajets',
            automatique: true
          }
        ],
        informationsImportantes: [
          '⚠️ Votre rôle reste "passager" jusqu\'à validation administrative',
          '📱 Vous serez notifié par email et SMS lors de la validation',
          '⏱️ Le délai de validation est généralement de 24 à 48 heures',
          '❌ En cas de rejet, vous pourrez corriger et resoumettre'
        ]
      },
      avertissement: {
        titre: '⚠️ Important',
        message: 'Votre compte conducteur sera activé uniquement après validation par un administrateur. En attendant, vous pouvez continuer à utiliser la plateforme en tant que passager.'
      }
    });

  } catch (error) {
    logger.error('❌ Erreur demande passage conducteur:', error);
    return next(AppError.serverError('Erreur lors de la demande de passage conducteur', { 
      originalError: error.message
    }));
  }
};

// ===================================
// INSCRIPTION AVEC WHATSAPP
// ===================================

const EMAIL_TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const OTP_TTL_MS         = 10 * 60 * 1000;
const STATUT_CHOIX_CANAL = 'EN_ATTENTE_CHOIX_CANAL';
const STATUT_ATTENTE     = 'EN_ATTENTE_VERIFICATION';

const _envoyerConfirmationEmail = async (utilisateur) => {
  const confirmationToken = crypto.randomBytes(32).toString('hex');
  const hashedToken = crypto.createHash('sha256').update(confirmationToken).digest('hex');
  utilisateur.tokenConfirmationEmail = hashedToken;
  utilisateur.expirationTokenConfirmation = Date.now() + EMAIL_TOKEN_TTL_MS;
  utilisateur.statutCompte = STATUT_ATTENTE;
  await utilisateur.save({ validateBeforeSave: false });
  const confirmationUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/api/auth/confirm-email/${confirmationToken}`;
  const emailHtml = chargerTemplate('envoiEmail-template.html', {
    'newUser.prenom': utilisateur.prenom,
    confirmationUrl,
  });
  await sendEmail({ to: utilisateur.email, subject: 'Confirmez votre adresse email – WAYZ-ECO', html: emailHtml });
  logger.info('Email de confirmation envoyé', { userId: utilisateur._id });
  return { expiration: utilisateur.expirationTokenConfirmation };
};

const _envoyerOTPWhatsApp = async (utilisateur) => {
  const code = utilisateur.genererCodeWhatsApp();
  utilisateur.statutCompte = STATUT_ATTENTE;
  await utilisateur.save({ validateBeforeSave: false });
  const nomComplet = `${utilisateur.prenom} ${utilisateur.nom}`;
  const resultat = await twilioService.envoyerCodeVerification(utilisateur.telephone, code, nomComplet);
  if (!resultat.success) {
    const err = new Error(resultat.error || 'Échec envoi WhatsApp');
    err.errorType = 'WHATSAPP_SEND_FAILED';
    throw err;
  }
  if (process.env.NODE_ENV === 'development') {
    console.log(`📱 [WhatsApp] Code pour ${utilisateur.telephone} : ${code}`);
  }
  logger.info('OTP WhatsApp envoyé', { userId: utilisateur._id });
  return { expiration: utilisateur.codeVerificationWhatsAppExpire };
};

const _envoyerOTPSMS = async (utilisateur) => {
  const codeSMS = Math.floor(100000 + Math.random() * 900000).toString();
  utilisateur.codeSMS = codeSMS;
  utilisateur.expirationCodeSMS = Date.now() + OTP_TTL_MS;
  utilisateur.statutCompte = STATUT_ATTENTE;
  await utilisateur.save({ validateBeforeSave: false });
  const nomComplet = `${utilisateur.prenom} ${utilisateur.nom}`;
  const resultat = await twilioService.envoyerCodeVerification(utilisateur.telephone, codeSMS, nomComplet);
  if (!resultat.success) {
    const err = new Error(resultat.error || 'Échec envoi SMS');
    err.errorType = 'SMS_SEND_FAILED';
    throw err;
  }
  if (process.env.NODE_ENV === 'development') {
    console.log(`📩 [SMS] Code pour ${utilisateur.telephone} : ${codeSMS}`);
  }
  logger.info('OTP SMS envoyé', { userId: utilisateur._id });
  return { expiration: utilisateur.expirationCodeSMS };
};

const _envoyerVerification = async (utilisateur, canal) => {
  switch (canal) {
    case 'EMAIL':    return _envoyerConfirmationEmail(utilisateur);
    case 'WHATSAPP': return _envoyerOTPWhatsApp(utilisateur);
    case 'SMS':      return _envoyerOTPSMS(utilisateur);
    default:
      throw Object.assign(new Error(`Canal inconnu : ${canal}`), { errorType: 'INVALID_CANAL' });
  }
};

const _buildSuccessMessage = (canal) => {
  switch (canal) {
    case 'EMAIL':    return 'Compte créé ! Un lien de confirmation a été envoyé à votre adresse email.';
    case 'WHATSAPP': return 'Compte créé ! Un code de vérification a été envoyé sur WhatsApp.';
    case 'SMS':      return 'Compte créé ! Un code de vérification a été envoyé par SMS.';
    default:         return 'Compte créé.';
  }
};

const _buildNextStep = (canal) => {
  switch (canal) {
    case 'EMAIL':
      return { action: 'CONFIRMER_EMAIL', message: 'Cliquez sur le lien reçu par email pour activer votre compte.' };
    case 'WHATSAPP':
      return { action: 'VERIFIER_CODE_WHATSAPP', message: 'Saisissez le code reçu sur WhatsApp.', route: '/api/auth/verify-code' };
    case 'SMS':
      return { action: 'VERIFIER_CODE_SMS', message: 'Saisissez le code reçu par SMS.', route: '/api/auth/verify-sms' };
    default:
      return {};
  }
};

/**
 * @desc    Inscription d'un nouvel utilisateur avec vérification WhatsApp
 * @route   POST /api/auth/register
 * @access  Public
 */
const register = async (req, res, next) => {
  try {
    const {
      nom,
      prenom,
      email,
      telephone,
      motDePasse,
      hasWhatsApp = true,
    } = req.body;
 
    logger.info('Tentative d\'inscription', {
      email: email || null,
      telephone: telephone || null,
    });
 
    // ── 1. CHAMPS OBLIGATOIRES ────────────────────────────────────────────────
    if (!nom || !prenom) {
      return res.status(400).json({
        success: false,
        message: 'Le nom et le prénom sont obligatoires.',
        champsRequis: ['nom', 'prenom'],
      });
    }
 
    if (!email && !telephone) {
      return res.status(400).json({
        success: false,
        message: 'Veuillez fournir un email et/ou un numéro de téléphone.',
        champsRequis: ['email ou telephone'],
      });
    }
 
    // ── 2. NORMALISATION DU TÉLÉPHONE ─────────────────────────────────────────
    let phoneProcessed = null;
 
    if (telephone) {
      phoneProcessed = normaliserTelephoneCI(telephone);
 
      if (!phoneProcessed) {
        return res.status(400).json({
          success: false,
          message: 'Numéro de téléphone invalide pour la Côte d\'Ivoire.',
          errorType: 'INVALID_PHONE_FORMAT',
          field: 'telephone',
          value: telephone,
          suggestion: 'Formats acceptés : 0707070708, +22507070708, 07070708',
        });
      }
    }
 
    // ── 3. UNICITÉ EMAIL + TÉLÉPHONE ──────────────────────────────────────────
    const filtres = [];
    if (phoneProcessed) filtres.push({ telephone: phoneProcessed });
    if (email)          filtres.push({ email });
 
    const doublon = await User.findOne({ $or: filtres }).maxTimeMS(30000);
 
    if (doublon) {
      if (phoneProcessed && doublon.telephone === phoneProcessed) {
        return res.status(409).json({
          success: false,
          message: 'Ce numéro de téléphone est déjà associé à un compte.',
          champ: 'telephone',
        });
      }
      if (email && doublon.email === email) {
        return res.status(409).json({
          success: false,
          message: 'Cet email est déjà associé à un compte.',
          champ: 'email',
        });
      }
    }
 
    // ── 4. CRÉER LE COMPTE ────────────────────────────────────────────────────
    //   Les deux canaux disponibles → statut intermédiaire CHOIX_CANAL
    //   Un seul canal               → statut ATTENTE_VERIFICATION direct
    const aDeuxCanaux   = !!email && !!phoneProcessed;
    const statutInitial = aDeuxCanaux ? STATUT_CHOIX_CANAL : STATUT_ATTENTE;
 
    const utilisateur = await User.create({
      nom,
      prenom,
      telephone: phoneProcessed || undefined,
      // Email obligatoire en base : on génère un temporaire si absent
      email: email || `${phoneProcessed}@temp.covoiturage.ci`,
      motDePasse: motDePasse || `Temp${Math.random().toString(36).slice(-8)}!1`,
      statutCompte: statutInitial,
      role: 'passager',
      compteCovoiturage: {
        solde: 0,
        estRecharge: false,
        seuilMinimum: 0,
        historiqueRecharges: [],
        totalCommissionsPayees: 0,
        totalGagnes: 0,
        modeAutoRecharge: { active: false },
        historiqueCommissions: [],
        parametresRetrait: {},
        limites: {
          retraitJournalier: 1000000,
          retraitMensuel: 5000000,
          montantRetireAujourdhui: 0,
          montantRetireCeMois: 0,
        },
      },
    });
 
    // ── 5A. DEUX CANAUX → DEMANDER LE CHOIX ──────────────────────────────────
    if (aDeuxCanaux) {
      logger.info('Inscription email + téléphone → choix de canal requis', {
        userId: utilisateur._id,
      });
 
      return res.status(201).json({
        success: true,
        requiresChoice: true,
        message: 'Compte créé. Veuillez choisir votre méthode de vérification.',
        data: {
          utilisateurId: utilisateur._id,
          nomComplet: `${utilisateur.prenom} ${utilisateur.nom}`,
          canauxDisponibles: [
            {
              canal: 'EMAIL',
              label: 'Email',
              description: `Recevoir un lien de confirmation sur ${email}`,
              valeur: email,
            },
            {
              canal: hasWhatsApp ? 'WHATSAPP' : 'SMS',
              label: hasWhatsApp ? 'WhatsApp' : 'SMS',
              description: `Recevoir un code OTP sur ${phoneProcessed}`,
              valeur: phoneProcessed,
            },
          ],
        },
        nextStep: {
          action: 'CHOISIR_CANAL',
          message: 'Envoyez votre choix via POST /api/auth/register/choose-channel',
          route: '/api/auth/register/choose-channel',
          bodyAttendu: {
            utilisateurId: utilisateur._id,
            canal: '"EMAIL" | "WHATSAPP" | "SMS"',
          },
        },
      });
    }
 
    // ── 5B. UN SEUL CANAL → ENVOYER DIRECTEMENT ──────────────────────────────
    const canal = email ? 'EMAIL' : hasWhatsApp ? 'WHATSAPP' : 'SMS';
    let envoi;
 
    try {
      envoi = await _envoyerVerification(utilisateur, canal);
    } catch (sendError) {
      // Rollback
      await User.findByIdAndDelete(utilisateur._id);
      logger.error(`Échec envoi (${canal}) à la création :`, sendError);
 
      return res.status(500).json({
        success: false,
        canal,
        message: `Impossible d'envoyer la vérification (${canal}). Veuillez réessayer.`,
        errorType: sendError.errorType || 'SEND_FAILED',
        details: sendError.message,
        ...(canal === 'WHATSAPP' && {
          fallback: {
            message: 'Relancez avec hasWhatsApp: false pour recevoir un SMS.',
          },
        }),
      });
    }
 
    return res.status(201).json({
      success: true,
      requiresChoice: false,
      canal,
      message: _buildSuccessMessage(canal),
      data: {
        utilisateurId: utilisateur._id,
        email: email || null,
        telephone: phoneProcessed || null,
        nomComplet: `${utilisateur.prenom} ${utilisateur.nom}`,
        expiration: envoi.expiration,
      },
      nextStep: _buildNextStep(canal),
    });
 
  } catch (error) {
    logger.error('Erreur inscription :', error);
 
    if (error.name === 'ValidationError') {
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation des données.',
        erreurs: Object.values(error.errors).map(e => e.message),
      });
    }
 
    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Un compte avec ces informations existe déjà.',
      });
    }
 
    return next(
      AppError.serverError('Erreur serveur lors de l\'inscription', {
        originalError: error.message,
      })
    );
  }
};
/**
 * @desc    Envoyer la vérification sur le canal choisi par l'utilisateur.
 *          Appelé uniquement quand email + téléphone ont été fournis à l'étape 1.
 *
 * @route   POST /api/auth/register/choose-channel
 * @access  Public
 *
 * Body : { utilisateurId, canal: 'EMAIL' | 'WHATSAPP' | 'SMS' }
 */
const chooseChannel = async (req, res, next) => {
  try {
    const { utilisateurId, canal } = req.body;
 
    // ── 1. VALIDATION ─────────────────────────────────────────────────────────
    if (!utilisateurId || !canal) {
      return res.status(400).json({
        success: false,
        message: 'utilisateurId et canal sont obligatoires.',
        champsRequis: ['utilisateurId', 'canal'],
      });
    }
 
    const canauxValides = ['EMAIL', 'WHATSAPP', 'SMS'];
 
    if (!canauxValides.includes(canal)) {
      return res.status(400).json({
        success: false,
        message: `Canal invalide. Valeurs acceptées : ${canauxValides.join(', ')}.`,
        errorType: 'INVALID_CANAL',
        canauxValides,
      });
    }
 
    // ── 2. CHARGER L'UTILISATEUR ──────────────────────────────────────────────
    const utilisateur = await User.findById(utilisateurId)
      .select('+codeVerificationWhatsApp +codeVerificationWhatsAppExpire +codeSMS +expirationCodeSMS +tokenConfirmationEmail +expirationTokenConfirmation')
      .maxTimeMS(30000);
 
    if (!utilisateur) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur introuvable.',
        errorType: 'USER_NOT_FOUND',
      });
    }
 
    // ── 3. VÉRIFIER LE STATUT ─────────────────────────────────────────────────
    if (utilisateur.statutCompte === 'ACTIF') {
      return res.status(400).json({
        success: false,
        message: 'Ce compte est déjà actif.',
        errorType: 'ALREADY_ACTIVE',
      });
    }
 
    if (utilisateur.statutCompte !== STATUT_CHOIX_CANAL) {
      return res.status(400).json({
        success: false,
        message: 'Ce compte n\'est pas en attente de choix de canal. ' +
                 'Vérifiez que vous n\'avez pas déjà effectué cette étape.',
        errorType: 'INVALID_STATUS',
        statutActuel: utilisateur.statutCompte,
      });
    }
 
    // ── 4. VÉRIFIER QUE LE CANAL EST DISPONIBLE POUR CE COMPTE ───────────────
    if (canal === 'EMAIL' && (!utilisateur.email || utilisateur.email.includes('@temp.covoiturage.ci'))) {
      return res.status(400).json({
        success: false,
        message: 'Aucun email réel associé à ce compte.',
        errorType: 'NO_EMAIL',
      });
    }
 
    if ((canal === 'WHATSAPP' || canal === 'SMS') && !utilisateur.telephone) {
      return res.status(400).json({
        success: false,
        message: 'Aucun numéro de téléphone associé à ce compte.',
        errorType: 'NO_PHONE',
      });
    }
 
    // ── 5. ENVOYER LA VÉRIFICATION ────────────────────────────────────────────
    let envoi;
 
    try {
      envoi = await _envoyerVerification(utilisateur, canal);
    } catch (sendError) {
      logger.error(`Échec envoi canal ${canal} (choose-channel) :`, sendError);
 
      return res.status(500).json({
        success: false,
        canal,
        message: `Impossible d'envoyer la vérification via ${canal}. ` +
                 'Veuillez choisir un autre canal ou réessayer.',
        errorType: sendError.errorType || 'SEND_FAILED',
        details: sendError.message,
        ...(canal === 'WHATSAPP' && {
          fallback: {
            message: 'Relancez avec canal: "SMS" pour recevoir un code par message texte.',
          },
        }),
      });
    }
 
    logger.info(`Canal ${canal} sélectionné et vérification envoyée`, {
      userId: utilisateur._id,
    });
 
    return res.status(200).json({
      success: true,
      canal,
      message: _buildSuccessMessage(canal),
      data: {
        utilisateurId: utilisateur._id,
        email: canal === 'EMAIL' ? utilisateur.email : null,
        telephone: (canal === 'WHATSAPP' || canal === 'SMS') ? utilisateur.telephone : null,
        expiration: envoi.expiration,
      },
      nextStep: _buildNextStep(canal),
    });
 
  } catch (error) {
    logger.error('Erreur choix de canal :', error);
    return next(
      AppError.serverError('Erreur serveur lors du choix de canal', {
        originalError: error.message,
      })
    );
  }
};
 
/**
 * @desc    Vérifier le code WhatsApp
 * @route   POST /api/auth/verify-code
 * @access  Public
 */
const verifyCode = async (req, res, next) => {
  try {
    const { telephone, code } = req.body;

    if (!telephone || !code) {
      return res.status(400).json({
        success: false,
        message: 'Veuillez fournir le numéro de téléphone et le code'
      });
    }

    // 🔥 NORMALISER LE TÉLÉPHONE AVANT LA RECHERCHE
    const phoneProcessed = normaliserTelephoneCI(telephone);
    
    if (!phoneProcessed) {
      return res.status(400).json({
        success: false,
        message: 'Le numéro de téléphone n\'est pas valide',
        errorType: 'INVALID_PHONE_FORMAT'
      });
    }

    const utilisateur = await User.findOne({ telephone: phoneProcessed })
      .select('+codeVerificationWhatsApp +codeVerificationWhatsAppExpire +refreshTokens');

    if (!utilisateur) {
      return res.status(404).json({
        success: false,
        message: 'Aucun compte trouvé avec ce numéro de téléphone'
      });
    }

    if (utilisateur.whatsappVerifie) {
      return res.status(400).json({
        success: false,
        message: 'Ce compte est déjà vérifié',
        data: { deja_verifie: true }
      });
    }

    const resultatVerification = utilisateur.verifierCodeWhatsApp(code);

    if (!resultatVerification.valide) {
      await utilisateur.save({ validateBeforeSave: false });

      return res.status(400).json({
        success: false,
        message: resultatVerification.raison
      });
    }

    // Code valide : activer le compte
    utilisateur.whatsappVerifie = true;
    utilisateur.statutCompte = 'ACTIF';
    utilisateur.estVerifie = true;
    utilisateur.codeVerificationWhatsApp = undefined;
    utilisateur.codeVerificationWhatsAppExpire = undefined;

    await utilisateur.save({ validateBeforeSave: false });

    // Envoyer message de bienvenue
    await twilioService.envoyerMessageBienvenue(
      phoneProcessed,
      utilisateur.prenom
    );

    // ✨ Récupérer les informations de l'appareil
    const deviceInfo = {
      userAgent: req.headers['user-agent'] || 'Unknown',
      ip: req.ip || req.connection.remoteAddress,
      deviceType: detectDeviceType(req.headers['user-agent']),
      os: detectOS(req.headers['user-agent']),
      browser: detectBrowser(req.headers['user-agent'])
    };

    // Générer Access Token ET Refresh Token
    const accessToken = utilisateur.getSignedJwtToken();
    const refreshToken = await utilisateur.generateRefreshToken(deviceInfo);

    logger.info('Vérification WhatsApp réussie', { userId: utilisateur._id });

    res.status(200).json({
      success: true,
      message: '✅ Compte vérifié avec succès !',
      data: {
        accessToken,       
        refreshToken, 
        expiresIn: process.env.JWT_EXPIRE || '15m',
        refreshTokenExpiresIn: `${process.env.REFRESH_TOKEN_DAYS || 30} jours`,    
        utilisateur: {
          id: utilisateur._id,
          nom: utilisateur.nom,
          prenom: utilisateur.prenom,
          telephone: utilisateur.telephone,
          email: utilisateur.email,
          role: utilisateur.role,
          statutCompte: utilisateur.statutCompte,
          nomComplet: utilisateur.nomComplet
        }
      }
    });

  } catch (error) {
    logger.error('Erreur vérification code WhatsApp:', error);
    return next(AppError.serverError('Erreur lors de la vérification du code', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc    Renvoyer le code de vérification WhatsApp
 * @route   POST /api/auth/resend-code
 * @access  Public
 */
const resendCode = async (req, res, next) => {
  try {
    const { telephone } = req.body;

    if (!telephone) {
      return res.status(400).json({
        success: false,
        message: 'Veuillez fournir le numéro de téléphone'
      });
    }

    // 🔥 NORMALISER LE TÉLÉPHONE
    const phoneProcessed = normaliserTelephoneCI(telephone);
    
    if (!phoneProcessed) {
      return res.status(400).json({
        success: false,
        message: 'Le numéro de téléphone n\'est pas valide',
        errorType: 'INVALID_PHONE_FORMAT'
      });
    }

    const utilisateur = await User.findOne({ telephone: phoneProcessed })
      .select('+codeVerificationWhatsApp +codeVerificationWhatsAppExpire');

    if (!utilisateur) {
      return res.status(404).json({
        success: false,
        message: 'Aucun compte trouvé avec ce numéro de téléphone'
      });
    }

    if (utilisateur.whatsappVerifie) {
      return res.status(400).json({
        success: false,
        message: 'Ce compte est déjà vérifié'
      });
    }

    const code = utilisateur.genererCodeWhatsApp();
    await utilisateur.save({ validateBeforeSave: false });

    const nomComplet = `${utilisateur.prenom} ${utilisateur.nom}`;
    const resultatEnvoi = await twilioService.envoyerCodeVerification(
      phoneProcessed,
      code,
      nomComplet
    );

    if (!resultatEnvoi.success) {
      return res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'envoi du code',
        details: 'Impossible d\'envoyer le message WhatsApp'
      });
    }

    logger.info('Nouveau code WhatsApp envoyé', { userId: utilisateur._id });
    
    if (process.env.NODE_ENV === 'development') {
      console.log(`📱 Nouveau code envoyé à ${phoneProcessed}: ${code}`);
    }

    res.status(200).json({
      success: true,
      message: 'Un nouveau code a été envoyé sur WhatsApp',
      data: {
        telephone: utilisateur.telephone,
        expiration: utilisateur.codeVerificationWhatsAppExpire
      }
    });

  } catch (error) {
    logger.error('Erreur renvoi code WhatsApp:', error);
    return next(AppError.serverError('Erreur lors du renvoi du code', { 
      originalError: error.message 
    }));
  }
};

// ===================================
// CONTRÔLEURS D'INSCRIPTION
// ===================================

/**
 * Inscription avec vérification EMAIL (système actuel)
 */
const inscription = async (req, res, next) => {
  try {
    logger.info('Tentative d\'inscription', { email: req.body.email });

    const { 
      nom, 
      prenom, 
      email, 
      motDePasse, 
      telephone,
      dateNaissance,
      sexe,
      role = 'passager',
      adresse
    } = req.body;

    // Validation des champs requis
    if (!nom || !prenom || !email || !motDePasse || !telephone) {
      return res.status(400).json({
        success: false,
        message: 'Tous les champs obligatoires doivent être renseignés',
        champsRequis: ['nom', 'prenom', 'email', 'motDePasse', 'telephone']
      });
    }

    // 🔥 NORMALISER LE TÉLÉPHONE
    const phoneProcessed = normaliserTelephoneCI(telephone);
    
    if (!phoneProcessed) {
      return res.status(400).json({
        success: false,
        message: 'Le numéro de téléphone n\'est pas valide',
        errorType: 'INVALID_PHONE_FORMAT',
        field: 'telephone'
      });
    }

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({ 
      $or: [{ email }, { telephone: phoneProcessed }] 
    }).maxTimeMS(30000);
    
    if (existingUser) {
      logger.warn('Inscription échouée - Email ou téléphone déjà utilisé', { email, telephone: phoneProcessed });
      return res.status(409).json({
        success: false,
        message: 'Un compte avec cet email ou ce numéro existe déjà'
      });
    }

    // Générer un token de confirmation d'email
    const confirmationToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(confirmationToken).digest('hex');

    // Créer un nouvel utilisateur
    const userData = {
      nom,
      prenom,
      email,
      motDePasse, // Sera hashé par le middleware pre-save
      telephone: phoneProcessed,
      role: (role && ['conducteur', 'passager', 'les_deux'].includes(role)) ? role : 'passager',
      statutCompte: 'EN_ATTENTE_VERIFICATION',
      tentativesConnexionEchouees: 0,
      tokenConfirmationEmail: hashedToken,
      expirationTokenConfirmation: Date.now() + 24 * 60 * 60 * 1000, // 24 heures
      // Initialiser le compte covoiturage
      compteCovoiturage: {
        solde: 0,
        estRecharge: false,
        seuilMinimum: 0,
        historiqueRecharges: [],
        totalCommissionsPayees: 0,
        totalGagnes: 0,
        modeAutoRecharge: {
          active: false
        },
        historiqueCommissions: [],
        parametresRetrait: {},
        limites: {
          retraitJournalier: 1000000,
          retraitMensuel: 5000000,
          montantRetireAujourdhui: 0,
          montantRetireCeMois: 0
        }
      }
    };

    // Ajouter les champs optionnels s'ils sont fournis
    if (dateNaissance) userData.dateNaissance = dateNaissance;
    if (sexe) userData.sexe = sexe;
    if (adresse) userData.adresse = adresse;

    const newUser = new User(userData);
    await newUser.save({ maxTimeMS: 30000 });

    // Envoyer l'email de confirmation
    const confirmationUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/api/auth/confirm-email/${confirmationToken}`;
    
    try {
      const emailHtml = chargerTemplate('envoiEmail-template.html', {
        'newUser.prenom': newUser.prenom,
        'confirmationUrl': confirmationUrl
      });

      await sendEmail({
        to: newUser.email,
        subject: 'Confirmez votre adresse email - WAYZ-ECO',
        html: emailHtml
      });

      logger.info('Email de confirmation envoyé', { userId: newUser._id, email: newUser.email });
      
    } catch (emailError) {
      logger.error('Erreur envoi email confirmation:', emailError);
    }

    logger.info('Inscription réussie', { userId: newUser._id });
    res.status(201).json({
      success: true,
      message: 'Compte créé avec succès. Veuillez vérifier votre email pour confirmer votre compte.',
      user: {
        id: newUser._id,
        nom: newUser.nom,
        prenom: newUser.prenom,
        email: newUser.email,
        telephone: newUser.telephone,
        role: newUser.role,
        statutCompte: newUser.statutCompte,
        compteCovoiturage: {
          solde: newUser.compteCovoiturage.solde,
          estRecharge: newUser.compteCovoiturage.estRecharge
        }
      }
    });

  } catch (error) {
    logger.error('Erreur inscription:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation',
        details: messages
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Un compte avec cet email ou ce numéro existe déjà'
      });
    }

    return next(AppError.serverError('Erreur serveur lors de l\'inscription', { 
      originalError: error.message
    }));
  }
};

/**
 * Inscription avec vérification SMS
 */
  const inscriptionSMS = async (req, res, next) => {
  let telephone, email;
  
  try {
    logger.info('Tentative d\'inscription SMS', { telephone: req.body.telephone });

    const { 
      nom, 
      prenom, 
      email: emailFromBody,
      motDePasse, 
      telephone: telephoneFromBody,
      dateNaissance,
      sexe,
      role = 'passager',
      adresse
    } = req.body;

    telephone = telephoneFromBody;
    email = emailFromBody;

    // 1. NORMALISATION DU SEXE au début
    let sexeNormalise = sexe;
    if (sexe) {
      if (sexe.toLowerCase() === 'masculin' || sexe.toLowerCase() === 'homme') {
        sexeNormalise = 'M';
      } else if (sexe.toLowerCase() === 'féminin' || sexe.toLowerCase() === 'femme') {
        sexeNormalise = 'F';
      }
    }

    // 2. VALIDATION EXPLICITE AVANT MONGOOSE
    const erreurs = {};
    
    // Champs obligatoires
    if (!nom || !prenom || !telephone || !motDePasse) {
      return res.status(400).json({
        success: false,
        message: 'Tous les champs obligatoires doivent être renseignés',
        champsRequis: ['nom', 'prenom', 'telephone', 'motDePasse']
      });
    }

    // 🔥 NORMALISER LE TÉLÉPHONE
    const phoneProcessed = normaliserTelephoneCI(telephone);
    
    if (!phoneProcessed) {
      return res.status(400).json({
        success: false,
        message: 'Le numéro de téléphone n\'est pas valide pour la Côte d\'Ivoire',
        errorType: 'INVALID_PHONE_FORMAT',
        field: 'telephone',
        value: telephone,
        suggestion: 'Formats acceptés: 0707070708 (10 chiffres), 07070708 (8 chiffres), +22507070708'
      });
    }

    // Mettre à jour avec le numéro validé
    telephone = phoneProcessed;

    // Validation du sexe si fourni
    if (sexeNormalise && !['M', 'F'].includes(sexeNormalise)) {
      erreurs.sexe = 'Le sexe doit être M (Masculin) ou F (Féminin)';
    }

    // Validation de l'adresse si fournie
    if (adresse && (!adresse.ville || adresse.ville.trim() === '')) {
      erreurs.ville = 'La ville est requise';
    }

    // Si des erreurs de validation, retourner maintenant
    if (Object.keys(erreurs).length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation des données',
        errors: erreurs
      });
    }

    // Vérifier si l'utilisateur existe déjà par téléphone
    const existingUserByPhone = await User.findOne({ telephone }).maxTimeMS(30000);
    if (existingUserByPhone) {
      logger.warn('Inscription SMS échouée - Téléphone déjà utilisé', { 
        telephone,
        userId: existingUserByPhone._id,
        statutCompte: existingUserByPhone.statutCompte 
      });
      
      return res.status(409).json({
        success: false,
        message: 'Un compte avec ce numéro de téléphone existe déjà',
        errorType: 'TELEPHONE_ALREADY_EXISTS',
        field: 'telephone',
        value: telephone,
        suggestion: existingUserByPhone.statutCompte === 'EN_ATTENTE_VERIFICATION' 
          ? 'Ce numéro a un compte en attente de vérification. Vérifiez vos SMS ou demandez un nouveau code.'
          : 'Essayez de vous connecter ou récupérez votre mot de passe.'
      });
    }

    // Vérifier l'email s'il est fourni
    if (email) {
      const existingUserByEmail = await User.findOne({ email }).maxTimeMS(30000);
      if (existingUserByEmail) {
        logger.warn('Inscription SMS échouée - Email déjà utilisé', { 
          email,
          userId: existingUserByEmail._id,
          statutCompte: existingUserByEmail.statutCompte 
        });
        
        return res.status(409).json({
          success: false,
          message: 'Un compte avec cet email existe déjà',
          errorType: 'EMAIL_ALREADY_EXISTS',
          field: 'email',
          value: email,
          suggestion: existingUserByEmail.statutCompte === 'EN_ATTENTE_VERIFICATION' 
            ? 'Cet email a un compte en attente de vérification. Vérifiez vos SMS ou demandez un nouveau code.'
            : 'Essayez de vous connecter avec cet email ou récupérez votre mot de passe.'
        });
      }
    }

    // Générer un code de vérification SMS (6 chiffres)
    const codeSMS = Math.floor(100000 + Math.random() * 900000).toString();
    const expirationCodeSMS = Date.now() + 10 * 60 * 1000; // 10 minutes

    // Créer un nouvel utilisateur avec les données NORMALISÉES
    const userData = {
      nom,
      prenom,
      telephone,
      motDePasse,
      role: (role && ['conducteur', 'passager', 'les_deux'].includes(role)) ? role : 'passager',
      statutCompte: 'EN_ATTENTE_VERIFICATION',
      tentativesConnexionEchouees: 0,
      codeSMS: codeSMS,
      expirationCodeSMS: expirationCodeSMS,
      compteCovoiturage: {
        solde: 0,
        estRecharge: false,
        seuilMinimum: 0,
        historiqueRecharges: [],
        totalCommissionsPayees: 0,
        totalGagnes: 0,
        modeAutoRecharge: {
          active: false
        },
        historiqueCommissions: [],
        parametresRetrait: {},
        limites: {
          retraitJournalier: 1000000,
          retraitMensuel: 5000000,
          montantRetireAujourdhui: 0,
          montantRetireCeMois: 0
        }
      }
    };

    // Ajouter les champs optionnels avec normalisation
    if (email) userData.email = email;
    if (dateNaissance) userData.dateNaissance = dateNaissance;
    if (sexeNormalise) userData.sexe = sexeNormalise;
    if (adresse) userData.adresse = adresse;

    const newUser = new User(userData);
    await newUser.save({ maxTimeMS: 30000 });

    // ✅ Envoyer le SMS de vérification via Twilio
    try {
      logger.info('Tentative envoi SMS via Twilio', {
        originalPhone: req.body.telephone,
        processedPhone: newUser.telephone,
        userId: newUser._id,
        phoneLength: newUser.telephone.length
      });

      const nomComplet = `${prenom} ${nom}`;
      const resultatEnvoi = await twilioService.envoyerCodeVerification(
        newUser.telephone,
        codeSMS,
        nomComplet
      );

      if (!resultatEnvoi.success) {
        // Supprimer l'utilisateur en cas d'échec
        await User.findByIdAndDelete(newUser._id);
        
        logger.error('Échec envoi SMS Twilio', {
          error: resultatEnvoi.error,
          originalPhone: req.body.telephone,
          processedPhone: newUser.telephone,
          userId: newUser._id,
          phoneLength: newUser.telephone.length
        });
        
        return res.status(500).json({
          success: false,
          message: 'Impossible d\'envoyer le SMS de vérification. Vérifiez votre numéro de téléphone.',
          errorType: 'SMS_SEND_FAILED',
          field: 'telephone',
          originalValue: req.body.telephone,
          processedValue: newUser.telephone,
          suggestion: 'Vérifiez que votre numéro est correct. Format: 0707070708 ou +22507070708',
          debug: process.env.NODE_ENV === 'development' ? {
            originalPhone: req.body.telephone,
            processedPhone: newUser.telephone,
            phoneLength: newUser.telephone.length,
            twilioError: resultatEnvoi.error,
            provider: resultatEnvoi.provider
          } : undefined
        });
      }

      logger.info('✅ SMS de vérification envoyé avec succès via Twilio', { 
        userId: newUser._id, 
        telephone: newUser.telephone,
        messageId: resultatEnvoi.messageId,
        provider: resultatEnvoi.provider
      });
      
    } catch (smsError) {
      logger.error('❌ Erreur lors de l\'envoi SMS Twilio', {
        error: smsError.message,
        originalPhone: req.body.telephone,
        processedPhone: newUser.telephone,
        userId: newUser._id,
        stackTrace: smsError.stack
      });
      
      // Supprimer l'utilisateur en cas d'échec
      await User.findByIdAndDelete(newUser._id);
      
      return res.status(500).json({
        success: false,
        message: 'Erreur technique lors de l\'envoi du SMS. Veuillez réessayer.',
        errorType: 'SMS_SEND_ERROR',
        field: 'telephone',
        originalValue: req.body.telephone,
        processedValue: newUser.telephone,
        debug: process.env.NODE_ENV === 'development' ? {
          error: smsError.message,
          stack: smsError.stack
        } : undefined
      });
    }

    logger.info('Inscription SMS réussie', { userId: newUser._id });
    res.status(201).json({
      success: true,
      message: 'Compte créé avec succès. Un code de vérification a été envoyé par SMS.',
      user: {
        id: newUser._id,
        nom: newUser.nom,
        prenom: newUser.prenom,
        telephone: newUser.telephone,
        email: newUser.email || null,
        role: newUser.role,
        statutCompte: newUser.statutCompte,
        compteCovoiturage: {
          solde: newUser.compteCovoiturage.solde,
          estRecharge: newUser.compteCovoiturage.estRecharge
        }
      },
      nextStep: {
        action: 'VERIFIER_SMS',
        message: 'Veuillez saisir le code reçu par SMS pour activer votre compte'
      }
    });

  } catch (error) {
    logger.error('Erreur inscription SMS:', error);
    
    // Erreurs de validation Mongoose
    if (error.name === 'ValidationError') {
      const validationErrors = {};
      Object.keys(error.errors).forEach(key => {
        validationErrors[key] = error.errors[key].message;
      });
      
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation des données',
        errorType: 'VALIDATION_ERROR',
        errors: validationErrors
      });
    }

    // Erreur de duplication MongoDB
    if (error.code === 11000) {
      let duplicatedField = 'unknown';
      let duplicatedValue = 'unknown';
      let message = 'Un compte avec ces informations existe déjà';
      let errorType = 'DUPLICATE_ERROR';

      if (error.message.includes('telephone')) {
        duplicatedField = 'telephone';
        duplicatedValue = telephone;
        message = 'Un compte avec ce numéro de téléphone existe déjà';
        errorType = 'TELEPHONE_ALREADY_EXISTS';
      } else if (error.message.includes('email')) {
        duplicatedField = 'email';
        duplicatedValue = email;
        message = 'Un compte avec cet email existe déjà';
        errorType = 'EMAIL_ALREADY_EXISTS';
      }

      logger.warn('Inscription SMS échouée - Duplication détectée', { 
        field: duplicatedField, 
        value: duplicatedValue,
        mongoError: error.message 
      });

      return res.status(409).json({
        success: false,
        message: message,
        errorType: errorType,
        field: duplicatedField,
        value: duplicatedValue
      });
    }

    return next(AppError.serverError('Erreur serveur lors de l\'inscription SMS', { 
      originalError: error.message
    }));
  }
};

// ===================================
// CONTRÔLEURS DE CONFIRMATION
// ===================================

/**
 * Confirmer l'email
 */
const confirmerEmail = async (req, res, next) => {
  try {
    let token;
    
    if (req.params.token) {
      token = req.params.token;
    } else if (req.query.token) {
      token = req.query.token;
    }
    
    if (!token) {
      logger.warn('Confirmation email - Token manquant');
      return res.status(400).json({
        success: false,
        message: 'Token de confirmation manquant'
      });
    }
    
    logger.info('Tentative de confirmation d\'email', { token: token.substring(0, 10) + '...' });
    
    // Hash le token pour comparer avec celui en base
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    const user = await User.findOne({
      tokenConfirmationEmail: hashedToken,
      expirationTokenConfirmation: { $gt: Date.now() }
    });

    if (!user) {
      logger.warn('Confirmation email - Token invalide ou expiré', { token: token.substring(0, 10) + '...' });
      return res.status(400).json({
        success: false,
        message: 'Lien de confirmation invalide ou expiré'
      });
    }

    if (user.statutCompte === 'ACTIF') {
      logger.info('Confirmation email - Compte déjà confirmé', { userId: user._id });
      return res.json({
        success: true,
        message: 'Votre compte est déjà confirmé'
      });
    }
    // 🔒 Bloquer les statuts incompatibles avec la confirmation email
    const statutsValides = ['EN_ATTENTE_VERIFICATION', 'EN_ATTENTE_CHOIX_CANAL'];
    if (!statutsValides.includes(user.statutCompte)) {
      logger.warn('Confirmation email - Statut incompatible', {
        userId: user._id,
        statutCompte: user.statutCompte
      });
      return res.status(400).json({
        success: false,
        message: 'Ce compte ne peut pas être confirmé par email dans son état actuel',
        statutActuel: user.statutCompte
      });
    }
    // Confirmer le compte
    user.statutCompte = 'ACTIF';
    user.tokenConfirmationEmail = undefined;
    user.expirationTokenConfirmation = undefined;
    user.emailConfirmeLe = new Date();
    user.estVerifie = true;
    
    await user.save();

    logger.info('Email confirmé avec succès', { userId: user._id });
    
    // Envoyer un email de bienvenue
    try {
      const welcomeHtml = chargerTemplate('welcome-template.html', {
        'user.prenom': user.prenom,
        'dashboardUrl': `${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard`
      });

      await sendEmail({
        to: user.email,
        subject: 'Bienvenue ! Votre compte WAYZ-ECO est activé',
        html: welcomeHtml
      });
    } catch (emailError) {
      logger.error('Erreur envoi email bienvenue:', emailError);
    }

    // Charger et afficher le template de validation
    try {
      const validationHtml = chargerTemplate('validation-template.html', {
        'user.prenom': user.prenom,
        'user.email': user.email
      });
      
      res.setHeader('Content-Type', 'text/html');
      res.send(validationHtml);
    } catch (templateError) {
      logger.error('Erreur chargement template validation:', templateError);
      res.setHeader('Content-Type', 'text/html');
      res.send(`
        <html>
          <head><title>Email confirmé - WAYZ-ECO</title></head>
          <body style="font-family: Arial, sans-serif; text-align: center; padding: 50px;">
            <h1 style="color: #28a745;">Email confirmé avec succès !</h1>
            <p>Bonjour ${user.prenom}, votre compte WAYZ-ECO est maintenant actif.</p>
            <p>Vous pouvez fermer cette fenêtre et vous connecter à l'application.</p>
          </body>
        </html>
      `);
    }
    
  } catch (error) {
    logger.error('Erreur confirmation email:', error);
    return next(AppError.serverError('Erreur serveur lors de la confirmation de l\'email', { 
      originalError: error.message 
    }));
  }
};

/**
 * Vérifier le code SMS
 */
const verifierCodeSMS = async (req, res, next) => {
  try {
    const { telephone, codeSMS } = req.body;

    if (!telephone || !codeSMS) {
      return res.status(400).json({
        success: false,
        message: 'Le téléphone et le code SMS sont requis'
      });
    }

    if (!/^[0-9]{6}$/.test(codeSMS)) {
      return res.status(400).json({
        success: false,
        message: 'Le code SMS doit contenir exactement 6 chiffres'
      });
    }

    // 🔥 NORMALISER LE TÉLÉPHONE
    const phoneProcessed = normaliserTelephoneCI(telephone);
    
    if (!phoneProcessed) {
      return res.status(400).json({
        success: false,
        message: 'Le numéro de téléphone n\'est pas valide',
        errorType: 'INVALID_PHONE_FORMAT'
      });
    }

    const user = await User.findOne({ telephone: phoneProcessed })
      .select('+codeSMS +expirationCodeSMS +refreshTokens')
      .maxTimeMS(30000);

    if (!user) {
      logger.warn('Vérification SMS échouée - Utilisateur non trouvé', { telephone: phoneProcessed });
      return res.status(404).json({
        success: false,
        message: 'Aucun utilisateur trouvé avec ce numéro de téléphone'
      });
    }

    if (user.statutCompte === 'ACTIF') {
      return res.status(400).json({
        success: false,
        message: 'Ce compte est déjà vérifié'
      });
    }

    // 🔥 LOGS DE DEBUG EN MODE DÉVELOPPEMENT
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 DEBUG - Vérification code SMS:', {
        userId: user._id,
        telephone: user.telephone,
        codeSMSExists: !!user.codeSMS,
        codeStocke: user.codeSMS,
        codeSaisi: codeSMS,
        codeStockeType: typeof user.codeSMS,
        codeSaisiType: typeof codeSMS,
        expiration: user.expirationCodeSMS,
        expirationDate: user.expirationCodeSMS ? new Date(user.expirationCodeSMS) : null,
        maintenant: Date.now(),
        maintenantDate: new Date(),
        estExpire: user.expirationCodeSMS ? (user.expirationCodeSMS < Date.now()) : null
      });
    }

    // ✅ VÉRIFIER SI LE CODE SMS EXISTE
    if (!user.codeSMS) {
      logger.warn('Vérification SMS échouée - Aucun code SMS enregistré', { 
        userId: user._id, 
        telephone: phoneProcessed 
      });
      return res.status(400).json({
        success: false,
        message: 'Aucun code de vérification actif. Veuillez en demander un nouveau.',
        errorType: 'NO_CODE_FOUND',
        suggestion: 'Utilisez /api/auth/renvoyer-code-sms pour obtenir un nouveau code'
      });
    }

    // ✅ VÉRIFIER L'EXPIRATION AVANT LA COMPARAISON
    if (!user.expirationCodeSMS || user.expirationCodeSMS < Date.now()) {
      logger.warn('Vérification SMS échouée - Code expiré', { 
        userId: user._id, 
        telephone: phoneProcessed,
        expiration: user.expirationCodeSMS,
        maintenant: Date.now()
      });
      
      // Nettoyer le code expiré
      user.codeSMS = undefined;
      user.expirationCodeSMS = undefined;
      await user.save({ validateBeforeSave: false });
      
      return res.status(400).json({
        success: false,
        message: 'Code SMS expiré. Veuillez en demander un nouveau.',
        errorType: 'CODE_EXPIRED',
        suggestion: 'Utilisez /api/auth/renvoyer-code-sms pour obtenir un nouveau code'
      });
    }

    // ✅ COMPARAISON ROBUSTE DES CODES (conversion en String + trim)
    const codeStocke = String(user.codeSMS).trim();
    const codeSaisi = String(codeSMS).trim();

    if (codeStocke !== codeSaisi) {
      logger.warn('Vérification SMS échouée - Code incorrect', { 
        userId: user._id, 
        telephone: phoneProcessed,
        codeStocke: codeStocke,
        codeSaisi: codeSaisi,
        longueurStocke: codeStocke.length,
        longueurSaisi: codeSaisi.length
      });
      
      return res.status(400).json({
        success: false,
        message: 'Code SMS incorrect',
        errorType: 'INVALID_CODE',
        debug: process.env.NODE_ENV === 'development' ? {
          codeStocke: codeStocke,
          codeSaisi: codeSaisi,
          match: codeStocke === codeSaisi
        } : undefined
      });
    }

    // ✅ CODE VALIDE - ACTIVER LE COMPTE
    user.statutCompte = 'ACTIF';
    user.codeSMS = undefined;
    user.expirationCodeSMS = undefined;
    user.estVerifie = true;
    user.telephoneVerifie = true;
    
    await user.save({ validateBeforeSave: false });

    // ✨ Récupérer les informations de l'appareil
    const deviceInfo = {
      userAgent: req.headers['user-agent'] || 'Unknown',
      ip: req.ip || req.connection.remoteAddress,
      deviceType: detectDeviceType(req.headers['user-agent']),
      os: detectOS(req.headers['user-agent']),
      browser: detectBrowser(req.headers['user-agent'])
    };

    // Générer Access Token ET Refresh Token
    const accessToken = user.getSignedJwtToken();
    const refreshToken = await user.generateRefreshToken(deviceInfo);

    logger.info('✅ Vérification SMS réussie - Compte activé', { 
      userId: user._id, 
      telephone: phoneProcessed 
    });

    res.status(200).json({
      success: true,
      message: '✅ Téléphone vérifié avec succès. Votre compte est maintenant actif !',
      data: {
        accessToken,
        refreshToken,
        expiresIn: process.env.JWT_EXPIRE || '15m',
        refreshTokenExpiresIn: `${process.env.REFRESH_TOKEN_DAYS || 30} jours`,
        tokenType: 'Bearer'
      },
      user: {
        id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        telephone: user.telephone,
        email: user.email || null,
        role: user.role,
        statutCompte: user.statutCompte,
        telephoneVerifie: user.telephoneVerifie,
        compteCovoiturage: {
          solde: user.compteCovoiturage.solde,
          estRecharge: user.compteCovoiturage.estRecharge,
          peutAccepterCourses: user.peutAccepterCourses
        }
      }
    });

  } catch (error) {
    logger.error('❌ Erreur vérification SMS:', error);
    return next(AppError.serverError('Erreur serveur lors de la vérification SMS', { 
      originalError: error.message
    }));
  }
};

/**
 * Renvoyer l'email de confirmation
 */
const renvoyerConfirmationEmail = async (req, res, next) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email requis'
      });
    }
    
    const user = await User.findOne({ email });
    
    if (!user) {
      return res.json({
        success: true,
        message: 'Si un compte existe avec cet email, un nouveau lien de confirmation a été envoyé'
      });
    }
    
    if (user.statutCompte === 'ACTIF') {
      return res.json({
        success: true,
        message: 'Votre compte est déjà confirmé'
      });
    }
    const statutsValides = ['EN_ATTENTE_VERIFICATION', 'EN_ATTENTE_CHOIX_CANAL'];
    if (!statutsValides.includes(user.statutCompte)) {
      return res.status(400).json({
        success: false,
        message: 'Ce compte n\'est pas en attente de confirmation par email.',
        statutActuel: user.statutCompte
      });
    }
    if (user.email.includes('@temp.covoiturage.ci')) {
      return res.status(400).json({
        success: false,
        message: 'Aucun email réel associé à ce compte. Utilisez la vérification par téléphone.',
        errorType: 'NO_REAL_EMAIL'
      });
    }
    if (user.expirationTokenConfirmation) {
      const tempsDepuisDernierEnvoi = (24 * 60 * 60 * 1000) - (user.expirationTokenConfirmation - Date.now());
      if (tempsDepuisDernierEnvoi < 2 * 60 * 1000) {
        const secondesRestantes = Math.ceil((2 * 60 * 1000 - tempsDepuisDernierEnvoi) / 1000);
        return res.status(429).json({
          success: false,
          message: `Veuillez attendre ${secondesRestantes} secondes avant de renvoyer un email.`,
          secondesRestantes
        });
      }
    }
    // Générer un nouveau token
    const confirmationToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(confirmationToken).digest('hex');
    
    user.tokenConfirmationEmail = hashedToken;
    user.expirationTokenConfirmation = Date.now() + 24 * 60 * 60 * 1000;
    
    await user.save();
    
    const confirmationUrl = `${process.env.BASE_URL || 'http://localhost:3000'}/api/auth/confirm-email/${confirmationToken}`;
    
    try {
      const emailHtml = chargerTemplate('envoiEmail-template.html', {
        'newUser.prenom': user.prenom,
        'confirmationUrl': confirmationUrl
      });

      await sendEmail({
        to: user.email,
        subject: 'Confirmez votre adresse email - WAYZ-ECO',
        html: emailHtml
      });
    } catch (emailError) {
      logger.error('Erreur renvoi email confirmation:', emailError);
      return res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'envoi de l\'email'
      });
    }
    
    logger.info('Email de confirmation renvoyé', { userId: user._id });
    
    res.json({
      success: true,
      message: 'Un nouveau lien de confirmation a été envoyé'
    });
    
  } catch (error) {
    logger.error('Erreur renvoi confirmation email:', error);
    return next(AppError.serverError('Erreur serveur lors du renvoi de l\'email', { 
      originalError: error.message 
    }));
  }
};

/**
 * Renvoyer un code SMS
 */
/**
 * Renvoyer un code SMS
 */
const renvoyerCodeSMS = async (req, res, next) => {
  try {
    const { telephone } = req.body;

    if (!telephone) {
      return res.status(400).json({
        success: false,
        message: 'Le numéro de téléphone est requis'
      });
    }

    // 🔥 NORMALISER LE TÉLÉPHONE
    const phoneProcessed = normaliserTelephoneCI(telephone);
    
    if (!phoneProcessed) {
      return res.status(400).json({
        success: false,
        message: 'Le numéro de téléphone n\'est pas valide',
        errorType: 'INVALID_PHONE_FORMAT'
      });
    }

    const user = await User.findOne({ telephone: phoneProcessed })
      .select('+codeSMS +expirationCodeSMS')
      .maxTimeMS(30000);

    if (!user) {
      logger.warn('Renvoi SMS échoué - Utilisateur non trouvé', { telephone: phoneProcessed });
      return res.status(404).json({
        success: false,
        message: 'Aucun utilisateur trouvé avec ce numéro de téléphone'
      });
    }

    if (user.statutCompte === 'ACTIF') {
      return res.status(400).json({
        success: false,
        message: 'Ce compte est déjà vérifié'
      });
    }

    // Limiter les renvois (2 minutes)
    const maintenant = new Date();
    const tempsEcoule = user.expirationCodeSMS ? 
      maintenant - (user.expirationCodeSMS - 10 * 60 * 1000) : 
      Infinity;
    
    if (tempsEcoule < 2 * 60 * 1000) {
      const tempsRestant = Math.ceil((2 * 60 * 1000 - tempsEcoule) / 1000);
      return res.status(429).json({
        success: false,
        message: `Veuillez attendre ${tempsRestant} secondes avant de demander un nouveau code`
      });
    }

    // Générer un nouveau code
    const nouveauCode = Math.floor(100000 + Math.random() * 900000).toString();
    user.codeSMS = nouveauCode;
    user.expirationCodeSMS = Date.now() + 10 * 60 * 1000;
    await user.save({ validateBeforeSave: false });

    // ✅ Envoyer le SMS via Twilio
    try {
      logger.info('Tentative renvoi SMS via Twilio', {
        telephone: phoneProcessed,
        userId: user._id
      });

      const nomComplet = `${user.prenom} ${user.nom}`;
      const resultatEnvoi = await twilioService.envoyerCodeVerification(
        phoneProcessed,
        nouveauCode,
        nomComplet
      );

      if (!resultatEnvoi.success) {
        logger.error('Échec renvoi SMS Twilio', {
          error: resultatEnvoi.error,
          telephone: phoneProcessed,
          userId: user._id
        });
        
        return res.status(500).json({
          success: false,
          message: 'Impossible de renvoyer le SMS. Veuillez réessayer plus tard.',
          errorType: 'SMS_SEND_FAILED',
          debug: process.env.NODE_ENV === 'development' ? {
            twilioError: resultatEnvoi.error,
            provider: resultatEnvoi.provider
          } : undefined
        });
      }

      logger.info('✅ Nouveau SMS envoyé via Twilio', { 
        userId: user._id, 
        telephone: phoneProcessed,
        messageId: resultatEnvoi.messageId,
        provider: resultatEnvoi.provider
      });
      
      res.status(200).json({
        success: true,
        message: 'Un nouveau code de vérification a été envoyé par SMS',
        data: {
          telephone: user.telephone,
          expiration: user.expirationCodeSMS
        }
      });

    } catch (smsError) {
      logger.error('❌ Erreur renvoi SMS Twilio:', {
        error: smsError.message,
        telephone: phoneProcessed,
        userId: user._id,
        stack: smsError.stack
      });
      
      return res.status(500).json({
        success: false,
        message: 'Erreur technique lors de l\'envoi du SMS. Veuillez réessayer.',
        errorType: 'SMS_SEND_ERROR',
        debug: process.env.NODE_ENV === 'development' ? {
          error: smsError.message,
          stack: smsError.stack
        } : undefined
      });
    }

  } catch (error) {
    logger.error('Erreur renvoi SMS:', error);
    return next(AppError.serverError('Erreur serveur lors du renvoi SMS', { 
      originalError: error.message
    }));
  }
};

// ===================================
// CONTRÔLEURS DE CONNEXION
// ===================================

/**
 * Connexion utilisateur
 */
const connexion = async (req, res, next) => {
  try {
    const { email, telephone, motDePasse } = req.body;
    
    // Accepter soit email soit telephone comme identifiant
    const identifiant = email || telephone;

    logger.info('Tentative de connexion', { 
      identifiant,
      type: email ? 'email' : 'telephone' 
    });

    if (!identifiant || !motDePasse) {
      return res.status(400).json({
        success: false,
        message: 'Email/Téléphone et mot de passe sont requis',
        codeErreur: 'MISSING_FIELDS'
      });
    }

    // Déterminer si c'est un email ou un téléphone
    const isEmail = identifiant.includes('@');
    let champRecherche = isEmail ? 'email' : 'telephone';
    let valeurRecherche = identifiant;

    // 🔥 Si c'est un téléphone, le normaliser
    if (!isEmail) {
      const phoneProcessed = normaliserTelephoneCI(identifiant);
      
      if (!phoneProcessed) {
        return res.status(400).json({
          success: false,
          message: 'Le numéro de téléphone n\'est pas valide',
          errorType: 'INVALID_PHONE_FORMAT',
          champ: 'telephone'
        });
      }
      
      valeurRecherche = phoneProcessed;
    }

    console.log('email : ', email , 'champ recheche : ', champRecherche, 'val : ', valeurRecherche)

    // Rechercher l'utilisateur
    const user = await User.findOne({ [champRecherche]: valeurRecherche })
      .select('+motDePasse +refreshTokens');
    
    if (!user) {
      logger.warn('Connexion échouée - Identifiant incorrect', { 
        identifiant: valeurRecherche,
        champRecherche 
      });
      
      return res.status(401).json({
        success: false,
        message: isEmail 
          ? 'Adresse email incorrecte' 
          : 'Numéro de téléphone incorrect',
        codeErreur: isEmail ? 'INVALID_EMAIL' : 'INVALID_PHONE',
        champ: champRecherche
      });
    }
    
    // Vérifier le statut du compte
    const statutAutorise = user.peutSeConnecter();
    if (!statutAutorise.autorise) {
      logger.warn('Connexion échouée - Compte non autorisé', { 
        userId: user._id, 
        statut: user.statutCompte,
        raison: statutAutorise.raison 
      });
      
      let messageStatut = '';
      let codeErreurStatut = '';

      switch (user.statutCompte) {
        case 'EN_ATTENTE_VERIFICATION':
          messageStatut = 'Votre compte n\'est pas encore vérifié. Vérifiez votre email.';
          codeErreurStatut = 'ACCOUNT_NOT_VERIFIED';
          break;
        case 'BLOQUE':
          messageStatut = 'Votre compte a été bloqué définitivement.';
          codeErreurStatut = 'ACCOUNT_BLOCKED';
          break;
        case 'SUSPENDU':
          messageStatut = 'Votre compte est temporairement suspendu.';
          codeErreurStatut = 'ACCOUNT_SUSPENDED';
          break;
        default:
          if (statutAutorise.raison === 'Compte temporairement bloqué') {
            messageStatut = 'Votre compte est temporairement bloqué suite à plusieurs tentatives de connexion échouées.';
            codeErreurStatut = 'ACCOUNT_TEMP_BLOCKED';
          } else {
            messageStatut = 'Votre compte est désactivé.';
            codeErreurStatut = 'ACCOUNT_DISABLED';
          }
      }

      return res.status(403).json({
        success: false,
        message: messageStatut,
        codeErreur: codeErreurStatut,
        champ: 'statutCompte'
      });
    }

    // Vérifier le mot de passe
    let isMatch = false;
    
    try {
      if (!user.motDePasse.startsWith('$2')) {
        logger.warn('Hash corrompu détecté', { userId: user._id });
        return res.status(500).json({
          success: false,
          message: 'Erreur de sécurité du compte. Veuillez réinitialiser votre mot de passe.',
          codeErreur: 'CORRUPTED_HASH',
          champ: 'motDePasse'
        });
      }
      
      isMatch = await user.verifierMotDePasse(motDePasse.trim());
      
    } catch (bcryptError) {
      logger.error('Erreur vérification mot de passe', { 
        error: bcryptError.message, 
        userId: user._id 
      });
      return res.status(500).json({
        success: false,
        message: 'Erreur de vérification du mot de passe',
        codeErreur: 'PASSWORD_VERIFICATION_ERROR',
        champ: 'motDePasse'
      });
    }

    if (!isMatch) {
      // Incrémenter les tentatives échouées
      user.tentativesConnexionEchouees += 1;
      user.derniereTentativeConnexion = new Date();
      
      if (user.tentativesConnexionEchouees >= 5) {
        user.compteBloqueLe = new Date();
      }
      
      await user.save();
      
      const tentativesRestantes = Math.max(0, 5 - user.tentativesConnexionEchouees);
      
      logger.warn('Connexion échouée - Mot de passe incorrect', { 
        identifiant: valeurRecherche, 
        tentativesEchouees: user.tentativesConnexionEchouees,
        tentativesRestantes
      });
      
      return res.status(401).json({
        success: false,
        message: 'Mot de passe incorrect',
        codeErreur: 'INVALID_PASSWORD',
        champ: 'motDePasse',
        tentativesRestantes,
        avertissement: tentativesRestantes <= 2 ? 
          `Attention : il vous reste ${tentativesRestantes} tentative(s) avant blocage temporaire` : 
          null
      });
    }

    // CONNEXION RÉUSSIE
    // Réinitialiser les tentatives échouées
    if (user.tentativesConnexionEchouees > 0) {
      user.tentativesConnexionEchouees = 0;
      user.derniereTentativeConnexion = null;
      user.compteBloqueLe = null;
    }

    // Mettre à jour la dernière connexion
    user.derniereConnexion = new Date();
    await user.save();

    // Générer le token JWT
    const accessToken = user.getSignedJwtToken();

    //  Récupérer les informations de l'appareil
    const deviceInfo = {
      userAgent: req.headers['user-agent'] || 'Unknown',
      ip: req.ip || req.connection?.remoteAddress || 'Unknown',
      deviceType: detectDeviceType(req.headers['user-agent']),
      os: detectOS(req.headers['user-agent']),
      browser: detectBrowser(req.headers['user-agent'])
    };

    // Générer le refresh token
    const refreshToken = await user.generateRefreshToken(deviceInfo);

    logger.info('Connexion réussie', { 
      userId: user._id,
      deviceType: deviceInfo.deviceType
    });
    
    res.json({
      success: true,
      message: 'Connexion réussie',
      data: {
        accessToken: accessToken,      
        refreshToken: refreshToken,   
        expiresIn: process.env.JWT_EXPIRE || '15m',
        tokenType: 'Bearer'
      },
      user: {
        id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        telephone: user.telephone,
        role: user.role,
        photoProfil: user.photoProfil,
        statutCompte: user.statutCompte,
        dateInscription: user.dateInscription,
        scoreConfiance: user.scoreConfiance,
        noteGenerale: user.noteGenerale,
        badges: user.badges,
        estVerifie: user.estVerifie,
        compteCovoiturage: {
          solde: user.compteCovoiturage.solde,
          estRecharge: user.compteCovoiturage.estRecharge,
          totalGagnes: user.compteCovoiturage.totalGagnes,
          peutAccepterCourses: user.peutAccepterCourses,
          compteRechargeActif: user.compteRechargeActif
        }
      }
    });
    
  } catch (error) {
    logger.error('Erreur connexion:', error);
    return next(AppError.serverError('Erreur serveur lors de la connexion', { originalError: error.message }));
  }
};

/**
 * Connexion administrateur
 */
const connexionAdmin = async (req, res, next) => {
  try {
    logger.info('Tentative de connexion admin', { email: req.body.email });
    
    const { email, motDePasse } = req.body;

    if (!email || !motDePasse) {
      return res.status(400).json({
        success: false,
        message: 'Email et mot de passe sont requis',
        codeErreur: 'MISSING_FIELDS'
      });
    }

    const user = await User.findOne({ email, role: 'admin' }).select('+motDePasse');
    
    if (!user) {
      const userExists = await User.findOne({ email });
      
      if (userExists) {
        return res.status(403).json({
          success: false,
          message: 'Accès administrateur refusé pour ce compte',
          codeErreur: 'NOT_ADMIN',
          champ: 'role'
        });
      } else {
        return res.status(401).json({
          success: false,
          message: 'Adresse email administrateur incorrecte',
          codeErreur: 'INVALID_ADMIN_EMAIL',
          champ: 'email'
        });
      }
    }

    const isMatch = await user.verifierMotDePasse(motDePasse.trim());
    if (!isMatch) {
      user.tentativesConnexionEchouees += 1;
      user.derniereTentativeConnexion = new Date();
      
      if (user.tentativesConnexionEchouees >= 5) {
        user.compteBloqueLe = new Date();
      }
      
      await user.save();
      
      const tentativesRestantes = Math.max(0, 5 - user.tentativesConnexionEchouees);
      
      return res.status(401).json({
        success: false,
        message: 'Mot de passe administrateur incorrect',
        codeErreur: 'INVALID_ADMIN_PASSWORD',
        champ: 'motDePasse',
        tentativesRestantes
      });
    }

    const token = user.getSignedJwtToken();

    logger.info('Connexion admin réussie', { userId: user._id });
    
    res.json({
      success: true,
      message: 'Connexion administrateur réussie',
      token,
      user: {
        id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        role: user.role
      }
    });
    
  } catch (error) {
    logger.error('Erreur connexion admin:', error);
    return next(AppError.serverError('Erreur serveur lors de la connexion admin', { originalError: error.message }));
  }
};

// ===================================
// CONTRÔLEURS DE SESSION
// ===================================

/**
 * Déconnexion utilisateur
 */
const deconnexion = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    logger.info('Déconnexion utilisateur', { userId });
    
    res.json({
      success: true,
      message: 'Déconnexion réussie'
    });
    
  } catch (error) {
    logger.error('Erreur déconnexion:', error);
    return next(AppError.serverError('Erreur serveur lors de la déconnexion', { originalError: error.message }));
  }
};

/**
 * Vérification de token
 */
const verifierToken = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('-motDePasse -tokenResetMotDePasse -expirationTokenReset -tokenConfirmationEmail -expirationTokenConfirmation -codeSMS -expirationCodeSMS');
    
    if (!user) {
      logger.warn('Vérification token - Utilisateur non trouvé', { userId: req.user.userId });
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    res.json({
      success: true,
      message: 'Token valide',
      user: {
        id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        telephone: user.telephone,
        role: user.role,
        photoProfil: user.photoProfil,
        statutCompte: user.statutCompte,
        compteCovoiturage: {
          solde: user.compteCovoiturage.solde,
          estRecharge: user.compteCovoiturage.estRecharge,
          totalGagnes: user.compteCovoiturage.totalGagnes,
          peutAccepterCourses: user.peutAccepterCourses,
          compteRechargeActif: user.compteRechargeActif
        }
      }
    });
    
  } catch (error) {
    logger.error('Erreur vérification token:', error);
    return next(AppError.serverError('Erreur serveur lors de la vérification du token', { originalError: error.message }));
  }
};

/**
 * Obtenir utilisateur connecté
 */
const obtenirUtilisateurConnecte = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('-motDePasse -tokenResetMotDePasse -expirationTokenReset -tokenConfirmationEmail -expirationTokenConfirmation -codeSMS -expirationCodeSMS');
    
    if (!user) {
      logger.warn('Profil utilisateur non trouvé', { userId: req.user.userId });
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Récupérer tous les véhicules de l'utilisateur (exclure ceux hors service)
    const vehicules = await Vehicule.find({ 
      proprietaireId: req.user.userId,
      statut: { $ne: 'HORS_SERVICE' }
    })
    .select('-audit -signalements -notesInternes')
    .sort({ estPrincipal: -1, createdAt: -1 }); // Véhicule principal en premier

    // Enrichir les données avec les informations virtuelles
    const userData = {
      id: user._id,
      nom: user.nom,
      prenom: user.prenom,
      nomComplet: user.nomComplet,
      email: user.email,
      telephone: user.telephone,
      dateNaissance: user.dateNaissance,
      age: user.age,
      sexe: user.sexe,
      photoProfil: user.photoProfil,
      role: user.role,
      adresse: user.adresse,
      preferences: user.preferences,
      contactsUrgence: user.contactsUrgence,
      scoreConfiance: user.scoreConfiance,
      nombreTrajetsEffectues: user.nombreTrajetsEffectues,
      nombreTrajetsAnnules: user.nombreTrajetsAnnules,
      tauxAnnulation: user.tauxAnnulation,
      noteGenerale: user.noteGenerale,
      badges: user.badges,
      statutCompte: user.statutCompte,
      dateInscription: user.dateInscription,
      derniereConnexion: user.derniereConnexion,
      estVerifie: user.estVerifie,
      estDocumentVerifie: user.estDocumentVerifie,
      vehicule: user.vehicule, // Ancien champ (legacy)
      
      // Liste complète des véhicules avec informations enrichies
      vehicules: vehicules.map(v => ({
        id: v._id,
        marque: v.marque,
        modele: v.modele,
        annee: v.annee,
        age: v.age, // Virtual
        couleur: v.couleur,
        immatriculation: v.immatriculation,
        nombrePlaces: v.nombrePlaces,
        placesDisponibles: v.placesDisponibles,
        carburant: v.carburant,
        typeCarrosserie: v.typeCarrosserie,
        transmission: v.transmission,
        kilometrage: v.kilometrage,
        
        // Photos
        photos: v.photos,
        
        // Documents légaux
        carteGrise: {
          numero: v.carteGrise?.numero,
          dateExpiration: v.carteGrise?.dateExpiration,
          numeroChassis: v.carteGrise?.numeroChassis
        },
        assurance: {
          numeroPolice: v.assurance?.numeroPolice,
          compagnie: v.assurance?.compagnie,
          type: v.assurance?.type,
          dateExpiration: v.assurance?.dateExpiration
        },
        visiteTechnique: {
          dateExpiration: v.visiteTechnique?.dateExpiration,
          resultat: v.visiteTechnique?.resultat,
          numeroAttestation: v.visiteTechnique?.numeroAttestation
        },
        vignette: {
          annee: v.vignette?.annee,
          numero: v.vignette?.numero,
          dateExpiration: v.vignette?.dateExpiration
        },
        carteTransport: {
          numero: v.carteTransport?.numero,
          dateExpiration: v.carteTransport?.dateExpiration,
          categorieAutorisee: v.carteTransport?.categorieAutorisee,
          typeVehicule: v.carteTransport?.typeVehicule
        },
        
        // Équipements et commodités
        equipements: v.equipements,
        commodites: v.commodites,
        preferences: v.preferences,
        
        // Statut et validation
        statut: v.statut,
        estPrincipal: v.estPrincipal,
        disponibilitePourCourse: v.disponibilitePourCourse,
        documentsComplets: v.documentsComplets,
        raisonRejet: v.raisonRejet,
        
        validation: {
          statutValidation: v.validation?.statutValidation,
          dateValidation: v.validation?.dateValidation,
          dateExpirationValidation: v.validation?.dateExpirationValidation,
          commentairesAdmin: v.validation?.commentairesAdmin
        },
        
        // Statistiques
        statistiques: {
          nombreTrajets: v.statistiques?.nombreTrajets || 0,
          nombrePassagers: v.statistiques?.nombrePassagers || 0,
          kilometresParcourus: v.statistiques?.kilometresParcourus || 0,
          noteMoyenne: v.statistiques?.noteMoyenne || 0,
          nombreAvis: v.statistiques?.nombreAvis || 0,
          tauxAnnulation: v.statistiques?.tauxAnnulation || 0,
          dernierTrajet: v.statistiques?.dernierTrajet
        },
        
        // Scores virtuels
        scoreSecurity: v.scoreSecurity,
        scoreConfort: v.scoreConfort,
        tauxFiabilite: v.tauxFiabilite,
        
        // Validation des documents
        documentsValides: v.documentsValides(),
        alertes: v.genererAlertes(),
        
        // Maintenance
        maintenance: {
          prochainEntretien: v.maintenance?.prochainEntretien,
          prochainEntretienKm: v.maintenance?.prochainEntretienKm,
          dernierEntretien: v.maintenance?.dernierEntretien
        },
        
        // Position
        dernierePosition: v.dernierePosition,
        
        // Dates
        createdAt: v.createdAt,
        updatedAt: v.updatedAt
      })),
      
      documentIdentite: user.documentIdentite ? {
        type: user.documentIdentite.type,
        statutVerification: user.documentIdentite.statutVerification,
        dateVerification: user.documentIdentite.dateVerification
      } : null,
      
      compteCovoiturage: {
        ...user.obtenirResumeCompte()
      }
    };

    logger.info('✅ Profil utilisateur récupéré avec succès', { 
      userId: req.user.userId,
      nombreVehicules: vehicules.length,
      vehiculePrincipal: vehicules.find(v => v.estPrincipal)?._id || null
    });

    res.json({
      success: true,
      user: userData
    });
    
  } catch (error) {
    logger.error('❌ Erreur obtention profil:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération du profil', { originalError: error.message }));
  }
};

// ============================================================
// RÉINITIALISATION MOT DE PASSE VIA WHATSAPP
// ============================================================

const forgotPassword = async (req, res, next) => {
  try {
    const { telephone } = req.body;

    if (!telephone) {
      return res.status(400).json({
        success: false,
        message: 'Numéro de téléphone requis',
        errorType: 'MISSING_PHONE'
      });
    }

    logger.info('Demande réinitialisation mot de passe WhatsApp', { telephone });

    // 🔥 NORMALISER LE TÉLÉPHONE
    const phoneProcessed = normaliserTelephoneCI(telephone);
    
    if (!phoneProcessed) {
      return res.status(400).json({
        success: false,
        message: 'Le numéro de téléphone n\'est pas valide',
        errorType: 'INVALID_PHONE_FORMAT'
      });
    }

    const utilisateur = await User.findOne({ telephone: phoneProcessed })
      .select('+codeResetWhatsApp');

    if (!utilisateur) {
      logger.info('Demande réinitialisation WhatsApp - Téléphone non trouvé (masqué)', { telephone: phoneProcessed });
      // Pour la sécurité, on renvoie le même message même si le compte n'existe pas
      return res.json({
        success: true,
        message: 'Si un compte existe avec ce numéro, un code de réinitialisation a été envoyé sur WhatsApp.',
        nextStep: {
          action: 'VERIFY_CODE',
          message: 'Veuillez saisir le code reçu sur WhatsApp'
        }
      });
    }

    // Vérifier si l'utilisateur peut recevoir un nouveau code
    const verification = utilisateur.peutRenvoyerCodeReset ? utilisateur.peutRenvoyerCodeReset() : { autorise: true };
    
    if (!verification.autorise) {
      return res.status(429).json({
        success: false,
        message: verification.message || 'Veuillez attendre avant de demander un nouveau code',
        raison: verification.raison,
        tempsRestant: verification.tempsRestant,
        errorType: 'TOO_MANY_REQUESTS'
      });
    }

    // Générer le code de vérification WhatsApp pour reset
    const codeReset = utilisateur.genererCodeResetWhatsApp ? 
      utilisateur.genererCodeResetWhatsApp() : 
      Math.floor(100000 + Math.random() * 900000).toString();

    // Si la méthode n'existe pas, on stocke manuellement
    if (!utilisateur.genererCodeResetWhatsApp) {
      utilisateur.codeResetWhatsApp = {
        code: codeReset,
        expiration: Date.now() + 10 * 60 * 1000, // 10 minutes
        tentativesRestantes: 5,
        dernierEnvoi: Date.now(),
        verifie: false
      };
    }

    await utilisateur.save({ validateBeforeSave: false });

    // Envoyer le code via WhatsApp
    const nomComplet = `${utilisateur.prenom} ${utilisateur.nom}`;
    const resultatEnvoi = await twilioService.envoyerCodeResetMotDePasse(
      phoneProcessed,
      codeReset,
      nomComplet
    );

    if (!resultatEnvoi.success) {
      logger.error('Échec envoi WhatsApp reset', { 
        telephone: phoneProcessed, 
        error: resultatEnvoi.error 
      });

      return res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'envoi du code de réinitialisation',
        details: 'Impossible d\'envoyer le message WhatsApp. Vérifiez votre numéro.',
        errorType: 'WHATSAPP_SEND_FAILED',
        erreurTechnique: resultatEnvoi.error
      });
    }

    logger.info('Code réinitialisation WhatsApp envoyé', { 
      userId: utilisateur._id, 
      telephone: phoneProcessed 
    });

    // En développement, afficher le code dans les logs
    if (process.env.NODE_ENV === 'development') {
      console.log(`🔐 Code réinitialisation envoyé à ${phoneProcessed}: ${codeReset}`);
    }

    res.status(200).json({
      success: true,
      message: 'Un code de réinitialisation a été envoyé sur WhatsApp',
      data: {
        telephone: utilisateur.telephone,
        expiration: utilisateur.codeResetWhatsApp?.expiration || Date.now() + 10 * 60 * 1000
      },
      nextStep: {
        action: 'VERIFY_CODE',
        message: 'Veuillez saisir le code reçu sur WhatsApp',
        route: '/api/auth/verify-reset-code'
      }
    });

  } catch (error) {
    logger.error('Erreur demande réinitialisation WhatsApp:', error);
    return next(AppError.serverError('Erreur serveur lors de la demande de réinitialisation', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc    Étape 2 - Vérifier le code de réinitialisation WhatsApp
 * @route   POST /api/auth/verify-reset-code
 * @access  Public
 */
const verifyResetCode = async (req, res, next) => {
  try {
    const { telephone, code } = req.body;

    if (!telephone || !code) {
      return res.status(400).json({
        success: false,
        message: 'Numéro de téléphone et code requis',
        errorType: 'MISSING_FIELDS'
      });
    }

    if (!/^[0-9]{6}$/.test(code)) {
      return res.status(400).json({
        success: false,
        message: 'Le code doit contenir exactement 6 chiffres',
        errorType: 'INVALID_CODE_FORMAT'
      });
    }

    logger.info('Vérification code réinitialisation WhatsApp', { telephone });

    // 🔥 NORMALISER LE TÉLÉPHONE
    const phoneProcessed = normaliserTelephoneCI(telephone);
    
    if (!phoneProcessed) {
      return res.status(400).json({
        success: false,
        message: 'Le numéro de téléphone n\'est pas valide',
        errorType: 'INVALID_PHONE_FORMAT'
      });
    }

    const utilisateur = await User.findOne({ telephone: phoneProcessed })
      .select('+codeResetWhatsApp');

    if (!utilisateur) {
      return res.status(404).json({
        success: false,
        message: 'Aucun compte trouvé avec ce numéro de téléphone',
        errorType: 'USER_NOT_FOUND'
      });
    }

    // Log de debug en développement
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Debug - Vérification code:', {
        userId: utilisateur._id,
        telephone: utilisateur.telephone,
        codeResetExists: !!utilisateur.codeResetWhatsApp,
        codeStocke: utilisateur.codeResetWhatsApp?.code,
        codeSaisi: code,
        expiration: utilisateur.codeResetWhatsApp?.expiration,
        expirationDate: utilisateur.codeResetWhatsApp?.expiration ? new Date(utilisateur.codeResetWhatsApp.expiration) : null,
        maintenant: Date.now(),
        maintenantDate: new Date(),
        estExpire: utilisateur.codeResetWhatsApp?.expiration ? (utilisateur.codeResetWhatsApp.expiration < Date.now()) : null,
        tentativesRestantes: utilisateur.codeResetWhatsApp?.tentativesRestantes
      });
    }

    // Vérifier si un code de reset existe
    if (!utilisateur.codeResetWhatsApp || !utilisateur.codeResetWhatsApp.code) {
      return res.status(400).json({
        success: false,
        message: 'Aucun code de réinitialisation actif. Veuillez en demander un nouveau.',
        errorType: 'NO_ACTIVE_CODE',
        nextStep: {
          action: 'REQUEST_NEW_CODE',
          route: '/api/auth/forgot-password-whatsapp'
        }
      });
    }

    // Vérifier l'expiration
    if (utilisateur.codeResetWhatsApp.expiration < Date.now()) {
      utilisateur.codeResetWhatsApp = undefined;
      await utilisateur.save({ validateBeforeSave: false });

      logger.warn('Code réinitialisation WhatsApp expiré', { userId: utilisateur._id });

      return res.status(410).json({
        success: false,
        message: 'Le code de réinitialisation a expiré',
        errorType: 'CODE_EXPIRED',
        nextStep: {
          action: 'REQUEST_NEW_CODE',
          message: 'Veuillez demander un nouveau code',
          route: '/api/auth/forgot-password-whatsapp'
        }
      });
    }

    // Comparer les codes
    const codeStocke = String(utilisateur.codeResetWhatsApp.code).trim();
    const codeSaisi = String(code).trim();

    if (codeStocke !== codeSaisi) {
      // Décrémenter les tentatives
      utilisateur.codeResetWhatsApp.tentativesRestantes = 
        (utilisateur.codeResetWhatsApp.tentativesRestantes || 5) - 1;

      if (utilisateur.codeResetWhatsApp.tentativesRestantes <= 0) {
        utilisateur.codeResetWhatsApp = undefined;
        await utilisateur.save({ validateBeforeSave: false });

        logger.warn('Code réinitialisation WhatsApp - Trop de tentatives', { userId: utilisateur._id });

        return res.status(429).json({
          success: false,
          message: 'Trop de tentatives incorrectes. Veuillez demander un nouveau code.',
          errorType: 'TOO_MANY_ATTEMPTS',
          nextStep: {
            action: 'REQUEST_NEW_CODE',
            route: '/api/auth/forgot-password-whatsapp'
          }
        });
      }

      await utilisateur.save({ validateBeforeSave: false });

      logger.warn('Code réinitialisation WhatsApp incorrect', { 
        userId: utilisateur._id,
        tentativesRestantes: utilisateur.codeResetWhatsApp.tentativesRestantes
      });

      return res.status(400).json({
        success: false,
        message: 'Code incorrect',
        errorType: 'INVALID_CODE',
        tentativesRestantes: utilisateur.codeResetWhatsApp.tentativesRestantes
      });
    }

    // ✅ Code valide - marquer comme vérifié
    utilisateur.codeResetWhatsApp.verifie = true;
    await utilisateur.save({ validateBeforeSave: false });

    logger.info('Code réinitialisation WhatsApp vérifié avec succès', { userId: utilisateur._id });

    res.status(200).json({
      success: true,
      message: '✅ Code vérifié avec succès',
      data: {
        telephone: utilisateur.telephone,
        codeVerifie: true
      },
      nextStep: {
        action: 'SET_NEW_PASSWORD',
        message: 'Vous pouvez maintenant définir un nouveau mot de passe',
        route: '/api/auth/reset-password-whatsapp'
      }
    });

  } catch (error) {
    logger.error('Erreur vérification code réinitialisation WhatsApp:', error);
    return next(AppError.serverError('Erreur lors de la vérification du code', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc    Étape 3 - Réinitialiser le mot de passe avec le code WhatsApp
 * @route   POST /api/auth/reset-password-whatsapp
 * @access  Public
 */
const resetPassword = async (req, res, next) => {
  try {
    const { telephone, code, new_password } = req.body;

    if (!telephone || !code || !new_password) {
      return res.status(400).json({
        success: false,
        message: 'Numéro de téléphone, code et nouveau mot de passe requis',
        errorType: 'MISSING_FIELDS',
        champsRequis: ['telephone', 'code', 'new_password']
      });
    }

    // Validation du nouveau mot de passe
    if (new_password.length < 4) {
      return res.status(400).json({
        success: false,
        message: 'Le mot de passe doit contenir au moins 4 caractères',
        errorType: 'WEAK_PASSWORD',
        field: 'new_password'
      });
    }

    logger.info('Réinitialisation mot de passe WhatsApp', { telephone });

    // 🔥 NORMALISER LE TÉLÉPHONE
    const phoneProcessed = normaliserTelephoneCI(telephone);
    
    if (!phoneProcessed) {
      return res.status(400).json({
        success: false,
        message: 'Le numéro de téléphone n\'est pas valide',
        errorType: 'INVALID_PHONE_FORMAT'
      });
    }

    const utilisateur = await User.findOne({ telephone: phoneProcessed })
      .select('+codeResetWhatsApp +motDePasse');

    if (!utilisateur) {
      return res.status(404).json({
        success: false,
        message: 'Aucun compte trouvé avec ce numéro de téléphone',
        errorType: 'USER_NOT_FOUND'
      });
    }

    // Log de debug en développement
    if (process.env.NODE_ENV === 'development') {
      console.log('🔍 Debug - Réinitialisation:', {
        userId: utilisateur._id,
        codeResetExists: !!utilisateur.codeResetWhatsApp,
        codeVerifie: utilisateur.codeResetWhatsApp?.verifie,
        codeStocke: utilisateur.codeResetWhatsApp?.code,
        codeSaisi: code
      });
    }

    // Vérifier si le code a été vérifié
    if (!utilisateur.codeResetWhatsApp || !utilisateur.codeResetWhatsApp.verifie) {
      return res.status(400).json({
        success: false,
        message: 'Veuillez d\'abord vérifier le code de réinitialisation',
        errorType: 'CODE_NOT_VERIFIED',
        nextStep: {
          action: 'VERIFY_CODE',
          route: '/api/auth/verify-reset-code'
        }
      });
    }

    // Vérifier que le code correspond toujours
    const codeStocke = String(utilisateur.codeResetWhatsApp.code).trim();
    const codeSaisi = String(code).trim();

    if (codeStocke !== codeSaisi) {
      return res.status(400).json({
        success: false,
        message: 'Code de réinitialisation invalide',
        errorType: 'INVALID_CODE'
      });
    }

    // Vérifier l'expiration
    if (utilisateur.codeResetWhatsApp.expiration < Date.now()) {
      utilisateur.codeResetWhatsApp = undefined;
      await utilisateur.save({ validateBeforeSave: false });

      return res.status(410).json({
        success: false,
        message: 'Le code de réinitialisation a expiré',
        errorType: 'CODE_EXPIRED',
        nextStep: {
          action: 'REQUEST_NEW_CODE',
          route: '/api/auth/forgot-password-whatsapp'
        }
      });
    }

    // Réinitialiser le mot de passe (sera hashé par le middleware pre-save)
    utilisateur.motDePasse = new_password;
    utilisateur.codeResetWhatsApp = undefined;
    
    // Réinitialiser les tentatives de connexion échouées
    utilisateur.tentativesConnexionEchouees = 0;
    utilisateur.derniereTentativeConnexion = null;
    utilisateur.compteBloqueLe = null;

    await utilisateur.save();

    logger.info('Mot de passe réinitialisé via WhatsApp avec succès', { userId: utilisateur._id });

    // Envoyer un message de confirmation WhatsApp
    try {
      await twilioService.envoyerConfirmationResetMotDePasse(
        phoneProcessed,
        utilisateur.prenom
      );
    } catch (whatsappError) {
      logger.error('Erreur envoi confirmation WhatsApp:', whatsappError);
      // Ne pas bloquer le processus si l'envoi échoue
    }

    res.status(200).json({
      success: true,
      message: '✅ Mot de passe réinitialisé avec succès !',
      data: {
        telephone: utilisateur.telephone,
        utilisateurId: utilisateur._id
      },
      nextStep: {
        action: 'LOGIN',
        message: 'Vous pouvez maintenant vous connecter avec votre nouveau mot de passe',
        route: '/api/auth/connexion'
      }
    });

  } catch (error) {
    logger.error('Erreur réinitialisation mot de passe WhatsApp:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation',
        errorType: 'VALIDATION_ERROR',
        erreurs: messages
      });
    }

    return next(AppError.serverError('Erreur lors de la réinitialisation du mot de passe', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc    Renvoyer le code de réinitialisation WhatsApp
 * @route   POST /api/auth/resend-reset-code-whatsapp
 * @access  Public
 */
const resendResetCode = async (req, res, next) => {
  try {
    const { telephone } = req.body;

    if (!telephone) {
      return res.status(400).json({
        success: false,
        message: 'Numéro de téléphone requis',
        errorType: 'MISSING_PHONE'
      });
    }

    logger.info('Renvoi code réinitialisation WhatsApp', { telephone });

    // 🔥 NORMALISER LE TÉLÉPHONE
    const phoneProcessed = normaliserTelephoneCI(telephone);
    
    if (!phoneProcessed) {
      return res.status(400).json({
        success: false,
        message: 'Le numéro de téléphone n\'est pas valide',
        errorType: 'INVALID_PHONE_FORMAT'
      });
    }

    const utilisateur = await User.findOne({ telephone: phoneProcessed })
      .select('+codeResetWhatsApp');

    if (!utilisateur) {
      logger.info('Renvoi code reset - Téléphone non trouvé (masqué)', { telephone: phoneProcessed });
      return res.json({
        success: true,
        message: 'Si un compte existe avec ce numéro, un nouveau code a été envoyé sur WhatsApp.'
      });
    }

    // Vérifier la limite de temps entre les renvois (2 minutes)
    const verification = utilisateur.peutRenvoyerCodeReset ? utilisateur.peutRenvoyerCodeReset() : { autorise: true };
    
    if (!verification.autorise) {
      return res.status(429).json({
        success: false,
        message: verification.message || 'Veuillez attendre avant de demander un nouveau code',
        raison: verification.raison,
        tempsRestant: verification.tempsRestant,
        errorType: 'TOO_MANY_REQUESTS'
      });
    }

    // Générer un nouveau code
    const nouveauCode = utilisateur.genererCodeResetWhatsApp ? 
      utilisateur.genererCodeResetWhatsApp() : 
      Math.floor(100000 + Math.random() * 900000).toString();

    // Si la méthode n'existe pas, on stocke manuellement
    if (!utilisateur.genererCodeResetWhatsApp) {
      utilisateur.codeResetWhatsApp = {
        code: nouveauCode,
        expiration: Date.now() + 10 * 60 * 1000, // 10 minutes
        tentativesRestantes: 5,
        dernierEnvoi: Date.now(),
        verifie: false
      };
    }

    await utilisateur.save({ validateBeforeSave: false });

    // Envoyer le nouveau code via WhatsApp
    const nomComplet = `${utilisateur.prenom} ${utilisateur.nom}`;
    const resultatEnvoi = await twilioService.envoyerCodeResetMotDePasse(
      phoneProcessed,
      nouveauCode,
      nomComplet
    );

    if (!resultatEnvoi.success) {
      return res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'envoi du nouveau code',
        details: 'Impossible d\'envoyer le message WhatsApp',
        errorType: 'WHATSAPP_SEND_FAILED'
      });
    }

    logger.info('Nouveau code réinitialisation WhatsApp envoyé', { userId: utilisateur._id });

    if (process.env.NODE_ENV === 'development') {
      console.log(`🔐 Nouveau code reset envoyé à ${phoneProcessed}: ${nouveauCode}`);
    }

    res.status(200).json({
      success: true,
      message: 'Un nouveau code de réinitialisation a été envoyé sur WhatsApp',
      data: {
        telephone: utilisateur.telephone,
        expiration: utilisateur.codeResetWhatsApp?.expiration || Date.now() + 10 * 60 * 1000
      }
    });

  } catch (error) {
    logger.error('Erreur renvoi code réinitialisation WhatsApp:', error);
    return next(AppError.serverError('Erreur lors du renvoi du code', { 
      originalError: error.message 
    }));
  }
};

// ===================================
// RÉINITIALISATION MOT DE PASSE
// ===================================

/**
 * Mot de passe oublié par EMAIL
 */
const motDePasseOublie = async (req, res, next) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email requis'
      });
    }

    logger.info('Demande mot de passe oublié', { email });

    const user = await User.findOne({ email });
    if (!user) {
      logger.info('Demande réinitialisation - Email non trouvé (masqué)', { email });
      return res.json({
        success: true,
        message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé'
      });
    }

    // Générer un token de réinitialisation
    const resetToken = crypto.randomBytes(32).toString('hex');
    const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');
    
    user.tokenResetMotDePasse = hashedToken;
    user.expirationTokenReset = Date.now() + 3600000; // 1 heure
    await user.save();

    // Envoyer l'email
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;

    try {
      const resetHtml = chargerTemplate('reset-password-template.html', {
        'user.prenom': user.prenom,
        'resetUrl': resetUrl
      });

      await sendEmail({
        to: user.email,
        subject: 'Réinitialisation de votre mot de passe - WAYZ-ECO',
        html: resetHtml
      });
      
      logger.info('Email réinitialisation envoyé', { userId: user._id });
    } catch (emailError) {
      logger.error('Erreur envoi email réinitialisation:', emailError);
      user.tokenResetMotDePasse = undefined;
      user.expirationTokenReset = undefined;
      await user.save();
      return res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'envoi de l\'email'
      });
    }

    res.json({
      success: true,
      message: 'Un lien de réinitialisation a été envoyé à votre email'
    });

  } catch (error) {
    logger.error('Erreur mot de passe oublié:', error);
    return next(AppError.serverError('Erreur serveur lors de la demande de réinitialisation', { originalError: error.message }));
  }
};

/**
 * Demande de réinitialisation par SMS
 */
const motDePasseOublieSMS = async (req, res, next) => {
  try {
    const { telephone } = req.body;

    if (!telephone) {
      return res.status(400).json({
        success: false,
        message: 'Numéro de téléphone requis'
      });
    }

    logger.info('Demande mot de passe oublié SMS', { telephone });

    // 🔥 NORMALISER LE TÉLÉPHONE
    const phoneProcessed = normaliserTelephoneCI(telephone);
    
    if (!phoneProcessed) {
      return res.status(400).json({
        success: false,
        message: 'Le numéro de téléphone n\'est pas valide',
        errorType: 'INVALID_PHONE_FORMAT'
      });
    }

    const user = await User.findOne({ telephone: phoneProcessed });
    if (!user) {
      logger.info('Demande réinitialisation SMS - Téléphone non trouvé (masqué)', { telephone: phoneProcessed });
      return res.json({
        success: true,
        message: 'Si un compte existe avec ce numéro, un code de réinitialisation a été envoyé'
      });
    }

    // Vérifier les tentatives récentes
    const maintenant = new Date();
    if (user.expirationTokenReset && user.expirationTokenReset > maintenant) {
      const tempsRestant = Math.ceil((user.expirationTokenReset - maintenant) / 60000);
      return res.status(429).json({
        success: false,
        message: `Un code a déjà été envoyé. Attendez ${tempsRestant} minutes avant d'en demander un nouveau.`
      });
    }

    // Générer un code OTP de réinitialisation
    const codeOTPReset = Math.floor(100000 + Math.random() * 900000).toString();
    const hashedCode = crypto.createHash('sha256').update(codeOTPReset).digest('hex');
    
    user.tokenResetMotDePasse = hashedCode;
    user.expirationTokenReset = Date.now() + 10 * 60 * 1000; // 10 minutes
    await user.save();

    try {
      await sendSMS({
        to: user.telephone,
        message: `Votre code de réinitialisation WAYZ-ECO est: ${codeOTPReset}. Ce code expire dans 10 minutes.`
      });

      logger.info('SMS réinitialisation envoyé', { userId: user._id, telephone: phoneProcessed });
      
      res.json({
        success: true,
        message: 'Un code de réinitialisation a été envoyé par SMS',
        nextStep: {
          action: 'SAISIR_CODE_OTP',
          message: 'Veuillez saisir le code reçu par SMS'
        }
      });
      
    } catch (smsError) {
      logger.error('Erreur envoi SMS réinitialisation:', smsError);
      user.tokenResetMotDePasse = undefined;
      user.expirationTokenReset = undefined;
      await user.save();
      return res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'envoi du SMS'
      });
    }

  } catch (error) {
    logger.error('Erreur mot de passe oublié SMS:', error);
    return next(AppError.serverError('Erreur serveur lors de la demande de réinitialisation SMS', { 
      originalError: error.message 
    }));
  }
};

/**
 * Vérifier le code OTP pour réinitialisation
 */
const verifierCodeOTPReset = async (req, res, next) => {
  try {
    const { telephone, codeOTP } = req.body;

    if (!telephone || !codeOTP) {
      return res.status(400).json({
        success: false,
        message: 'Numéro de téléphone et code OTP requis'
      });
    }

    if (!/^[0-9]{6}$/.test(codeOTP)) {
      return res.status(400).json({
        success: false,
        message: 'Le code OTP doit contenir exactement 6 chiffres'
      });
    }

    logger.info('Vérification code OTP reset', { telephone });

    // 🔥 NORMALISER LE TÉLÉPHONE
    const phoneProcessed = normaliserTelephoneCI(telephone);
    
    if (!phoneProcessed) {
      return res.status(400).json({
        success: false,
        message: 'Le numéro de téléphone n\'est pas valide',
        errorType: 'INVALID_PHONE_FORMAT'
      });
    }

    const hashedCode = crypto.createHash('sha256').update(codeOTP).digest('hex');
    
    const user = await User.findOne({ 
      telephone: phoneProcessed,
      tokenResetMotDePasse: hashedCode,
      expirationTokenReset: { $gt: Date.now() }
    });

    if (!user) {
      logger.warn('Vérification OTP reset échouée', { telephone: phoneProcessed });
      return res.status(400).json({
        success: false,
        message: 'Code OTP invalide ou expiré'
      });
    }

    // Code valide - générer un token temporaire pour la réinitialisation
    const tempResetToken = crypto.randomBytes(32).toString('hex');
    const hashedTempToken = crypto.createHash('sha256').update(tempResetToken).digest('hex');
    
    user.tokenResetMotDePasse = hashedTempToken;
    user.expirationTokenReset = Date.now() + 15 * 60 * 1000; // 15 minutes
    await user.save();

    logger.info('Code OTP reset vérifié avec succès', { userId: user._id });

    res.json({
      success: true,
      message: 'Code OTP vérifié avec succès',
      resetToken: tempResetToken,
      nextStep: {
        action: 'NOUVEAU_MOT_DE_PASSE',
        message: 'Vous pouvez maintenant définir un nouveau mot de passe'
      }
    });

  } catch (error) {
    logger.error('Erreur vérification code OTP reset:', error);
    return next(AppError.serverError('Erreur serveur lors de la vérification OTP', { 
      originalError: error.message 
    }));
  }
};

/**
 * Réinitialiser mot de passe
 */
const reinitialiserMotDePasse = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { motDePasse } = req.body;
    
    if (!motDePasse) {
      return res.status(400).json({
        success: false,
        message: 'Nouveau mot de passe requis'
      });
    }
    
    logger.info('Réinitialisation mot de passe', { token: token ? 'présent' : 'absent' });
    
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    const user = await User.findOne({
      tokenResetMotDePasse: hashedToken,
      expirationTokenReset: { $gt: Date.now() }
    });

    if (!user) {
      logger.warn('Réinitialisation mot de passe - Token invalide ou expiré', { token });
      return res.status(400).json({
        success: false,
        message: 'Token de réinitialisation invalide ou expiré'
      });
    }

    // Le nouveau mot de passe sera hashé par le middleware pre-save
    user.motDePasse = motDePasse;
    user.tokenResetMotDePasse = undefined;
    user.expirationTokenReset = undefined;
    
    // Réinitialiser les tentatives de connexion échouées
    user.tentativesConnexionEchouees = 0;
    user.derniereTentativeConnexion = null;
    user.compteBloqueLe = null;
    
    await user.save();

    logger.info('Mot de passe réinitialisé avec succès', { userId: user._id });
    res.json({
      success: true,
      message: 'Mot de passe réinitialisé avec succès'
    });
    
  } catch (error) {
    logger.error('Erreur réinitialisation mot de passe:', error);
    return next(AppError.serverError('Erreur serveur lors de la réinitialisation', { originalError: error.message }));
  }
};

/**
 * Confirmer validité token de réinitialisation
 */
const confirmerReinitialisationMotDePasse = async (req, res, next) => {
  try {
    const { token } = req.params;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token manquant'
      });
    }
    
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');
    
    const user = await User.findOne({
      tokenResetMotDePasse: hashedToken,
      expirationTokenReset: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Token de réinitialisation invalide ou expiré'
      });
    }

    res.json({
      success: true,
      message: 'Token valide pour réinitialisation'
    });
    
  } catch (error) {
    logger.error('Erreur confirmation réinitialisation:', error);
    return next(AppError.serverError('Erreur serveur lors de la confirmation', { originalError: error.message }));
  }
};

// ===================================
// ✨ GESTION DES REFRESH TOKENS
// ===================================

/**
 * @desc    Rafraîchir le token d'accès
 * @route   POST /api/auth/refresh-token
 * @access  Public
 */
const refreshToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token manquant'
      });
    }

    // Hasher le refresh token pour recherche
    const hashedToken = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    // Trouver l'utilisateur avec ce refresh token
    const user = await User.findOne({
      'refreshTokens.token': hashedToken
    }).select('+refreshTokens');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token invalide'
      });
    }

    // Vérifier le refresh token
    const verification = await user.verifyRefreshToken(refreshToken);

    if (!verification.valide) {
      return res.status(401).json({
        success: false,
        message: verification.message,
        raison: verification.raison
      });
    }

    // Générer un nouveau access token
    const newAccessToken = user.getSignedJwtToken();

    logger.info('Token rafraîchi avec succès', { userId: user._id });

    res.json({
      success: true,
      message: 'Token rafraîchi avec succès',
      data: {
        accessToken: newAccessToken,
        expiresIn: process.env.JWT_EXPIRE || '15m'
      }
    });

  } catch (error) {
    logger.error('Erreur rafraîchissement token:', error);
    return next(AppError.serverError('Erreur lors du rafraîchissement du token'));
  }
};

/**
 * @desc    Obtenir les sessions actives de l'utilisateur
 * @route   GET /api/auth/sessions
 * @access  Private
 */
const obtenirSessionsActives = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('+refreshTokens');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const sessions = user.getActiveSessions();

    res.json({
      success: true,
      sessions: sessions,
      total: sessions.length
    });

  } catch (error) {
    logger.error('Erreur obtention sessions:', error);
    return next(AppError.serverError('Erreur lors de la récupération des sessions'));
  }
};

/**
 * @desc    Révoquer une session spécifique
 * @route   DELETE /api/auth/sessions
 * @access  Private
 */
const revoquerSession = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token manquant'
      });
    }

    const user = await User.findById(req.user.userId)
      .select('+refreshTokens');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const result = await user.revokeRefreshToken(refreshToken, 'USER_REVOKE');

    if (!result.success) {
      return res.status(400).json({
        success: false,
        message: result.message
      });
    }

    logger.info('Session révoquée', { userId: user._id });

    res.json({
      success: true,
      message: 'Session révoquée avec succès'
    });

  } catch (error) {
    logger.error('Erreur révocation session:', error);
    return next(AppError.serverError('Erreur lors de la révocation de la session'));
  }
};

/**
 * @desc    Révoquer toutes les sessions (déconnexion globale)
 * @route   POST /api/auth/logout-all
 * @access  Private
 */
const deconnexionGlobale = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('+refreshTokens');

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const result = await user.revokeAllRefreshTokens('LOGOUT_ALL_DEVICES');

    logger.info('Déconnexion globale réussie', { 
      userId: user._id, 
      sessionsRevoquees: result.count 
    });

    res.json({
      success: true,
      message: result.message,
      sessionsRevoquees: result.count
    });

  } catch (error) {
    logger.error('Erreur déconnexion globale:', error);
    return next(AppError.serverError('Erreur lors de la déconnexion globale'));
  }
};

/**
 * @desc    Rotation du refresh token (plus sécurisé)
 * @route   POST /api/auth/rotate
 * @access  Public
 */
const roterToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token manquant'
      });
    }

    // Récupérer les informations de l'appareil
    const deviceInfo = {
      userAgent: req.headers['user-agent'] || 'Unknown',
      ip: req.ip || req.connection.remoteAddress,
      deviceType: detectDeviceType(req.headers['user-agent']),
      os: detectOS(req.headers['user-agent']),
      browser: detectBrowser(req.headers['user-agent'])
    };

    // Hasher le refresh token
    const hashedToken = crypto
      .createHash('sha256')
      .update(refreshToken)
      .digest('hex');

    // Trouver l'utilisateur
    const user = await User.findOne({
      'refreshTokens.token': hashedToken
    }).select('+refreshTokens');

    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Refresh token invalide'
      });
    }

    // Rotation du token
    const result = await user.rotateRefreshToken(refreshToken, deviceInfo);

    if (!result.success) {
      return res.status(401).json({
        success: false,
        message: result.message,
        raison: result.raison
      });
    }

    logger.info('Rotation de token réussie', { userId: user._id });

    res.json({
      success: true,
      message: 'Tokens rotatés avec succès',
      data: {
        accessToken: result.accessToken,
        refreshToken: result.refreshToken,
        expiresIn: result.expiresIn
      }
    });

  } catch (error) {
    logger.error('Erreur rotation token:', error);
    return next(AppError.serverError('Erreur lors de la rotation du token'));
  }
};


// ===================================
// ✨ GESTION DES RECHARGES
// ===================================

/**
 * @desc    Demander une recharge de compte
 * @route   POST /api/auth/recharge
 * @access  Private
 */
const demanderRecharge = async (req, res, next) => {
  try {
    const { montant, methodePaiement, referenceTransaction, fraisTransaction } = req.body;

    if (!montant || !methodePaiement || !referenceTransaction) {
      return res.status(400).json({
        success: false,
        message: 'Montant, méthode de paiement et référence transaction requis'
      });
    }

    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Vérifier que l'utilisateur est conducteur
    if (user.role !== 'conducteur' && user.role !== 'les_deux') {
      return res.status(403).json({
        success: false,
        message: 'Seuls les conducteurs peuvent recharger leur compte'
      });
    }

    await user.rechargerCompte(montant, methodePaiement, referenceTransaction, fraisTransaction || 0);

    logger.info('Demande de recharge créée', { 
      userId: user._id, 
      montant, 
      referenceTransaction 
    });

    res.status(201).json({
      success: true,
      message: 'Demande de recharge enregistrée',
      data: {
        referenceTransaction,
        montant,
        methodePaiement,
        statut: 'en_attente'
      }
    });

  } catch (error) {
    logger.error('Erreur demande recharge:', error);
    return next(AppError.serverError('Erreur lors de la demande de recharge', {
      originalError: error.message
    }));
  }
};

/**
 * @desc    Confirmer une recharge (webhook ou admin)
 * @route   PUT /api/auth/recharge/:referenceTransaction/confirm
 * @access  Private/Admin
 */
const confirmerRecharge = async (req, res, next) => {
  try {
    const { referenceTransaction } = req.params;
    const { statut = 'reussi', userId } = req.body;

    if (!userId) {
      return res.status(400).json({
        success: false,
        message: 'ID utilisateur requis'
      });
    }

    const user = await User.findById(userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    await user.confirmerRecharge(referenceTransaction, statut);

    logger.info('Recharge confirmée', { 
      userId: user._id, 
      referenceTransaction, 
      statut 
    });

    res.json({
      success: true,
      message: `Recharge ${statut === 'reussi' ? 'confirmée' : 'échouée'}`,
      data: {
        referenceTransaction,
        statut,
        nouveauSolde: user.compteCovoiturage.solde
      }
    });

  } catch (error) {
    logger.error('Erreur confirmation recharge:', error);
    return next(AppError.serverError('Erreur lors de la confirmation de recharge', {
      originalError: error.message
    }));
  }
};

/**
 * @desc    Configurer la recharge automatique
 * @route   POST /api/auth/auto-recharge/configure
 * @access  Private
 */
const configurerAutoRecharge = async (req, res, next) => {
  try {
    const { seuilAutoRecharge, montantAutoRecharge, methodePaiementAuto } = req.body;

    if (!seuilAutoRecharge || !montantAutoRecharge || !methodePaiementAuto) {
      return res.status(400).json({
        success: false,
        message: 'Tous les paramètres de recharge automatique sont requis'
      });
    }

    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    await user.configurerAutoRecharge(seuilAutoRecharge, montantAutoRecharge, methodePaiementAuto);

    logger.info('Recharge automatique configurée', { userId: user._id });

    res.json({
      success: true,
      message: 'Recharge automatique configurée avec succès',
      data: {
        modeAutoRecharge: user.compteCovoiturage.modeAutoRecharge
      }
    });

  } catch (error) {
    logger.error('Erreur configuration auto-recharge:', error);
    return next(AppError.serverError('Erreur lors de la configuration', {
      originalError: error.message
    }));
  }
};

/**
 * @desc    Désactiver la recharge automatique
 * @route   POST /api/auth/auto-recharge/desactiver
 * @access  Private
 */
const desactiverAutoRecharge = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    await user.desactiverAutoRecharge();

    logger.info('Recharge automatique désactivée', { userId: user._id });

    res.json({
      success: true,
      message: 'Recharge automatique désactivée avec succès'
    });

  } catch (error) {
    logger.error('Erreur désactivation auto-recharge:', error);
    return next(AppError.serverError('Erreur lors de la désactivation'));
  }
};

/**
 * @desc    Configurer les paramètres de retrait des gains
 * @route   POST /api/auth/retrait/configure
 * @access  Private
 */
const configurerRetraitGains = async (req, res, next) => {
  try {
    const { numeroMobile, operateur, nomTitulaire } = req.body;

    if (!numeroMobile || !operateur || !nomTitulaire) {
      return res.status(400).json({
        success: false,
        message: 'Numéro mobile, opérateur et nom titulaire requis'
      });
    }

    const user = await User.findById(req.user.userId);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    await user.configurerRetraitGains(numeroMobile, operateur, nomTitulaire);

    logger.info('Paramètres de retrait configurés', { userId: user._id });

    res.json({
      success: true,
      message: 'Paramètres de retrait configurés avec succès',
      data: {
        parametresRetrait: user.compteCovoiturage.parametresRetrait
      }
    });

  } catch (error) {
    logger.error('Erreur configuration retrait:', error);
    return next(AppError.serverError('Erreur lors de la configuration', {
      originalError: error.message
    }));
  }
};

// ===================================
// NOUVEAUX CONTRÔLEURS COMPTE COVOITURAGE
// ===================================

/**
 * Obtenir le résumé du compte covoiturage
 */
const obtenirResumeCompteCovoiturage = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const resumeCompte = user.obtenirResumeCompte();

    res.json({
      success: true,
      compteCovoiturage: resumeCompte
    });

  } catch (error) {
    logger.error('Erreur obtention résumé compte:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération du résumé du compte', { 
      originalError: error.message 
    }));
  }
};

/**
 * Obtenir l'historique des recharges
 */
const obtenirHistoriqueRecharges = async (req, res, next) => {
  try {
    const { statut, limit = 20, dateDebut, dateFin } = req.query;
    
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const historique = user.obtenirHistoriqueRecharges({
      statut,
      limit: parseInt(limit),
      dateDebut,
      dateFin
    });

    res.json({
      success: true,
      historiqueRecharges: historique,
      total: user.compteCovoiturage.historiqueRecharges.length
    });

  } catch (error) {
    logger.error('Erreur obtention historique recharges:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération de l\'historique', { 
      originalError: error.message 
    }));
  }
};

/**
 * Obtenir l'historique des commissions
 */
const obtenirHistoriqueCommissions = async (req, res, next) => {
  try {
    const { statut, limit = 20, dateDebut, dateFin } = req.query;
    
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const historique = user.obtenirHistoriqueCommissions({
      statut,
      limit: parseInt(limit),
      dateDebut,
      dateFin
    });

    res.json({
      success: true,
      historiqueCommissions: historique,
      total: user.compteCovoiturage.historiqueCommissions.length
    });

  } catch (error) {
    logger.error('Erreur obtention historique commissions:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération de l\'historique des commissions', { 
      originalError: error.message 
    }));
  }
};

/**
 * Vérifier si le conducteur peut accepter une course
 */
const verifierCapaciteAcceptationCourse = async (req, res, next) => {
  try {
    const { modePaiementDemande } = req.query;
    
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const capaciteAcceptation = user.peutAccepterCourse(modePaiementDemande);

    res.json({
      success: true,
      peutAccepterCourse: capaciteAcceptation.autorise,
      raison: capaciteAcceptation.raison || null,
      modesAcceptes: capaciteAcceptation.modesAcceptes || [],
      compteCovoiturage: {
        solde: user.compteCovoiturage.solde,
        estRecharge: user.compteCovoiturage.estRecharge,
        compteRechargeActif: user.compteRechargeActif
      }
    });

  } catch (error) {
    logger.error('Erreur vérification capacité acceptation course:', error);
    return next(AppError.serverError('Erreur serveur lors de la vérification', { 
      originalError: error.message 
    }));
  }
};

// Alias pour compatibilité
const demandeReinitialisationMotDePasse = motDePasseOublie;

// ===================================
// EXPORTS DU MODULE
// ===================================

module.exports = {
  // Inscription
  inscription,
  inscriptionSMS,
  passerConducteur,
  register,
  chooseChannel,
  verifyCode,
  resendCode,
  
  // Confirmation
  confirmerEmail,
  verifierCodeSMS,
  renvoyerConfirmationEmail,
  renvoyerCodeSMS,
  
  // Connexion
  connexion,
  connexionAdmin,
  deconnexion,
  verifierToken,
  obtenirUtilisateurConnecte,
  
  // Réinitialisation mot de passe
  motDePasseOublie,
  motDePasseOublieSMS,
  verifierCodeOTPReset,
  reinitialiserMotDePasse,
  demandeReinitialisationMotDePasse,
  confirmerReinitialisationMotDePasse,
  
  // Réinitialisation mot de passe WhatsApp
  forgotPassword,
  verifyResetCode,
  resetPassword,
  resendResetCode,

  // Gestion des Refresh Tokens
  refreshToken,
  roterToken,
  obtenirSessionsActives,
  revoquerSession,
  deconnexionGlobale,

  // Gestion des Recharges 
  demanderRecharge,
  confirmerRecharge,
  configurerAutoRecharge,
  desactiverAutoRecharge,
  configurerRetraitGains,

  // Nouveaux contrôleurs compte covoiturage
  obtenirResumeCompteCovoiturage,
  obtenirHistoriqueRecharges,
  obtenirHistoriqueCommissions,
  verifierCapaciteAcceptationCourse
};