const Vehicule = require('../models/Vehicule');
const mongoose = require('mongoose');
const path = require('path');
const fs = require('fs').promises;

/**
 * Contrôleur pour la gestion des véhicules
 */
class VehiculeController {
  
  /**
   * CREATE - Ajouter un nouveau véhicule
   */
  static async ajouterVehicule(req, res) {
    try {
      const {
        marque,
        modele,
        couleur,
        immatriculation,
        nombrePlaces,
        assurance,
        visiteTechnique,
        proprietaireId,
        estPrincipal
      } = req.body;

      // Validation des données requises
      if (!marque || !modele || !couleur || !immatriculation || !nombrePlaces || !proprietaireId) {
        return res.status(400).json({
          success: false,
          message: 'Tous les champs obligatoires doivent être renseignés'
        });
      }

      // Vérifier si l'immatriculation existe déjà
      const vehiculeExistant = await Vehicule.findOne({ 
        immatriculation: immatriculation.toUpperCase() 
      });
      
      if (vehiculeExistant) {
        return res.status(409).json({
          success: false,
          message: 'Un véhicule avec cette immatriculation existe déjà'
        });
      }

      // Créer le nouveau véhicule
      const nouveauVehicule = new Vehicule({
        marque,
        modele,
        couleur,
        immatriculation: immatriculation.toUpperCase(),
        nombrePlaces,
        assurance,
        visiteTechnique,
        proprietaireId,
        estPrincipal: estPrincipal || false,
        photoVehicule: req.file ? `/uploads/vehicules/${req.file.filename}` : null
      });

      // Si c'est le véhicule principal, désactiver les autres
      if (estPrincipal) {
        await Vehicule.updateMany(
          { proprietaireId, _id: { $ne: nouveauVehicule._id } },
          { estPrincipal: false }
        );
      }

      const vehiculeSauvegarde = await nouveauVehicule.save();
      await vehiculeSauvegarde.populate('proprietaireId', 'nom prenom email');

      res.status(201).json({
        success: true,
        message: 'Véhicule ajouté avec succès',
        data: vehiculeSauvegarde
      });

    } catch (error) {
      console.error('Erreur lors de l\'ajout du véhicule:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de l\'ajout du véhicule',
        error: error.message
      });
    }
  }

  /**
   * READ - Obtenir tous les véhicules d'un utilisateur
   */
  static async obtenirVehiculesUtilisateur(req, res) {
    try {
      const { utilisateurId } = req.params;
      const { statut, page = 1, limit = 10 } = req.query;

      if (!mongoose.Types.ObjectId.isValid(utilisateurId)) {
        return res.status(400).json({
          success: false,
          message: 'ID utilisateur invalide'
        });
      }

      // Construire les filtres
      const filtres = { proprietaireId: utilisateurId };
      if (statut) {
        filtres.statut = statut;
      }

      // Pagination
      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { estPrincipal: -1, createdAt: -1 }
      };

      const vehicules = await Vehicule.find(filtres)
        .populate('proprietaireId', 'nom prenom email')
        .sort(options.sort)
        .limit(options.limit * 1)
        .skip((options.page - 1) * options.limit);

      const total = await Vehicule.countDocuments(filtres);

      // Ajouter les informations de validité des documents
      const vehiculesAvecValidite = vehicules.map(vehicule => ({
        ...vehicule.toObject(),
        documentsValidite: vehicule.documentsValides()
      }));

      res.status(200).json({
        success: true,
        data: vehiculesAvecValidite,
        pagination: {
          page: options.page,
          limit: options.limit,
          total,
          pages: Math.ceil(total / options.limit)
        }
      });

    } catch (error) {
      console.error('Erreur lors de la récupération des véhicules:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de la récupération des véhicules',
        error: error.message
      });
    }
  }

  /**
   * READ - Obtenir les détails d'un véhicule
   */
  static async obtenirDetailsVehicule(req, res) {
    try {
      const { vehiculeId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(vehiculeId)) {
        return res.status(400).json({
          success: false,
          message: 'ID véhicule invalide'
        });
      }

      const vehicule = await Vehicule.findById(vehiculeId)
        .populate('proprietaireId', 'nom prenom email telephone');

      if (!vehicule) {
        return res.status(404).json({
          success: false,
          message: 'Véhicule non trouvé'
        });
      }

      const vehiculeAvecValidite = {
        ...vehicule.toObject(),
        documentsValidite: vehicule.documentsValides()
      };

      res.status(200).json({
        success: true,
        data: vehiculeAvecValidite
      });

    } catch (error) {
      console.error('Erreur lors de la récupération du véhicule:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de la récupération du véhicule',
        error: error.message
      });
    }
  }

  /**
   * UPDATE - Modifier les informations d'un véhicule
   */
  static async modifierVehicule(req, res) {
    try {
      const { vehiculeId } = req.params;
      const donneesModification = req.body;

      if (!mongoose.Types.ObjectId.isValid(vehiculeId)) {
        return res.status(400).json({
          success: false,
          message: 'ID véhicule invalide'
        });
      }

      const vehicule = await Vehicule.findById(vehiculeId);
      if (!vehicule) {
        return res.status(404).json({
          success: false,
          message: 'Véhicule non trouvé'
        });
      }

      // Si une nouvelle photo est uploadée
      if (req.file) {
        // Supprimer l'ancienne photo si elle existe
        if (vehicule.photoVehicule) {
          try {
            await fs.unlink(path.join(process.cwd(), 'public', vehicule.photoVehicule));
          } catch (err) {
            console.log('Erreur lors de la suppression de l\'ancienne photo:', err);
          }
        }
        donneesModification.photoVehicule = `/uploads/vehicules/${req.file.filename}`;
      }

      // Si on change l'immatriculation, vérifier qu'elle n'existe pas déjà
      if (donneesModification.immatriculation) {
        const vehiculeExistant = await Vehicule.findOne({
          immatriculation: donneesModification.immatriculation.toUpperCase(),
          _id: { $ne: vehiculeId }
        });
        
        if (vehiculeExistant) {
          return res.status(409).json({
            success: false,
            message: 'Un autre véhicule avec cette immatriculation existe déjà'
          });
        }
        donneesModification.immatriculation = donneesModification.immatriculation.toUpperCase();
      }

      const vehiculeModifie = await Vehicule.findByIdAndUpdate(
        vehiculeId,
        donneesModification,
        { new: true, runValidators: true }
      ).populate('proprietaireId', 'nom prenom email');

      res.status(200).json({
        success: true,
        message: 'Véhicule modifié avec succès',
        data: vehiculeModifie
      });

    } catch (error) {
      console.error('Erreur lors de la modification du véhicule:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de la modification du véhicule',
        error: error.message
      });
    }
  }

  /**
   * UPDATE - Définir comme véhicule principal
   */
  static async definirVehiculePrincipal(req, res) {
    try {
      const { vehiculeId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(vehiculeId)) {
        return res.status(400).json({
          success: false,
          message: 'ID véhicule invalide'
        });
      }

      const vehicule = await Vehicule.findById(vehiculeId);
      if (!vehicule) {
        return res.status(404).json({
          success: false,
          message: 'Véhicule non trouvé'
        });
      }

      const vehiculePrincipal = await vehicule.definirCommePrincipal();

      res.status(200).json({
        success: true,
        message: 'Véhicule défini comme principal avec succès',
        data: vehiculePrincipal
      });

    } catch (error) {
      console.error('Erreur lors de la définition du véhicule principal:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de la définition du véhicule principal',
        error: error.message
      });
    }
  }

  /**
   * UPDATE - Renouveler l'assurance
   */
  static async renouvellerAssurance(req, res) {
    try {
      const { vehiculeId } = req.params;
      const { numeroPolice, dateExpiration, compagnie } = req.body;

      if (!mongoose.Types.ObjectId.isValid(vehiculeId)) {
        return res.status(400).json({
          success: false,
          message: 'ID véhicule invalide'
        });
      }

      if (!numeroPolice || !dateExpiration || !compagnie) {
        return res.status(400).json({
          success: false,
          message: 'Tous les champs de l\'assurance sont requis'
        });
      }

      const vehicule = await Vehicule.findByIdAndUpdate(
        vehiculeId,
        {
          'assurance.numeroPolice': numeroPolice,
          'assurance.dateExpiration': new Date(dateExpiration),
          'assurance.compagnie': compagnie
        },
        { new: true, runValidators: true }
      );

      if (!vehicule) {
        return res.status(404).json({
          success: false,
          message: 'Véhicule non trouvé'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Assurance renouvelée avec succès',
        data: vehicule
      });

    } catch (error) {
      console.error('Erreur lors du renouvellement de l\'assurance:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors du renouvellement de l\'assurance',
        error: error.message
      });
    }
  }

  /**
   * UPDATE - Renouveler la visite technique
   */
  static async renouvellerVisiteTechnique(req, res) {
    try {
      const { vehiculeId } = req.params;
      const { dateExpiration } = req.body;

      if (!mongoose.Types.ObjectId.isValid(vehiculeId)) {
        return res.status(400).json({
          success: false,
          message: 'ID véhicule invalide'
        });
      }

      if (!dateExpiration) {
        return res.status(400).json({
          success: false,
          message: 'La date d\'expiration est requise'
        });
      }

      const donneesModification = {
        'visiteTechnique.dateExpiration': new Date(dateExpiration)
      };

      // Si un certificat est uploadé
      if (req.file) {
        donneesModification['visiteTechnique.certificatUrl'] = `/uploads/vehicules/${req.file.filename}`;
      }

      const vehicule = await Vehicule.findByIdAndUpdate(
        vehiculeId,
        donneesModification,
        { new: true, runValidators: true }
      );

      if (!vehicule) {
        return res.status(404).json({
          success: false,
          message: 'Véhicule non trouvé'
        });
      }

      res.status(200).json({
        success: true,
        message: 'Visite technique renouvelée avec succès',
        data: vehicule
      });

    } catch (error) {
      console.error('Erreur lors du renouvellement de la visite technique:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors du renouvellement de la visite technique',
        error: error.message
      });
    }
  }

  /**
   * READ - Vérifier la validité des documents
   */
  static async verifierValiditeDocuments(req, res) {
    try {
      const { vehiculeId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(vehiculeId)) {
        return res.status(400).json({
          success: false,
          message: 'ID véhicule invalide'
        });
      }

      const vehicule = await Vehicule.findById(vehiculeId);
      if (!vehicule) {
        return res.status(404).json({
          success: false,
          message: 'Véhicule non trouvé'
        });
      }

      const validiteDocuments = vehicule.documentsValides();

      res.status(200).json({
        success: true,
        data: validiteDocuments
      });

    } catch (error) {
      console.error('Erreur lors de la vérification des documents:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de la vérification des documents',
        error: error.message
      });
    }
  }

  /**
   * DELETE - Supprimer un véhicule
   */
  static async supprimerVehicule(req, res) {
    try {
      const { vehiculeId } = req.params;

      if (!mongoose.Types.ObjectId.isValid(vehiculeId)) {
        return res.status(400).json({
          success: false,
          message: 'ID véhicule invalide'
        });
      }

      const vehicule = await Vehicule.findById(vehiculeId);
      if (!vehicule) {
        return res.status(404).json({
          success: false,
          message: 'Véhicule non trouvé'
        });
      }

      // TODO: Vérifier s'il n'y a pas de trajets actifs pour ce véhicule
      // Cette logique dépend de votre modèle de trajets

      // Supprimer les fichiers associés
      if (vehicule.photoVehicule) {
        try {
          await fs.unlink(path.join(process.cwd(), 'public', vehicule.photoVehicule));
        } catch (err) {
          console.log('Erreur lors de la suppression de la photo:', err);
        }
      }

      if (vehicule.visiteTechnique.certificatUrl) {
        try {
          await fs.unlink(path.join(process.cwd(), 'public', vehicule.visiteTechnique.certificatUrl));
        } catch (err) {
          console.log('Erreur lors de la suppression du certificat:', err);
        }
      }

      await Vehicule.findByIdAndDelete(vehiculeId);

      res.status(200).json({
        success: true,
        message: 'Véhicule supprimé avec succès'
      });

    } catch (error) {
      console.error('Erreur lors de la suppression du véhicule:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de la suppression du véhicule',
        error: error.message
      });
    }
  }

  /**
   * READ - Obtenir les véhicules avec documents expirés ou à expirer
   */
  static async obtenirVehiculesExpiresOuAExpirer(req, res) {
    try {
      const { jours = 30 } = req.query; // Par défaut, vérifier les documents qui expirent dans 30 jours
      const dateLimit = new Date();
      dateLimit.setDate(dateLimit.getDate() + parseInt(jours));

      const vehicules = await Vehicule.find({
        $or: [
          { 'assurance.dateExpiration': { $lte: dateLimit } },
          { 'visiteTechnique.dateExpiration': { $lte: dateLimit } }
        ]
      }).populate('proprietaireId', 'nom prenom email telephone');

      const vehiculesAvecValidite = vehicules.map(vehicule => ({
        ...vehicule.toObject(),
        documentsValidite: vehicule.documentsValides()
      }));

      res.status(200).json({
        success: true,
        data: vehiculesAvecValidite,
        message: `Véhicules avec documents expirant dans les ${jours} prochains jours`
      });

    } catch (error) {
      console.error('Erreur lors de la récupération des véhicules à expirer:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur serveur lors de la récupération des véhicules',
        error: error.message
      });
    }
  }
}

module.exports = VehiculeController;