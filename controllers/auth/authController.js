// controllers/auth/authController.js
const User = require('../../models/Utilisateur');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sendEmail = require('../../utils/emailService');
const { logger } = require('../../utils/logger');
const AppError = require('../../utils/AppError');
const fs = require('fs');
const path = require('path');

// Fonction utilitaire pour charger et remplacer les variables dans un template
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
      adresse,
      role = 'passager'
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
      logger.warn('Inscription échouée - Utilisateur existe déjà', { email, telephone });
      const champ = existingUser.email === email ? 'email' : 'telephone';
      return res.status(409).json({
        success: false,
        message: `Un compte avec ce ${champ} existe déjà`,
        champ
      });
    }

    // Créer un nouvel utilisateur
    const userData = {
      nom: nom.trim(),
      prenom: prenom.trim(),
      email: email.toLowerCase().trim(),
      motDePasse, // Sera hashé par le middleware pre-save
      telephone: telephone.trim(),
      role,
      statutCompte: 'EN_ATTENTE_VERIFICATION',
      tentativesConnexionEchouees: 0,
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
          retraitJournalier: 1000000, // 1M FCFA
          retraitMensuel: 5000000,    // 5M FCFA
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

    // Générer token de confirmation
    const confirmationToken = newUser.getEmailConfirmationToken();
    
    // Sauvegarder l'utilisateur
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
        // Informations compte covoiturage initial
        compteCovoiturage: {
          solde: newUser.compteCovoiturage.solde,
          estRecharge: newUser.compteCovoiturage.estRecharge,
          peutAccepterCourses: newUser.peutAccepterCourses,
          compteRechargeActif: newUser.compteRechargeActif
        }
      }
    });

  } catch (error) {
    logger.error('Erreur inscription:', error);

    // Gestion des erreurs MongoDB
    if (error.name === 'MongoTimeoutError' || 
        (error.name === 'MongoError' && error.message.includes('timed out'))) {
      return next(AppError.serverError('Délai d\'attente de la base de données dépassé', { 
        originalError: error.message,
        isTimeout: true
      }));
    }

    // Gestion des erreurs de validation
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation',
        details: messages
      });
    }

    // Gestion des erreurs de duplication
    if (error.code === 11000) {
      const field = Object.keys(error.keyPattern)[0];
      const fieldName = field === 'email' ? 'email' : 'numéro de téléphone';
      return res.status(409).json({
        success: false,
        message: `Un compte avec ce ${fieldName} existe déjà`,
        champ: field
      });
    }

    return next(AppError.serverError('Erreur serveur lors de l\'inscription', { 
      originalError: error.message
    }));
  }
};

const connexion = async (req, res, next) => {
  try {
    logger.info('Tentative de connexion', { email: req.body.email });
    
    const { email, motDePasse } = req.body;

    // Validation des champs requis
    if (!email || !motDePasse) {
      return res.status(400).json({
        success: false,
        message: 'Email et mot de passe sont requis',
        codeErreur: 'MISSING_FIELDS'
      });
    }

    // Récupérer l'utilisateur avec le mot de passe
    const user = await User.findOne({ email: email.toLowerCase() }).select('+motDePasse');
    
    // EMAIL INCORRECT
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
      
      // Messages spécifiques selon le statut
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

    // VÉRIFICATION MOT DE PASSE
    let isMatch = false;
    
    try {
      isMatch = await user.verifierMotDePasse(motDePasse.trim());
    } catch (bcryptError) {
      logger.error('Erreur vérification mot de passe', { error: bcryptError.message, userId: user._id });
      return res.status(500).json({
        success: false,
        message: 'Erreur de vérification du mot de passe',
        codeErreur: 'PASSWORD_VERIFICATION_ERROR'
      });
    }

    // MOT DE PASSE INCORRECT
    if (!isMatch) {
      // Incrémenter les tentatives échouées
      user.tentativesConnexionEchouees += 1;
      user.derniereTentativeConnexion = new Date();
      
      // Bloquer temporairement après 5 tentatives
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
        nomComplet: user.nomComplet,
        email: user.email,
        telephone: user.telephone,
        role: user.role,
        photoProfil: user.photoProfil,
        statutCompte: user.statutCompte,
        estVerifie: user.estVerifie,
        scoreConfiance: user.scoreConfiance,
        noteGenerale: user.noteGenerale,
        badges: user.badges,
        // Informations compte covoiturage
        compteCovoiturage: {
          solde: user.compteCovoiturage.solde,
          estRecharge: user.compteCovoiturage.estRecharge,
          seuilMinimum: user.compteCovoiturage.seuilMinimum,
          totalGagnes: user.compteCovoiturage.totalGagnes,
          totalCommissionsPayees: user.compteCovoiturage.totalCommissionsPayees,
          // Virtuals
          peutAccepterCourses: user.peutAccepterCourses,
          compteRechargeActif: user.compteRechargeActif,
          soldeDisponible: user.soldeDisponible,
          peutRetirerGains: user.peutRetirerGains
        },
        // Informations conducteur si applicable
        ...(user.role === 'conducteur' || user.role === 'les_deux' ? {
          vehicule: user.vehicule
        } : {}),
        preferences: user.preferences,
        adresse: user.adresse
      }
    });
    
  } catch (error) {
    logger.error('Erreur connexion:', error);
    return next(AppError.serverError('Erreur serveur lors de la connexion', { originalError: error.message }));
  }
};

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

    const user = await User.findOne({ 
      email: email.toLowerCase(), 
      role: 'admin' 
    }).select('+motDePasse');
    
    if (!user) {
      // Vérifier s'il existe un utilisateur avec cet email mais pas admin
      const userExists = await User.findOne({ email: email.toLowerCase() });
      
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

    // Réinitialiser les tentatives échouées
    if (user.tentativesConnexionEchouees > 0) {
      user.tentativesConnexionEchouees = 0;
      user.derniereTentativeConnexion = null;
      user.compteBloqueLe = null;
    }
    
    user.derniereConnexion = new Date();
    await user.save();

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
        nomComplet: user.nomComplet,
        email: user.email,
        role: user.role,
        photoProfil: user.photoProfil
      }
    });
    
  } catch (error) {
    logger.error('Erreur connexion admin:', error);
    return next(AppError.serverError('Erreur serveur lors de la connexion admin', { originalError: error.message }));
  }
};

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

const verifierToken = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    
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
        nomComplet: user.nomComplet,
        email: user.email,
        role: user.role,
        statutCompte: user.statutCompte,
        compteCovoiturage: {
          solde: user.compteCovoiturage.solde,
          estRecharge: user.compteCovoiturage.estRecharge,
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

const obtenirUtilisateurConnecte = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId);
    
    if (!user) {
      logger.warn('Profil utilisateur non trouvé', { userId: req.user.userId });
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const userResponse = {
      id: user._id,
      nom: user.nom,
      prenom: user.prenom,
      nomComplet: user.nomComplet,
      email: user.email,
      telephone: user.telephone,
      dateNaissance: user.dateNaissance,
      sexe: user.sexe,
      photoProfil: user.photoProfil,
      role: user.role,
      statutCompte: user.statutCompte,
      dateInscription: user.dateInscription,
      derniereConnexion: user.derniereConnexion,
      estVerifie: user.estVerifie,
      age: user.age,
      scoreConfiance: user.scoreConfiance,
      nombreTrajetsEffectues: user.nombreTrajetsEffectues,
      nombreTrajetsAnnules: user.nombreTrajetsAnnules,
      tauxAnnulation: user.tauxAnnulation,
      noteGenerale: user.noteGenerale,
      badges: user.badges,
      documentIdentite: {
        statutVerification: user.documentIdentite?.statutVerification || 'EN_ATTENTE',
        estVerifie: user.estDocumentVerifie
      },
      adresse: user.adresse,
      preferences: user.preferences,
      contactsUrgence: user.contactsUrgence,
      // Compte covoiturage complet
      compteCovoiturage: user.obtenirResumeCompte(),
      // Véhicule si conducteur
      ...(user.role === 'conducteur' || user.role === 'les_deux' ? {
        vehicule: user.vehicule
      } : {})
    };

    res.json({
      success: true,
      user: userResponse
    });
    
  } catch (error) {
    logger.error('Erreur obtention profil:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération du profil', { originalError: error.message }));
  }
};

// Confirmation d'email
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
    
    // Hasher le token reçu pour comparaison
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
    
    // Trouver l'utilisateur avec ce token
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

    // Vérifier si le compte est déjà confirmé
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
    
    await user.save();

    logger.info('Email confirmé avec succès', { userId: user._id });
    
    // Afficher le template de validation
    try {
      const validationHtml = chargerTemplate('validation-template.html', {
        'user.prenom': user.prenom,
        'user.email': user.email
      });
      
      res.setHeader('Content-Type', 'text/html');
      res.send(validationHtml);
    } catch (templateError) {
      logger.error('Erreur chargement template validation:', templateError);
      // Fallback
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

// Renvoyer l'email de confirmation
const renvoyerConfirmationEmail = async (req, res, next) => {
  try {
    const { email } = req.body;
    
    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email requis'
      });
    }
    
    const user = await User.findOne({ email: email.toLowerCase() });
    
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
    const confirmationToken = user.getEmailConfirmationToken();
    await user.save();
    
    // Renvoyer l'email
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

// Mot de passe oublié
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

    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      logger.info('Demande réinitialisation - Email non trouvé (masqué)', { email });
      return res.json({
        success: true,
        message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé'
      });
    }

    // Générer un token de réinitialisation
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.tokenResetMotDePasse = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');
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

// Réinitialiser mot de passe
const reinitialiserMotDePasse = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    
    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'Nouveau mot de passe requis'
      });
    }
    
    logger.info('Réinitialisation mot de passe', { token: token ? 'présent' : 'absent' });
    
    // Hasher le token reçu pour comparaison
    const hashedToken = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');
    
    const user = await User.findOne({
      tokenResetMotDePasse: hashedToken,
      expirationTokenReset: { $gt: Date.now() }
    });

    if (!user) {
      logger.warn('Réinitialisation mot de passe - Token invalide ou expiré', { token });
      return res.status(400).json({
        success: false,
        message: 'Lien de réinitialisation invalide ou expiré'
      });
    }

    // Le mot de passe sera hashé par le middleware pre-save
    user.motDePasse = password;
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

// ===== NOUVELLES FONCTIONS COMPTE COVOITURAGE =====

/**
 * Obtenir le statut du compte covoiturage
 */
const obtenirStatutCompteCovoiturage = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const resumeCompte = user.obtenirResumeCompte();

    res.json({
      success: true,
      data: resumeCompte
    });
    
  } catch (error) {
    logger.error('Erreur obtention statut compte covoiturage:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération du compte', { 
      originalError: error.message 
    }));
  }
};

/**
 * Vérifier l'éligibilité pour accepter des courses
 */
const verifierEligibiliteCourses = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { modePaiementDemande } = req.query;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const eligibilite = user.peutAccepterCourse(modePaiementDemande);

    res.json({
      success: true,
      data: eligibilite
    });
    
  } catch (error) {
    logger.error('Erreur vérification éligibilité courses:', error);
    return next(AppError.serverError('Erreur serveur lors de la vérification', { 
      originalError: error.message 
    }));
  }
};

/**
 * Obtenir l'historique des recharges
 */
const obtenirHistoriqueRecharges = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { statut, limit, dateDebut, dateFin } = req.query;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const options = {
      statut,
      limit: parseInt(limit) || 20,
      dateDebut,
      dateFin
    };

    const historique = user.obtenirHistoriqueRecharges(options);

    res.json({
      success: true,
      data: {
        historique,
        total: user.compteCovoiturage.historiqueRecharges.length,
        filtres: options
      }
    });
    
  } catch (error) {
    logger.error('Erreur historique recharges:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération', { 
      originalError: error.message 
    }));
  }
};

/**
 * Obtenir l'historique des commissions
 */
const obtenirHistoriqueCommissions = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { statut, limit, dateDebut, dateFin } = req.query;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const options = {
      statut,
      limit: parseInt(limit) || 20,
      dateDebut,
      dateFin
    };

    const historique = user.obtenirHistoriqueCommissions(options);

    res.json({
      success: true,
      data: {
        historique,
        total: user.compteCovoiturage.historiqueCommissions.length,
        filtres: options
      }
    });
    
  } catch (error) {
    logger.error('Erreur historique commissions:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération', { 
      originalError: error.message 
    }));
  }
};

/**
 * Vérifier si une recharge automatique est nécessaire
 */
const verifierAutoRecharge = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const verificationAutoRecharge = user.verifierAutoRecharge();

    res.json({
      success: true,
      data: verificationAutoRecharge
    });
    
  } catch (error) {
    logger.error('Erreur vérification auto-recharge:', error);
    return next(AppError.serverError('Erreur serveur lors de la vérification', { 
      originalError: error.message 
    }));
  }
};

/**
 * Initialiser le compte covoiturage pour les nouveaux conducteurs
 */
const initialiserCompteCovoiturage = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Vérifier que l'utilisateur peut être conducteur
    if (user.role !== 'conducteur' && user.role !== 'les_deux') {
      return res.status(403).json({
        success: false,
        message: 'Seuls les conducteurs peuvent initialiser un compte covoiturage'
      });
    }

    // Vérifier si le compte est déjà initialisé
    if (user.compteCovoiturage.historiqueRecharges.length > 0 || 
        user.compteCovoiturage.historiqueCommissions.length > 0) {
      return res.json({
        success: true,
        message: 'Compte covoiturage déjà initialisé',
        data: user.obtenirResumeCompte()
      });
    }

    // Le compte est déjà initialisé par défaut dans le modèle
    const resumeCompte = user.obtenirResumeCompte();

    logger.info('Compte covoiturage consulté', { userId });

    res.json({
      success: true,
      message: 'Compte covoiturage prêt à l\'utilisation',
      data: resumeCompte
    });
    
  } catch (error) {
    logger.error('Erreur initialisation compte covoiturage:', error);
    return next(AppError.serverError('Erreur serveur lors de l\'initialisation', { 
      originalError: error.message 
    }));
  }
};

/**
 * Obtenir les statistiques du compte covoiturage
 */
const obtenirStatistiquesCompte = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const maintenant = new Date();
    const debutMois = new Date(maintenant.getFullYear(), maintenant.getMonth(), 1);
    const debutAnnee = new Date(maintenant.getFullYear(), 0, 1);

    // Statistiques personnalisées
    const rechargesReussies = user.compteCovoiturage.historiqueRecharges.filter(r => r.statut === 'reussi');
    const commissions = user.compteCovoiturage.historiqueCommissions.filter(c => c.statut === 'preleve');
    
    const rechargesCeMois = rechargesReussies.filter(r => r.date >= debutMois);
    const rechargesCetteAnnee = rechargesReussies.filter(r => r.date >= debutAnnee);
    
    const commissionsCeMois = commissions.filter(c => c.date >= debutMois);
    const commissionsCetteAnnee = commissions.filter(c => c.date >= debutAnnee);

    const statistiques = {
      general: {
        soldeActuel: user.compteCovoiturage.solde,
        estRecharge: user.compteCovoiturage.estRecharge,
        totalGagnes: user.compteCovoiturage.totalGagnes,
        totalCommissions: user.compteCovoiturage.totalCommissionsPayees,
        beneficeNet: user.compteCovoiturage.totalGagnes - user.compteCovoiturage.totalCommissionsPayees
      },
      recharges: {
        nombreTotal: rechargesReussies.length,
        montantTotal: rechargesReussies.reduce((sum, r) => sum + r.montant, 0),
        nombreCeMois: rechargesCeMois.length,
        montantCeMois: rechargesCeMois.reduce((sum, r) => sum + r.montant, 0),
        nombreCetteAnnee: rechargesCetteAnnee.length,
        montantCetteAnnee: rechargesCetteAnnee.reduce((sum, r) => sum + r.montant, 0)
      },
      commissions: {
        nombreTotal: commissions.length,
        montantTotal: user.compteCovoiturage.totalCommissionsPayees,
        nombreCeMois: commissionsCeMois.length,
        montantCeMois: commissionsCeMois.reduce((sum, c) => sum + c.montant, 0),
        nombreCetteAnnee: commissionsCetteAnnee.length,
        montantCetteAnnee: commissionsCetteAnnee.reduce((sum, c) => sum + c.montant, 0)
      },
      moyennes: {
        rechargeParMois: rechargesReussies.length > 0 ? 
          Math.round(rechargesReussies.reduce((sum, r) => sum + r.montant, 0) / 
          Math.max(1, Math.ceil((maintenant - new Date(user.dateInscription)) / (30 * 24 * 60 * 60 * 1000)))) : 0,
        commissionParCourse: commissions.length > 0 ? 
          Math.round(user.compteCovoiturage.totalCommissionsPayees / commissions.length) : 0
      }
    };

    res.json({
      success: true,
      data: statistiques
    });
    
  } catch (error) {
    logger.error('Erreur statistiques compte:', error);
    return next(AppError.serverError('Erreur serveur lors du calcul des statistiques', { 
      originalError: error.message 
    }));
  }
};

module.exports = {
  inscription,
  connexion,
  connexionAdmin,
  deconnexion,
  verifierToken,
  obtenirUtilisateurConnecte,
  confirmerEmail,
  renvoyerConfirmationEmail,
  motDePasseOublie,
  reinitialiserMotDePasse,
  // NOUVELLES FONCTIONS COMPTE COVOITURAGE
  obtenirStatutCompteCovoiturage,
  verifierEligibiliteCourses,
  obtenirHistoriqueRecharges,
  obtenirHistoriqueCommissions,
  verifierAutoRecharge,
  initialiserCompteCovoiturage,
  obtenirStatistiquesCompte
};