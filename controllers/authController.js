// controllers/authController.js
const User = require('../models/Utilisateur');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sendEmail = require('../utils/emailService');
const { logger, securityLogger } = require('../utils/logger');
const AppError = require('../utils/AppError');

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
      adresse
    } = req.body;

    // Validation des champs requis
    if (!nom || !prenom || !email || !motDePasse) {
      return res.status(400).json({
        success: false,
        message: 'Tous les champs obligatoires doivent être renseignés',
        champsRequis: ['nom', 'prenom', 'email', 'motDePasse']
      });
    }

    // Vérifier si l'utilisateur existe déjà avec un délai d'attente augmenté
    const existingUser = await User.findOne({ email }).maxTimeMS(30000);
    if (existingUser) {
      logger.warn('Inscription échouée - Email déjà utilisé', { email });
      return res.status(409).json({
        success: false,
        message: 'Un compte avec cet email existe déjà'
      });
    }
    
    console.log("Mot de passe reçu :", motDePasse);

    // Hacher le mot de passe
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(motDePasse, salt);

    // Générer un token de confirmation d'email
    const confirmationToken = crypto.randomBytes(32).toString('hex');

    // Créer un nouvel utilisateur
    const userData = {
      nom,
      prenom,
      email,
      motDePasse: hashedPassword,
      telephone,
      role: 'utilisateur',
      statutCompte: 'EN_ATTENTE_VERIFICATION', // Statut initial pour vérification
      tentativesConnexionEchouees: 0,
      derniereTentativeConnexion: null,
      compteBloqueLe: null,
      tokenConfirmationEmail: confirmationToken,
      expirationTokenConfirmation: Date.now() + 24 * 60 * 60 * 1000 // 24 heures
    };

    // Ajouter les champs optionnels s'ils sont fournis
    if (dateNaissance) userData.dateNaissance = dateNaissance;
    if (sexe) userData.sexe = sexe;
    if (adresse) userData.adresse = adresse;

    const newUser = new User(userData);

    // Sauvegarder l'utilisateur avec un délai d'attente augmenté
    await newUser.save({ maxTimeMS: 30000 });

    // Envoyer l'email de confirmation
    const confirmationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/confirm-email/${confirmationToken}`;
    
    try {
      await sendEmail({
        to: newUser.email,
        subject: 'Confirmez votre adresse email',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #333;">Bienvenue ${newUser.prenom} !</h2>
            <p>Merci de vous être inscrit sur notre plateforme.</p>
            <p>Pour activer votre compte, veuillez cliquer sur le lien ci-dessous :</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${confirmationUrl}" 
                 style="background-color: #007bff; color: white; padding: 12px 30px; 
                        text-decoration: none; border-radius: 5px; display: inline-block;">
                Confirmer mon email
              </a>
            </div>
            <p style="color: #666; font-size: 14px;">
              Ce lien expirera dans 24 heures.<br>
              Si vous n'avez pas créé de compte, ignorez ce message.
            </p>
            <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">
            <p style="color: #999; font-size: 12px;">
              Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :<br>
              ${confirmationUrl}
            </p>
          </div>
        `
      });

      logger.info('Email de confirmation envoyé', { userId: newUser._id, email: newUser.email });
      
    } catch (emailError) {
      logger.error('Erreur envoi email confirmation:', emailError);
      // On continue même si l'email n'a pas pu être envoyé
    }

    // Ne pas générer de token JWT immédiatement car le compte n'est pas confirmé
    logger.info('Inscription réussie', { userId: newUser._id });
    res.status(201).json({
      success: true,
      message: 'Compte créé avec succès. Veuillez vérifier votre email pour confirmer votre compte.',
      user: {
        id: newUser._id,
        nom: newUser.nom,
        prenom: newUser.prenom,
        email: newUser.email,
        role: newUser.role,
        statutCompte: newUser.statutCompte
      }
    });

  } catch (error) {
    logger.error('Erreur détaillée :', error.message);
    logger.error('Stack trace :', error.stack);

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
      return res.status(409).json({
        success: false,
        message: 'Un compte avec cet email existe déjà'
      });
    }

    return next(AppError.serverError('Erreur serveur lors de l\'inscription', { 
      originalError: error.message
    }));
  }
};

// Fonction pour confirmer l'email
const confirmerEmail = async (req, res, next) => {
  try {
    let token;
    
    // Récupérer le token depuis l'URL ou les paramètres de requête
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
    // const hashedToken = crypto
    //   .createHash('sha256')
    //   .update(token)
    //   .digest('hex');
    // Trouver l'utilisateur avec ce token
    const user = await User.findOne({
      tokenConfirmationEmail: token,
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

    // Générer un token JWT pour la connexion automatique
    const accessToken = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    user.refreshToken = refreshToken;
    await user.save();

    logger.info('Email confirmé avec succès', { userId: user._id });
    
    // Envoyer un email de bienvenue
    try {
      await sendEmail({
        to: user.email,
        subject: 'Bienvenue ! Votre compte est activé',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #28a745;">Félicitations ${user.prenom} !</h2>
            <p>Votre compte a été confirmé avec succès.</p>
            <p>Vous pouvez maintenant profiter de tous nos services.</p>
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" 
                 style="background-color: #28a745; color: white; padding: 12px 30px; 
                        text-decoration: none; border-radius: 5px; display: inline-block;">
                Accéder à mon compte
              </a>
            </div>
            <p style="color: #666;">Merci de nous faire confiance !</p>
          </div>
        `
      });
    } catch (emailError) {
      logger.error('Erreur envoi email bienvenue:', emailError);
    }

    res.json({
      success: true,
      message: 'Email confirmé avec succès. Vous êtes maintenant connecté.',
      token: accessToken,
      refreshToken,
      user: {
        id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        role: user.role,
        statutCompte: user.statutCompte
      }
    });
    
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
    
    const user = await User.findOne({ email });
    
    if (!user) {
      // Ne pas révéler que l'email n'existe pas
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
    user.tokenConfirmationEmail = confirmationToken;
    user.expirationTokenConfirmation = Date.now() + 24 * 60 * 60 * 1000; // 24 heures
    
    await user.save();
    
    // Renvoyer l'email
    const confirmationUrl = `${process.env.FRONTEND_URL || 'http://localhost:3000'}/confirm-email/${confirmationToken}`;
    
    await sendEmail({
      to: user.email,
      subject: 'Confirmez votre adresse email',
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <h2 style="color: #333;">Confirmez votre email</h2>
          <p>Bonjour ${user.prenom},</p>
          <p>Voici votre nouveau lien de confirmation :</p>
          <div style="text-align: center; margin: 30px 0;">
            <a href="${confirmationUrl}" 
               style="background-color: #007bff; color: white; padding: 12px 30px; 
                      text-decoration: none; border-radius: 5px; display: inline-block;">
              Confirmer mon email
            </a>
          </div>
          <p style="color: #666; font-size: 14px;">Ce lien expirera dans 24 heures.</p>
        </div>
      `
    });
    
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

// Contrôleur de connexion
const connexion = async (req, res, next) => {
  try {
    logger.info('Tentative de connexion', { email: req.body.email });
    
    const { email, motDePasse } = req.body;

    // Validation des champs requis
    if (!email || !motDePasse) {
      return res.status(400).json({
        success: false,
        message: 'Email et mot de passe sont requis'
      });
    }

    // Vérifier l'utilisateur
    const user = await User.findOne({ email }).select('+motDePasse');
    if (!user) {
      logger.warn('Connexion échouée - Utilisateur non trouvé', { email });
      return next(AppError.userNotFound({ email }));
    }

    // Vérifier le statut du compte
    const statutAutorise = user.peutSeConnecter();
    if (!statutAutorise.autorise) {
      logger.warn('Connexion échouée - Compte non autorisé', { 
        userId: user._id, 
        statut: user.statutCompte,
        raison: statutAutorise.raison 
      });
      
      const context = {
        userId: user._id,
        statut: user.statutCompte,
        raison: statutAutorise.raison,
        deblocageA: statutAutorise.deblocageA
      };

      // Journalisation sécurité
      securityLogger.warn('Connexion refusée - Compte non autorisé', {
        event: 'login_blocked',
        ...context,
        ip: req.ip
      });

      // Conserver le mapping fin des statuts mais via AppError typé
      if (user.statutCompte === 'BLOQUE') {
        return next(AppError.accountPermanentlyBlocked(context));
      } else if (user.statutCompte === 'SUSPENDU') {
        return next(AppError.accountSuspended(context));
      } else if (user.statutCompte === 'EN_ATTENTE_VERIFICATION') {
        return next(AppError.accountPendingVerification(context));
      } else if (statutAutorise.raison === 'Compte temporairement bloqué') {
        return next(AppError.accountTemporarilyBlocked(context));
      }
      return next(AppError.accountDisabled(context));
    }

    // Vérifier la présence du mot de passe côté utilisateur
    if (!user.motDePasse) {
      logger.warn('Connexion échouée - Utilisateur sans mot de passe', { email });
      return res.status(500).json({
        success: false,
        message: 'Erreur de configuration du compte'
      });
    }

    // Vérifier le mot de passe
    const isMatch = await user.verifierMotDePasse(motDePasse);
    if (!isMatch) {
      // Incrémenter les tentatives échouées
      await user.incrementerTentativesEchouees();
      
      logger.warn('Connexion échouée - Mot de passe incorrect', { 
        email, 
        tentativesEchouees: user.tentativesConnexionEchouees + 1
      });
      
      return res.status(401).json({
        success: false,
        message: 'Identifiants invalides',
        codeErreur: 'INVALID_CREDENTIALS',
        tentativesRestantes: Math.max(0, 5 - (user.tentativesConnexionEchouees + 1))
      });
    }

    // Réinitialiser les tentatives échouées en cas de succès
    if (user.tentativesConnexionEchouees > 0) {
      user.tentativesConnexionEchouees = 0;
      user.derniereTentativeConnexion = null;
      user.compteBloqueLe = null;
    }

    // Générer les tokens
    const accessToken = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    // Mettre à jour le refresh token et la dernière connexion
    user.refreshToken = refreshToken;
    await user.mettreAJourDerniereConnexion();

    logger.info('Connexion réussie', { userId: user._id });
    res.json({
      success: true,
      message: 'Connexion réussie',
      token: accessToken,
      refreshToken,
      user: {
        id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        email: user.email,
        role: user.role,
        photo: user.photo,
        statutCompte: user.statutCompte
      }
    });
    
  } catch (error) {
    logger.error('Erreur connexion:', error);
    return next(AppError.serverError('Erreur serveur lors de la connexion', { originalError: error.message }));
  }
};

// Contrôleur de connexion admin
const connexionAdmin = async (req, res, next) => {
  try {
    logger.info('Tentative de connexion admin', { email: req.body.email });
    
    const { email, motDePasse } = req.body;

    // Validation des champs requis
    if (!email || !motDePasse) {
      return res.status(400).json({
        success: false,
        message: 'Email et mot de passe sont requis'
      });
    }

    const user = await User.findOne({ email, role: 'admin' });
    if (!user) {
      logger.warn('Connexion admin échouée - Utilisateur non admin', { email });
      return res.status(401).json({
        success: false,
        message: 'Accès administrateur refusé',
        codeErreur: 'ADMIN_ACCESS_DENIED'
      });
    }

    const isMatch = await user.verifierMotDePasse(motDePasse);
    if (!isMatch) {
      // Incrémenter les tentatives échouées
      await user.incrementerTentativesEchouees();
      
      logger.warn('Connexion admin échouée - Mot de passe incorrect', { 
        email, 
        tentativesEchouees: user.tentativesConnexionEchouees + 1
      });
      
      return res.status(401).json({
        success: false,
        message: 'Identifiants invalides',
        codeErreur: 'INVALID_CREDENTIALS',
        tentativesRestantes: Math.max(0, 5 - (user.tentativesConnexionEchouees + 1))
      });
    }

    // Générer le token admin
    const token = jwt.sign(
      { userId: user._id, role: 'admin' },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

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

// Contrôleur de déconnexion
const deconnexion = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    logger.info('Déconnexion utilisateur', { userId });
    
    // Supprimer le refresh token
    await User.findByIdAndUpdate(userId, { 
      refreshToken: null,
      $unset: { refreshToken: 1 }
    });

    res.json({
      success: true,
      message: 'Déconnexion réussie'
    });
    
  } catch (error) {
    logger.error('Erreur déconnexion:', error);
    return next(AppError.serverError('Erreur serveur lors de la déconnexion', { originalError: error.message }));
  }
};

// Vérification de token
const verifierToken = async (req, res, next) => {
  try {
    // Le middleware d'authentification a déjà validé le token
    const user = await User.findById(req.user.userId).select('-motDePasse -refreshToken');
    
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
      user
    });
    
  } catch (error) {
    logger.error('Erreur vérification token:', error);
    return next(AppError.serverError('Erreur serveur lors de la vérification du token', { originalError: error.message }));
  }
};

// Obtenir utilisateur connecté
const obtenirUtilisateurConnecte = async (req, res, next) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('-motDePasse -refreshToken -tokenResetMotDePasse -expirationTokenReset -tokenConfirmationEmail -expirationTokenConfirmation');
    
    if (!user) {
      logger.warn('Profil utilisateur non trouvé', { userId: req.user.userId });
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    res.json({
      success: true,
      user
    });
    
  } catch (error) {
    logger.error('Erreur obtention profil:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération du profil', { originalError: error.message }));
  }
};

// Rafraîchir token
const rafraichirToken = async (req, res, next) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token manquant'
      });
    }

    // Vérifier le refresh token
    let decoded;
    try {
      decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    } catch (jwtError) {
      logger.warn('Rafraîchissement token - Token invalide', { error: jwtError.message });
      return res.status(403).json({
        success: false,
        message: 'Refresh token invalide'
      });
    }

    const user = await User.findOne({ 
      _id: decoded.userId, 
      refreshToken 
    });

    if (!user) {
      logger.warn('Rafraîchissement token - Utilisateur non trouvé ou token révoqué', { userId: decoded.userId });
      return res.status(403).json({
        success: false,
        message: 'Refresh token invalide'
      });
    }

    // Vérifier le statut du compte
    const statutAutorise = user.peutSeConnecter();
    if (!statutAutorise.autorise) {
      return res.status(403).json({
        success: false,
        message: 'Compte non autorisé'
      });
    }

    // Générer un nouveau token d'accès
    const newAccessToken = jwt.sign(
      { userId: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: '15m' }
    );

    logger.info('Token rafraîchi avec succès', { userId: user._id });
    res.json({
      success: true,
      token: newAccessToken
    });
    
  } catch (error) {
    logger.error('Erreur rafraîchissement token:', error);
    
    if (error.name === 'TokenExpiredError') {
      return next(AppError.tokenExpired());
    }
    
    return next(AppError.serverError('Erreur serveur lors du rafraîchissement du token', { originalError: error.message }));
  }
};

// Mot de passe oublié
const motDePasseOublie = async (req, res, next) => {
  try {
    // ===== DEBUG : Afficher les informations de la requête =====
    console.log('=== DEBUG MOT DE PASSE OUBLIE ===');
    console.log('Headers:', JSON.stringify(req.headers, null, 2));
    console.log('Content-Type:', req.get('Content-Type'));
    console.log('Body (raw):', req.body);
    console.log('Body type:', typeof req.body);
    console.log('Body keys:', Object.keys(req.body));
    console.log('==============================');

    const { email } = req.body;

    // ===== DEBUG : Vérification de l'email =====
    console.log('Email reçu:', email);
    console.log('Type de email:', typeof email);

    if (!email) {
      return res.status(400).json({
        success: false,
        message: 'Email requis',
        debug: {
          receivedBody: req.body,
          emailValue: email,
          emailType: typeof email,
          contentType: req.get('Content-Type'),
          headers: req.headers
        }
      });
    }

    logger.info('Demande mot de passe oublié', { email });

    const user = await User.findOne({ email });
    if (!user) {
      // Ne pas révéler que l'email n'existe pas pour des raisons de sécurité
      logger.info('Demande réinitialisation - Email non trouvé (masqué)', { email });
      return res.json({
        success: true,
        message: 'Si un compte existe avec cet email, un lien de réinitialisation a été envoyé'
      });
    }

    // Générer un token de réinitialisation
    const resetToken = crypto.randomBytes(32).toString('hex');
    user.tokenResetMotDePasse = resetToken;
    user.expirationTokenReset = Date.now() + 3600000; // 1 heure
    await user.save();

    // Envoyer l'email
    const resetUrl = `${process.env.FRONTEND_URL}/reset-password?token=${resetToken}`;
    try {
    await sendEmail({
    to: user.email,
    subject: 'Réinitialisation de votre mot de passe',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; color: #333; border: 1px solid #ddd; border-radius: 10px; overflow: hidden;">
        <!-- En-tête violet -->
        <div style="background-color: #4B0082; color: white; padding: 20px; text-align: center;">
          <h2 style="margin: 0;">Covoiturage App</h2>
        </div>

        <!-- Contenu -->
        <div style="padding: 20px; background-color: #f9f9f9;">
          <h3 style="color: #4B0082;">Bonjour ${user.prenom},</h3>
          <p>Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le bouton ci-dessous pour procéder à la réinitialisation :</p>

          <!-- Bouton vert -->
          <div style="text-align: center; margin: 20px 0;">
            <a href="${resetUrl}"
               style="background-color: #4CAF50; color: white; padding: 12px 24px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">
              Réinitialiser mon mot de passe
            </a>
          </div>

          <p>Ce lien expirera dans <strong>1 heure</strong>.</p>
          <p style="color: #666; font-size: 14px;">Si vous n'avez pas demandé cette réinitialisation, vous pouvez ignorer cet email en toute sécurité.</p>
        </div>

        <!-- Pied de page -->
        <div style="background-color: #4B0082; color: white; padding: 10px; text-align: center; font-size: 12px;">
          <p style="margin: 0;">© 2025 Covoiturage App. Tous droits réservés.</p>
        </div>
      </div>
    `
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
    
    const user = await User.findOne({
      tokenResetMotDePasse: token,
      expirationTokenReset: { $gt: Date.now() }
    });

    if (!user) {
      logger.warn('Réinitialisation mot de passe - Token invalide ou expiré', { token });
      return res.status(400).json({
        success: false,
        message: 'Lien de réinitialisation invalide ou expiré'
      });
    }

    // Hacher le nouveau mot de passe
    const salt = await bcrypt.genSalt(10);
    user.motDePasse = await bcrypt.hash(password, salt);
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

// Demande de réinitialisation (alias pour motDePasseOublie)
const demandeReinitialisationMotDePasse = motDePasseOublie;

// Confirmer réinitialisation
const confirmerReinitialisationMotDePasse = async (req, res, next) => {
  try {
    const { token } = req.params;
    
    if (!token) {
      return res.status(400).json({
        success: false,
        message: 'Token manquant'
      });
    }
    
    const user = await User.findOne({
      tokenResetMotDePasse: token,
      expirationTokenReset: { $gt: Date.now() }
    });

    if (!user) {
      return res.status(400).json({
        success: false,
        message: 'Lien de réinitialisation invalide ou expiré'
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

module.exports = {
  inscription,
  connexion,
  connexionAdmin,
  deconnexion,
  verifierToken,
  obtenirUtilisateurConnecte,
  rafraichirToken,
  motDePasseOublie,
  reinitialiserMotDePasse,
  demandeReinitialisationMotDePasse,
  confirmerReinitialisationMotDePasse,
  confirmerEmail,
  renvoyerConfirmationEmail
};