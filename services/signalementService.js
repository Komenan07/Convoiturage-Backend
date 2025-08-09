const Signalement = require('../models/Signalement');
const User = require('../models/Utilisateur');
const AppError = require('../utils/appError');
const { sendNotification } = require('./alerteUrgenceService');

// Créer un nouveau signalement
const creerSignalement = async (data) => {
  try {
    const nouveauSignalement = await Signalement.create(data);
    
    // Notifier les modérateurs
    const moderateurs = await User.find({ roles: 'MODERATEUR' });
    moderateurs.forEach(moderateur => {
      sendNotification(
        moderateur._id,
        'Nouveau signalement',
        `Un nouveau signalement de type ${data.typeSignalement} a été créé`,
        { signalementId: nouveauSignalement._id }
      );
    });

    return nouveauSignalement;
  } catch (error) {
    throw new AppError('Erreur lors de la création du signalement', 500);
  }
};

// Télécharger des preuves
const uploaderPreuves = async (signalementId, fichiers) => {
  try {
    const urls = fichiers.map(f => `/uploads/signalements/${f.filename}`);
    return await Signalement.findByIdAndUpdate(
      signalementId,
      { $push: { preuves: { $each: urls } } },
      { new: true }
    );
  } catch (error) {
    throw new AppError('Erreur lors du téléchargement des preuves', 500);
  }
};

// Obtenir un signalement par ID
const obtenirSignalement = async (id) => {
  try {
    return await Signalement.findById(id)
      .populate('signaleurId', 'nom prenom')
      .populate('signaleId', 'nom prenom')
      .populate('moderateurId', 'nom prenom');
  } catch (error) {
    throw new AppError('Erreur lors de la récupération du signalement', 500);
  }
};

// Traiter un signalement
const traiterSignalement = async (id, data) => {
  try {
    const updateData = {
      statut: 'TRAITE',
      dateTraitement: new Date(),
      ...data
    };

    const signalementTraite = await Signalement.findByIdAndUpdate(
      id,
      updateData,
      { new: true }
    );

    // Appliquer les sanctions
    if (data.actionsDisciplinaires && data.actionsDisciplinaires.length > 0) {
      await appliquerSanctions(
        signalementTraite.signaleId, 
        data.actionsDisciplinaires
      );
    }

    return signalementTraite;
  } catch (error) {
    throw new AppError('Erreur lors du traitement du signalement', 500);
  }
};

// Assigner un modérateur
const assignerModerateur = async (signalementId, moderateurId) => {
  try {
    return await Signalement.findByIdAndUpdate(
      signalementId,
      { 
        statut: 'EN_COURS',
        moderateurId,
        dateAssignation: new Date() 
      },
      { new: true }
    );
  } catch (error) {
    throw new AppError('Erreur lors de l\'assignation du modérateur', 500);
  }
};

// Obtenir la queue de modération
const obtenirQueueModeration = async (filtres = {}, options = {}) => {
  try {
    const { page = 1, limite = 10 } = options;
    const skip = (page - 1) * limite;

    const query = { 
      statut: 'EN_ATTENTE',
      ...filtres 
    };

    return await Signalement.find(query)
      .sort({ priorite: -1, dateCreation: 1 })
      .skip(skip)
      .limit(limite)
      .populate('signaleurId', 'nom prenom');
  } catch (error) {
    throw new AppError('Erreur lors de la récupération de la queue', 500);
  }
};

// Obtenir les statistiques de modération
const obtenirStatistiquesModeration = async (filtres = {}) => {
  try {
    const pipeline = [
      { $match: filtres },
      { $group: {
          _id: null,
          total: { $sum: 1 },
          enAttente: { $sum: { $cond: [{ $eq: ['$statut', 'EN_ATTENTE'] }, 1, 0] } },
          enCours: { $sum: { $cond: [{ $eq: ['$statut', 'EN_COURS'] }, 1, 0] } },
          traites: { $sum: { $cond: [{ $eq: ['$statut', 'TRAITE'] }, 1, 0] } },
          rejetes: { $sum: { $cond: [{ $eq: ['$statut', 'REJETE'] }, 1, 0] } }
        }
      }
    ];

    const result = await Signalement.aggregate(pipeline);
    return result[0] || {
      total: 0,
      enAttente: 0,
      enCours: 0,
      traites: 0,
      rejetes: 0
    };
  } catch (error) {
    throw new AppError('Erreur lors du calcul des statistiques', 500);
  }
};

// --- Fonctions internes ---
const appliquerSanctions = async (userId, sanctions) => {
  const user = await User.findById(userId);
  
  for (const sanction of sanctions) {
    switch (sanction) {
      case 'SUSPENSION_1_JOUR':
        user.suspension = new Date(Date.now() + 24 * 60 * 60 * 1000);
        break;
      case 'SUSPENSION_7_JOURS':
        user.suspension = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000);
        break;
      case 'BLOCAGE_DEFINITIF':
        user.actif = false;
        break;
      // ... autres sanctions
    }
  }

  await user.save();
};

module.exports = {
  creerSignalement,
  uploaderPreuves,
  obtenirSignalement,
  traiterSignalement,
  assignerModerateur,
  obtenirQueueModeration,
  obtenirStatistiquesModeration
};