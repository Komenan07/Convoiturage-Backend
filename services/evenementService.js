// services/evenementService.js
const Evenement = require('../models/Evenement');
const { AppError } = require('../utils/helpers');

class EvenementService {
  
  /**
   * Créer un nouvel événement
   * @param {Object} donnees - Données de l'événement
   * @returns {Promise<Object>} L'événement créé
   */
  async creerEvenement(donnees) {
    try {
      // Valider les coordonnées si fournies
      if (donnees.lieu && donnees.lieu.coordonnees) {
        await this._validerCoordonnees(donnees.lieu.coordonnees.coordinates);
      }
      
      // Créer l'événement
      const evenement = new Evenement(donnees);
      const evenementSauvegarde = await evenement.save();
      
      return evenementSauvegarde;
    } catch (error) {
      if (error.name === 'ValidationError') {
        throw new AppError(`Erreur de validation: ${error.message}`, 400);
      }
      throw new AppError(`Erreur lors de la création: ${error.message}`, 500);
    }
  }

  /**
   * Obtenir un événement par ID
   * @param {string} evenementId - ID de l'événement
   * @returns {Promise<Object>} L'événement trouvé
   */
  async obtenirEvenement(evenementId) {
    try {
      const evenement = await Evenement.findById(evenementId)
        .populate('trajetsAssocies')
        .populate('groupesCovoiturage.membres', 'nom email');
      
      if (!evenement) {
        throw new AppError('Événement non trouvé', 404);
      }
      
      return evenement;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Erreur lors de la récupération: ${error.message}`, 500);
    }
  }

  /**
   * Mettre à jour un événement
   * @param {string} evenementId - ID de l'événement
   * @param {Object} miseAJour - Données à mettre à jour
   * @returns {Promise<Object>} L'événement mis à jour
   */
  async mettreAJourEvenement(evenementId, miseAJour) {
    try {
      // Empêcher la modification de certains champs sensibles
      const champsInterdits = ['_id', 'createdAt', 'sourceDetection'];
      champsInterdits.forEach(champ => delete miseAJour[champ]);
      
      const evenement = await Evenement.findByIdAndUpdate(
        evenementId,
        miseAJour,
        { 
          new: true, 
          runValidators: true 
        }
      ).populate('trajetsAssocies');
      
      if (!evenement) {
        throw new AppError('Événement non trouvé', 404);
      }
      
      return evenement;
    } catch (error) {
      if (error instanceof AppError) throw error;
      if (error.name === 'ValidationError') {
        throw new AppError(`Erreur de validation: ${error.message}`, 400);
      }
      throw new AppError(`Erreur lors de la mise à jour: ${error.message}`, 500);
    }
  }

  /**
   * Supprimer un événement
   * @param {string} evenementId - ID de l'événement
   * @returns {Promise<Object>} Confirmation de suppression
   */
  async supprimerEvenement(evenementId) {
    try {
      const evenement = await Evenement.findByIdAndDelete(evenementId);
      
      if (!evenement) {
        throw new AppError('Événement non trouvé', 404);
      }
      
      return { 
        message: 'Événement supprimé avec succès', 
        evenementId 
      };
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Erreur lors de la suppression: ${error.message}`, 500);
    }
  }

  /**
   * Rechercher des événements avec filtres
   * @param {Object} filtres - Critères de recherche
   * @param {Object} options - Options de pagination et tri
   * @returns {Promise<Object>} Liste d'événements et métadonnées
   */
  async rechercherEvenements(filtres = {}, options = {}) {
    try {
      // Construction de la requête
      const requete = this._construireRequete(filtres);
      
      // Options par défaut
      const {
        page = 1,
        limite = 20,
        tri = { dateDebut: 1 },
        peupler = true
      } = options;
      
      // Calculer le skip pour la pagination
      const skip = (page - 1) * limite;
      
      // Exécuter la requête
      let query = Evenement.find(requete)
        .sort(tri)
        .skip(skip)
        .limit(limite);
      
      if (peupler) {
        query = query.populate('trajetsAssocies');
      }
      
      const [evenements, total] = await Promise.all([
        query.exec(),
        Evenement.countDocuments(requete)
      ]);
      
      return {
        evenements,
        pagination: {
          page,
          limite,
          total,
          pages: Math.ceil(total / limite)
        }
      };
    } catch (error) {
      throw new AppError(`Erreur lors de la recherche: ${error.message}`, 500);
    }
  }

  /**
   * Rechercher des événements par proximité géographique
   * @param {number} longitude - Longitude du point de référence
   * @param {number} latitude - Latitude du point de référence
   * @param {number} rayonKm - Rayon de recherche en kilomètres
   * @param {Object} filtresSupplementaires - Autres filtres
   * @returns {Promise<Array>} Liste d'événements à proximité
   */
  async rechercherParProximite(longitude, latitude, rayonKm = 10, filtresSupplementaires = {}) {
    try {
      // Valider les coordonnées
      await this._validerCoordonnees([longitude, latitude]);
      
      // Construire la requête géospatiale
      const requete = {
        "lieu.coordonnees": {
          $near: {
            $geometry: { type: "Point", coordinates: [longitude, latitude] },
            $maxDistance: rayonKm * 1000
          }
        },
        ...filtresSupplementaires
      };
      
      const evenements = await Evenement.find(requete)
        .populate('trajetsAssocies')
        .sort({ dateDebut: 1 });
      
      // Ajouter la distance calculée à chaque événement
      const evenementsAvecDistance = evenements.map(evenement => {
        const distance = this._calculerDistance(
          latitude, longitude,
          evenement.lieu.coordonnees.coordinates[1],
          evenement.lieu.coordonnees.coordinates[0]
        );
        
        return {
          ...evenement.toJSON(),
          distanceKm: Math.round(distance * 100) / 100
        };
      });
      
      return evenementsAvecDistance;
    } catch (error) {
      throw new AppError(`Erreur lors de la recherche par proximité: ${error.message}`, 500);
    }
  }

  /**
   * Obtenir les événements à venir
   * @param {number} limite - Nombre maximum d'événements
   * @returns {Promise<Array>} Liste d'événements à venir
   */
  async obtenirEvenementsAVenir(limite = 20) {
    try {
      return await Evenement.obtenirEvenementsAVenir(limite);
    } catch (error) {
      throw new AppError(`Erreur lors de la récupération des événements à venir: ${error.message}`, 500);
    }
  }

  /**
   * Ajouter un groupe de covoiturage à un événement
   * @param {string} evenementId - ID de l'événement
   * @param {Object} donneesGroupe - Données du groupe
   * @returns {Promise<Object>} L'événement mis à jour
   */
  async ajouterGroupeCovoiturage(evenementId, donneesGroupe) {
    try {
      const evenement = await Evenement.findById(evenementId);
      
      if (!evenement) {
        throw new AppError('Événement non trouvé', 404);
      }
      
      // Vérifier que l'événement n'est pas terminé
      if (evenement.statutEvenement === 'TERMINE' || evenement.statutEvenement === 'ANNULE') {
        throw new AppError('Impossible d\'ajouter un groupe à un événement terminé ou annulé', 400);
      }
      
      await evenement.ajouterGroupeCovoiturage(donneesGroupe);
      
      return evenement;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Erreur lors de l'ajout du groupe: ${error.message}`, 500);
    }
  }

  /**
   * Supprimer un groupe de covoiturage
   * @param {string} evenementId - ID de l'événement
   * @param {string} groupeId - ID du groupe à supprimer
   * @returns {Promise<Object>} L'événement mis à jour
   */
  async supprimerGroupeCovoiturage(evenementId, groupeId) {
    try {
      const evenement = await Evenement.findById(evenementId);
      
      if (!evenement) {
        throw new AppError('Événement non trouvé', 404);
      }
      
      await evenement.supprimerGroupeCovoiturage(groupeId);
      
      return evenement;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Erreur lors de la suppression du groupe: ${error.message}`, 500);
    }
  }

  /**
   * Obtenir les statistiques des événements
   * @returns {Promise<Object>} Statistiques globales
   */
  async obtenirStatistiques() {
    try {
      const [
        totalEvenements,
        evenementsAVenir,
        evenementsEnCours,
        evenementsTermines,
        evenementsParType
      ] = await Promise.all([
        Evenement.countDocuments(),
        Evenement.countDocuments({ 
          dateDebut: { $gt: new Date() },
          statutEvenement: 'PROGRAMME'
        }),
        Evenement.countDocuments({ statutEvenement: 'EN_COURS' }),
        Evenement.countDocuments({ statutEvenement: 'TERMINE' }),
        Evenement.aggregate([
          { $group: { _id: '$typeEvenement', count: { $sum: 1 } } },
          { $sort: { count: -1 } }
        ])
      ]);
      
      return {
        total: totalEvenements,
        aVenir: evenementsAVenir,
        enCours: evenementsEnCours,
        termines: evenementsTermines,
        parType: evenementsParType
      };
    } catch (error) {
      throw new AppError(`Erreur lors de la récupération des statistiques: ${error.message}`, 500);
    }
  }

  // === MÉTHODES PRIVÉES ===

  /**
   * Construire la requête MongoDB à partir des filtres
   * @private
   */
  _construireRequete(filtres) {
    const requete = {};
    
    // Filtre par type d'événement
    if (filtres.typeEvenement) {
      requete.typeEvenement = filtres.typeEvenement;
    }
    
    // Filtre par statut
    if (filtres.statutEvenement) {
      requete.statutEvenement = filtres.statutEvenement;
    }
    
    // Filtre par ville
    if (filtres.ville) {
      requete['lieu.ville'] = new RegExp(filtres.ville, 'i');
    }
    
    // Filtre par date
    if (filtres.dateDebut || filtres.dateFin) {
      requete.dateDebut = {};
      if (filtres.dateDebut) {
        requete.dateDebut.$gte = new Date(filtres.dateDebut);
      }
      if (filtres.dateFin) {
        requete.dateDebut.$lte = new Date(filtres.dateFin);
      }
    }
    
    // Filtre par tags
    if (filtres.tags && filtres.tags.length > 0) {
      requete.tags = { $in: filtres.tags };
    }
    
    // Recherche textuelle
    if (filtres.recherche) {
      requete.$or = [
        { nom: new RegExp(filtres.recherche, 'i') },
        { description: new RegExp(filtres.recherche, 'i') },
        { 'lieu.nom': new RegExp(filtres.recherche, 'i') }
      ];
    }
    
    return requete;
  }

  /**
   * Valider les coordonnées GPS
   * @private
   */
  async _validerCoordonnees(coordinates) {
    if (!Array.isArray(coordinates) || coordinates.length !== 2) {
      throw new AppError('Coordonnées invalides: format attendu [longitude, latitude]', 400);
    }
    
    const [longitude, latitude] = coordinates;
    
    if (longitude < -180 || longitude > 180) {
      throw new AppError('Longitude invalide: doit être entre -180 et 180', 400);
    }
    
    if (latitude < -90 || latitude > 90) {
      throw new AppError('Latitude invalide: doit être entre -90 et 90', 400);
    }
  }

  /**
   * Calculer la distance entre deux points (formule de Haversine)
   * @private
   */
  _calculerDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Rayon de la Terre en km
    const dLat = this._degresEnRadians(lat2 - lat1);
    const dLon = this._degresEnRadians(lon2 - lon1);
    
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this._degresEnRadians(lat1)) * Math.cos(this._degresEnRadians(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    
    return R * c;
  }

  /**
   * Convertir des degrés en radians
   * @private
   */
  _degresEnRadians(degres) {
    return degres * (Math.PI/180);
  }
}

module.exports = new EvenementService();