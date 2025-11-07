// controllers/alerteUrgenceController.js 
const AlerteUrgence = require('../models/AlerteUrgence');
const Trajet = require('../models/Trajet');
const logger = require('../utils/logger');
const AppError = require('../utils/AppError');

// =============== MÉTHODES CRUD DE BASE ===============

/**
 * @desc    Obtenir toutes les alertes avec pagination et filtres
 * @route   GET /api/alertes-urgence
 * @access  Public
 */
const obtenirAlertes = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 20, 
      statut, 
      ville, 
      typeAlerte,
      niveauGravite,
      dateDebut,
      dateFin
    } = req.query;
    
    // Construire le filtre
    const filtre = {};
    if (statut) filtre.statutAlerte = statut;
    if (ville && ville !== 'Autre') filtre.ville = ville;
    if (typeAlerte) filtre.typeAlerte = typeAlerte;
    if (niveauGravite) filtre.niveauGravite = niveauGravite;
    
    // Filtre par date
    if (dateDebut || dateFin) {
      filtre.createdAt = {};
      if (dateDebut) filtre.createdAt.$gte = new Date(dateDebut);
      if (dateFin) filtre.createdAt.$lte = new Date(dateFin);
    }
    
    const alertes = await AlerteUrgence.find(filtre)
      .sort({ priorite: -1, createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('declencheurId', 'nom prenom telephone email')
      .populate('trajetId', 'depart destination dateDepart heureDepart');
    
    const total = await AlerteUrgence.countDocuments(filtre);
    
    res.json({
      success: true,
      count: alertes.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      alertes
    });
  } catch (error) {
    logger.error('Erreur récupération alertes:', error);
    return next(AppError.serverError('Erreur lors de la récupération des alertes'));
  }
};

/**
 * @desc    Obtenir une alerte spécifique
 * @route   GET /api/alertes-urgence/:id
 * @access  Public
 */
const obtenirAlerte = async (req, res, next) => {
  try {
    const alerte = await AlerteUrgence.findById(req.params.id)
      .populate('declencheurId', 'nom prenom telephone email profil')
      .populate('trajetId')
      .populate('resolePar', 'nom prenom');
    
    if (!alerte) {
      return res.status(404).json({
        success: false,
        message: 'Alerte non trouvée'
      });
    }
    
    res.json({
      success: true,
      alerte
    });
  } catch (error) {
    logger.error('Erreur récupération alerte:', error);
    return next(AppError.serverError('Erreur lors de la récupération de l\'alerte'));
  }
};

/**
 * @desc    Déclencher une nouvelle alerte d'urgence
 * @route   POST /api/alertes-urgence
 * @access  Privé
 */
const declencherAlerte = async (req, res, next) => {
  try {
    const { 
      trajetId,
      typeAlerte,
      description,
      position,
      niveauGravite,
      ville,
      commune,
      adresseApproximative,
      personnesPresentes,
      contactsAlertes,
      infoTrajet
    } = req.body;
    
    // ✅ Toutes les validations sont déjà faites par le middleware
    
    // Vérifier que le trajet existe
    const trajet = await Trajet.findById(trajetId);
    if (!trajet) {
      return res.status(404).json({
        success: false,
        message: 'Trajet non trouvé'
      });
    }
    
    // Construire les données de l'alerte
    const alerteData = {
      declencheurId: req.user.userId,
      trajetId,
      typeAlerte,
      description,
      position: {
        type: 'Point',
        coordinates: position.coordinates
      },
      niveauGravite,
      statutAlerte: 'ACTIVE',
      ville: ville || 'Autre',
      commune,
      adresseApproximative,
      personnesPresentes,
      contactsAlertes: contactsAlertes || [],
      infoTrajet: infoTrajet || {
        depart: trajet.depart,
        destination: trajet.destination,
        immatriculationVehicule: trajet.immatriculationVehicule,
        marqueVehicule: trajet.marqueVehicule
      }
    };
    
    // Créer l'alerte
    const nouvelleAlerte = new AlerteUrgence(alerteData);
    await nouvelleAlerte.save();
    
    // Notifications
    if (nouvelleAlerte.estCritique) {
      await nouvelleAlerte.notifierServicesUrgence();
    }
    
    logger.info('🚨 Alerte urgence déclenchée', { 
      alerteId: nouvelleAlerte._id,
      numeroUrgence: nouvelleAlerte.numeroUrgence,
      userId: req.user.userId,
      type: typeAlerte,
      gravite: niveauGravite,
      ville,
      position: position.coordinates
    });
    
    res.status(201).json({
      success: true,
      message: 'Alerte d\'urgence déclenchée avec succès',
      alerte: nouvelleAlerte,
      informations: {
        numeroUrgence: nouvelleAlerte.numeroUrgence,
        priorite: nouvelleAlerte.priorite,
        estCritique: nouvelleAlerte.estCritique,
        contactsNotifies: nouvelleAlerte.contactsAlertes.length,
        servicesUrgenceCI: {
          police: '110 / 111',
          pompiers: '180',
          ambulance: '185',
          samu: '185'
        },
        conseil: nouvelleAlerte.estCritique 
          ? 'Alerte CRITIQUE - Contactez immédiatement le 110 (Police) ou 185 (SAMU)'
          : 'Alerte envoyée à vos contacts d\'urgence'
      }
    });
  } catch (error) {
    logger.error('❌ Erreur déclenchement alerte:', error);
    
    // Gestion des erreurs de validation Mongoose (au cas où)
    if (error.name === 'ValidationError') {
      const erreurs = Object.keys(error.errors).map(key => ({
        champ: key,
        message: error.errors[key].message
      }));
      
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation des données',
        erreurs
      });
    }
    
    return next(AppError.serverError('Erreur lors du déclenchement de l\'alerte'));
  }
};

// =============== GESTION DU STATUT ===============

/**
 * @desc    Mettre à jour le statut d'une alerte
 * @route   PATCH /api/alertes-urgence/:id/statut
 * @access  Privé
 */
const mettreAJourStatut = async (req, res, next) => {
  try {
    const { nouveauStatut, commentaire } = req.body;
    
    const alerte = await AlerteUrgence.findOne({
      _id: req.params.id,
      declencheurId: req.user.userId
    });
    
    if (!alerte) {
      return res.status(404).json({
        success: false,
        message: 'Alerte non trouvée ou accès non autorisé'
      });
    }
    
    // Valider le statut
    const statutsValides = ['ACTIVE', 'EN_TRAITEMENT', 'RESOLUE', 'FAUSSE_ALERTE'];
    if (!statutsValides.includes(nouveauStatut)) {
      return res.status(400).json({
        success: false,
        message: 'Statut invalide',
        statutsValides
      });
    }
    
    // Si résolution ou fausse alerte, vérifier le commentaire
    if ((nouveauStatut === 'RESOLUE' || nouveauStatut === 'FAUSSE_ALERTE') && !commentaire) {
      return res.status(400).json({
        success: false,
        message: 'Un commentaire de résolution est requis'
      });
    }
    
    // Utiliser la méthode du modèle
    if (nouveauStatut === 'RESOLUE' || nouveauStatut === 'FAUSSE_ALERTE') {
      await alerte.resoudre(commentaire, nouveauStatut);
      alerte.resolePar = req.user.userId;
    } else {
      alerte.statutAlerte = nouveauStatut;
      await alerte.save();
    }
    
    logger.info('Statut alerte mis à jour', {
      alerteId: alerte._id,
      numeroUrgence: alerte.numeroUrgence,
      userId: req.user.userId,
      ancienStatut: req.body.ancienStatut,
      nouveauStatut
    });
    
    res.json({
      success: true,
      message: 'Statut mis à jour avec succès',
      alerte
    });
  } catch (error) {
    logger.error('Erreur mise à jour statut:', error);
    return next(AppError.serverError('Erreur lors de la mise à jour du statut'));
  }
};

/**
 * @desc    Escalader une alerte vers un niveau supérieur
 * @route   POST /api/alertes-urgence/:id/escalader
 * @access  Privé
 */
const escaladerAlerte = async (req, res, next) => {
  try {
    const alerte = await AlerteUrgence.findOne({
      _id: req.params.id,
      declencheurId: req.user.userId
    });
    
    if (!alerte) {
      return res.status(404).json({
        success: false,
        message: 'Alerte non trouvée'
      });
    }
    
    if (alerte.niveauGravite === 'CRITIQUE') {
      return res.status(400).json({
        success: false,
        message: 'L\'alerte est déjà au niveau critique maximum'
      });
    }
    
    const ancienNiveau = alerte.niveauGravite;
    const anciennePriorite = alerte.priorite;
    
    await alerte.escalader();
    
    logger.warn('⚠️ Alerte escaladée', {
      alerteId: alerte._id,
      numeroUrgence: alerte.numeroUrgence,
      ancienNiveau,
      nouveauNiveau: alerte.niveauGravite,
      anciennePriorite,
      nouvellePriorite: alerte.priorite
    });
    
    res.json({
      success: true,
      message: 'Alerte escaladée avec succès',
      alerte,
      changements: {
        ancienNiveau,
        nouveauNiveau: alerte.niveauGravite,
        anciennePriorite,
        nouvellePriorite: alerte.priorite
      }
    });
  } catch (error) {
    logger.error('Erreur escalade alerte:', error);
    return next(AppError.serverError('Erreur lors de l\'escalade'));
  }
};

/**
 * @desc    Marquer comme fausse alerte
 * @route   PATCH /api/alertes-urgence/:id/fausse-alerte
 * @access  Privé
 */
const marquerFausseAlerte = async (req, res, next) => {
  try {
    const { raison } = req.body;
    
    const alerte = await AlerteUrgence.findOne({
      _id: req.params.id,
      declencheurId: req.user.userId
    });
    
    if (!alerte) {
      return res.status(404).json({
        success: false,
        message: 'Alerte non trouvée'
      });
    }
    
    await alerte.resoudre(raison || 'Marquée comme fausse alerte par l\'utilisateur', 'FAUSSE_ALERTE');
    alerte.resolePar = req.user.userId;
    await alerte.save();
    
    logger.info('Alerte marquée comme fausse alerte', {
      alerteId: alerte._id,
      numeroUrgence: alerte.numeroUrgence,
      raison
    });
    
    res.json({
      success: true,
      message: 'Alerte marquée comme fausse alerte',
      alerte
    });
  } catch (error) {
    logger.error('Erreur fausse alerte:', error);
    return next(AppError.serverError('Erreur lors du marquage'));
  }
};

// =============== GESTION DES CONTACTS ===============

/**
 * @desc    Ajouter un contact à une alerte
 * @route   POST /api/alertes-urgence/:id/contacts
 * @access  Privé
 */
const ajouterContact = async (req, res, next) => {
  try {
    const { nom, telephone, relation, canal = 'SMS' } = req.body;
    
    // Validation
    if (!nom || !telephone || !relation) {
      return res.status(400).json({
        success: false,
        message: 'Nom, téléphone et relation sont requis'
      });
    }
    
    const alerte = await AlerteUrgence.findOne({
      _id: req.params.id,
      declencheurId: req.user.userId
    });
    
    if (!alerte) {
      return res.status(404).json({
        success: false,
        message: 'Alerte non trouvée'
      });
    }
    
    const contact = { 
      nom, 
      telephone, 
      relation,
      canal,
      dateNotification: new Date(),
      statutNotification: 'ENVOYE'
    };
    
    await alerte.ajouterContactAlerte(contact);
    
    logger.info('Contact ajouté à alerte', {
      alerteId: alerte._id,
      numeroUrgence: alerte.numeroUrgence,
      contactNom: nom,
      relation
    });
    
    res.json({
      success: true,
      message: 'Contact ajouté avec succès',
      totalContacts: alerte.contactsAlertes.length,
      contact
    });
  } catch (error) {
    logger.error('Erreur ajout contact:', error);
    
    if (error.message.includes('Limite')) {
      return res.status(400).json({
        success: false,
        message: error.message
      });
    }
    
    return next(AppError.serverError('Erreur lors de l\'ajout du contact'));
  }
};

/**
 * @desc    Mettre à jour le statut d'un contact
 * @route   PATCH /api/alertes-urgence/:id/contacts/:contactId
 * @access  Privé
 */
const mettreAJourStatutContact = async (req, res, next) => {
  try {
    const { contactId } = req.params;
    const { statut } = req.body;
    
    const statutsValides = ['ENVOYE', 'RECU', 'ECHEC', 'EN_ATTENTE'];
    if (!statutsValides.includes(statut)) {
      return res.status(400).json({
        success: false,
        message: 'Statut invalide',
        statutsValides
      });
    }
    
    const alerte = await AlerteUrgence.findOne({
      _id: req.params.id,
      declencheurId: req.user.userId
    });
    
    if (!alerte) {
      return res.status(404).json({
        success: false,
        message: 'Alerte non trouvée'
      });
    }
    
    await alerte.mettreAJourStatutContact(contactId, statut);
    
    logger.info('Statut contact mis à jour', {
      alerteId: alerte._id,
      contactId,
      statut
    });
    
    res.json({
      success: true,
      message: 'Statut du contact mis à jour',
      alerte
    });
  } catch (error) {
    logger.error('Erreur mise à jour statut contact:', error);
    
    if (error.message === 'Contact non trouvé') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    
    return next(AppError.serverError('Erreur lors de la mise à jour'));
  }
};

// =============== ALERTES ACTIVES ET SPÉCIFIQUES ===============

/**
 * @desc    Obtenir les alertes actives uniquement
 * @route   GET /api/alertes-urgence/actives
 * @access  Public
 */
const obtenirAlertesActives = async (req, res, next) => {
  try {
    const alertes = await AlerteUrgence.obtenirAlertesActives();
    
    res.json({
      success: true,
      count: alertes.length,
      alertes
    });
  } catch (error) {
    logger.error('Erreur récupération alertes actives:', error);
    return next(AppError.serverError('Erreur lors de la récupération des alertes actives'));
  }
};

/**
 * @desc    Obtenir les alertes covoiturage spécifiques
 * @route   GET /api/alertes-urgence/covoiturage
 * @access  Public
 */
const obtenirAlertesCovoiturage = async (req, res, next) => {
  try {
    const alertes = await AlerteUrgence.obtenirAlertesCovoiturage();
    
    res.json({
      success: true,
      count: alertes.length,
      alertes,
      typesCovoiturage: [
        'PASSAGER_SUSPECT',
        'CONDUCTEUR_DANGEREUX',
        'HARCELEMENT',
        'CHANGEMENT_ITINERAIRE',
        'POINT_RENCONTRE_INSECURE',
        'DEMANDE_ARGENT_SUPPLEMENTAIRE',
        'VEHICULE_NON_CONFORME'
      ]
    });
  } catch (error) {
    logger.error('Erreur récupération alertes covoiturage:', error);
    return next(AppError.serverError('Erreur lors de la récupération'));
  }
};

/**
 * @desc    Obtenir alertes anciennes (non résolues depuis 2h+)
 * @route   GET /api/alertes-urgence/anciennes
 * @access  Public
 */
const obtenirAlertesAnciennes = async (req, res, next) => {
  try {
    const deuxHeuresAvant = new Date(Date.now() - 2 * 60 * 60 * 1000);
    
    const alertes = await AlerteUrgence.find({
      statutAlerte: { $in: ['ACTIVE', 'EN_TRAITEMENT'] },
      createdAt: { $lt: deuxHeuresAvant }
    })
    .sort({ createdAt: 1 })
    .populate('declencheurId', 'nom telephone')
    .populate('trajetId', 'depart destination');
    
    res.json({
      success: true,
      count: alertes.length,
      seuil: '2 heures',
      alertes
    });
  } catch (error) {
    logger.error('Erreur alertes anciennes:', error);
    return next(AppError.serverError('Erreur lors de la récupération'));
  }
};

// =============== RECHERCHE ET PROXIMITÉ ===============

/**
 * @desc    Rechercher par proximité géographique
 * @route   GET /api/alertes-urgence/proximite
 * @access  Public
 */
const rechercherProximite = async (req, res, next) => {
  try {
    const { longitude, latitude, rayon = 50 } = req.query;
    
    if (!longitude || !latitude) {
      return res.status(400).json({
        success: false,
        message: 'Coordonnées GPS requises (longitude, latitude)'
      });
    }
    
    const alertes = await AlerteUrgence.rechercherParProximite(
      parseFloat(longitude),
      parseFloat(latitude),
      parseFloat(rayon)
    );
    
    res.json({
      success: true,
      count: alertes.length,
      rayon: `${rayon} km`,
      centre: { 
        longitude: parseFloat(longitude), 
        latitude: parseFloat(latitude) 
      },
      alertes
    });
  } catch (error) {
    logger.error('Erreur recherche proximité:', error);
    return next(AppError.serverError('Erreur lors de la recherche'));
  }
};

/**
 * @desc    Recherche avancée avec filtres multiples
 * @route   POST /api/alertes-urgence/recherche-avancee
 * @access  Public
 */
const rechercheAvancee = async (req, res, next) => {
  try {
    const { 
      types, 
      gravites, 
      statuts, 
      villes, 
      dateDebut, 
      dateFin,
      prioriteMin,
      prioriteMax
    } = req.body;
    
    const filtre = {};
    
    if (types?.length) filtre.typeAlerte = { $in: types };
    if (gravites?.length) filtre.niveauGravite = { $in: gravites };
    if (statuts?.length) filtre.statutAlerte = { $in: statuts };
    if (villes?.length) filtre.ville = { $in: villes };
    
    if (prioriteMin || prioriteMax) {
      filtre.priorite = {};
      if (prioriteMin) filtre.priorite.$gte = prioriteMin;
      if (prioriteMax) filtre.priorite.$lte = prioriteMax;
    }
    
    if (dateDebut || dateFin) {
      filtre.createdAt = {};
      if (dateDebut) filtre.createdAt.$gte = new Date(dateDebut);
      if (dateFin) filtre.createdAt.$lte = new Date(dateFin);
    }
    
    const alertes = await AlerteUrgence.find(filtre)
      .sort({ priorite: -1, createdAt: -1 })
      .limit(100)
      .populate('declencheurId', 'nom telephone')
      .populate('trajetId', 'depart destination');
    
    res.json({
      success: true,
      count: alertes.length,
      filtresAppliques: { types, gravites, statuts, villes, prioriteMin, prioriteMax },
      alertes
    });
  } catch (error) {
    logger.error('Erreur recherche avancée:', error);
    return next(AppError.serverError('Erreur lors de la recherche'));
  }
};

// =============== STATISTIQUES ET ANALYTICS ===============

/**
 * @desc    Obtenir statistiques globales
 * @route   GET /api/alertes-urgence/statistiques
 * @access  Public
 */
const obtenirStatistiques = async (req, res, next) => {
  try {
    const { dateDebut, dateFin } = req.query;
    
    const stats = await AlerteUrgence.obtenirStatistiques(dateDebut, dateFin);
    
    // Calculer la répartition par type
    const statsDetaillees = stats[0] || {};
    if (statsDetaillees.repartitionTypes) {
      const compteurTypes = {};
      statsDetaillees.repartitionTypes.forEach(type => {
        compteurTypes[type] = (compteurTypes[type] || 0) + 1;
      });
      statsDetaillees.repartitionTypes = compteurTypes;
    }
    
    // Villes les plus affectées
    if (statsDetaillees.villesPlusAffectees) {
      const compteurVilles = {};
      statsDetaillees.villesPlusAffectees.forEach(ville => {
        if (ville) compteurVilles[ville] = (compteurVilles[ville] || 0) + 1;
      });
      statsDetaillees.villesPlusAffectees = Object.entries(compteurVilles)
        .sort(([,a], [,b]) => b - a)
        .slice(0, 10)
        .map(([ville, count]) => ({ ville, count }));
    }
    
    res.json({
      success: true,
      periode: {
        debut: dateDebut || 'Début',
        fin: dateFin || 'Aujourd\'hui'
      },
      statistiques: statsDetaillees
    });
  } catch (error) {
    logger.error('Erreur statistiques:', error);
    return next(AppError.serverError('Erreur lors de la récupération des statistiques'));
  }
};

/**
 * @desc    Tableau de bord public temps réel
 * @route   GET /api/alertes-urgence/dashboard
 * @access  Public
 */
const obtenirTableauBord = async (req, res, next) => {
  try {
    const [
      actives, 
      critiques, 
      total24h, 
      parVille,
      parType,
      anciennes
    ] = await Promise.all([
      AlerteUrgence.countDocuments({ 
        statutAlerte: { $in: ['ACTIVE', 'EN_TRAITEMENT'] } 
      }),
      AlerteUrgence.countDocuments({ 
        niveauGravite: 'CRITIQUE', 
        statutAlerte: 'ACTIVE' 
      }),
      AlerteUrgence.countDocuments({ 
        createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) }
      }),
      AlerteUrgence.aggregate([
        { $match: { statutAlerte: 'ACTIVE' } },
        { $group: { _id: '$ville', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 5 }
      ]),
      AlerteUrgence.aggregate([
        { $match: { statutAlerte: 'ACTIVE' } },
        { $group: { _id: '$typeAlerte', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      AlerteUrgence.countDocuments({
        statutAlerte: 'ACTIVE',
        createdAt: { $lt: new Date(Date.now() - 2 * 60 * 60 * 1000) }
      })
    ]);
    
    res.json({
      success: true,
      dashboard: {
        alertesActives: actives,
        alertesCritiques: critiques,
        alertes24h: total24h,
        alertesAnciennes: anciennes,
        villesAffectees: parVille.map(v => ({ ville: v._id, count: v.count })),
        typesAlertes: parType.map(t => ({ type: t._id, count: t.count })),
        derniereMiseAJour: new Date(),
        tauxCritique: actives > 0 ? ((critiques / actives) * 100).toFixed(1) : 0
      }
    });
  } catch (error) {
    logger.error('Erreur tableau de bord:', error);
    return next(AppError.serverError('Erreur lors de la récupération du tableau de bord'));
  }
};

/**
 * @desc    Notifications temps réel (dernières 5 minutes)
 * @route   GET /api/alertes-urgence/notifications
 * @access  Public
 */
const obtenirNotifications = async (req, res, next) => {
  try {
    const derniere5min = new Date(Date.now() - 5 * 60 * 1000);
    
    const notifications = await AlerteUrgence.find({
      createdAt: { $gte: derniere5min },
      statutAlerte: 'ACTIVE'
    })
    .sort({ createdAt: -1 })
    .limit(10)
    .select('numeroUrgence typeAlerte niveauGravite ville commune createdAt priorite');
    
    res.json({
      success: true,
      count: notifications.length,
      periode: '5 dernières minutes',
      notifications
    });
  } catch (error) {
    logger.error('Erreur notifications:', error);
    return next(AppError.serverError('Erreur lors de la récupération'));
  }
};

// =============== EXPORT ET RAPPORTS ===============

/**
 * @desc    Exporter alertes en CSV ou JSON
 * @route   GET /api/alertes-urgence/export
 * @access  Public
 */
const exporterAlertes = async (req, res, next) => {
  try {
    const { format = 'json', dateDebut, dateFin, ville, statut } = req.query;
    
    const filtre = {};
    if (ville) filtre.ville = ville;
    if (statut) filtre.statutAlerte = statut;
    
    if (dateDebut || dateFin) {
      filtre.createdAt = {};
      if (dateDebut) filtre.createdAt.$gte = new Date(dateDebut);
      if (dateFin) filtre.createdAt.$lte = new Date(dateFin);
    }
    
    const alertes = await AlerteUrgence.find(filtre)
      .sort({ createdAt: -1 })
      .populate('declencheurId', 'nom prenom telephone')
      .populate('trajetId', 'depart destination')
      .limit(5000); // Limite pour éviter surcharge
    
    if (format === 'csv') {
      res.setHeader('Content-Type', 'text/csv; charset=utf-8');
      res.setHeader('Content-Disposition', 'attachment; filename="alertes-urgence-ci.csv"');
      
      const header = 'Numero Urgence,Date,Type,Gravite,Priorite,Statut,Ville,Commune,Description,Declencheur,Telephone,Longitude,Latitude\n';
      const rows = alertes.map(a => {
        const coords = a.position?.coordinates || [0, 0];
        const desc = (a.description || '').replace(/"/g, '""').replace(/\n/g, ' ');
        return `"${a.numeroUrgence}","${a.createdAt}","${a.typeAlerte}","${a.niveauGravite}",${a.priorite},"${a.statutAlerte}","${a.ville || 'N/A'}","${a.commune || 'N/A'}","${desc}","${a.declencheurId?.nom || 'N/A'} ${a.declencheurId?.prenom || ''}","${a.declencheurId?.telephone || 'N/A'}",${coords[0]},${coords[1]}`;
      }).join('\n');
      
      return res.send('\ufeff' + header + rows); // UTF-8 BOM pour Excel
    }
    
    // Export JSON par défaut
    res.json({
      success: true,
      count: alertes.length,
      format: 'json',
      periode: { dateDebut, dateFin },
      alertes
    });
  } catch (error) {
    logger.error('Erreur export:', error);
    return next(AppError.serverError('Erreur lors de l\'export'));
  }
};

/**
 * @desc    Générer rapport d'activité
 * @route   GET /api/alertes-urgence/rapport
 * @access  Public
 */
const genererRapport = async (req, res, next) => {
  try {
    const { dateDebut, dateFin, ville } = req.query;
    
    const filtre = {};
    if (ville) filtre.ville = ville;
    if (dateDebut || dateFin) {
      filtre.createdAt = {};
      if (dateDebut) filtre.createdAt.$gte = new Date(dateDebut);
      if (dateFin) filtre.createdAt.$lte = new Date(dateFin);
    }
    
    const [
      total,
      parStatut,
      parType,
      parGravite,
      parVille,
      tempsReponse
    ] = await Promise.all([
      AlerteUrgence.countDocuments(filtre),
      
      AlerteUrgence.aggregate([
        { $match: filtre },
        { $group: { _id: '$statutAlerte', count: { $sum: 1 } } }
      ]),
      
      AlerteUrgence.aggregate([
        { $match: filtre },
        { $group: { _id: '$typeAlerte', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      
      AlerteUrgence.aggregate([
        { $match: filtre },
        { $group: { _id: '$niveauGravite', count: { $sum: 1 } } }
      ]),
      
      AlerteUrgence.aggregate([
        { $match: filtre },
        { $group: { _id: '$ville', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),
      
      AlerteUrgence.aggregate([
        { 
          $match: { 
            ...filtre,
            statutAlerte: 'RESOLUE',
            dateResolution: { $exists: true }
          } 
        },
        {
          $project: {
            tempsReponse: {
              $divide: [
                { $subtract: ['$dateResolution', '$createdAt'] },
                60000 // Convertir en minutes
              ]
            }
          }
        },
        {
          $group: {
            _id: null,
            tempsReponseMoyen: { $avg: '$tempsReponse' },
            tempsReponseMin: { $min: '$tempsReponse' },
            tempsReponseMax: { $max: '$tempsReponse' }
          }
        }
      ])
    ]);
    
    res.json({
      success: true,
      periode: {
        debut: dateDebut || 'Début',
        fin: dateFin || 'Aujourd\'hui',
        ville: ville || 'Toutes'
      },
      rapport: {
        totalAlertes: total,
        repartitionStatut: parStatut.map(s => ({ statut: s._id, count: s.count })),
        repartitionType: parType.map(t => ({ type: t._id, count: t.count })),
        repartitionGravite: parGravite.map(g => ({ gravite: g._id, count: g.count })),
        top10Villes: parVille.map(v => ({ ville: v._id, count: v.count })),
        tempsReponse: tempsReponse[0] || {
          tempsReponseMoyen: null,
          tempsReponseMin: null,
          tempsReponseMax: null
        },
        dateGeneration: new Date()
      }
    });
  } catch (error) {
    logger.error('Erreur génération rapport:', error);
    return next(AppError.serverError('Erreur lors de la génération du rapport'));
  }
};

// =============== MES ALERTES (UTILISATEUR) ===============

/**
 * @desc    Obtenir mes alertes
 * @route   GET /api/alertes-urgence/mes-alertes
 * @access  Privé
 */
const obtenirMesAlertes = async (req, res, next) => {
  try {
    const { page = 1, limit = 20, statut } = req.query;
    
    const filtre = { declencheurId: req.user.userId };
    if (statut) filtre.statutAlerte = statut;
    
    const alertes = await AlerteUrgence.find(filtre)
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('trajetId', 'depart destination dateDepart');
    
    const total = await AlerteUrgence.countDocuments(filtre);
    
    res.json({
      success: true,
      count: alertes.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      alertes
    });
  } catch (error) {
    logger.error('Erreur récupération mes alertes:', error);
    return next(AppError.serverError('Erreur lors de la récupération'));
  }
};

/**
 * @desc    Obtenir mes statistiques personnelles
 * @route   GET /api/alertes-urgence/mes-statistiques
 * @access  Privé
 */
const obtenirMesStatistiques = async (req, res, next) => {
  try {
    const stats = await AlerteUrgence.aggregate([
      { $match: { declencheurId: req.user.userId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          actives: { $sum: { $cond: [{ $eq: ['$statutAlerte', 'ACTIVE'] }, 1, 0] } },
          resolues: { $sum: { $cond: [{ $eq: ['$statutAlerte', 'RESOLUE'] }, 1, 0] } },
          faussesAlertes: { $sum: { $cond: [{ $eq: ['$statutAlerte', 'FAUSSE_ALERTE'] }, 1, 0] } },
          critiques: { $sum: { $cond: [{ $eq: ['$niveauGravite', 'CRITIQUE'] }, 1, 0] } }
        }
      }
    ]);
    
    const statistiques = stats[0] || {
      total: 0,
      actives: 0,
      resolues: 0,
      faussesAlertes: 0,
      critiques: 0
    };
    
    res.json({
      success: true,
      statistiques
    });
  } catch (error) {
    logger.error('Erreur mes statistiques:', error);
    return next(AppError.serverError('Erreur lors de la récupération'));
  }
};

// =============== ROUTES ADMIN ===============

/**
 * @desc    Obtenir toutes les alertes (ADMIN)
 * @route   GET /api/alertes-urgence/admin/toutes
 * @access  Admin
 */
const obtenirAlertesAdmin = async (req, res, next) => {
  try {
    const { page = 1, limit = 50 } = req.query;
    
    const alertes = await AlerteUrgence.find()
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit)
      .populate('declencheurId', 'nom prenom telephone email')
      .populate('trajetId')
      .populate('resolePar', 'nom prenom');
    
    const total = await AlerteUrgence.countDocuments();
    
    res.json({
      success: true,
      count: alertes.length,
      total,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      alertes
    });
  } catch (error) {
    logger.error('Erreur alertes admin:', error);
    return next(AppError.serverError('Erreur lors de la récupération'));
  }
};

/**
 * @desc    Forcer mise à jour statut (ADMIN)
 * @route   PATCH /api/alertes-urgence/admin/:id/statut
 * @access  Admin
 */
const forcerMiseAJourStatut = async (req, res, next) => {
  try {
    const { statutAlerte, commentaire } = req.body;
    
    const alerte = await AlerteUrgence.findById(req.params.id);
    if (!alerte) {
      return res.status(404).json({ 
        success: false, 
        message: 'Alerte non trouvée' 
      });
    }
    
    const ancienStatut = alerte.statutAlerte;
    alerte.statutAlerte = statutAlerte;
    
    if (statutAlerte === 'RESOLUE' || statutAlerte === 'FAUSSE_ALERTE') {
      alerte.dateResolution = new Date();
      alerte.commentaireResolution = commentaire || 'Résolu par administrateur';
      alerte.resolePar = req.user.userId;
    }
    
    await alerte.save();
    
    logger.warn('⚠️ Statut forcé par admin', {
      alerteId: alerte._id,
      numeroUrgence: alerte.numeroUrgence,
      adminId: req.user.userId,
      ancienStatut,
      nouveauStatut: statutAlerte
    });
    
    res.json({ 
      success: true, 
      message: 'Statut mis à jour par admin',
      alerte 
    });
  } catch (error) {
    logger.error('Erreur force statut:', error);
    return next(AppError.serverError('Erreur'));
  }
};

/**
 * @desc    Supprimer une alerte (SUPER ADMIN)
 * @route   DELETE /api/alertes-urgence/admin/:id
 * @access  Super Admin
 */
const supprimerAlerte = async (req, res, next) => {
  try {
    const alerte = await AlerteUrgence.findById(req.params.id);
    
    if (!alerte) {
      return res.status(404).json({ 
        success: false, 
        message: 'Alerte non trouvée' 
      });
    }
    
    // Sauvegarder les infos avant suppression
    const infoAlerte = {
      numeroUrgence: alerte.numeroUrgence,
      typeAlerte: alerte.typeAlerte,
      ville: alerte.ville
    };
    
    await AlerteUrgence.findByIdAndDelete(req.params.id);
    
    logger.warn('🗑️ Alerte supprimée par super admin', {
      alerteId: req.params.id,
      ...infoAlerte,
      adminId: req.user.userId
    });
    
    res.json({ 
      success: true, 
      message: 'Alerte supprimée avec succès' 
    });
  } catch (error) {
    logger.error('Erreur suppression:', error);
    return next(AppError.serverError('Erreur'));
  }
};

/**
 * @desc    Statistiques admin avancées
 * @route   GET /api/alertes-urgence/admin/statistiques-avancees
 * @access  Admin
 */
const obtenirStatistiquesAvancees = async (req, res, next) => {
  try {
    const { dateDebut, dateFin } = req.query;
    
    const filtre = {};
    if (dateDebut || dateFin) {
      filtre.createdAt = {};
      if (dateDebut) filtre.createdAt.$gte = new Date(dateDebut);
      if (dateFin) filtre.createdAt.$lte = new Date(dateFin);
    }
    
    const [
      total,
      moyenneTempsReponse,
      parJour,
      parHeure,
      topVilles,
      topTypes,
      tauxResolution
    ] = await Promise.all([
      AlerteUrgence.countDocuments(filtre),
      
      AlerteUrgence.aggregate([
        { $match: { ...filtre, statutAlerte: 'RESOLUE', dateResolution: { $exists: true } } },
        {
          $group: {
            _id: null,
            moyenne: {
              $avg: {
                $divide: [{ $subtract: ['$dateResolution', '$createdAt'] }, 60000]
              }
            }
          }
        }
      ]),
      
      AlerteUrgence.aggregate([
        { $match: filtre },
        {
          $group: {
            _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } },
        { $limit: 30 }
      ]),
      
      AlerteUrgence.aggregate([
        { $match: filtre },
        {
          $group: {
            _id: { $hour: '$createdAt' },
            count: { $sum: 1 }
          }
        },
        { $sort: { _id: 1 } }
      ]),
      
      AlerteUrgence.aggregate([
        { $match: filtre },
        { $group: { _id: '$ville', count: { $sum: 1 } } },
        { $sort: { count: -1 } },
        { $limit: 10 }
      ]),
      
      AlerteUrgence.aggregate([
        { $match: filtre },
        { $group: { _id: '$typeAlerte', count: { $sum: 1 } } },
        { $sort: { count: -1 } }
      ]),
      
      AlerteUrgence.aggregate([
        { $match: filtre },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            resolues: { $sum: { $cond: [{ $eq: ['$statutAlerte', 'RESOLUE'] }, 1, 0] } }
          }
        }
      ])
    ]);
    
    const tauxResolutionCalc = tauxResolution[0] 
      ? ((tauxResolution[0].resolues / tauxResolution[0].total) * 100).toFixed(2)
      : 0;
    
    res.json({
      success: true,
      periode: { dateDebut, dateFin },
      statistiques: {
        totalAlertes: total,
        tempsReponseMoyen: moyenneTempsReponse[0]?.moyenne?.toFixed(2) || null,
        tauxResolution: tauxResolutionCalc + '%',
        alertesParJour: parJour,
        alertesParHeure: parHeure,
        top10Villes: topVilles,
        repartitionTypes: topTypes
      }
    });
  } catch (error) {
    logger.error('Erreur statistiques avancées:', error);
    return next(AppError.serverError('Erreur'));
  }
};

// =============== EXPORTS ===============

module.exports = {
  // CRUD de base
  obtenirAlertes,
  obtenirAlerte,
  declencherAlerte,
  
  // Gestion du statut
  mettreAJourStatut,
  escaladerAlerte,
  marquerFausseAlerte,
  
  // Gestion des contacts
  ajouterContact,
  mettreAJourStatutContact,
  
  // Alertes actives et spécifiques
  obtenirAlertesActives,
  obtenirAlertesCovoiturage,
  obtenirAlertesAnciennes,
  
  // Recherche et proximité
  rechercherProximite,
  rechercheAvancee,
  
  // Statistiques et analytics
  obtenirStatistiques,
  obtenirTableauBord,
  obtenirNotifications,
  
  // Export et rapports
  exporterAlertes,
  genererRapport,
  
  // Mes alertes (utilisateur)
  obtenirMesAlertes,
  obtenirMesStatistiques,
  
  // Admin
  obtenirAlertesAdmin,
  forcerMiseAJourStatut,
  supprimerAlerte,
  obtenirStatistiquesAvancees
};