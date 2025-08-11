// services/alerteUrgenceService.js
const mongoose = require('mongoose');
const { AppError } = require('../utils/helpers');
const notificationService = require('./notificationService');

// Modèle AlerteUrgence
const AlerteUrgence = mongoose.model('AlerteUrgence', new mongoose.Schema({
  numeroUrgence: {
    type: String,
    unique: true,
    required: true
  },
  declencheurId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  typeAlerte: {
    type: String,
    enum: ['accident', 'panne', 'agression', 'malaise', 'autre'],
    required: true
  },
  niveauGravite: {
    type: String,
    enum: ['faible', 'moyen', 'eleve', 'critique'],
    default: 'moyen'
  },
  statutAlerte: {
    type: String,
    enum: ['active', 'en_cours', 'resolue', 'fermee', 'annulee'],
    default: 'active'
  },
  description: {
    type: String,
    maxlength: 500
  },
  position: {
    latitude: { type: Number, required: true },
    longitude: { type: Number, required: true },
    adresse: String
  },
  ville: String,
  contactsAlertes: [{
    nom: String,
    telephone: String,
    email: String,
    relation: String
  }],
  priorite: {
    type: Number,
    min: 1,
    max: 5,
    default: 3
  },
  estCritique: {
    type: Boolean,
    default: false
  },
  metadonnees: {
    dispositif: String,
    navigateur: String,
    adresseIP: String
  },
  historiqueStatuts: [{
    statut: String,
    modifiePar: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    dateModification: { type: Date, default: Date.now },
    commentaire: String
  }],
  tempsReponse: Date,
  resoluePar: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
}, {
  timestamps: true
}));

/**
 * Génère un numéro d'urgence unique
 */
const genererNumeroUrgence = () => {
  const timestamp = Date.now().toString(36);
  const random = Math.random().toString(36).substring(2, 5);
  return `URG-${timestamp}-${random}`.toUpperCase();
};

/**
 * Calcule la priorité basée sur le type et niveau de gravité
 */
const calculerPriorite = (typeAlerte, niveauGravite) => {
  const prioriteMatrix = {
    'accident': { 'critique': 5, 'eleve': 4, 'moyen': 3, 'faible': 2 },
    'agression': { 'critique': 5, 'eleve': 5, 'moyen': 4, 'faible': 3 },
    'malaise': { 'critique': 5, 'eleve': 4, 'moyen': 3, 'faible': 2 },
    'panne': { 'critique': 3, 'eleve': 2, 'moyen': 2, 'faible': 1 },
    'autre': { 'critique': 4, 'eleve': 3, 'moyen': 2, 'faible': 1 }
  };
  
  return prioriteMatrix[typeAlerte]?.[niveauGravite] || 3;
};

/**
 * Extrait la ville à partir des coordonnées (géocodage inversé simplifié)
 */
const extraireVille = async (latitude, longitude) => {
  try {
    // En production, utilisez une API de géocodage réelle
    // Pour le moment, retourne une ville fictive basée sur les coordonnées
    const villes = ['Abidjan', 'Bouaké', 'Daloa', 'San-Pédro', 'Yamoussoukro'];
    const index = Math.floor((latitude + longitude) * 100) % villes.length;
    return villes[Math.abs(index)];
  } catch (error) {
    console.error('Erreur géocodage:', error);
    return 'Ville inconnue';
  }
};

/**
 * Déclenche une nouvelle alerte d'urgence
 */
const declencherAlerte = async (payload, utilisateurId) => {
  try {
    const {
      typeAlerte,
      niveauGravite = 'moyen',
      description,
      position,
      contactsAlertes = [],
      metadonnees = {}
    } = payload;

    // Validation des données obligatoires
    if (!typeAlerte || !position?.latitude || !position?.longitude) {
      throw new AppError('Type d\'alerte et position sont requis', 400);
    }

    // Calcul automatique de la priorité
    const priorite = calculerPriorite(typeAlerte, niveauGravite);
    const estCritique = priorite >= 4;

    // Extraction de la ville
    const ville = await extraireVille(position.latitude, position.longitude);

    // Création de l'alerte
    const nouvelleAlerte = new AlerteUrgence({
      numeroUrgence: genererNumeroUrgence(),
      declencheurId: utilisateurId,
      typeAlerte,
      niveauGravite,
      description: description?.substring(0, 500), // Limitation de taille
      position: {
        latitude: parseFloat(position.latitude),
        longitude: parseFloat(position.longitude),
        adresse: position.adresse
      },
      ville,
      contactsAlertes: contactsAlertes.slice(0, 5), // Max 5 contacts
      priorite,
      estCritique,
      metadonnees,
      historiqueStatuts: [{
        statut: 'active',
        modifiePar: utilisateurId,
        dateModification: new Date(),
        commentaire: 'Alerte créée'
      }]
    });

    const alerteSauvegardee = await nouvelleAlerte.save();

    // Notification asynchrone aux contacts d'urgence
    if (contactsAlertes.length > 0) {
      notifierContactsUrgence(alerteSauvegardee, contactsAlertes);
    }

    // Notification aux services d'urgence si critique
    if (estCritique) {
      notifierServicesUrgence(alerteSauvegardee);
    }

    return alerteSauvegardee;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Erreur lors de la création de l\'alerte: ' + error.message, 500);
  }
};

/**
 * Recherche des alertes avec filtres et pagination
 */
const rechercherAlertes = async (filtres = {}, options = {}) => {
  try {
    const {
      page = 1,
      limite = 20,
      tri = { priorite: -1, createdAt: -1 },
      peupler = true
    } = options;

    // Construction de la requête MongoDB
    const query = {};
    
    // Filtres par statut (array)
    if (filtres.statutAlerte?.length) {
      query.statutAlerte = { $in: filtres.statutAlerte };
    }
    
    // Filtres par type (array)
    if (filtres.typeAlerte?.length) {
      query.typeAlerte = { $in: filtres.typeAlerte };
    }
    
    // Filtres par niveau de gravité (array)
    if (filtres.niveauGravite?.length) {
      query.niveauGravite = { $in: filtres.niveauGravite };
    }
    
    // Filtres simples
    if (filtres.ville) query.ville = new RegExp(filtres.ville, 'i');
    if (filtres.declencheurId) query.declencheurId = filtres.declencheurId;
    if (filtres.estCritique !== undefined) query.estCritique = filtres.estCritique === 'true';
    
    // Filtre par date
    if (filtres.createdAt) query.createdAt = filtres.createdAt;

    // Calcul de la pagination
    const skip = (page - 1) * limite;
    
    // Exécution des requêtes
    let queryBuilder = AlerteUrgence.find(query)
      .sort(tri)
      .skip(skip)
      .limit(limite);
    
    if (peupler) {
      queryBuilder = queryBuilder
        .populate('declencheurId', 'nom email telephone')
        .populate('resoluePar', 'nom email')
        .populate('historiqueStatuts.modifiePar', 'nom');
    }

    const [alertes, total] = await Promise.all([
      queryBuilder.exec(),
      AlerteUrgence.countDocuments(query)
    ]);

    // Calcul des métadonnées de pagination
    const totalPages = Math.ceil(total / limite);
    const hasNext = page < totalPages;
    const hasPrev = page > 1;

    return {
      alertes,
      pagination: {
        page,
        limite,
        total,
        totalPages,
        hasNext,
        hasPrev
      }
    };
  } catch (error) {
    throw new AppError('Erreur lors de la recherche: ' + error.message, 500);
  }
};

/**
 * Obtient une alerte par ID
 */
const obtenirAlerte = async (alerteId) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(alerteId)) {
      throw new AppError('ID d\'alerte invalide', 400);
    }

    const alerte = await AlerteUrgence.findById(alerteId)
      .populate('declencheurId', 'nom email telephone')
      .populate('resoluePar', 'nom email')
      .populate('historiqueStatuts.modifiePar', 'nom email');

    if (!alerte) {
      throw new AppError('Alerte non trouvée', 404);
    }

    return alerte;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Erreur lors de la récupération: ' + error.message, 500);
  }
};

/**
 * Met à jour le statut d'une alerte
 */
const mettreAJourStatut = async (alerteId, nouveauStatut, utilisateurId, metadonnees = {}) => {
  try {
    const alerte = await AlerteUrgence.findById(alerteId);
    
    if (!alerte) {
      throw new AppError('Alerte non trouvée', 404);
    }

    // Validation des transitions de statut
    const transitionsValides = {
      'active': ['en_cours', 'annulee'],
      'en_cours': ['resolue', 'fermee', 'annulee'],
      'resolue': ['fermee'],
      'fermee': [],
      'annulee': []
    };

    const statutActuel = alerte.statutAlerte;
    if (!transitionsValides[statutActuel]?.includes(nouveauStatut)) {
      throw new AppError(`Transition de statut invalide: ${statutActuel} -> ${nouveauStatut}`, 400);
    }

    // Mise à jour des champs
    alerte.statutAlerte = nouveauStatut;
    
    // Ajout à l'historique
    alerte.historiqueStatuts.push({
      statut: nouveauStatut,
      modifiePar: utilisateurId,
      dateModification: new Date(),
      commentaire: metadonnees.commentaire || `Statut changé vers ${nouveauStatut}`
    });

    // Actions spécifiques selon le nouveau statut
    if (nouveauStatut === 'en_cours' && !alerte.tempsReponse) {
      alerte.tempsReponse = new Date();
    }
    
    if (nouveauStatut === 'resolue' && !alerte.resoluePar) {
      alerte.resoluePar = utilisateurId;
    }

    const alerteModifiee = await alerte.save();

    // Notification du changement de statut
    await notifierChangementStatut(alerteModifiee, statutActuel, nouveauStatut);

    return alerteModifiee;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError('Erreur lors de la mise à jour: ' + error.message, 500);
  }
};

/**
 * Notifie les contacts d'urgence
 */
const notifierContactsUrgence = async (alerte, contacts) => {
  try {
    const message = `🚨 ALERTE URGENCE 🚨\n` +
                   `Type: ${alerte.typeAlerte}\n` +
                   `Niveau: ${alerte.niveauGravite}\n` +
                   `Numéro: ${alerte.numeroUrgence}\n` +
                   `Position: ${alerte.position.latitude}, ${alerte.position.longitude}`;

    const notifications = contacts.map(async (contact) => {
      if (contact.telephone) {
        await notificationService.sendSMS(contact.telephone, message);
      }
      if (contact.email) {
        await notificationService.sendEmail(
          contact.email,
          '🚨 Alerte d\'urgence déclenchée',
          message
        );
      }
    });

    await Promise.allSettled(notifications);
  } catch (error) {
    console.error('Erreur notification contacts:', error);
  }
};

/**
 * Notifie les services d'urgence pour les alertes critiques
 */
const notifierServicesUrgence = async (alerte) => {
  try {
    console.log(`🚨 ALERTE CRITIQUE DÉCLENCHÉE - ${alerte.numeroUrgence}`);
    
    // En production, intégrer avec les APIs des services d'urgence
    const message = `ALERTE CRITIQUE - ${alerte.typeAlerte} - ${alerte.numeroUrgence}`;
    
    // Simulation d'appel aux services d'urgence
    await notificationService.sendSMS('119', message); // Pompiers
    await notificationService.sendSMS('117', message); // Police
    
  } catch (error) {
    console.error('Erreur notification services urgence:', error);
  }
};

/**
 * Notifie les changements de statut
 */
const notifierChangementStatut = async (alerte, ancienStatut, nouveauStatut) => {
  try {
    const message = `Alerte ${alerte.numeroUrgence}: ${ancienStatut} → ${nouveauStatut}`;
    
    // Notification au déclencheur
    if (alerte.declencheurId) {
      await notificationService.sendPushNotification(
        alerte.declencheurId,
        'Mise à jour alerte',
        message
      );
    }
  } catch (error) {
    console.error('Erreur notification changement statut:', error);
  }
};

/**
 * Obtient les statistiques des alertes
 */
const obtenirStatistiques = async (filtres = {}) => {
  try {
    const pipeline = [
      ...(Object.keys(filtres).length ? [{ $match: filtres }] : []),
      {
        $group: {
          _id: null,
          totalAlertes: { $sum: 1 },
          alertesActives: {
            $sum: { $cond: [{ $eq: ['$statutAlerte', 'active'] }, 1, 0] }
          },
          alertesCritiques: {
            $sum: { $cond: ['$estCritique', 1, 0] }
          },
          alertesResolues: {
            $sum: { $cond: [{ $eq: ['$statutAlerte', 'resolue'] }, 1, 0] }
          }
        }
      }
    ];

    const [stats] = await AlerteUrgence.aggregate(pipeline);
    
    return stats || {
      totalAlertes: 0,
      alertesActives: 0,
      alertesCritiques: 0,
      alertesResolues: 0
    };
  } catch (error) {
    throw new AppError('Erreur lors du calcul des statistiques: ' + error.message, 500);
  }
};

// Export des services
module.exports = {
  declencherAlerte,
  rechercherAlertes,
  obtenirAlerte,
  mettreAJourStatut,
  obtenirStatistiques,
  // Utilitaires
  genererNumeroUrgence,
  calculerPriorite
};