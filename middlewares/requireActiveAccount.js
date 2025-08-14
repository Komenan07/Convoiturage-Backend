// middlewares/requireActiveAccount.js
const User = require('../models/Utilisateur');
const AppError = require('../utils/AppError');
const { securityLogger } = require('../utils/logger');

module.exports = async function requireActiveAccount(req, res, next) {
  try {
    const existingProfile = req.userProfile || req.utilisateur;
    let user = null;

    if (existingProfile && existingProfile._id) {
      user = existingProfile;
    } else if (req.user && req.user.id) {
      user = await User.findById(req.user.id);
    } else if (req.user && req.user.userId) {
      user = await User.findById(req.user.userId);
    }

    if (!user) {
      return next(AppError.userNotFound({ reason: 'PROFILE_MISSING' }));
    }

    const statut = user.statutCompte || user.statut;
    const autorisation = user.peutSeConnecter?.() ?? { autorise: statut === 'actif' || statut === 'ACTIF' };

    if (!autorisation.autorise) {
      const context = {
        userId: user._id,
        statut,
        raison: autorisation.raison,
        deblocageA: autorisation.deblocageA
      };

      // Log sécurité dédié
      securityLogger.warn('Blocage action - Compte non actif', {
        event: 'account_not_active',
        ...context,
        ip: req.ip,
        endpoint: `${req.method} ${req.originalUrl}`
      });

      return next(AppError.accountDisabled(context));
    }

    return next();
  } catch (err) {
    return next(AppError.serverError("Erreur de vérification du statut de compte", { originalError: err.message }));
  }
};


