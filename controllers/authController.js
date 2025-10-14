// controllers/authController.js
const User = require('../models/Utilisateur');
const crypto = require('crypto');
const sendEmail = require('../utils/emailService');
const { sendSMS } = require('../services/smsService');
const { logger } = require('../utils/logger');
const AppError = require('../utils/AppError');
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

    // Vérifier si l'utilisateur existe déjà
    const existingUser = await User.findOne({ 
      $or: [{ email }, { telephone }] 
    }).maxTimeMS(30000);
    
    if (existingUser) {
      logger.warn('Inscription échouée - Email ou téléphone déjà utilisé', { email, telephone });
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
      telephone,
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
 * Inscription avec vérification SMS - VERSION CORRIGÉE
 */
const inscriptionSMS = async (req, res, next) => {
  // Déclarer les variables en dehors du try pour les rendre accessibles dans le catch
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

    // Assigner aux variables déclarées en dehors
    telephone = telephoneFromBody;
    email = emailFromBody;

    // ========== CORRECTIONS PRINCIPALES ==========
    
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

    // ========== NORMALISATION SPÉCIFIQUE CÔTE D'IVOIRE ==========
    
    const normaliserTelephoneCI = (tel) => {
      if (!tel) return null;
      
      // Supprimer tous les caractères non numériques sauf le +
      let telClean = tel.replace(/[\s\-().]/g, '');
      
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

    // Appliquer la normalisation et validation
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

    // ========== VÉRIFICATIONS D'EXISTENCE AMÉLIORÉES ==========

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
      motDePasse, // Sera hashé par le middleware pre-save
      role: (role && ['conducteur', 'passager', 'les_deux'].includes(role)) ? role : 'passager',
      statutCompte: 'EN_ATTENTE_VERIFICATION',
      tentativesConnexionEchouees: 0,
      codeSMS: codeSMS,
      expirationCodeSMS: expirationCodeSMS,
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

    // Ajouter les champs optionnels avec normalisation
    if (email) userData.email = email;
    if (dateNaissance) userData.dateNaissance = dateNaissance;
    if (sexeNormalise) userData.sexe = sexeNormalise; // Utiliser la version normalisée
    if (adresse) userData.adresse = adresse;

    const newUser = new User(userData);
    await newUser.save({ maxTimeMS: 30000 });

    // Envoyer le SMS de vérification
    try {
      // Log détaillé pour debug
      logger.info('Tentative envoi SMS', {
        originalPhone: req.body.telephone,
        processedPhone: newUser.telephone,
        userId: newUser._id,
        phoneLength: newUser.telephone.length
      });

      await sendSMS({
        to: newUser.telephone,
        message: `Votre code de vérification WAYZ-ECO est: ${codeSMS}. Ce code expire dans 10 minutes.`
      });

      logger.info('SMS de vérification envoyé avec succès', { 
        userId: newUser._id, 
        telephone: newUser.telephone 
      });
      
    } catch (smsError) {
      logger.error('Échec envoi SMS', {
        error: smsError.message,
        originalPhone: req.body.telephone,
        processedPhone: newUser.telephone,
        userId: newUser._id,
        phoneLength: newUser.telephone.length,
        stackTrace: smsError.stack
      });
      
      // Supprimer l'utilisateur en cas d'échec
      await User.findByIdAndDelete(newUser._id);
      
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
          twilioError: smsError.message,
          fullError: smsError.stack
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
    
    // ========== GESTION D'ERREUR AMÉLIORÉE ==========
    
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

    // Erreur de duplication MongoDB (code 11000)
    if (error.code === 11000) {
      // Identifier le champ dupliqué
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

    // Autres erreurs
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

    const user = await User.findOne({ telephone })
      .select('+codeSMS +expirationCodeSMS')
      .maxTimeMS(30000);

    if (!user) {
      logger.warn('Vérification SMS échouée - Utilisateur non trouvé', { telephone });
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

    // Vérifier le code SMS
    if (!user.codeSMS || user.codeSMS !== codeSMS) {
      logger.warn('Vérification SMS échouée - Code incorrect', { userId: user._id, telephone });
      return res.status(400).json({
        success: false,
        message: 'Code SMS incorrect'
      });
    }

    // Vérifier l'expiration
    if (!user.expirationCodeSMS || user.expirationCodeSMS < Date.now()) {
      logger.warn('Vérification SMS échouée - Code expiré', { userId: user._id, telephone });
      return res.status(400).json({
        success: false,
        message: 'Code SMS expiré'
      });
    }

    // Code valide - confirmer le téléphone
    user.statutCompte = 'ACTIF';
    user.codeSMS = undefined;
    user.expirationCodeSMS = undefined;
    user.estVerifie = true;
    await user.save();

    // Générer le token JWT
    const token = user.getSignedJwtToken();

    logger.info('Vérification SMS réussie', { userId: user._id, telephone });

    res.status(200).json({
      success: true,
      message: 'Téléphone vérifié avec succès. Votre compte est maintenant actif.',
      token,
      user: {
        id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        telephone: user.telephone,
        email: user.email || null,
        role: user.role,
        statutCompte: user.statutCompte,
        compteCovoiturage: {
          solde: user.compteCovoiturage.solde,
          estRecharge: user.compteCovoiturage.estRecharge,
          peutAccepterCourses: user.peutAccepterCourses
        }
      }
    });

  } catch (error) {
    logger.error('Erreur vérification SMS:', error);
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
const renvoyerCodeSMS = async (req, res, next) => {
  try {
    const { telephone } = req.body;

    if (!telephone) {
      return res.status(400).json({
        success: false,
        message: 'Le numéro de téléphone est requis'
      });
    }

    const user = await User.findOne({ telephone })
      .select('+codeSMS +expirationCodeSMS')
      .maxTimeMS(30000);

    if (!user) {
      logger.warn('Renvoi SMS échoué - Utilisateur non trouvé', { telephone });
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
    await user.save();

    // Envoyer le SMS
    try {
      await sendSMS({
        to: user.telephone,
        message: `Votre nouveau code de vérification WAYZ-ECO est: ${nouveauCode}. Ce code expire dans 10 minutes.`
      });

      logger.info('Nouveau SMS envoyé', { userId: user._id, telephone });
      
      res.status(200).json({
        success: true,
        message: 'Un nouveau code de vérification a été envoyé par SMS'
      });

    } catch (smsError) {
      logger.error('Erreur envoi SMS:', smsError);
      return res.status(500).json({
        success: false,
        message: 'Impossible d\'envoyer le SMS. Veuillez réessayer plus tard.'
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
    logger.info('Tentative de connexion', { email: req.body.email });
    
    const { email, motDePasse } = req.body;

    if (!email || !motDePasse) {
      return res.status(400).json({
        success: false,
        message: 'Email et mot de passe sont requis',
        codeErreur: 'MISSING_FIELDS'
      });
    }

    const user = await User.findOne({ email }).select('+motDePasse');
    
    if (!user) {
      logger.warn('Connexion échouée - Email incorrect', { email });
      return res.status(401).json({
        success: false,
        message: 'Adresse email incorrecte',
        codeErreur: 'INVALID_EMAIL',
        champ: 'email'
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
        codeErreur: codeErreurStatut
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
          codeErreur: 'CORRUPTED_HASH'
        });
      }
      
      isMatch = await user.verifierMotDePasse(motDePasse.trim());
      
    } catch (bcryptError) {
      logger.error('Erreur vérification mot de passe', { error: bcryptError.message, userId: user._id });
      return res.status(500).json({
        success: false,
        message: 'Erreur de vérification du mot de passe',
        codeErreur: 'PASSWORD_VERIFICATION_ERROR'
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
        email, 
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
    const token = user.getSignedJwtToken();

    logger.info('Connexion réussie', { userId: user._id });
    
    res.json({
      success: true,
      message: 'Connexion réussie',
      token,
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
      vehicule: user.vehicule,
      documentIdentite: user.documentIdentite ? {
        type: user.documentIdentite.type,
        statutVerification: user.documentIdentite.statutVerification,
        dateVerification: user.documentIdentite.dateVerification
      } : null,
      compteCovoiturage: {
        ...user.obtenirResumeCompte()
      }
    };

    res.json({
      success: true,
      user: userData
    });
    
  } catch (error) {
    logger.error('Erreur obtention profil:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération du profil', { originalError: error.message }));
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

    const user = await User.findOne({ telephone });
    if (!user) {
      logger.info('Demande réinitialisation SMS - Téléphone non trouvé (masqué)', { telephone });
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

      logger.info('SMS réinitialisation envoyé', { userId: user._id, telephone });
      
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

    const hashedCode = crypto.createHash('sha256').update(codeOTP).digest('hex');
    
    const user = await User.findOne({ 
      telephone,
      tokenResetMotDePasse: hashedCode,
      expirationTokenReset: { $gt: Date.now() }
    });

    if (!user) {
      logger.warn('Vérification OTP reset échouée', { telephone });
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
  
  // Nouveaux contrôleurs compte covoiturage
  obtenirResumeCompteCovoiturage,
  obtenirHistoriqueRecharges,
  obtenirHistoriqueCommissions,
  verifierCapaciteAcceptationCourse
};