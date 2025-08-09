const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const Utilisateur = require('../models/Utilisateur');
const Administrateur = require('../models/Administrateur');

/**
 * Middleware d'authentification principal (alias: auth)
 */
const auth = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Token d\'authentification requis'
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    
    const user = await Utilisateur.findById(decoded.id).select('-motDePasse');
    if (!user) {
      return res.status(401).json({
        success: false,
        message: 'Token invalide - utilisateur introuvable'
      });
    }

    if (user.statutCompte === 'SUSPENDU') {
      return res.status(403).json({
        success: false,
        message: 'Compte suspendu. Contactez l\'assistance.'
      });
    }

    if (user.statutCompte === 'BLOQUE') {
      return res.status(403).json({
        success: false,
        message: 'Compte bloqué définitivement.'
      });
    }

    await Utilisateur.findByIdAndUpdate(user._id, {
      derniereConnexion: new Date()
    });

    req.user = user;
    req.userId = user._id;
    next();

  } catch (error) {
    console.error('Erreur d\'authentification:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token invalide'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Token expiré'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'authentification'
    });
  }
};

/**
 * Middleware d'authentification pour les administrateurs
 */
const admin = async (req, res, next) => {
  try {
    const authHeader = req.header('Authorization');
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        success: false,
        message: 'Token d\'authentification administrateur requis'
      });
    }

    const token = authHeader.replace('Bearer ', '');
    const decoded = jwt.verify(token, process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET);
    
    const adminUser = await Administrateur.findById(decoded.id).select('-motDePasse');
    if (!adminUser) {
      return res.status(401).json({
        success: false,
        message: 'Token administrateur invalide'
      });
    }

    if (adminUser.statutCompte === 'SUSPENDU') {
      return res.status(403).json({
        success: false,
        message: 'Compte administrateur suspendu'
      });
    }

    await Administrateur.findByIdAndUpdate(adminUser._id, {
      derniereConnexion: new Date()
    });

    req.admin = adminUser;
    req.adminId = adminUser._id;
    next();

  } catch (error) {
    console.error('Erreur d\'authentification admin:', error);
    
    if (error.name === 'JsonWebTokenError') {
      return res.status(401).json({
        success: false,
        message: 'Token administrateur invalide'
      });
    }

    if (error.name === 'TokenExpiredError') {
      return res.status(401).json({
        success: false,
        message: 'Session administrateur expirée'
      });
    }

    return res.status(500).json({
      success: false,
      message: 'Erreur serveur lors de l\'authentification administrateur'
    });
  }
};

// Export des fonctions principales
module.exports = auth;
module.exports.auth = auth;
module.exports.admin = admin;

// Export des utilitaires
module.exports.generateToken = (userId, options = {}) => {
  const payload = { id: userId, type: 'user' };
  const defaultOptions = { expiresIn: process.env.JWT_EXPIRE || '24h' };
  return jwt.sign(payload, process.env.JWT_SECRET, { ...defaultOptions, ...options });
};

module.exports.generateAdminToken = (adminId, options = {}) => {
  const payload = { id: adminId, type: 'admin' };
  const defaultOptions = { expiresIn: process.env.JWT_ADMIN_EXPIRE || '8h' };
  return jwt.sign(payload, process.env.JWT_ADMIN_SECRET || process.env.JWT_SECRET, { ...defaultOptions, ...options });
};

module.exports.hashPassword = async (password) => {
  const saltRounds = parseInt(process.env.BCRYPT_ROUNDS) || 12;
  return await bcrypt.hash(password, saltRounds);
};

module.exports.comparePassword = async (password, hash) => {
  return await bcrypt.compare(password, hash);
};