// middleware/trajetValidation.js
// Middleware de validation complet pour les trajets de covoiturage WAYZ-ECO

const User = require('../../models/Utilisateur');
const Trajet = require('../../models/Trajet');
const { logger } = require('../../utils/logger');
const AppError = require('../../utils/constants/errorConstants');
const mongoose = require('mongoose');

/**
 * Validation complète pour la création d'un trajet
 */
const validateTripCreation = async (req, res, next) => {
  try {
    const {
      pointDepart,
      pointArrivee,
      arretsIntermediaires,
      dateDepart,
      heureDepart,
      heureArriveePrevue,
      dureeEstimee,
      distance,
      prixParPassager,
      nombrePlacesTotal,
      nombrePlacesDisponibles,
      typeTrajet,
      recurrence,
      modesPaiementAcceptes,
      preferences,
      commentaireConducteur,
      vehiculeId
    } = req.body;

    const errors = [];
    const userId = req.user.userId;

    // 1. Vérifications préliminaires de l'utilisateur
    const user = await User.findById(userId)
      .select('role vehicule compteCovoiturage statutCompte documentIdentite scoreConfiance');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Vérification du rôle conducteur
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

    // Vérification de la vérification d'identité
    if (!user.documentIdentite || user.documentIdentite.statutVerification !== 'VERIFIE') {
      return res.status(403).json({
        success: false,
        message: 'Vérification d\'identité requise pour créer des trajets',
        code: 'VERIFICATION_REQUIRED'
      });
    }

    // Score de confiance minimum
    if (user.scoreConfiance < 40) {
      return res.status(403).json({
        success: false,
        message: 'Score de confiance insuffisant (minimum 40)',
        code: 'TRUST_SCORE_LOW',
        scoreActuel: user.scoreConfiance
      });
    }

    // 2. Validation du véhicule
    if (!vehiculeId || !mongoose.Types.ObjectId.isValid(vehiculeId)) {
      errors.push('ID véhicule invalide');
    }

    // 3. Validation des points géographiques
    if (!pointDepart) {
      errors.push('Point de départ requis');
    } else {
      if (!pointDepart.nom || pointDepart.nom.trim().length < 3) {
        errors.push('Nom du point de départ invalide (minimum 3 caractères)');
      }
      if (!pointDepart.adresse || pointDepart.adresse.trim().length < 10) {
        errors.push('Adresse du point de départ invalide (minimum 10 caractères)');
      }
      if (!pointDepart.commune || pointDepart.commune.trim().length < 2) {
        errors.push('Commune du point de départ requise');
      }
      if (!pointDepart.quartier || pointDepart.quartier.trim().length < 2) {
        errors.push('Quartier du point de départ requis');
      }
      if (!pointDepart.coordonnees || !pointDepart.coordonnees.coordinates || 
          !Array.isArray(pointDepart.coordonnees.coordinates) || 
          pointDepart.coordonnees.coordinates.length !== 2) {
        errors.push('Coordonnées du point de départ invalides');
      } else {
        const [lng, lat] = pointDepart.coordonnees.coordinates;
        if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
          errors.push('Coordonnées du point de départ hors limites');
        }
      }
    }

    if (!pointArrivee) {
      errors.push('Point d\'arrivée requis');
    } else {
      if (!pointArrivee.nom || pointArrivee.nom.trim().length < 3) {
        errors.push('Nom du point d\'arrivée invalide (minimum 3 caractères)');
      }
      if (!pointArrivee.adresse || pointArrivee.adresse.trim().length < 10) {
        errors.push('Adresse du point d\'arrivée invalide (minimum 10 caractères)');
      }
      if (!pointArrivee.commune || pointArrivee.commune.trim().length < 2) {
        errors.push('Commune du point d\'arrivée requise');
      }
      if (!pointArrivee.quartier || pointArrivee.quartier.trim().length < 2) {
        errors.push('Quartier du point d\'arrivée requis');
      }
      if (!pointArrivee.coordonnees || !pointArrivee.coordonnees.coordinates || 
          !Array.isArray(pointArrivee.coordonnees.coordinates) || 
          pointArrivee.coordonnees.coordinates.length !== 2) {
        errors.push('Coordonnées du point d\'arrivée invalides');
      } else {
        const [lng, lat] = pointArrivee.coordonnees.coordinates;
        if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
          errors.push('Coordonnées du point d\'arrivée hors limites');
        }
      }
    }

    // Vérifier que départ et arrivée sont différents
    if (pointDepart && pointArrivee) {
      if (pointDepart.nom.toLowerCase() === pointArrivee.nom.toLowerCase()) {
        errors.push('Le point de départ et d\'arrivée doivent être différents');
      }
      
      // Vérifier distance minimale (au moins 500m)
      if (pointDepart.coordonnees?.coordinates && pointArrivee.coordonnees?.coordinates) {
        const distance = calculateDistance(
          pointDepart.coordonnees.coordinates,
          pointArrivee.coordonnees.coordinates
        );
        if (distance < 0.5) {
          errors.push('Distance minimale de 500m entre départ et arrivée');
        }
      }
    }

    // 4. Validation des arrêts intermédiaires
    if (arretsIntermediaires && Array.isArray(arretsIntermediaires)) {
      if (arretsIntermediaires.length > 5) {
        errors.push('Maximum 5 arrêts intermédiaires autorisés');
      }
      
      arretsIntermediaires.forEach((arret, index) => {
        if (!arret.nom || arret.nom.trim().length < 3) {
          errors.push(`Arrêt ${index + 1}: nom invalide (minimum 3 caractères)`);
        }
        if (!arret.adresse || arret.adresse.trim().length < 10) {
          errors.push(`Arrêt ${index + 1}: adresse invalide (minimum 10 caractères)`);
        }
        if (!arret.commune || arret.commune.trim().length < 2) {
          errors.push(`Arrêt ${index + 1}: commune requise`);
        }
        if (!arret.quartier || arret.quartier.trim().length < 2) {
          errors.push(`Arrêt ${index + 1}: quartier requis`);
        }
        if (!arret.coordonnees?.coordinates || !Array.isArray(arret.coordonnees.coordinates)) {
          errors.push(`Arrêt ${index + 1}: coordonnées invalides`);
        }
        if (!arret.ordreArret || arret.ordreArret < 1) {
          errors.push(`Arrêt ${index + 1}: ordre d'arrêt invalide`);
        }
      });

      // Vérifier l'unicité des ordres d'arrêt
      const ordres = arretsIntermediaires.map(a => a.ordreArret);
      const ordresUniques = new Set(ordres);
      if (ordres.length !== ordresUniques.size) {
        errors.push('Les ordres d\'arrêt doivent être uniques');
      }
    }

    // 5. Validation de la planification
    if (!dateDepart) {
      errors.push('Date de départ requise');
    } else {
      const dateDepObj = new Date(dateDepart);
      if (isNaN(dateDepObj.getTime())) {
        errors.push('Format de date de départ invalide');
      } else {
        const maintenant = new Date();
        const dans90Jours = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
        
        if (typeTrajet === 'PONCTUEL' && dateDepObj <= maintenant) {
          errors.push('La date de départ doit être dans le futur pour les trajets ponctuels');
        }
        if (dateDepObj > dans90Jours) {
          errors.push('Maximum 90 jours à l\'avance');
        }
      }
    }

    if (!heureDepart) {
      errors.push('Heure de départ requise');
    } else if (!/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(heureDepart)) {
      errors.push('Format d\'heure de départ invalide (HH:MM)');
    }

    if (heureArriveePrevue && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(heureArriveePrevue)) {
      errors.push('Format d\'heure d\'arrivée invalide (HH:MM)');
    }

    // Validation cohérence horaire
    if (heureDepart && heureArriveePrevue) {
      const [hDepart, mDepart] = heureDepart.split(':').map(Number);
      const [hArrivee, mArrivee] = heureArriveePrevue.split(':').map(Number);
      
      const minutesDepart = hDepart * 60 + mDepart;
      const minutesArrivee = hArrivee * 60 + mArrivee;
      
      if (minutesArrivee <= minutesDepart) {
        errors.push('L\'heure d\'arrivée doit être après l\'heure de départ');
      }
    }

    if (dureeEstimee !== undefined) {
      if (typeof dureeEstimee !== 'number' || dureeEstimee < 1 || dureeEstimee > 1440) {
        errors.push('Durée estimée invalide (1 à 1440 minutes)');
      }
    }

    // 6. Validation des détails du trajet
    if (!distance || typeof distance !== 'number' || distance < 0.1) {
      errors.push('Distance invalide (minimum 0.1 km)');
    } else if (distance > 2000) {
      errors.push('Distance maximum 2000 km');
    }

    if (!prixParPassager || typeof prixParPassager !== 'number' || prixParPassager < 100) {
      errors.push('Prix par passager invalide (minimum 100 FCFA)');
    } else if (prixParPassager > 100000) {
      errors.push('Prix par passager maximum 100 000 FCFA');
    }

    // Validation du prix par rapport à la distance
    if (distance && prixParPassager) {
      const prixParKm = prixParPassager / distance;
      if (prixParKm > 5000) {
        errors.push('Prix par km trop élevé (maximum 5000 FCFA/km)');
      }
      if (prixParKm < 50) {
        errors.push('Prix par km trop faible (minimum 50 FCFA/km)');
      }
    }

    if (!nombrePlacesTotal || typeof nombrePlacesTotal !== 'number' || nombrePlacesTotal < 1) {
      errors.push('Nombre total de places invalide (minimum 1)');
    } else if (nombrePlacesTotal > 8) {
      errors.push('Nombre total de places maximum 8');
    }

    if (nombrePlacesDisponibles === undefined || typeof nombrePlacesDisponibles !== 'number' || 
        nombrePlacesDisponibles < 0) {
      errors.push('Nombre de places disponibles invalide');
    } else if (nombrePlacesDisponibles > nombrePlacesTotal) {
      errors.push('Places disponibles ne peuvent dépasser le total');
    }

    // 7. Validation du type de trajet et récurrence
    const typesValides = ['PONCTUEL', 'RECURRENT', 'EVENEMENTIEL'];
    if (!typeTrajet || !typesValides.includes(typeTrajet)) {
      errors.push('Type de trajet invalide (PONCTUEL, RECURRENT, EVENEMENTIEL)');
    }

    if (typeTrajet === 'RECURRENT') {
      if (!recurrence) {
        errors.push('Récurrence requise pour trajet récurrent');
      } else {
        if (!recurrence.jours || !Array.isArray(recurrence.jours) || recurrence.jours.length === 0) {
          errors.push('Jours de récurrence requis');
        } else {
          const joursValides = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'];
          const joursInvalides = recurrence.jours.filter(j => !joursValides.includes(j));
          if (joursInvalides.length > 0) {
            errors.push(`Jours de récurrence invalides: ${joursInvalides.join(', ')}`);
          }
        }
        
        if (recurrence.dateFinRecurrence) {
          const dateFin = new Date(recurrence.dateFinRecurrence);
          if (isNaN(dateFin.getTime()) || dateFin <= new Date()) {
            errors.push('Date de fin de récurrence invalide (doit être future)');
          }
        }
      }
    }

    // 8. Validation des modes de paiement
    if (modesPaiementAcceptes) {
      const modesValides = ['especes', 'wave', 'orangeMoney', 'mtnMoney', 'moovMoney', 'compteRecharge'];
      const auMoinsUnMode = Object.keys(modesPaiementAcceptes).some(mode => 
        modesValides.includes(mode) && modesPaiementAcceptes[mode] === true
      );
      
      if (!auMoinsUnMode) {
        errors.push('Au moins un mode de paiement doit être accepté');
      }

      // Vérifier cohérence avec le compte conducteur
      if (modesPaiementAcceptes.especes && !user.compteCovoiturage?.estRecharge) {
        errors.push('Paiement en espèces nécessite un compte rechargé');
      }
    }

    // 9. Validation des préférences
    if (preferences) {
      if (preferences.accepteFemmesSeulement && preferences.accepteHommesSeuleument) {
        errors.push('Ne peut accepter exclusivement les femmes ET les hommes');
      }
      
      if (preferences.typeBagages && !['PETIT', 'MOYEN', 'GRAND'].includes(preferences.typeBagages)) {
        errors.push('Type de bagages invalide (PETIT, MOYEN, GRAND)');
      }
      
      if (preferences.conversation && !['AUCUNE', 'LIMITEE', 'LIBRE'].includes(preferences.conversation)) {
        errors.push('Préférence de conversation invalide (AUCUNE, LIMITEE, LIBRE)');
      }
    }

    // 10. Validation du commentaire
    if (commentaireConducteur && commentaireConducteur.length > 1000) {
      errors.push('Commentaire maximum 1000 caractères');
    }

    // 11. Vérifications de limite de trajets
    const maintenant = new Date();
    const debutJour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
    const trajetsAujourdhui = await Trajet.countDocuments({
      conducteurId: userId,
      createdAt: { $gte: debutJour },
      statutTrajet: { $in: ['PROGRAMME', 'EN_COURS'] }
    });

    if (trajetsAujourdhui >= 10) {
      errors.push('Maximum 10 trajets par jour autorisés');
    }

    // 12. Vérifier les conflits d'horaire
    if (dateDepart && heureDepart) {
      const dateHeureDepart = new Date(`${dateDepart}T${heureDepart}`);
      const uneHeureAvant = new Date(dateHeureDepart.getTime() - 60 * 60 * 1000);
      const uneHeureApres = new Date(dateHeureDepart.getTime() + 60 * 60 * 1000);

      const conflits = await Trajet.countDocuments({
        conducteurId: userId,
        dateDepart: {
          $gte: uneHeureAvant,
          $lte: uneHeureApres
        },
        statutTrajet: { $in: ['PROGRAMME', 'EN_COURS'] }
      });

      if (conflits > 0) {
        errors.push('Conflit d\'horaire avec un autre trajet (moins d\'1h d\'écart)');
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Données de trajet invalides',
        errors: errors
      });
    }

    // Ajouter les informations validées pour les contrôleurs suivants
    req.userInfo = {
      canAcceptCash: user.compteCovoiturage?.estRecharge || false,
      trustScore: user.scoreConfiance,
      isVerified: true,
      accountType: user.compteCovoiturage?.estRecharge ? 'RECHARGED' : 'MOBILE_ONLY'
    };

    next();

  } catch (error) {
    logger.error('Erreur validation création trajet:', error);
    return next(AppError.serverError('Erreur de validation', { originalError: error.message }));
  }
};

/**
 * Validation pour la modification d'un trajet
 */
const validateTripUpdate = async (req, res, next) => {
  try {
    const { trajetId } = req.params;
    const userId = req.user.userId;

    // Vérifier que le trajet existe et appartient au conducteur
    const trajet = await Trajet.findById(trajetId);
    
    if (!trajet) {
      return res.status(404).json({
        success: false,
        message: 'Trajet non trouvé'
      });
    }

    if (trajet.conducteurId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Non autorisé à modifier ce trajet'
      });
    }

    // Vérifier que le trajet peut être modifié
    if (!['PROGRAMME'].includes(trajet.statutTrajet)) {
      return res.status(400).json({
        success: false,
        message: 'Seuls les trajets programmés peuvent être modifiés'
      });
    }

    // Pour les modifications, on peut avoir une validation plus souple
    const maintenant = new Date();
    if (trajet.dateDepart <= maintenant) {
      return res.status(400).json({
        success: false,
        message: 'Impossible de modifier un trajet déjà commencé'
      });
    }

    // Vérifier s'il y a des réservations
    // Note: Cette logique devrait vérifier les réservations existantes
    // selon votre modèle de données Reservation

    req.existingTrip = trajet;
    
    // Appliquer la validation normale pour le contenu
    return validateTripCreation(req, res, next);

  } catch (error) {
    logger.error('Erreur validation modification trajet:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

/**
 * Validation pour l'annulation d'un trajet
 */
const validateTripCancellation = async (req, res, next) => {
  try {
    const { trajetId } = req.params;
    const { raisonAnnulation } = req.body;
    const userId = req.user.userId;

    const errors = [];

    // Vérifier que le trajet existe
    const trajet = await Trajet.findById(trajetId);
    
    if (!trajet) {
      return res.status(404).json({
        success: false,
        message: 'Trajet non trouvé'
      });
    }

    // Vérifier que c'est le conducteur
    if (trajet.conducteurId.toString() !== userId) {
      return res.status(403).json({
        success: false,
        message: 'Non autorisé à annuler ce trajet'
      });
    }

    // Vérifier le statut
    if (!['PROGRAMME'].includes(trajet.statutTrajet)) {
      return res.status(400).json({
        success: false,
        message: 'Seuls les trajets programmés peuvent être annulés'
      });
    }

    // Validation de la raison d'annulation
    if (!raisonAnnulation || raisonAnnulation.trim().length < 10) {
      errors.push('Raison d\'annulation requise (minimum 10 caractères)');
    } else if (raisonAnnulation.length > 500) {
      errors.push('Raison d\'annulation maximum 500 caractères');
    }

    // Vérifier le délai d'annulation (par exemple, 2h avant le départ)
    const maintenant = new Date();
    const deuxHeuresAvant = new Date(trajet.dateDepart.getTime() - 2 * 60 * 60 * 1000);
    
    if (maintenant >= deuxHeuresAvant) {
      errors.push('Annulation impossible moins de 2h avant le départ');
    }

    // Vérifier le nombre d'annulations récentes
    const il30Jours = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const annulationsRecentes = await Trajet.countDocuments({
      conducteurId: userId,
      statutTrajet: 'ANNULE',
      updatedAt: { $gte: il30Jours }
    });

    if (annulationsRecentes >= 5) {
      errors.push('Limite d\'annulations atteinte (5 par mois)');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Annulation non autorisée',
        errors: errors
      });
    }

    req.tripToCancel = trajet;
    next();

  } catch (error) {
    logger.error('Erreur validation annulation trajet:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

/**
 * Validation pour la recherche de trajets
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
      modePaiement,
      heureMin,
      heureMax,
      typeTrajet
    } = req.query;

    const errors = [];

    // Validation des coordonnées de recherche
    if (pointDepart) {
      try {
        const coords = JSON.parse(pointDepart);
        if (!Array.isArray(coords) || coords.length !== 2) {
          errors.push('Coordonnées point de départ invalides');
        } else {
          const [lng, lat] = coords;
          if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
            errors.push('Coordonnées point de départ hors limites');
          }
        }
      } catch {
        errors.push('Format coordonnées point de départ invalide');
      }
    }

    if (pointArrivee) {
      try {
        const coords = JSON.parse(pointArrivee);
        if (!Array.isArray(coords) || coords.length !== 2) {
          errors.push('Coordonnées point d\'arrivée invalides');
        } else {
          const [lng, lat] = coords;
          if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
            errors.push('Coordonnées point d\'arrivée hors limites');
          }
        }
      } catch {
        errors.push('Format coordonnées point d\'arrivée invalide');
      }
    }

    // Validation date de recherche
    if (dateDepart) {
      const searchDate = new Date(dateDepart);
      if (isNaN(searchDate.getTime())) {
        errors.push('Format de date de recherche invalide');
      } else {
        const il90Jours = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
        if (searchDate > il90Jours) {
          errors.push('Date de recherche maximum 90 jours');
        }
      }
    }

    // Validation nombre de places
    if (nombrePlaces) {
      const places = parseInt(nombrePlaces);
      if (isNaN(places) || places < 1 || places > 8) {
        errors.push('Nombre de places invalide (1-8)');
      }
    }

    // Validation prix maximum
    if (prixMaximum) {
      const prix = parseInt(prixMaximum);
      if (isNaN(prix) || prix < 100 || prix > 100000) {
        errors.push('Prix maximum invalide (100-100000 FCFA)');
      }
    }

    // Validation rayon de recherche
    if (rayonRecherche) {
      const rayon = parseInt(rayonRecherche);
      if (isNaN(rayon) || rayon < 1 || rayon > 100) {
        errors.push('Rayon de recherche invalide (1-100 km)');
      }
    }

    // Validation mode de paiement
    if (modePaiement) {
      const modesValides = ['especes', 'wave', 'orange_money', 'mtn_money', 'moov_money', 'compte_recharge'];
      if (!modesValides.includes(modePaiement)) {
        errors.push('Mode de paiement recherché invalide');
      }
    }

    // Validation heures
    if (heureMin && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(heureMin)) {
      errors.push('Format heure minimum invalide (HH:MM)');
    }

    if (heureMax && !/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/.test(heureMax)) {
      errors.push('Format heure maximum invalide (HH:MM)');
    }

    if (heureMin && heureMax) {
      const [hMin, mMin] = heureMin.split(':').map(Number);
      const [hMax, mMax] = heureMax.split(':').map(Number);
      
      if ((hMin * 60 + mMin) >= (hMax * 60 + mMax)) {
        errors.push('Heure minimum doit être antérieure à heure maximum');
      }
    }

    // Validation type de trajet
    if (typeTrajet) {
      const typesValides = ['PONCTUEL', 'RECURRENT', 'EVENEMENTIEL'];
      if (!typesValides.includes(typeTrajet)) {
        errors.push('Type de trajet invalide pour la recherche');
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
    logger.error('Erreur validation recherche trajet:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

/**
 * Validation de l'ID trajet
 */
const validateTripId = (req, res, next) => {
  try {
    const { trajetId } = req.params;

    if (!trajetId) {
      return res.status(400).json({
        success: false,
        message: 'ID de trajet requis'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(trajetId)) {
      return res.status(400).json({
        success: false,
        message: 'ID de trajet invalide'
      });
    }

    next();

  } catch (error) {
    logger.error('Erreur validation ID trajet:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

/**
 * Validation des trajets récurrents
 */
const validateRecurrentTrip = async (req, res, next) => {
  try {
    const {
      typeTrajet,
      recurrence,
      dateDepart
    } = req.body;

    const errors = [];

    if (typeTrajet !== 'RECURRENT') {
      return next();
    }

    // Validation spécifique pour trajets récurrents
    if (!recurrence) {
      errors.push('Configuration de récurrence requise');
    } else {
      // Validation des jours
      if (!recurrence.jours || !Array.isArray(recurrence.jours) || recurrence.jours.length === 0) {
        errors.push('Au moins un jour de récurrence requis');
      } else {
        const joursValides = ['LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI', 'DIMANCHE'];
        const joursInvalides = recurrence.jours.filter(j => !joursValides.includes(j));
        if (joursInvalides.length > 0) {
          errors.push(`Jours invalides: ${joursInvalides.join(', ')}`);
        }

        // Vérifier doublons
        const joursUniques = new Set(recurrence.jours);
        if (joursUniques.size !== recurrence.jours.length) {
          errors.push('Jours de récurrence en double');
        }
      }

      // Validation date de fin
      if (!recurrence.dateFinRecurrence) {
        errors.push('Date de fin de récurrence requise');
      } else {
        const dateFin = new Date(recurrence.dateFinRecurrence);
        const dateDebut = new Date(dateDepart);
        
        if (isNaN(dateFin.getTime())) {
          errors.push('Format de date de fin invalide');
        } else if (dateFin <= dateDebut) {
          errors.push('Date de fin doit être après la date de début');
        } else if (dateFin > new Date(Date.now() + 365 * 24 * 60 * 60 * 1000)) {
          errors.push('Date de fin maximum 1 an');
        }
      }
    }

    // Vérifier cohérence avec le jour de la semaine
    if (dateDepart && recurrence?.jours) {
      const jourSemaine = ['DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'][new Date(dateDepart).getDay()];
      if (!recurrence.jours.includes(jourSemaine)) {
        errors.push(`La date de début doit correspondre à un jour de récurrence (${jourSemaine} non inclus)`);
      }
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Configuration de récurrence invalide',
        errors: errors
      });
    }

    next();

  } catch (error) {
    logger.error('Erreur validation trajet récurrent:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

/**
 * Validation des permissions de conducteur
 */
const validateDriverPermissions = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId)
      .select('role statutCompte documentIdentite scoreConfiance nombreTrajetsAnnules nombreTrajetsEffectues')
      .lean();

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const errors = [];

    // Vérifications de base
    if (!['conducteur', 'les_deux'].includes(user.role)) {
      return res.status(403).json({
        success: false,
        message: 'Rôle conducteur requis',
        code: 'INVALID_ROLE'
      });
    }

    if (user.statutCompte !== 'ACTIF') {
      return res.status(403).json({
        success: false,
        message: 'Compte non actif',
        code: 'ACCOUNT_INACTIVE'
      });
    }

    if (!user.documentIdentite || user.documentIdentite.statutVerification !== 'VERIFIE') {
      return res.status(403).json({
        success: false,
        message: 'Vérification d\'identité requise',
        code: 'VERIFICATION_REQUIRED',
        redirectTo: '/verification'
      });
    }

    // Score de confiance
    if (user.scoreConfiance < 40) {
      errors.push(`Score de confiance insuffisant: ${user.scoreConfiance}/100 (minimum 40)`);
    }

    // Taux d'annulation
    const totalTrajets = user.nombreTrajetsEffectues + user.nombreTrajetsAnnules;
    if (totalTrajets > 0) {
      const tauxAnnulation = (user.nombreTrajetsAnnules / totalTrajets) * 100;
      if (tauxAnnulation > 20) {
        errors.push(`Taux d'annulation trop élevé: ${tauxAnnulation.toFixed(1)}% (maximum 20%)`);
      }
    }

    // Vérifier suspensions récentes
    const il30Jours = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const trajectsSuspendus = await Trajet.countDocuments({
      conducteurId: userId,
      statutTrajet: 'SUSPENDU',
      updatedAt: { $gte: il30Jours }
    });

    if (trajectsSuspendus > 0) {
      errors.push('Trajets récemment suspendus - création temporairement limitée');
    }

    if (errors.length > 0) {
      return res.status(403).json({
        success: false,
        message: 'Permissions insuffisantes pour créer des trajets',
        errors: errors,
        userStats: {
          scoreConfiance: user.scoreConfiance,
          tauxAnnulation: totalTrajets > 0 ? Math.round((user.nombreTrajetsAnnules / totalTrajets) * 100) : 0,
          nombreTrajetsEffectues: user.nombreTrajetsEffectues
        }
      });
    }

    req.driverProfile = {
      trustScore: user.scoreConfiance,
      cancellationRate: totalTrajets > 0 ? (user.nombreTrajetsAnnules / totalTrajets) * 100 : 0,
      totalTrips: totalTrajets,
      isVerified: true
    };

    next();

  } catch (error) {
    logger.error('Erreur validation permissions conducteur:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

/**
 * Validation des limites de création de trajets
 */
const validateTripLimits = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { typeTrajet } = req.body;

    const maintenant = new Date();
    const errors = [];

    // Limites quotidiennes
    const debutJour = new Date(maintenant.getFullYear(), maintenant.getMonth(), maintenant.getDate());
    const trajectsAujourdhui = await Trajet.countDocuments({
      conducteurId: userId,
      createdAt: { $gte: debutJour },
      statutTrajet: { $in: ['PROGRAMME', 'EN_COURS'] }
    });

    const limitesQuotidiennes = {
      'PONCTUEL': 10,
      'RECURRENT': 3,
      'EVENEMENTIEL': 5
    };

    if (trajectsAujourdhui >= limitesQuotidiennes[typeTrajet]) {
      errors.push(`Limite quotidienne atteinte pour les trajets ${typeTrajet}: ${limitesQuotidiennes[typeTrajet]}`);
    }

    // Limites hebdomadaires pour récurrents
    if (typeTrajet === 'RECURRENT') {
      const debutSemaine = new Date(maintenant.getTime() - (maintenant.getDay() * 24 * 60 * 60 * 1000));
      const trajectsRecurrentsCetteSemaine = await Trajet.countDocuments({
        conducteurId: userId,
        typeTrajet: 'RECURRENT',
        createdAt: { $gte: debutSemaine },
        statutTrajet: { $ne: 'ANNULE' }
      });

      if (trajectsRecurrentsCetteSemaine >= 5) {
        errors.push('Limite hebdomadaire de trajets récurrents atteinte: 5');
      }
    }

    // Limites futures (trajets programmés dans le futur)
    const dans90Jours = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    const trajectsFuturs = await Trajet.countDocuments({
      conducteurId: userId,
      dateDepart: { 
        $gte: maintenant,
        $lte: dans90Jours 
      },
      statutTrajet: 'PROGRAMME'
    });

    if (trajectsFuturs >= 50) {
      errors.push('Limite de trajets futurs programmés atteinte: 50');
    }

    if (errors.length > 0) {
      return res.status(429).json({
        success: false,
        message: 'Limites de création de trajets atteintes',
        errors: errors,
        limites: {
          quotidiennes: limitesQuotidiennes,
          trajectsAujourdhui,
          trajectsFuturs,
          maxFuturs: 50
        }
      });
    }

    req.tripLimits = {
      quotidiennes: limitesQuotidiennes,
      utilisationQuotidienne: trajectsAujourdhui,
      utilisationFuture: trajectsFuturs
    };

    next();

  } catch (error) {
    logger.error('Erreur validation limites trajets:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

/**
 * Validation des prix selon la distance et le marché local
 */
const validatePricing = (req, res, next) => {
  try {
    const { distance, prixParPassager, pointDepart, pointArrivee } = req.body;

    if (!distance || !prixParPassager) {
      return next();
    }

    const errors = [];
    const prixParKm = prixParPassager / distance;

    // Tarifs de référence selon les zones (Côte d'Ivoire)
    const tarifsZones = {
      'urbain': { min: 100, max: 500 }, // FCFA/km en ville
      'interurbain': { min: 50, max: 300 }, // FCFA/km entre villes
      'rural': { min: 30, max: 200 } // FCFA/km zones rurales
    };

    // Déterminer le type de zone basé sur les communes
    let typeZone = 'interurbain';
    
    if (pointDepart?.commune && pointArrivee?.commune) {
      const communesUrbaines = ['Abidjan', 'Bouaké', 'Daloa', 'Korhogo', 'San-Pédro', 'Yamoussoukro'];
      
      if (communesUrbaines.includes(pointDepart.commune) && 
          communesUrbaines.includes(pointArrivee.commune) &&
          pointDepart.commune === pointArrivee.commune) {
        typeZone = 'urbain';
      } else if (!communesUrbaines.includes(pointDepart.commune) && 
                 !communesUrbaines.includes(pointArrivee.commune)) {
        typeZone = 'rural';
      }
    }

    const tarifs = tarifsZones[typeZone];
    
    if (prixParKm < tarifs.min) {
      errors.push(`Prix trop bas pour une zone ${typeZone}: ${prixParKm.toFixed(0)} FCFA/km (minimum ${tarifs.min})`);
    }
    
    if (prixParKm > tarifs.max) {
      errors.push(`Prix trop élevé pour une zone ${typeZone}: ${prixParKm.toFixed(0)} FCFA/km (maximum ${tarifs.max})`);
    }

    // Validation selon la distance totale
    if (distance < 5 && prixParPassager < 500) {
      errors.push('Prix minimum 500 FCFA pour trajets courts (< 5km)');
    }

    if (distance > 200 && prixParKm > 150) {
      errors.push('Prix par km trop élevé pour trajets longue distance (> 200km)');
    }

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Tarification invalide',
        errors: errors,
        suggestions: {
          typeZone,
          prixParKmActuel: Math.round(prixParKm),
          fourchettePrix: {
            minimum: Math.round(distance * tarifs.min),
            maximum: Math.round(distance * tarifs.max)
          }
        }
      });
    }

    req.pricingInfo = {
      pricePerKm: prixParKm,
      zoneType: typeZone,
      isWithinRange: true
    };

    next();

  } catch (error) {
    logger.error('Erreur validation tarification:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

/**
 * Fonction utilitaire pour calculer la distance entre deux points
 */
function calculateDistance(coords1, coords2) {
  const [lon1, lat1] = coords1;
  const [lon2, lat2] = coords2;
  
  const R = 6371; // Rayon de la Terre en km
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLon = (lon2 - lon1) * Math.PI / 180;
  
  const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
    Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * 
    Math.sin(dLon/2) * Math.sin(dLon/2);
    
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
  const distance = R * c;
  
  return distance;
}

/**
 * Validation de cohérence géographique
 */
const validateGeographicConsistency = (req, res, next) => {
  try {
    const { pointDepart, pointArrivee, arretsIntermediaires, distance } = req.body;

    if (!pointDepart?.coordonnees?.coordinates || !pointArrivee?.coordonnees?.coordinates) {
      return next();
    }

    const errors = [];
    
    // Calculer la distance réelle vs distance fournie
    const distanceCalculee = calculateDistance(
      pointDepart.coordonnees.coordinates,
      pointArrivee.coordonnees.coordinates
    );

    // Tolérance de 20% sur la distance
    const tolerance = 0.2;
    const distanceMin = distanceCalculee * (1 - tolerance);
    const distanceMax = distanceCalculee * (1 + tolerance);

    if (distance < distanceMin || distance > distanceMax) {
      errors.push(`Distance incohérente: fournie ${distance}km, calculée ${distanceCalculee.toFixed(1)}km`);
    }

    // Vérifier cohérence des arrêts intermédiaires
    if (arretsIntermediaires && arretsIntermediaires.length > 0) {
      let distanceTotaleAvecArrets = 0;
      let pointPrecedent = pointDepart.coordonnees.coordinates;

      for (const arret of arretsIntermediaires) {
        if (arret.coordonnees?.coordinates) {
          distanceTotaleAvecArrets += calculateDistance(pointPrecedent, arret.coordonnees.coordinates);
          pointPrecedent = arret.coordonnees.coordinates;
        }
      }

      // Distance du dernier arrêt vers l'arrivée
      distanceTotaleAvecArrets += calculateDistance(pointPrecedent, pointArrivee.coordonnees.coordinates);

      // Les arrêts ne devraient pas augmenter la distance de plus de 50%
      if (distanceTotaleAvecArrets > distanceCalculee * 1.5) {
        errors.push('Les arrêts intermédiaires créent un détour excessif');
      }
    }

    // Vérifier que les points sont en Côte d'Ivoire (approximativement)
    const coordsCoteDivoire = {
      lngMin: -8.5,
      lngMax: -2.5,
      latMin: 4.2,
      latMax: 10.5
    };

    const verifierCoordonneesCoteDivoire = (coords, nom) => {
      const [lng, lat] = coords;
      if (lng < coordsCoteDivoire.lngMin || lng > coordsCoteDivoire.lngMax ||
          lat < coordsCoteDivoire.latMin || lat > coordsCoteDivoire.latMax) {
        errors.push(`${nom} semble être hors de la Côte d'Ivoire`);
      }
    };

    verifierCoordonneesCoteDivoire(pointDepart.coordonnees.coordinates, 'Point de départ');
    verifierCoordonneesCoteDivoire(pointArrivee.coordonnees.coordinates, 'Point d\'arrivée');

    if (errors.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Incohérences géographiques détectées',
        errors: errors,
        infos: {
          distanceFournie: distance,
          distanceCalculee: Math.round(distanceCalculee * 10) / 10
        }
      });
    }

    req.geographicInfo = {
      calculatedDistance: distanceCalculee,
      isConsistent: true
    };

    next();

  } catch (error) {
    logger.error('Erreur validation cohérence géographique:', error);
    return next(AppError.serverError('Erreur de validation'));
  }
};

module.exports = {
  validateTripCreation,
  validateTripUpdate,
  validateTripCancellation,
  validateTripSearch,
  validateTripId,
  validateRecurrentTrip,
  validateDriverPermissions,
  validateTripLimits,
  validatePricing,
  validateGeographicConsistency,
  calculateDistance
};