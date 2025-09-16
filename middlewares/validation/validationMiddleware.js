// middleware/validationMiddleware.js
// Middleware de validation métier pour l'application de covoiturage WAYZ-ECO

const User = require('../../models/Utilisateur');
const { logger } = require('../../utils/logger');
const AppError = require('../../utils/constants/errorConstants');
const validator = require('validator');
const mongoose = require('mongoose');

/**
 * Validation des trajets (pour conducteurs)
 */
const validateTripCreation = async (req, res, next) => {
  try {
    const {
      pointDepart,
      pointArrivee,
      dateDepart,
      heureDepart,
      nombrePlacesDisponibles,
      prixParPlace,
      detourMaximum,
      modePaiement,
      commentaires,
      arrets
    } = req.body;

    const errors = [];
    const userId = req.user.userId;

    // Vérifier que l'utilisateur peut créer des trajets
    const user = await User.findById(userId).select('role vehicule compteCovoiturage statutCompte documentIdentite');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Vérification du rôle
    if (!['conducteur', 'les_deux'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Seuls les conducteurs peuvent créer des trajets',
        code: 'ROLE_INSUFFICIENT'
      });
    }

    // Vérification du statut du compte
    if (user.statutCompte !== 'ACTIF') {
      return res.status(403).json({
        success: false,
        message: 'Compte non actif - création de trajet impossible',
        code: 'ACCOUNT_INACTIVE'
      });
    }

    // Vérification du véhicule
    if (!user.vehicule || !user.vehicule.immatriculation) {
      return res.status(400).json({
        success: false,
        message: 'Véhicule non enregistré - veuillez ajouter votre véhicule',
        code: 'VEHICLE_REQUIRED'
      });
    }

    // Validation point de départ
    if (!pointDepart || !pointDepart.nom || !pointDepart.coordonnees) {
      errors.push('Point de départ invalide (nom et coordonnées requis)');
    } else {
      if (!Array.isArray(pointDepart.coordonnees) || pointDepart.coordonnees.length !== 2) {
        errors.push('Coordonnées du point de départ invalides');
      }
    }

    // Validation point d'arrivée
    if (!pointArrivee || !pointArrivee.nom || !pointArrivee.coordonnees) {
      errors.push('Point d\'arrivée invalide (nom et coordonnées requis)');
    } else {
      if (!Array.isArray(pointArrivee.coordonnees) || pointArrivee.coordonnees.length !== 2) {
        errors.push('Coordonnées du point d\'arrivée invalides');
      }
    }

    // Vérifier que départ et arrivée sont différents
    if (pointDepart && pointArrivee && pointDepart.nom === pointArrivee.nom) {
      errors.push('Le point de départ et d\'arrivée doivent être différents');
    }

    // Validation date et heure
    const dateTimeDepart = new Date(`${dateDepart}T${heureDepart}`);
    const maintenant = new Date();
    
    if (!dateDepart || !heureDepart) {
      errors.push('Date et heure de départ requises');
    } else if (dateTimeDepart <= maintenant) {
      errors.push('Le trajet doit être programmé dans le futur');
    } else if (dateTimeDepart > new Date(Date.now() + 90 * 24 * 60 * 60 * 1000)) {
      errors.push('Maximum 90 jours à l\'avance');
    }

    // Validation nombre de places
    if (!nombrePlacesDisponibles || nombrePlacesDisponibles < 1) {
      errors.push('Nombre de places invalide (minimum 1)');
    } else if (user.vehicule.nombrePlaces && nombrePlacesDisponibles > user.vehicule.nombrePlaces - 1) {
      errors.push(`Maximum ${user.vehicule.nombrePlaces - 1} places disponibles (conducteur exclu)`);
    }

    // Validation prix
    if (!prixParPlace || prixParPlace < 100) {
      errors.push('Prix minimum par place : 100 FCFA');
    } else if (prixParPlace > 50000) {
      errors.push('Prix maximum par place : 50 000 FCFA');
    }

    // Validation détour maximum
    if (detourMaximum !== undefined && (detourMaximum < 0 || detourMaximum > 50)) {
      errors.push('Détour maximum entre 0 et 50 km');
    }

    // Validation mode de paiement selon le type de compte
    const modesValides = ['especes', 'wave', 'orange_money', 'mtn_money', 'moov_money'];
    if (!modePaiement || !Array.isArray(modePaiement) || modePaiement.length === 0) {
      errors.push('Au moins un mode de paiement requis');
    } else {
      const modesInvalides = modePaiement.filter(mode => !modesValides.includes(mode));
      if (modesInvalides.length > 0) {
        errors.push(`Modes de paiement invalides: ${modesInvalides.join(', ')}`);
      }

      // Règles selon le type de compte
      if (!user.compteCovoiturage.estRecharge && modePaiement.includes('especes')) {
        errors.push('Paiement en espèces non autorisé pour les comptes non rechargés');
      }
    }

    // Validation commentaires
    if (commentaires && commentaires.length > 500) {
      errors.push('Commentaires maximum 500 caractères');
    }

    // Validation arrêts intermédiaires
    if (arrets && Array.isArray(arrets)) {
      if (arrets.length > 5) {
        errors.push('Maximum 5 arrêts intermédiaires');
      }
      
      arrets.forEach((arret, index) => {
        if (!arret.nom || !arret.coordonnees) {
          errors.push(`Arrêt ${index + 1}: nom et coordonnées requis`);
        }
        if (!Array.isArray(arret.coordonnees) || arret.coordonnees.length !== 2) {
          errors.push(`Arrêt ${index + 1}: coordonnées invalides`);
        }
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Données de trajet invalides',
        errors: errors
      });
    }

    // Ajouter les infos utilisateur pour les contrôleurs suivants
    req.userInfo = {
      canAcceptCash: user.compteCovoiturage.estRecharge,
      vehicleInfo: user.vehicule,
      accountType: user.compteCovoiturage.estRecharge ? 'RECHARGED' : 'MOBILE_ONLY'
    };

    next();

  } catch (error) {
    logger.error('Erreur validation création trajet:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

/**
 * Validation des réservations (pour passagers)
 */
const validateReservation = async (req, res, next) => {
  try {
    const {
      trajetId,
      nombrePlaces,
      pointPriseEnCharge,
      pointDepose,
      modePaiement,
      messageAuConducteur
    } = req.body;

    const errors = [];
    const userId = req.user.userId;

    // Vérifier l'utilisateur
    const user = await User.findById(userId).select('statutCompte documentIdentite scoreConfiance');
    
    if (!user || user.statutCompte !== 'ACTIF') {
      return res.status(403).json({
        success: false,
        message: 'Compte non autorisé pour les réservations'
      });
    }

    // Validation trajetId
    if (!trajetId || !mongoose.Types.ObjectId.isValid(trajetId)) {
      errors.push('ID de trajet invalide');
    }

    // Validation nombre de places
    if (!nombrePlaces || nombrePlaces < 1 || nombrePlaces > 4) {
      errors.push('Nombre de places invalide (entre 1 et 4)');
    }

    // Validation points de prise en charge et dépose
    if (pointPriseEnCharge) {
      if (!pointPriseEnCharge.nom || !Array.isArray(pointPriseEnCharge.coordonnees)) {
        errors.push('Point de prise en charge invalide');
      }
    }

    if (pointDepose) {
      if (!pointDepose.nom || !Array.isArray(pointDepose.coordonnees)) {
        errors.push('Point de dépose invalide');
      }
    }

    // Validation mode de paiement
    const modesValides = ['especes', 'wave', 'orange_money', 'mtn_money', 'moov_money'];
    if (!modePaiement || !modesValides.includes(modePaiement)) {
      errors.push('Mode de paiement invalide');
    }

    // Validation message
    if (messageAuConducteur && messageAuConducteur.length > 200) {
      errors.push('Message au conducteur maximum 200 caractères');
    }

    // Vérifications de sécurité selon le score de confiance
    if (user.scoreConfiance < 30) {
      errors.push('Score de confiance insuffisant - complétez votre profil');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Données de réservation invalides',
        errors: errors
      });
    }

    next();

  } catch (error) {
    logger.error('Erreur validation réservation:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

/**
 * Validation des évaluations et avis
 */
const validateRating = (req, res, next) => {
  try {
    const {
      note,
      commentaire,
      trajetId,
      utilisateurEvalueId,
      categories
    } = req.body;

    const errors = [];

    // Validation note
    if (!note || typeof note !== 'number' || note < 1 || note > 5) {
      errors.push('Note invalide (entre 1 et 5)');
    }

    // Validation IDs
    if (!trajetId || !mongoose.Types.ObjectId.isValid(trajetId)) {
      errors.push('ID de trajet invalide');
    }

    if (!utilisateurEvalueId || !mongoose.Types.ObjectId.isValid(utilisateurEvalueId)) {
      errors.push('ID utilisateur évalué invalide');
    }

    // Éviter l'auto-évaluation
    if (utilisateurEvalueId === req.user.userId) {
      errors.push('Impossible de s\'évaluer soi-même');
    }

    // Validation commentaire
    if (commentaire) {
      if (commentaire.length < 10) {
        errors.push('Commentaire minimum 10 caractères');
      } else if (commentaire.length > 500) {
        errors.push('Commentaire maximum 500 caractères');
      }
      
      // Détection de contenu inapproprié basique
      const motsInterdits = ['con', 'idiot', 'imbecile', 'stupide'];
      const contientMotsInterdits = motsInterdits.some(mot => 
        commentaire.toLowerCase().includes(mot)
      );
      
      if (contientMotsInterdits) {
        errors.push('Commentaire contient du contenu inapproprié');
      }
    }

    // Validation catégories d'évaluation
    if (categories) {
      const categoriesValides = [
        'ponctualite', 'proprete', 'conduite', 
        'communication', 'respect', 'amabilite'
      ];
      
      Object.keys(categories).forEach(cat => {
        if (!categoriesValides.includes(cat)) {
          errors.push(`Catégorie d'évaluation invalide: ${cat}`);
        } else if (categories[cat] < 1 || categories[cat] > 5) {
          errors.push(`Note de catégorie ${cat} invalide (entre 1 et 5)`);
        }
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Données d\'évaluation invalides',
        errors: errors
      });
    }

    next();

  } catch (error) {
    logger.error('Erreur validation évaluation:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

/**
 * Validation de recherche de trajets
 */
const validateTripSearch = (req, res, next) => {
  try {
    const {
      pointDepart,
      pointArrivee,
      dateDepart,
      nombrePlaces,
      prixMaximum,
      rayonRecherche,
      modePaiement
    } = req.query;

    const errors = [];

    // Validation points géographiques
    if (pointDepart) {
      try {
        const coordsDepart = JSON.parse(pointDepart);
        if (!Array.isArray(coordsDepart) || coordsDepart.length !== 2) {
          errors.push('Coordonnées point de départ invalides');
        }
      } catch {
        errors.push('Format coordonnées point de départ invalide');
      }
    }

    if (pointArrivee) {
      try {
        const coordsArrivee = JSON.parse(pointArrivee);
        if (!Array.isArray(coordsArrivee) || coordsArrivee.length !== 2) {
          errors.push('Coordonnées point d\'arrivée invalides');
        }
      } catch {
        errors.push('Format coordonnées point d\'arrivée invalide');
      }
    }

    // Validation date
    if (dateDepart) {
      const searchDate = new Date(dateDepart);
      if (isNaN(searchDate.getTime()) || searchDate < new Date()) {
        errors.push('Date de recherche invalide');
      }
    }

    // Validation nombre de places
    if (nombrePlaces && (parseInt(nombrePlaces) < 1 || parseInt(nombrePlaces) > 8)) {
      errors.push('Nombre de places recherché invalide (1-8)');
    }

    // Validation prix maximum
    if (prixMaximum && (parseInt(prixMaximum) < 100 || parseInt(prixMaximum) > 100000)) {
      errors.push('Prix maximum invalide (100-100000 FCFA)');
    }

    // Validation rayon de recherche
    if (rayonRecherche && (parseInt(rayonRecherche) < 1 || parseInt(rayonRecherche) > 100)) {
      errors.push('Rayon de recherche invalide (1-100 km)');
    }

    // Validation mode de paiement
    if (modePaiement) {
      const modesValides = ['especes', 'wave', 'orange_money', 'mtn_money', 'moov_money'];
      if (!modesValides.includes(modePaiement)) {
        errors.push('Mode de paiement recherché invalide');
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Paramètres de recherche invalides',
        errors: errors
      });
    }

    next();

  } catch (error) {
    logger.error('Erreur validation recherche:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

/**
 * Validation des réclamations et signalements
 */
const validateComplaint = (req, res, next) => {
  try {
    const {
      type,
      description,
      trajetId,
      utilisateurSignaleId,
      gravite,
      preuves
    } = req.body;

    const errors = [];

    // Validation type de réclamation
    const typesValides = [
      'CONDUITE_DANGEREUSE',
      'RETARD_EXCESSIF',
      'ANNULATION_ABUSIVE',
      'COMPORTEMENT_INAPPROPRIE',
      'VEHICULE_NON_CONFORME',
      'FRAUDE_PAIEMENT',
      'HARCELEMENT',
      'DISCRIMINATION',
      'AUTRE'
    ];

    if (!type || !typesValides.includes(type)) {
      errors.push('Type de réclamation invalide');
    }

    // Validation description
    if (!description || description.length < 20) {
      errors.push('Description minimum 20 caractères');
    } else if (description.length > 1000) {
      errors.push('Description maximum 1000 caractères');
    }

    // Validation IDs
    if (!trajetId || !mongoose.Types.ObjectId.isValid(trajetId)) {
      errors.push('ID de trajet invalide');
    }

    if (!utilisateurSignaleId || !mongoose.Types.ObjectId.isValid(utilisateurSignaleId)) {
      errors.push('ID utilisateur signalé invalide');
    }

    // Éviter l'auto-signalement
    if (utilisateurSignaleId === req.user.userId) {
      errors.push('Impossible de se signaler soi-même');
    }

    // Validation gravité
    const gravitesValides = ['FAIBLE', 'MOYENNE', 'ELEVEE', 'CRITIQUE'];
    if (!gravite || !gravitesValides.includes(gravite)) {
      errors.push('Niveau de gravité invalide');
    }

    // Validation preuves (URLs ou base64)
    if (preuves && Array.isArray(preuves)) {
      if (preuves.length > 5) {
        errors.push('Maximum 5 preuves autorisées');
      }

      preuves.forEach((preuve, index) => {
        const isUrl = validator.isURL(preuve);
        const isBase64 = preuve.startsWith('data:');
        
        if (!isUrl && !isBase64) {
          errors.push(`Preuve ${index + 1}: format invalide`);
        }
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Données de réclamation invalides',
        errors: errors
      });
    }

    next();

  } catch (error) {
    logger.error('Erreur validation réclamation:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

/**
 * Validation des messages de discussion
 */
const validateMessage = (req, res, next) => {
  try {
    const {
      contenu,
      destinataireId,
      trajetId,
      typeMessage
    } = req.body;

    const errors = [];

    // Validation contenu
    if (!contenu || contenu.trim().length < 1) {
      errors.push('Contenu du message requis');
    } else if (contenu.length > 500) {
      errors.push('Message maximum 500 caractères');
    }

    // Filtre anti-spam et contenu inapproprié
    const spamPatterns = [
      /(.)\1{10,}/i, // Répétition excessive
      /(https?:\/\/[^\s]+)/gi, // URLs
      /(\d{10,})/g // Numéros longs (potentiels téléphones)
    ];

    if (spamPatterns.some(pattern => pattern.test(contenu))) {
      errors.push('Message contient du contenu suspect (URLs, répétitions, etc.)');
    }

    // Validation destinataire
    if (!destinataireId || !mongoose.Types.ObjectId.isValid(destinataireId)) {
      errors.push('Destinataire invalide');
    }

    // Éviter les messages à soi-même
    if (destinataireId === req.user.userId) {
      errors.push('Impossible de s\'envoyer un message à soi-même');
    }

    // Validation trajetId si fourni
    if (trajetId && !mongoose.Types.ObjectId.isValid(trajetId)) {
      errors.push('ID de trajet invalide');
    }

    // Validation type de message
    const typesValides = ['PRIVE', 'TRAJET', 'SYSTEME'];
    if (typeMessage && !typesValides.includes(typeMessage)) {
      errors.push('Type de message invalide');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Données de message invalides',
        errors: errors
      });
    }

    next();

  } catch (error) {
    logger.error('Erreur validation message:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

/**
 * Validation des paramètres de notification
 */
const validateNotificationSettings = (req, res, next) => {
  try {
    const {
      email,
      push,
      sms,
      types
    } = req.body;

    const errors = [];

    // Validation des canaux de notification
    if (email !== undefined && typeof email !== 'boolean') {
      errors.push('Paramètre email doit être true ou false');
    }

    if (push !== undefined && typeof push !== 'boolean') {
      errors.push('Paramètre push doit être true ou false');
    }

    if (sms !== undefined && typeof sms !== 'boolean') {
      errors.push('Paramètre SMS doit être true ou false');
    }

    // Validation des types de notifications
    if (types && typeof types === 'object') {
      const typesValides = [
        'nouvelle_reservation',
        'annulation_trajet',
        'confirmation_reservation',
        'rappel_trajet',
        'evaluation_recue',
        'message_recu',
        'modification_trajet',
        'paiement_recu',
        'promotion',
        'securite'
      ];

      Object.keys(types).forEach(type => {
        if (!typesValides.includes(type)) {
          errors.push(`Type de notification invalide: ${type}`);
        } else if (typeof types[type] !== 'boolean') {
          errors.push(`Valeur pour ${type} doit être true ou false`);
        }
      });
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Paramètres de notification invalides',
        errors: errors
      });
    }

    next();

  } catch (error) {
    logger.error('Erreur validation notifications:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

/**
 * Validation des coordonnées GPS en temps réel
 */
const validateLocationUpdate = (req, res, next) => {
  try {
    const {
      latitude,
      longitude,
      precision,
      vitesse,
      trajetId
    } = req.body;

    const errors = [];

    // Validation coordonnées
    if (latitude === undefined || longitude === undefined) {
      errors.push('Latitude et longitude requises');
    } else {
      if (typeof latitude !== 'number' || latitude < -90 || latitude > 90) {
        errors.push('Latitude invalide (-90 à 90)');
      }
      if (typeof longitude !== 'number' || longitude < -180 || longitude > 180) {
        errors.push('Longitude invalide (-180 à 180)');
      }
    }

    // Validation précision GPS
    if (precision !== undefined && (typeof precision !== 'number' || precision < 0)) {
      errors.push('Précision GPS invalide');
    }

    // Validation vitesse
    if (vitesse !== undefined && (typeof vitesse !== 'number' || vitesse < 0 || vitesse > 200)) {
      errors.push('Vitesse invalide (0-200 km/h)');
    }

    // Validation trajetId
    if (trajetId && !mongoose.Types.ObjectId.isValid(trajetId)) {
      errors.push('ID de trajet invalide');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Données de localisation invalides',
        errors: errors
      });
    }

    next();

  } catch (error) {
    logger.error('Erreur validation localisation:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

module.exports = {
  validateTripCreation,
  validateReservation,
  validateRating,
  validateTripSearch,
  validateComplaint,
  validateMessage,
  validateNotificationSettings,
  validateLocationUpdate
};