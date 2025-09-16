// middleware/validation.js
// Middleware de validation complet pour l'application de covoiturage

const User = require('../models/Utilisateur');
const { logger } = require('../utils/logger');
const AppError = require('../utils/constants/errorConstants');
const validator = require('validator');
const mongoose = require('mongoose');

/**
 * Middleware de validation pour l'inscription utilisateur
 */
const validateUserRegistration = (req, res, next) => {
  try {
    const { 
      email, 
      telephone, 
      motDePasse, 
      confirmationMotDePasse,
      nom, 
      prenom, 
      dateNaissance,
      sexe,
      role,
      ville
    } = req.body;

    const errors = [];

    // Validation email
    if (!email) {
      errors.push('L\'email est requis');
    } else if (!validator.isEmail(email)) {
      errors.push('Format d\'email invalide');
    }

    // Validation téléphone (format ivoirien)
    if (!telephone) {
      errors.push('Le numéro de téléphone est requis');
    } else if (!/^(\+225)?[0-9]{8,10}$/.test(telephone.replace(/\s/g, ''))) {
      errors.push('Format de numéro de téléphone invalide (format ivoirien requis)');
    }

    // Validation mot de passe
    if (!motDePasse) {
      errors.push('Le mot de passe est requis');
    } else {
      if (motDePasse.length < 8) {
        errors.push('Le mot de passe doit contenir au moins 8 caractères');
      }
      if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(motDePasse)) {
        errors.push('Le mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre');
      }
    }

    // Validation confirmation mot de passe
    if (motDePasse !== confirmationMotDePasse) {
      errors.push('La confirmation du mot de passe ne correspond pas');
    }

    // Validation nom et prénom
    if (!nom || nom.trim().length < 2) {
      errors.push('Le nom doit contenir au moins 2 caractères');
    } else if (nom.length > 50) {
      errors.push('Le nom ne peut dépasser 50 caractères');
    }

    if (!prenom || prenom.trim().length < 2) {
      errors.push('Le prénom doit contenir au moins 2 caractères');
    } else if (prenom.length > 50) {
      errors.push('Le prénom ne peut dépasser 50 caractères');
    }

    // Validation date de naissance (optionnelle mais si fournie)
    if (dateNaissance) {
      const birthDate = new Date(dateNaissance);
      const age = (Date.now() - birthDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
      
      if (isNaN(birthDate.getTime())) {
        errors.push('Format de date de naissance invalide');
      } else if (age < 18) {
        errors.push('Vous devez avoir au moins 18 ans');
      } else if (age > 80) {
        errors.push('Âge maximum autorisé : 80 ans');
      }
    }

    // Validation sexe
    if (sexe && !['M', 'F'].includes(sexe)) {
      errors.push('Le sexe doit être M (Masculin) ou F (Féminin)');
    }

    // Validation rôle
    const rolesValides = ['conducteur', 'passager', 'les_deux'];
    if (!role) {
      errors.push('Le rôle est requis');
    } else if (!rolesValides.includes(role)) {
      errors.push('Rôle invalide (conducteur, passager, les_deux)');
    }

    // Validation ville
    if (!ville || ville.trim().length < 2) {
      errors.push('La ville est requise');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Données d\'inscription invalides',
        errors: errors
      });
    }

    // Nettoyer et formater les données
    req.body.email = email.toLowerCase().trim();
    req.body.telephone = telephone.replace(/\s/g, '');
    req.body.nom = nom.trim();
    req.body.prenom = prenom.trim();
    req.body.ville = ville.trim();

    next();

  } catch (error) {
    logger.error('Erreur validation inscription:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

/**
 * Middleware de validation pour la mise à jour du profil
 */
const validateProfileUpdate = (req, res, next) => {
  try {
    const { 
      nom, 
      prenom, 
      dateNaissance,
      sexe,
      photoProfil,
      ville,
      commune,
      quartier,
      coordonnees
    } = req.body;

    const errors = [];

    // Validation nom (si fourni)
    if (nom !== undefined) {
      if (!nom || nom.trim().length < 2) {
        errors.push('Le nom doit contenir au moins 2 caractères');
      } else if (nom.length > 50) {
        errors.push('Le nom ne peut dépasser 50 caractères');
      }
    }

    // Validation prénom (si fourni)
    if (prenom !== undefined) {
      if (!prenom || prenom.trim().length < 2) {
        errors.push('Le prénom doit contenir au moins 2 caractères');
      } else if (prenom.length > 50) {
        errors.push('Le prénom ne peut dépasser 50 caractères');
      }
    }

    // Validation date de naissance
    if (dateNaissance) {
      const birthDate = new Date(dateNaissance);
      const age = (Date.now() - birthDate.getTime()) / (1000 * 60 * 60 * 24 * 365);
      
      if (isNaN(birthDate.getTime())) {
        errors.push('Format de date de naissance invalide');
      } else if (age < 18 || age > 80) {
        errors.push('L\'âge doit être compris entre 18 et 80 ans');
      }
    }

    // Validation sexe
    if (sexe && !['M', 'F'].includes(sexe)) {
      errors.push('Le sexe doit être M ou F');
    }

    // Validation photo de profil (URL ou base64)
    if (photoProfil) {
      const isUrl = validator.isURL(photoProfil);
      const isBase64 = photoProfil.startsWith('data:image/');
      
      if (!isUrl && !isBase64) {
        errors.push('Format de photo de profil invalide');
      }
    }

    // Validation ville, commune, quartier
    if (ville !== undefined && (!ville || ville.trim().length < 2)) {
      errors.push('La ville doit contenir au moins 2 caractères');
    }

    if (commune !== undefined && commune && commune.trim().length < 2) {
      errors.push('La commune doit contenir au moins 2 caractères');
    }

    if (quartier !== undefined && quartier && quartier.trim().length < 2) {
      errors.push('Le quartier doit contenir au moins 2 caractères');
    }

    // Validation coordonnées
    if (coordonnees) {
      if (!Array.isArray(coordonnees) || coordonnees.length !== 2) {
        errors.push('Les coordonnées doivent être un tableau [longitude, latitude]');
      } else {
        const [lng, lat] = coordonnees;
        if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
          errors.push('Coordonnées géographiques invalides');
        }
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Données de profil invalides',
        errors: errors
      });
    }

    // Nettoyer les données d'adresse
    if (ville) req.body.ville = ville.trim();
    if (commune) req.body.commune = commune.trim();
    if (quartier) req.body.quartier = quartier.trim();

    next();

  } catch (error) {
    logger.error('Erreur validation profil:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

/**
 * Middleware de validation pour les véhicules (conducteurs)
 */
const validateVehicleData = (req, res, next) => {
  try {
    const { 
      marque, 
      modele, 
      couleur, 
      immatriculation,
      nombrePlaces,
      photoVehicule,
      assurance,
      visiteTechnique
    } = req.body;

    const errors = [];

    // Validation marque et modèle
    if (!marque || marque.trim().length < 2) {
      errors.push('La marque du véhicule est requise (minimum 2 caractères)');
    }

    if (!modele || modele.trim().length < 2) {
      errors.push('Le modèle du véhicule est requis (minimum 2 caractères)');
    }

    // Validation couleur
    if (!couleur || couleur.trim().length < 3) {
      errors.push('La couleur du véhicule est requise');
    }

    // Validation immatriculation (format ivoirien)
    if (!immatriculation) {
      errors.push('L\'immatriculation est requise');
    } else {
      // Format simplifié pour la Côte d'Ivoire
      const immatFormat = /^[0-9]{4}\s?[A-Z]{2}\s?[0-9]{2}$/;
      if (!immatFormat.test(immatriculation.toUpperCase())) {
        errors.push('Format d\'immatriculation invalide (ex: 1234 AB 01)');
      }
    }

    // Validation nombre de places
    if (!nombrePlaces || nombrePlaces < 1 || nombrePlaces > 8) {
      errors.push('Le nombre de places doit être entre 1 et 8');
    }

    // Validation photo véhicule
    if (photoVehicule) {
      const isUrl = validator.isURL(photoVehicule);
      const isBase64 = photoVehicule.startsWith('data:image/');
      
      if (!isUrl && !isBase64) {
        errors.push('Format de photo de véhicule invalide');
      }
    }

    // Validation assurance
    if (assurance) {
      if (assurance.numeroPolice && assurance.numeroPolice.length < 5) {
        errors.push('Numéro de police d\'assurance trop court');
      }
      
      if (assurance.dateExpiration) {
        const expDate = new Date(assurance.dateExpiration);
        if (expDate <= new Date()) {
          errors.push('L\'assurance ne doit pas être expirée');
        }
      }
    }

    // Validation visite technique
    if (visiteTechnique && visiteTechnique.dateExpiration) {
      const expDate = new Date(visiteTechnique.dateExpiration);
      if (expDate <= new Date()) {
        errors.push('La visite technique ne doit pas être expirée');
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Données de véhicule invalides',
        errors: errors
      });
    }

    // Nettoyer les données
    req.body.immatriculation = immatriculation.toUpperCase().replace(/\s/g, '');

    next();

  } catch (error) {
    logger.error('Erreur validation véhicule:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

/**
 * Validation des contacts d'urgence
 */
const validateEmergencyContacts = (req, res, next) => {
  try {
    const { contactsUrgence } = req.body;

    if (!contactsUrgence || !Array.isArray(contactsUrgence)) {
      return res.status(400).json({
        success: false,
        message: 'Les contacts d\'urgence doivent être un tableau'
      });
    }

    const errors = [];
    const relationsValides = ['FAMILLE', 'AMI', 'COLLEGUE'];

    contactsUrgence.forEach((contact, index) => {
      if (!contact.nom || contact.nom.trim().length < 2) {
        errors.push(`Contact ${index + 1}: Nom requis (minimum 2 caractères)`);
      }

      if (!contact.telephone || !/^(\+225)?[0-9]{8,10}$/.test(contact.telephone)) {
        errors.push(`Contact ${index + 1}: Numéro de téléphone invalide`);
      }

      if (!contact.relation || !relationsValides.includes(contact.relation)) {
        errors.push(`Contact ${index + 1}: Relation invalide (FAMILLE, AMI, COLLEGUE)`);
      }
    });

    if (contactsUrgence.length > 3) {
      errors.push('Maximum 3 contacts d\'urgence autorisés');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Contacts d\'urgence invalides',
        errors: errors
      });
    }

    next();

  } catch (error) {
    logger.error('Erreur validation contacts urgence:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

/**
 * Validation de recharge de compte covoiturage
 */
const validateAccountRecharge = (req, res, next) => {
  try {
    const { 
      montant, 
      methodePaiement, 
      numeroTelephone,
      referenceTransaction
    } = req.body;

    const errors = [];

    // Validation montant
    if (!montant || typeof montant !== 'number' || montant <= 0) {
      errors.push('Montant invalide');
    } else if (montant < 1000) {
      errors.push('Montant minimum de recharge : 1000 FCFA');
    } else if (montant > 1000000) {
      errors.push('Montant maximum de recharge : 1 000 000 FCFA');
    }

    // Validation méthode de paiement
    const methodesValides = ['wave', 'orange_money', 'mtn_money', 'moov_money'];
    if (!methodePaiement || !methodesValides.includes(methodePaiement)) {
      errors.push('Méthode de paiement invalide');
    }

    // Validation numéro de téléphone selon l'opérateur
    if (!numeroTelephone) {
      errors.push('Numéro de téléphone requis');
    } else {
      let formatValide = false;
      
      switch (methodePaiement) {
        case 'orange_money':
          formatValide = /^(\+225)?07[0-9]{8}$/.test(numeroTelephone);
          if (!formatValide) errors.push('Numéro Orange Money invalide (doit commencer par 07)');
          break;
        case 'mtn_money':
          formatValide = /^(\+225)?05[0-9]{8}$/.test(numeroTelephone);
          if (!formatValide) errors.push('Numéro MTN Money invalide (doit commencer par 05)');
          break;
        case 'moov_money':
          formatValide = /^(\+225)?01[0-9]{8}$/.test(numeroTelephone);
          if (!formatValide) errors.push('Numéro Moov Money invalide (doit commencer par 01)');
          break;
        case 'wave':
          formatValide = /^(\+225)?[0-9]{8,10}$/.test(numeroTelephone);
          if (!formatValide) errors.push('Numéro Wave invalide');
          break;
      }
    }

    // Validation référence transaction
    if (!referenceTransaction || referenceTransaction.length < 6) {
      errors.push('Référence de transaction invalide (minimum 6 caractères)');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Données de recharge invalides',
        errors: errors
      });
    }

    next();

  } catch (error) {
    logger.error('Erreur validation recharge:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

/**
 * Validation de configuration de retrait
 */
const validateWithdrawalConfig = (req, res, next) => {
  try {
    const { numeroMobile, operateur, nomTitulaire } = req.body;

    const errors = [];

    // Validation opérateur
    const operateursValides = ['ORANGE', 'MTN', 'MOOV'];
    if (!operateur || !operateursValides.includes(operateur)) {
      errors.push('Opérateur invalide (ORANGE, MTN, MOOV)');
    }

    // Validation numéro selon l'opérateur
    if (!numeroMobile) {
      errors.push('Numéro de téléphone requis');
    } else {
      let formatValide = false;
      
      switch (operateur) {
        case 'ORANGE':
          formatValide = /^(\+225)?07[0-9]{8}$/.test(numeroMobile);
          if (!formatValide) errors.push('Numéro Orange invalide (doit commencer par 07)');
          break;
        case 'MTN':
          formatValide = /^(\+225)?05[0-9]{8}$/.test(numeroMobile);
          if (!formatValide) errors.push('Numéro MTN invalide (doit commencer par 05)');
          break;
        case 'MOOV':
          formatValide = /^(\+225)?01[0-9]{8}$/.test(numeroMobile);
          if (!formatValide) errors.push('Numéro Moov invalide (doit commencer par 01)');
          break;
      }
    }

    // Validation nom titulaire
    if (!nomTitulaire || nomTitulaire.trim().length < 2) {
      errors.push('Nom du titulaire requis (minimum 2 caractères)');
    } else if (nomTitulaire.length > 100) {
      errors.push('Nom du titulaire trop long (maximum 100 caractères)');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Configuration de retrait invalide',
        errors: errors
      });
    }

    next();

  } catch (error) {
    logger.error('Erreur validation retrait:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

/**
 * Validation de configuration de recharge automatique
 */
const validateAutoRechargeConfig = (req, res, next) => {
  try {
    const { 
      seuilAutoRecharge, 
      montantAutoRecharge, 
      methodePaiementAuto 
    } = req.body;

    const errors = [];

    // Validation seuil
    if (seuilAutoRecharge !== undefined) {
      if (typeof seuilAutoRecharge !== 'number' || seuilAutoRecharge < 0) {
        errors.push('Seuil de recharge automatique invalide');
      } else if (seuilAutoRecharge > 100000) {
        errors.push('Seuil maximum : 100 000 FCFA');
      }
    }

    // Validation montant
    if (montantAutoRecharge !== undefined) {
      if (typeof montantAutoRecharge !== 'number' || montantAutoRecharge < 1000) {
        errors.push('Montant minimum de recharge automatique : 1000 FCFA');
      } else if (montantAutoRecharge > 500000) {
        errors.push('Montant maximum de recharge automatique : 500 000 FCFA');
      }
    }

    // Validation méthode de paiement
    if (methodePaiementAuto) {
      const methodesValides = ['wave', 'orange_money', 'mtn_money', 'moov_money'];
      if (!methodesValides.includes(methodePaiementAuto)) {
        errors.push('Méthode de paiement automatique invalide');
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Configuration de recharge automatique invalide',
        errors: errors
      });
    }

    next();

  } catch (error) {
    logger.error('Erreur validation recharge auto:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

/**
 * Validation des paramètres MongoDB ObjectId
 */
const validateObjectId = (paramName = 'id') => {
  return (req, res, next) => {
    try {
      const id = req.params[paramName];

      if (!id) {
        return res.status(400).json({
          success: false,
          message: `Paramètre ${paramName} requis`
        });
      }

      if (!mongoose.Types.ObjectId.isValid(id)) {
        return res.status(400).json({
          success: false,
          message: `ID ${paramName} invalide`
        });
      }

      next();

    } catch (error) {
      logger.error('Erreur validation ObjectId:', error);
      return next(AppError.serverError('Erreur de validation'));
    }
  };
};

/**
 * Validation des préférences utilisateur
 */
const validateUserPreferences = (req, res, next) => {
  try {
    const { 
      musique, 
      climatisation, 
      conversation, 
      languePreferee 
    } = req.body;

    const errors = [];

    // Validation conversation
    if (conversation) {
      const conversationsValides = ['BAVARD', 'CALME', 'NEUTRE'];
      if (!conversationsValides.includes(conversation)) {
        errors.push('Préférence de conversation invalide (BAVARD, CALME, NEUTRE)');
      }
    }

    // Validation langue
    if (languePreferee) {
      const languesValides = ['FR', 'ANG'];
      if (!languesValides.includes(languePreferee)) {
        errors.push('Langue préférée invalide (FR, ANG)');
      }
    }

    // Validation booléens
    if (musique !== undefined && typeof musique !== 'boolean') {
      errors.push('Préférence musique doit être true ou false');
    }

    if (climatisation !== undefined && typeof climatisation !== 'boolean') {
      errors.push('Préférence climatisation doit être true ou false');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Préférences invalides',
        errors: errors
      });
    }

    next();

  } catch (error) {
    logger.error('Erreur validation préférences:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

/**
 * Middleware de vérification d'unicité email/téléphone
 */
const checkEmailPhoneUniqueness = async (req, res, next) => {
  try {
    const { email, telephone } = req.body;
    const userId = req.user?.userId; // Pour les mises à jour

    const errors = [];

    // Vérifier email
    if (email) {
      const emailQuery = { email: email.toLowerCase() };
      if (userId) emailQuery._id = { $ne: userId };

      const existingEmail = await User.findOne(emailQuery);
      if (existingEmail) {
        errors.push('Cette adresse email est déjà utilisée');
      }
    }

    // Vérifier téléphone
    if (telephone) {
      const phoneQuery = { telephone };
      if (userId) phoneQuery._id = { $ne: userId };

      const existingPhone = await User.findOne(phoneQuery);
      if (existingPhone) {
        errors.push('Ce numéro de téléphone est déjà utilisé');
      }
    }

    if (errors.length > 0) {
      return res.status(409).json({
        success: false,
        message: 'Conflit de données',
        errors: errors
      });
    }

    next();

  } catch (error) {
    logger.error('Erreur vérification unicité:', error);
    return next(AppError.serverError('Erreur de vérification'));
  }
};

/**
 * Validation des limites de requête (pagination)
 */
const validatePagination = (req, res, next) => {
  try {
    let { page = 1, limit = 10, sort } = req.query;

    // Conversion et validation page
    page = parseInt(page);
    if (isNaN(page) || page < 1) {
      page = 1;
    } else if (page > 1000) {
      page = 1000; // Limite maximum
    }

    // Conversion et validation limit
    limit = parseInt(limit);
    if (isNaN(limit) || limit < 1) {
      limit = 10;
    } else if (limit > 100) {
      limit = 100; // Limite maximum
    }

    // Validation sort
    if (sort) {
      const sortFields = sort.split(',');
      const validSortFields = [
        'nom', 'prenom', 'dateInscription', 'derniereConnexion',
        'scoreConfiance', 'noteGenerale', 'nombreTrajetsEffectues',
        'compteCovoiturage.solde', 'compteCovoiturage.totalGagnes'
      ];
      
      for (const field of sortFields) {
        const fieldName = field.replace(/^-/, '');
        if (!validSortFields.includes(fieldName)) {
          return res.status(400).json({
            success: false,
            message: `Champ de tri invalide: ${fieldName}`,
            champsValides: validSortFields
          });
        }
      }
    }

    // Ajouter à req pour utilisation dans les contrôleurs
    req.pagination = { page, limit, sort };

    next();

  } catch (error) {
    logger.error('Erreur validation pagination:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

/**
 * Validation générique des paramètres de requête
 */
const validateQueryParams = (allowedParams = []) => {
  return (req, res, next) => {
    try {
      const queryKeys = Object.keys(req.query);
      const commonParams = ['page', 'limit', 'sort', 'search'];
      const allAllowed = [...allowedParams, ...commonParams];

      const invalidParams = queryKeys.filter(key => !allAllowed.includes(key));

      if (invalidParams.length > 0) {
        return res.status(400).json({
          success: false,
          message: 'Paramètres de requête invalides',
          parametresInvalides: invalidParams,
          parametresAutorises: allAllowed
        });
      }

      next();

    } catch (error) {
      logger.error('Erreur validation paramètres:', error);
      return next(AppError.serverError('Erreur de validation'));
    }
  };
};

/**
 * Validation de changement de mot de passe
 */
const validatePasswordChange = (req, res, next) => {
  try {
    const { 
      motDePasseActuel, 
      nouveauMotDePasse, 
      confirmationNouveauMotDePasse 
    } = req.body;

    const errors = [];

    // Validation mot de passe actuel
    if (!motDePasseActuel) {
      errors.push('Mot de passe actuel requis');
    }

    // Validation nouveau mot de passe
    if (!nouveauMotDePasse) {
      errors.push('Nouveau mot de passe requis');
    } else {
      if (nouveauMotDePasse.length < 8) {
        errors.push('Le nouveau mot de passe doit contenir au moins 8 caractères');
      }
      if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(nouveauMotDePasse)) {
        errors.push('Le nouveau mot de passe doit contenir au moins une majuscule, une minuscule et un chiffre');
      }
      if (nouveauMotDePasse === motDePasseActuel) {
        errors.push('Le nouveau mot de passe doit être différent de l\'ancien');
      }
    }

    // Validation confirmation
    if (nouveauMotDePasse !== confirmationNouveauMotDePasse) {
      errors.push('La confirmation du nouveau mot de passe ne correspond pas');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Données de changement de mot de passe invalides',
        errors: errors
      });
    }

    next();

  } catch (error) {
    logger.error('Erreur validation changement mot de passe:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

module.exports = {
  validateUserRegistration,
  validateProfileUpdate,
  validateVehicleData,
  validateEmergencyContacts,
  validateAccountRecharge,
  validateWithdrawalConfig,
  validateAutoRechargeConfig,
  validateObjectId,
  validateUserPreferences,
  checkEmailPhoneUniqueness,
  validatePagination,
  validateQueryParams,
  validatePasswordChange
};