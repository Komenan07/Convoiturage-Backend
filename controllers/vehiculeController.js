// ========================================
// CONTRÔLEUR VÉHICULES
// ========================================

const Vehicule = require('../models/Vehicule');
const Trajet = require('../models/Trajet');
const { validationResult } = require('express-validator');
const cloudinary = require('../config/cloudinary');

class VehiculeController {

  // =============== CREATE ===============
  async creerVehicule(req, res) {
    try {
      const erreurs = validationResult(req);
      if (!erreurs.isEmpty()) {
        return res.status(400).json({ 
          success: false, 
          erreurs: erreurs.array() 
        });
      }

      const {
        marque, modele, couleur, immatriculation,
        nombrePlaces, assurance, visiteTechnique
      } = req.body;

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

      // Upload photo si fournie
      let photoUrl = null;
      if (req.file) {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'vehicules',
          transformation: [
            { width: 800, height: 600, crop: 'limit' },
            { quality: 'auto:good' }
          ]
        });
        photoUrl = result.secure_url;
      }

      // Créer le véhicule
      const nouveauVehicule = new Vehicule({
        marque,
        modele,
        couleur,
        immatriculation: immatriculation.toUpperCase(),
        nombrePlaces: parseInt(nombrePlaces),
        photoVehicule: photoUrl,
        assurance: JSON.parse(assurance),
        visiteTechnique: JSON.parse(visiteTechnique),
        proprietaireId: req.user.id
      });

      await nouveauVehicule.save();

      res.status(201).json({
        success: true,
        message: 'Véhicule ajouté avec succès',
        vehicule: nouveauVehicule
      });

    } catch (error) {
      console.error('Erreur création véhicule:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la création du véhicule'
      });
    }
  }

  // =============== READ ===============
  async obtenirMesVehicules(req, res) {
    try {
      const { page = 1, limit = 10 } = req.query;
      
      const vehicules = await Vehicule.find({ 
        proprietaireId: req.user.id 
      })
      .sort({ createdAt: -1 })
      .limit(limit * 1)
      .skip((page - 1) * limit);

      const total = await Vehicule.countDocuments({ 
        proprietaireId: req.user.id 
      });

      res.json({
        success: true,
        vehicules,
        pagination: {
          page: parseInt(page),
          pages: Math.ceil(total / limit),
          total
        }
      });

    } catch (error) {
      console.error('Erreur obtention véhicules:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des véhicules'
      });
    }
  }

  async obtenirVehicule(req, res) {
    try {
      const vehicule = await Vehicule.findOne({
        _id: req.params.vehiculeId,
        proprietaireId: req.user.id
      });

      if (!vehicule) {
        return res.status(404).json({
          success: false,
          message: 'Véhicule non trouvé'
        });
      }

      res.json({
        success: true,
        vehicule
      });

    } catch (error) {
      console.error('Erreur obtention véhicule:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération du véhicule'
      });
    }
  }

  async verifierValiditeDocuments(req, res) {
    try {
      const vehicule = await Vehicule.findOne({
        _id: req.params.vehiculeId,
        proprietaireId: req.user.id
      });

      if (!vehicule) {
        return res.status(404).json({
          success: false,
          message: 'Véhicule non trouvé'
        });
      }

      const maintenant = new Date();
      const dans30Jours = new Date(maintenant.getTime() + (30 * 24 * 60 * 60 * 1000));

      const validite = {
        assurance: {
          valide: vehicule.assurance.dateExpiration > maintenant,
          expireSoon: vehicule.assurance.dateExpiration <= dans30Jours,
          dateExpiration: vehicule.assurance.dateExpiration
        },
        visiteTechnique: {
          valide: vehicule.visiteTechnique.dateExpiration > maintenant,
          expireSoon: vehicule.visiteTechnique.dateExpiration <= dans30Jours,
          dateExpiration: vehicule.visiteTechnique.dateExpiration
        }
      };

      res.json({
        success: true,
        validite,
        vehiculeUtilisable: validite.assurance.valide && validite.visiteTechnique.valide
      });

    } catch (error) {
      console.error('Erreur vérification documents:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification des documents'
      });
    }
  }

  async obtenirDocumentsExpires(req, res) {
    try {
      const maintenant = new Date();
      const dans30Jours = new Date(maintenant.getTime() + (30 * 24 * 60 * 60 * 1000));

      const vehiculesExpires = await Vehicule.find({
        proprietaireId: req.user.id,
        $or: [
          { 'assurance.dateExpiration': { $lte: dans30Jours } },
          { 'visiteTechnique.dateExpiration': { $lte: dans30Jours } }
        ]
      }).select('marque modele immatriculation assurance.dateExpiration visiteTechnique.dateExpiration');

      res.json({
        success: true,
        vehiculesExpires: vehiculesExpires.map(v => ({
          ...v.toObject(),
          alertes: {
            assurance: v.assurance.dateExpiration <= dans30Jours,
            visiteTechnique: v.visiteTechnique.dateExpiration <= dans30Jours
          }
        }))
      });

    } catch (error) {
      console.error('Erreur documents expirés:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la vérification des documents expirés'
      });
    }
  }

  // =============== UPDATE ===============
  async modifierVehicule(req, res) {
    try {
      const vehicule = await Vehicule.findOne({
        _id: req.params.vehiculeId,
        proprietaireId: req.user.id
      });

      if (!vehicule) {
        return res.status(404).json({
          success: false,
          message: 'Véhicule non trouvé'
        });
      }

      // Mise à jour des champs autorisés
      const champsModifiables = ['marque', 'modele', 'couleur', 'nombrePlaces'];
      champsModifiables.forEach(champ => {
        if (req.body[champ] !== undefined) {
          vehicule[champ] = req.body[champ];
        }
      });

      // Upload nouvelle photo si fournie
      if (req.file) {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'vehicules',
          transformation: [
            { width: 800, height: 600, crop: 'limit' },
            { quality: 'auto:good' }
          ]
        });
        vehicule.photoVehicule = result.secure_url;
      }

      await vehicule.save();

      res.json({
        success: true,
        message: 'Véhicule modifié avec succès',
        vehicule
      });

    } catch (error) {
      console.error('Erreur modification véhicule:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la modification du véhicule'
      });
    }
  }

  async renouvellerAssurance(req, res) {
    try {
      const { numeroPolice, dateExpiration, compagnie } = req.body;

      const vehicule = await Vehicule.findOneAndUpdate(
        {
          _id: req.params.vehiculeId,
          proprietaireId: req.user.id
        },
        {
          'assurance.numeroPolice': numeroPolice,
          'assurance.dateExpiration': new Date(dateExpiration),
          'assurance.compagnie': compagnie,
          updatedAt: new Date()
        },
        { new: true }
      );

      if (!vehicule) {
        return res.status(404).json({
          success: false,
          message: 'Véhicule non trouvé'
        });
      }

      res.json({
        success: true,
        message: 'Assurance renouvelée avec succès',
        assurance: vehicule.assurance
      });

    } catch (error) {
      console.error('Erreur renouvellement assurance:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du renouvellement de l\'assurance'
      });
    }
  }

  async renouvellerVisiteTechnique(req, res) {
    try {
      const { dateExpiration } = req.body;

      // Upload certificat si fourni
      let certificatUrl = null;
      if (req.file) {
        const result = await cloudinary.uploader.upload(req.file.path, {
          folder: 'certificats',
          resource_type: 'auto'
        });
        certificatUrl = result.secure_url;
      }

      const updateData = {
        'visiteTechnique.dateExpiration': new Date(dateExpiration),
        updatedAt: new Date()
      };

      if (certificatUrl) {
        updateData['visiteTechnique.certificatUrl'] = certificatUrl;
      }

      const vehicule = await Vehicule.findOneAndUpdate(
        {
          _id: req.params.vehiculeId,
          proprietaireId: req.user.id
        },
        updateData,
        { new: true }
      );

      if (!vehicule) {
        return res.status(404).json({
          success: false,
          message: 'Véhicule non trouvé'
        });
      }

      res.json({
        success: true,
        message: 'Visite technique renouvelée avec succès',
        visiteTechnique: vehicule.visiteTechnique
      });

    } catch (error) {
      console.error('Erreur renouvellement visite technique:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors du renouvellement de la visite technique'
      });
    }
  }

  async definirVehiculePrincipal(req, res) {
    try {
      // Retirer le statut principal de tous les véhicules de l'utilisateur
      await Vehicule.updateMany(
        { proprietaireId: req.user.id },
        { $unset: { principal: "" } }
      );

      // Définir ce véhicule comme principal
      const vehicule = await Vehicule.findOneAndUpdate(
        {
          _id: req.params.vehiculeId,
          proprietaireId: req.user.id
        },
        { 
          principal: true,
          updatedAt: new Date()
        },
        { new: true }
      );

      if (!vehicule) {
        return res.status(404).json({
          success: false,
          message: 'Véhicule non trouvé'
        });
      }

      res.json({
        success: true,
        message: 'Véhicule défini comme principal',
        vehicule
      });

    } catch (error) {
      console.error('Erreur définition véhicule principal:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la définition du véhicule principal'
      });
    }
  }

  // =============== DELETE ===============
  async supprimerVehicule(req, res) {
    try {
      const vehicule = await Vehicule.findOne({
        _id: req.params.vehiculeId,
        proprietaireId: req.user.id
      });

      if (!vehicule) {
        return res.status(404).json({
          success: false,
          message: 'Véhicule non trouvé'
        });
      }

      // Vérifier s'il y a des trajets actifs avec ce véhicule
      const trajetsActifs = await Trajet.countDocuments({
        vehiculeId: req.params.vehiculeId,
        statut: { $in: ['actif', 'en_cours'] }
      });

      if (trajetsActifs > 0) {
        return res.status(409).json({
          success: false,
          message: 'Impossible de supprimer le véhicule car il est utilisé dans des trajets actifs'
        });
      }

      await Vehicule.findByIdAndDelete(req.params.vehiculeId);

      res.json({
        success: true,
        message: 'Véhicule supprimé avec succès'
      });

    } catch (error) {
      console.error('Erreur suppression véhicule:', error);
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la suppression du véhicule'
      });
    }
  }
}

module.exports = new VehiculeController();