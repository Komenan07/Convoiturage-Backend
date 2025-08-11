// controllers/authController.js
const User = require('../models/Utilisateur');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const sendEmail = require('../utils/emailService');
const logger = require('../utils/logger');

const inscription = async (req, res) => {
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

    // Créer un nouvel utilisateur
    const userData = {
      nom,
      prenom,
      email,
      motDePasse: hashedPassword,
      telephone,
      role: 'utilisateur',
      statutCompte: 'EN_ATTENTE_VERIFICATION' // Statut initial pour vérification
    };

    // Ajouter les champs optionnels s'ils sont fournis
    if (dateNaissance) userData.dateNaissance = dateNaissance;
    if (sexe) userData.sexe = sexe;
    if (adresse) userData.adresse = adresse;

    const newUser = new User(userData);

    // Sauvegarder l'utilisateur avec un délai d'attente augmenté
    await newUser.save({ maxTimeMS: 30000 });

    // Générer le token JWT
    const token = jwt.sign(
      { userId: newUser._id, role: newUser.role },
      process.env.JWT_SECRET,
      { expiresIn: '1h' }
    );

    logger.info('Inscription réussie', { userId: newUser._id });
    res.status(201).json({
      success: true,
      message: 'Compte créé avec succès',
      token,
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

    // Vérifiez si l'erreur est due à un délai d'attente
    if (error.name === 'MongoError' && error.message.includes('timed out')) {
      res.status(500).json({
        success: false,
        message: 'Délai d\'attente de la base de données dépassé',
        error: error.message
      });
    } else {
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de l\'inscription',
        error: error.message
      });
    }
  }
};

// Contrôleur de connexion
const connexion = async (req, res) => {
  try {
    logger.info('Tentative de connexion', { email: req.body.email });
    
    const { email, motDePasse } = req.body;

    // Vérifier l'utilisateur
    const user = await User.findOne({ email });
    if (!user) {
      logger.warn('Connexion échouée - Utilisateur non trouvé', { email });
      return res.status(401).json({
        success: false,
        message: 'Identifiants invalides',
        codeErreur: 'USER_NOT_FOUND'
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
      
      let message = 'Votre compte est temporairement indisponible.';
      let codeErreur = 'ACCOUNT_DISABLED';
      
      if (user.statutCompte === 'BLOQUE') {
        message = 'Votre compte a été définitivement bloqué. Contactez le support.';
        codeErreur = 'ACCOUNT_PERMANENTLY_BLOCKED';
      } else if (user.statutCompte === 'SUSPENDU') {
        message = 'Votre compte a été suspendu. Contactez le support.';
        codeErreur = 'ACCOUNT_SUSPENDED';
      } else if (user.statutCompte === 'EN_ATTENTE_VERIFICATION') {
        message = 'Votre compte est en attente de vérification.';
        codeErreur = 'ACCOUNT_PENDING_VERIFICATION';
      } else if (statutAutorise.raison === 'Compte temporairement bloqué') {
        message = `Votre compte est temporairement bloqué jusqu'à ${new Date(statutAutorise.deblocageA).toLocaleString()}.`;
        codeErreur = 'ACCOUNT_TEMPORARILY_BLOCKED';
      }
      
      return res.status(403).json({
        success: false,
        message,
        codeErreur,
        details: statutAutorise.raison
      });
    }

    // Vérifier le mot de passe
    const isMatch = await user.verifierMotDePasse(motDePasse);
    if (!isMatch) {
      // Incrémenter les tentatives échouées
      await user.incrementerTentativesEchouees();
      
      logger.warn('Connexion échouée - Mot de passe incorrect', { 
        email, 
        tentativesEchouees: user.tentativesConnexionEchouees 
      });
      
      return res.status(401).json({
        success: false,
        message: 'Identifiants invalides',
        codeErreur: 'INVALID_CREDENTIALS',
        tentativesRestantes: Math.max(0, 5 - user.tentativesConnexionEchouees)
      });
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
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la connexion'
    });
  }
};

// Contrôleur de connexion admin
const connexionAdmin = async (req, res) => {
  try {
    logger.info('Tentative de connexion admin', { email: req.body.email });
    
    const { email, motDePasse } = req.body;

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
        tentativesEchouees: user.tentativesConnexionEchouees 
      });
      
      return res.status(401).json({
        success: false,
        message: 'Identifiants invalides',
        codeErreur: 'INVALID_CREDENTIALS',
        tentativesRestantes: Math.max(0, 5 - user.tentativesConnexionEchouees)
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
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la connexion admin'
    });
  }
};

// Contrôleur de déconnexion
const deconnexion = async (req, res) => {
  try {
    const userId = req.user.userId;
    logger.info('Déconnexion utilisateur', { userId });
    
    // Supprimer le refresh token
    await User.findByIdAndUpdate(userId, { refreshToken: null });

    res.json({
      success: true,
      message: 'Déconnexion réussie'
    });
    
  } catch (error) {
    logger.error('Erreur déconnexion:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la déconnexion'
    });
  }
};

// Vérification de token
const verifierToken = async (req, res) => {
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
    res.status(401).json({
      success: false,
      message: 'Token invalide'
    });
  }
};

// Obtenir utilisateur connecté
const obtenirUtilisateurConnecte = async (req, res) => {
  try {
    const user = await User.findById(req.user.userId)
      .select('-motDePasse -refreshToken -tokenResetMotDePasse -expirationTokenReset');
    
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
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la récupération du profil'
    });
  }
};

// Rafraîchir token
const rafraichirToken = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    
    if (!refreshToken) {
      return res.status(400).json({
        success: false,
        message: 'Refresh token manquant'
      });
    }

    // Vérifier le refresh token
    const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
    const user = await User.findOne({ 
      _id: decoded.userId, 
      refreshToken 
    });

    if (!user) {
      logger.warn('Rafraîchissement token - Refresh token invalide', { userId: decoded.userId });
      return res.status(403).json({
        success: false,
        message: 'Refresh token invalide'
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
      return res.status(401).json({
        success: false,
        message: 'Refresh token expiré'
      });
    }
    
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors du rafraîchissement du token'
    });
  }
};

// Mot de passe oublié
const motDePasseOublie = async (req, res) => {
  try {
    const { email } = req.body;
    logger.info('Demande mot de passe oublié', { email });
    
    const user = await User.findOne({ email });
    if (!user) {
      // Ne pas révéler que l'email n'existe pas
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
    await sendEmail({
      to: user.email,
      subject: 'Réinitialisation de votre mot de passe',
      html: `
        <p>Bonjour ${user.prenom},</p>
        <p>Vous avez demandé à réinitialiser votre mot de passe. Cliquez sur le lien ci-dessous :</p>
        <p><a href="${resetUrl}">Réinitialiser mon mot de passe</a></p>
        <p>Ce lien expirera dans 1 heure.</p>
      `
    });

    logger.info('Email réinitialisation envoyé', { userId: user._id });
    res.json({
      success: true,
      message: 'Un lien de réinitialisation a été envoyé à votre email'
    });
    
  } catch (error) {
    logger.error('Erreur mot de passe oublié:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la demande de réinitialisation'
    });
  }
};

// Réinitialiser mot de passe
const reinitialiserMotDePasse = async (req, res) => {
  try {
    const { token } = req.params;
    const { password } = req.body;
    
    logger.info('Réinitialisation mot de passe', { token });
    
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
    
    await user.save();

    logger.info('Mot de passe réinitialisé avec succès', { userId: user._id });
    res.json({
      success: true,
      message: 'Mot de passe réinitialisé avec succès'
    });
    
  } catch (error) {
    logger.error('Erreur réinitialisation mot de passe:', error);
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la réinitialisation'
    });
  }
};

// Demande de réinitialisation (alias pour motDePasseOublie)
const demandeReinitialisationMotDePasse = motDePasseOublie;

// Confirmer réinitialisation
const confirmerReinitialisationMotDePasse = async (req, res) => {
  try {
    const { token } = req.params;
    
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
    res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de la confirmation'
    });
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
  confirmerReinitialisationMotDePasse
};
