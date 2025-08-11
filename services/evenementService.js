const Evenement = require('../models/Evenement');
const Utilisateur = require('../models/Utilisateur');
const mongoose = require('mongoose');

class EvenementService {
  
  // Créer un nouvel événement
  static async creerEvenement(donnees, organisateurId) {
    try {
      const evenement = new Evenement({
        ...donnees,
        organisateur: organisateurId,
        participants: [organisateurId], // L'organisateur est automatiquement participant
        dateCreation: new Date()
      });

      await evenement.save();
      await evenement.populate('organisateur', 'nom prenom email');
      
      return evenement;
    } catch (error) {
      throw new Error(`Erreur lors de la création de l'événement: ${error.message}`);
    }
  }

  // Récupérer tous les événements avec pagination
  static async obtenirEvenements(page = 1, limite = 10, filtres = {}) {
    try {
      const skip = (page - 1) * limite;
      
      // Construction des filtres
      let query = {};
      
      if (filtres.ville) {
        query.ville = new RegExp(filtres.ville, 'i');
      }
      
      if (filtres.dateDebut && filtres.dateFin) {
        query.date = {
          $gte: new Date(filtres.dateDebut),
          $lte: new Date(filtres.dateFin)
        };
      }
      
      if (filtres.statut) {
        query.statut = filtres.statut;
      }

      // Récupérer uniquement les événements futurs et actifs par défaut
      if (!filtres.inclurePasses) {
        query.date = { ...query.date, $gte: new Date() };
        query.statut = { $ne: 'annule' };
      }

      const evenements = await Evenement.find(query)
        .populate('organisateur', 'nom prenom email photo')
        .sort({ date: 1 })
        .skip(skip)
        .limit(limite);

      const total = await Evenement.countDocuments(query);

      return {
        evenements,
        pagination: {
          page: parseInt(page),
          limite: parseInt(limite),
          total,
          pages: Math.ceil(total / limite)
        }
      };
    } catch (error) {
      throw new Error(`Erreur lors de la récupération des événements: ${error.message}`);
    }
  }

  // Récupérer un événement par ID
  static async obtenirEvenementParId(id) {
    try {
      if (!mongoose.Types.ObjectId.isValid(id)) {
        throw new Error('ID d\'événement invalide');
      }

      const evenement = await Evenement.findById(id)
        .populate('organisateur', 'nom prenom email photo telephone')
        .populate('participants', 'nom prenom photo');

      if (!evenement) {
        throw new Error('Événement non trouvé');
      }

      return evenement;
    } catch (error) {
      throw new Error(`Erreur lors de la récupération de l'événement: ${error.message}`);
    }
  }

  // Participer à un événement
  static async participerEvenement(evenementId, utilisateurId) {
    try {
      const evenement = await Evenement.findById(evenementId);
      
      if (!evenement) {
        throw new Error('Événement non trouvé');
      }

      // Vérifier si l'événement n'est pas complet
      if (evenement.participants.length >= evenement.nombreMaxParticipants) {
        throw new Error('L\'événement est complet');
      }

      // Vérifier si l'utilisateur ne participe pas déjà
      if (evenement.participants.includes(utilisateurId)) {
        throw new Error('Vous participez déjà à cet événement');
      }

      // Vérifier si l'événement n'est pas passé
      if (evenement.date < new Date()) {
        throw new Error('Impossible de participer à un événement passé');
      }

      // Ajouter le participant
      evenement.participants.push(utilisateurId);
      await evenement.save();

      await evenement.populate('participants', 'nom prenom photo');
      
      return evenement;
    } catch (error) {
      throw new Error(`Erreur lors de la participation: ${error.message}`);
    }
  }

  // Se désinscrire d'un événement
  static async seDesinscrireEvenement(evenementId, utilisateurId) {
    try {
      const evenement = await Evenement.findById(evenementId);
      
      if (!evenement) {
        throw new Error('Événement non trouvé');
      }

      // Vérifier si l'utilisateur participe
      if (!evenement.participants.includes(utilisateurId)) {
        throw new Error('Vous ne participez pas à cet événement');
      }

      // L'organisateur ne peut pas se désinscrire
      if (evenement.organisateur.toString() === utilisateurId) {
        throw new Error('L\'organisateur ne peut pas se désinscrire');
      }

      // Retirer le participant
      evenement.participants = evenement.participants.filter(
        participant => participant.toString() !== utilisateurId
      );
      
      await evenement.save();
      
      return evenement;
    } catch (error) {
      throw new Error(`Erreur lors de la désinscription: ${error.message}`);
    }
  }

  // Mettre à jour un événement
  static async mettreAJourEvenement(id, donnees, utilisateurId) {
    try {
      const evenement = await Evenement.findById(id);
      
      if (!evenement) {
        throw new Error('Événement non trouvé');
      }

      // Seul l'organisateur peut modifier l'événement
      if (evenement.organisateur.toString() !== utilisateurId) {
        throw new Error('Seul l\'organisateur peut modifier cet événement');
      }

      // Ne pas permettre de modifier un événement passé
      if (evenement.date < new Date()) {
        throw new Error('Impossible de modifier un événement passé');
      }

      Object.assign(evenement, donnees);
      evenement.dateModification = new Date();
      
      await evenement.save();
      await evenement.populate('organisateur', 'nom prenom email');
      
      return evenement;
    } catch (error) {
      throw new Error(`Erreur lors de la mise à jour: ${error.message}`);
    }
  }

  // Annuler un événement
  static async annulerEvenement(id, utilisateurId) {
    try {
      const evenement = await Evenement.findById(id);
      
      if (!evenement) {
        throw new Error('Événement non trouvé');
      }

      // Seul l'organisateur peut annuler l'événement
      if (evenement.organisateur.toString() !== utilisateurId) {
        throw new Error('Seul l\'organisateur peut annuler cet événement');
      }

      evenement.statut = 'annule';
      evenement.dateModification = new Date();
      
      await evenement.save();
      
      return evenement;
    } catch (error) {
      throw new Error(`Erreur lors de l'annulation: ${error.message}`);
    }
  }

  // Récupérer les événements d'un utilisateur
  static async obtenirEvenementsUtilisateur(utilisateurId, type = 'tous') {
    try {
      let query = {};
      
      switch (type) {
        case 'organises':
          query.organisateur = utilisateurId;
          break;
        case 'participes':
          query.participants = utilisateurId;
          break;
        default:
          query.$or = [
            { organisateur: utilisateurId },
            { participants: utilisateurId }
          ];
      }

      const evenements = await Evenement.find(query)
        .populate('organisateur', 'nom prenom photo')
        .sort({ date: 1 });

      return evenements;
    } catch (error) {
      throw new Error(`Erreur lors de la récupération des événements de l'utilisateur: ${error.message}`);
    }
  }

  // Rechercher des événements
  static async rechercherEvenements(termeRecherche, filtres = {}) {
    try {
      let query = {
        $or: [
          { titre: new RegExp(termeRecherche, 'i') },
          { description: new RegExp(termeRecherche, 'i') },
          { ville: new RegExp(termeRecherche, 'i') }
        ]
      };

      // Ajouter les filtres
      if (filtres.ville) {
        query.ville = new RegExp(filtres.ville, 'i');
      }
      
      if (filtres.dateDebut) {
        query.date = { $gte: new Date(filtres.dateDebut) };
      }

      const evenements = await Evenement.find(query)
        .populate('organisateur', 'nom prenom photo')
        .sort({ date: 1 })
        .limit(20);

      return evenements;
    } catch (error) {
      throw new Error(`Erreur lors de la recherche: ${error.message}`);
    }
  }
}

module.exports = EvenementService;