const Trajet = require('../models/Trajet');
const { validationResult } = require('express-validator');

class TrajetController {
  
  // ==================== CREATE ====================
  
  /**
   * Créer un trajet ponctuel
   */
  async creerTrajetPonctuel(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false, 
          message: 'Erreurs de validation', 
          errors: errors.array() 
        });
      }

      const trajetData = {
        ...req.body,
        conducteurId: req.user.id,
        typeTrajet: 'PONCTUEL'
      };

      // Validation avec Google Maps API (simulation)
      const itineraireValide = await this.validerItineraire(
        trajetData.pointDepart.coordonnees.coordinates,
        trajetData.pointArrivee.coordonnees.coordinates
      );

      if (!itineraireValide.success) {
        return res.status(400).json({
          success: false,
          message: 'Itinéraire invalide',
          details: itineraireValide.message
        });
      }

      // Ajout des données calculées depuis Google Maps
      trajetData.distance = itineraireValide.distance;
      trajetData.dureeEstimee = itineraireValide.duree;
      trajetData.heureArriveePrevue = itineraireValide.heureArrivee;

      const nouveauTrajet = new Trajet(trajetData);
      await nouveauTrajet.save();

      await nouveauTrajet.populate('conducteurId', 'nom prenom photo');

      res.status(201).json({
        success: true,
        message: 'Trajet ponctuel créé avec succès',
        data: nouveauTrajet
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la création du trajet',
        error: error.message
      });
    }
  }

  /**
   * Créer un trajet récurrent
   */
  async creerTrajetRecurrent(req, res) {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ 
          success: false, 
          message: 'Erreurs de validation', 
          errors: errors.array() 
        });
      }

      const trajetData = {
        ...req.body,
        conducteurId: req.user.id,
        typeTrajet: 'RECURRENT'
      };

      // Validation de la récurrence
      if (!trajetData.recurrence || !trajetData.recurrence.jours || trajetData.recurrence.jours.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'La récurrence est requise pour un trajet récurrent'
        });
      }

      // Validation avec Google Maps API
      const itineraireValide = await this.validerItineraire(
        trajetData.pointDepart.coordonnees.coordinates,
        trajetData.pointArrivee.coordonnees.coordinates
      );

      if (!itineraireValide.success) {
        return res.status(400).json({
          success: false,
          message: 'Itinéraire invalide',
          details: itineraireValide.message
        });
      }

      trajetData.distance = itineraireValide.distance;
      trajetData.dureeEstimee = itineraireValide.duree;
      trajetData.heureArriveePrevue = itineraireValide.heureArrivee;

      const nouveauTrajet = new Trajet(trajetData);
      await nouveauTrajet.save();

      await nouveauTrajet.populate('conducteurId', 'nom prenom photo');

      res.status(201).json({
        success: true,
        message: 'Trajet récurrent créé avec succès',
        data: nouveauTrajet
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la création du trajet récurrent',
        error: error.message
      });
    }
  }

  // ==================== READ ====================

  /**
   * Rechercher trajets disponibles (géospatial)
   */
  async rechercherTrajetsDisponibles(req, res) {
    try {
      const {
        longitude,
        latitude,
        rayonKm = 10,
        dateDepart,
        dateFin,
        prixMax,
        nombrePlacesMin = 1
      } = req.query;

      let query = {
        statutTrajet: 'PROGRAMME',
        nombrePlacesDisponibles: { $gte: parseInt(nombrePlacesMin) }
      };

      // Filtre par date
      if (dateDepart) {
        query.dateDepart = { $gte: new Date(dateDepart) };
        if (dateFin) {
          query.dateDepart.$lte = new Date(dateFin);
        }
      }

      // Filtre par prix
      if (prixMax) {
        query.prixParPassager = { $lte: parseInt(prixMax) };
      }

      let trajets;

      // Recherche géospatiale si coordonnées fournies
      if (longitude && latitude) {
        trajets = await Trajet.findTrajetsProches(
          parseFloat(longitude), 
          parseFloat(latitude), 
          parseInt(rayonKm)
        ).where(query)
          .populate('conducteurId', 'nom prenom photo note')
          .sort({ dateDepart: 1 });
      } else {
        trajets = await Trajet.find(query)
          .populate('conducteurId', 'nom prenom photo note')
          .sort({ dateDepart: 1 });
      }

      res.json({
        success: true,
        count: trajets.length,
        data: trajets
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la recherche de trajets',
        error: error.message
      });
    }
  }

  /**
   * Obtenir détails complets d'un trajet
   */
  async obtenirDetailsTrajet(req, res) {
    try {
      const { id } = req.params;

      const trajet = await Trajet.findById(id)
        .populate('conducteurId', 'nom prenom photo telephone note avis')
        .populate('evenementAssocie', 'nom description');

      if (!trajet) {
        return res.status(404).json({
          success: false,
          message: 'Trajet non trouvé'
        });
      }

      res.json({
        success: true,
        data: trajet
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération du trajet',
        error: error.message
      });
    }
  }

  /**
   * Obtenir tous les trajets d'un conducteur
   */
  async obtenirTrajetsConducteur(req, res) {
    try {
      const { conducteurId } = req.params;
      const { statut, type, page = 1, limit = 10 } = req.query;

      let query = { conducteurId };

      if (statut) {
        query.statutTrajet = statut;
      }

      if (type) {
        query.typeTrajet = type;
      }

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { dateDepart: -1 },
        populate: 'evenementAssocie'
      };

      const trajets = await Trajet.paginate(query, options);

      res.json({
        success: true,
        data: trajets.docs,
        pagination: {
          page: trajets.page,
          totalPages: trajets.totalPages,
          totalDocs: trajets.totalDocs,
          hasNextPage: trajets.hasNextPage,
          hasPrevPage: trajets.hasPrevPage
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération des trajets du conducteur',
        error: error.message
      });
    }
  }

  /**
   * Obtenir l'historique des trajets (pour un utilisateur connecté)
   */
  async obtenirHistoriqueTrajets(req, res) {
    try {
      const { type = 'tous', page = 1, limit = 10 } = req.query;
      const userId = req.user.id;

      let query = {};

      switch (type) {
        case 'conduits':
          query.conducteurId = userId;
          break;
        case 'tous':
        default:
          query = {
            $or: [
              { conducteurId: userId },
              // TODO: Ajouter la référence aux réservations quand disponible
              // { 'reservations.passagerId': userId }
            ]
          };
          break;
      }

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { dateDepart: -1 },
        populate: [
          { path: 'conducteurId', select: 'nom prenom photo' },
          { path: 'evenementAssocie', select: 'nom' }
        ]
      };

      const historique = await Trajet.paginate(query, options);

      res.json({
        success: true,
        data: historique.docs,
        pagination: {
          page: historique.page,
          totalPages: historique.totalPages,
          totalDocs: historique.totalDocs
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la récupération de l\'historique',
        error: error.message
      });
    }
  }

  /**
   * Filtrer les trajets avec critères avancés
   */
  async filtrerTrajets(req, res) {
    try {
      const {
        dateDepart,
        dateFin,
        prixMin,
        prixMax,
        typeTrajet,
        accepteFemmesSeulement,
        accepteHommesSeuleument,
        accepteBagages,
        musique,
        fumeur,
        commune,
        page = 1,
        limit = 10
      } = req.query;

      let query = {
        statutTrajet: 'PROGRAMME',
        nombrePlacesDisponibles: { $gt: 0 }
      };

      // Filtres de date
      if (dateDepart || dateFin) {
        query.dateDepart = {};
        if (dateDepart) query.dateDepart.$gte = new Date(dateDepart);
        if (dateFin) query.dateDepart.$lte = new Date(dateFin);
      }

      // Filtres de prix
      if (prixMin || prixMax) {
        query.prixParPassager = {};
        if (prixMin) query.prixParPassager.$gte = parseInt(prixMin);
        if (prixMax) query.prixParPassager.$lte = parseInt(prixMax);
      }

      // Type de trajet
      if (typeTrajet) {
        query.typeTrajet = typeTrajet;
      }

      // Filtres de préférences
      if (accepteFemmesSeulement === 'true') {
        query['preferences.accepteFemmesSeulement'] = true;
      }
      if (accepteHommesSeuleument === 'true') {
        query['preferences.accepteHommesSeuleument'] = true;
      }
      if (accepteBagages === 'false') {
        query['preferences.accepteBagages'] = false;
      }
      if (musique === 'true') {
        query['preferences.musique'] = true;
      }
      if (fumeur === 'true') {
        query['preferences.fumeur'] = true;
      }

      // Filtre par commune (départ ou arrivée)
      if (commune) {
        query.$or = [
          { 'pointDepart.commune': new RegExp(commune, 'i') },
          { 'pointArrivee.commune': new RegExp(commune, 'i') }
        ];
      }

      const options = {
        page: parseInt(page),
        limit: parseInt(limit),
        sort: { dateDepart: 1 },
        populate: { path: 'conducteurId', select: 'nom prenom photo note' }
      };

      const resultat = await Trajet.paginate(query, options);

      res.json({
        success: true,
        data: resultat.docs,
        pagination: {
          page: resultat.page,
          totalPages: resultat.totalPages,
          totalDocs: resultat.totalDocs,
          count: resultat.docs.length
        },
        filters: req.query
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors du filtrage des trajets',
        error: error.message
      });
    }
  }

  // ==================== UPDATE ====================

  /**
   * Modifier les détails d'un trajet
   */
  async modifierDetailsTrajet(req, res) {
    try {
      const { id } = req.params;
      const updates = req.body;

      // Vérifier que l'utilisateur est le conducteur
      const trajet = await Trajet.findById(id);
      if (!trajet) {
        return res.status(404).json({
          success: false,
          message: 'Trajet non trouvé'
        });
      }

      if (trajet.conducteurId.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'êtes pas autorisé à modifier ce trajet'
        });
      }

      // Vérifier que le trajet peut être modifié
      if (trajet.statutTrajet === 'EN_COURS' || trajet.statutTrajet === 'TERMINE') {
        return res.status(400).json({
          success: false,
          message: 'Ce trajet ne peut plus être modifié'
        });
      }

      // Revalidation de l'itinéraire si les points changent
      if (updates.pointDepart || updates.pointArrivee) {
        const pointDepart = updates.pointDepart || trajet.pointDepart;
        const pointArrivee = updates.pointArrivee || trajet.pointArrivee;
        
        const itineraireValide = await this.validerItineraire(
          pointDepart.coordonnees.coordinates,
          pointArrivee.coordonnees.coordinates
        );

        if (itineraireValide.success) {
          updates.distance = itineraireValide.distance;
          updates.dureeEstimee = itineraireValide.duree;
          updates.heureArriveePrevue = itineraireValide.heureArrivee;
        }
      }

      const trajetModifie = await Trajet.findByIdAndUpdate(
        id,
        { $set: updates },
        { new: true, runValidators: true }
      ).populate('conducteurId', 'nom prenom photo');

      res.json({
        success: true,
        message: 'Trajet modifié avec succès',
        data: trajetModifie
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la modification du trajet',
        error: error.message
      });
    }
  }

  /**
   * Changer le nombre de places disponibles
   */
  async changerNombrePlaces(req, res) {
    try {
      const { id } = req.params;
      const { nombrePlacesDisponibles } = req.body;

      const trajet = await Trajet.findById(id);
      if (!trajet) {
        return res.status(404).json({
          success: false,
          message: 'Trajet non trouvé'
        });
      }

      if (trajet.conducteurId.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'êtes pas autorisé à modifier ce trajet'
        });
      }

      if (nombrePlacesDisponibles > trajet.nombrePlacesTotal) {
        return res.status(400).json({
          success: false,
          message: 'Le nombre de places disponibles ne peut pas dépasser le nombre total de places'
        });
      }

      trajet.nombrePlacesDisponibles = nombrePlacesDisponibles;
      await trajet.save();

      res.json({
        success: true,
        message: 'Nombre de places mis à jour avec succès',
        data: {
          nombrePlacesDisponibles: trajet.nombrePlacesDisponibles,
          nombrePlacesTotal: trajet.nombrePlacesTotal,
          placesReservees: trajet.placesReservees
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la modification du nombre de places',
        error: error.message
      });
    }
  }

  /**
   * Modifier les préférences du trajet
   */
  async modifierPreferences(req, res) {
    try {
      const { id } = req.params;
      const nouvellesPreferences = req.body;

      const trajet = await Trajet.findById(id);
      if (!trajet) {
        return res.status(404).json({
          success: false,
          message: 'Trajet non trouvé'
        });
      }

      if (trajet.conducteurId.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'êtes pas autorisé à modifier ce trajet'
        });
      }

      // Validation des préférences contradictoires
      if (nouvellesPreferences.accepteFemmesSeulement && nouvellesPreferences.accepteHommesSeuleument) {
        return res.status(400).json({
          success: false,
          message: 'Ne peut pas accepter exclusivement les femmes ET les hommes'
        });
      }

      trajet.preferences = { ...trajet.preferences.toObject(), ...nouvellesPreferences };
      await trajet.save();

      res.json({
        success: true,
        message: 'Préférences mises à jour avec succès',
        data: trajet.preferences
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la modification des préférences',
        error: error.message
      });
    }
  }

  /**
   * Mettre à jour le statut du trajet
   */
  async mettreAJourStatut(req, res) {
    try {
      const { id } = req.params;
      const { statutTrajet } = req.body;

      const trajet = await Trajet.findById(id);
      if (!trajet) {
        return res.status(404).json({
          success: false,
          message: 'Trajet non trouvé'
        });
      }

      if (trajet.conducteurId.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'êtes pas autorisé à modifier ce trajet'
        });
      }

      const statutsValides = ['PROGRAMME', 'EN_COURS', 'TERMINE', 'ANNULE'];
      if (!statutsValides.includes(statutTrajet)) {
        return res.status(400).json({
          success: false,
          message: 'Statut invalide'
        });
      }

      const ancienStatut = trajet.statutTrajet;
      trajet.statutTrajet = statutTrajet;
      await trajet.save();

      // TODO: Envoyer des notifications selon le changement de statut
      await this.gererNotificationsStatut(trajet, ancienStatut, statutTrajet);

      res.json({
        success: true,
        message: `Statut du trajet changé de ${ancienStatut} à ${statutTrajet}`,
        data: {
          statutTrajet: trajet.statutTrajet,
          id: trajet._id
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la mise à jour du statut',
        error: error.message
      });
    }
  }

  // ==================== DELETE ====================

  /**
   * Annuler un trajet (avec notifications)
   */
  async annulerTrajet(req, res) {
    try {
      const { id } = req.params;
      const { motifAnnulation } = req.body;

      const trajet = await Trajet.findById(id);
      if (!trajet) {
        return res.status(404).json({
          success: false,
          message: 'Trajet non trouvé'
        });
      }

      if (trajet.conducteurId.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'êtes pas autorisé à annuler ce trajet'
        });
      }

      if (trajet.statutTrajet === 'TERMINE' || trajet.statutTrajet === 'ANNULE') {
        return res.status(400).json({
          success: false,
          message: 'Ce trajet ne peut pas être annulé'
        });
      }

      // Changer le statut à ANNULE
      trajet.statutTrajet = 'ANNULE';
      if (motifAnnulation) {
        trajet.commentaireConducteur = motifAnnulation;
      }
      await trajet.save();

      // TODO: Envoyer des notifications aux passagers
      await this.envoyerNotificationsAnnulation(trajet, motifAnnulation);

      res.json({
        success: true,
        message: 'Trajet annulé avec succès',
        data: {
          id: trajet._id,
          statutTrajet: trajet.statutTrajet,
          motifAnnulation
        }
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de l\'annulation du trajet',
        error: error.message
      });
    }
  }

  /**
   * Supprimer un trajet récurrent
   */
  async supprimerTrajetRecurrent(req, res) {
    try {
      const { id } = req.params;

      const trajet = await Trajet.findById(id);
      if (!trajet) {
        return res.status(404).json({
          success: false,
          message: 'Trajet non trouvé'
        });
      }

      if (trajet.conducteurId.toString() !== req.user.id) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'êtes pas autorisé à supprimer ce trajet'
        });
      }

      if (trajet.typeTrajet !== 'RECURRENT') {
        return res.status(400).json({
          success: false,
          message: 'Cette action est réservée aux trajets récurrents'
        });
      }

      if (trajet.statutTrajet === 'EN_COURS') {
        return res.status(400).json({
          success: false,
          message: 'Impossible de supprimer un trajet en cours'
        });
      }

      // TODO: Vérifier s'il y a des réservations actives
      // const reservationsActives = await Reservation.countDocuments({ 
      //   trajetId: id, 
      //   statut: { $in: ['CONFIRMEE', 'EN_ATTENTE'] } 
      // });

      // if (reservationsActives > 0) {
      //   return res.status(400).json({
      //     success: false,
      //     message: 'Impossible de supprimer un trajet avec des réservations actives'
      //   });
      // }

      await Trajet.findByIdAndDelete(id);

      res.json({
        success: true,
        message: 'Trajet récurrent supprimé avec succès'
      });

    } catch (error) {
      res.status(500).json({
        success: false,
        message: 'Erreur lors de la suppression du trajet',
        error: error.message
      });
    }
  }

  // ==================== MÉTHODES UTILITAIRES ====================

  /**
   * Valider un itinéraire avec Google Maps API (simulation)
   */
  async validerItineraire(coordonneesDepart, coordonneesArrivee) {
    try {
      // Simulation d'appel à Google Maps API
      // En réalité, vous utiliseriez l'API Google Maps Directions
      
      // Calculs approximatifs (à remplacer par l'API réelle)
      const [longDepart, latDepart] = coordonneesDepart;
      const [longArrivee, latArrivee] = coordonneesArrivee;
      
      // Calcul de distance approximatif (formule haversine simplifiée)
      const distance = this.calculerDistance(latDepart, longDepart, latArrivee, longArrivee);
      
      // Durée estimée (60 km/h en moyenne)
      const duree = Math.round(distance * 60 / 60); // en minutes
      
      return {
        success: true,
        distance: Math.round(distance * 100) / 100, // 2 décimales
        duree: duree,
        heureArrivee: this.calculerHeureArrivee('08:00', duree) // exemple
      };

    } catch (error) {
      return {
        success: false,
        message: 'Erreur de validation d\'itinéraire',
        error: error.message
      };
    }
  }

  /**
   * Calculer la distance entre deux points (formule haversine)
   */
  calculerDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Rayon de la Terre en km
    const dLat = this.toRad(lat2 - lat1);
    const dLon = this.toRad(lon2 - lon1);
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * 
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  toRad(deg) {
    return deg * (Math.PI/180);
  }

  /**
   * Calculer l'heure d'arrivée
   */
  calculerHeureArrivee(heureDepart, dureeMinutes) {
    const [heures, minutes] = heureDepart.split(':').map(Number);
    const totalMinutes = heures * 60 + minutes + dureeMinutes;
    const nouvellesHeures = Math.floor(totalMinutes / 60) % 24;
    const nouvellesMinutes = totalMinutes % 60;
    return `${nouvellesHeures.toString().padStart(2, '0')}:${nouvellesMinutes.toString().padStart(2, '0')}`;
  }

  /**
   * Gérer les notifications selon le changement de statut
   */
  async gererNotificationsStatut(trajet, ancienStatut, nouveauStatut) {
    // TODO: Implémenter la logique de notification
    console.log(`Notification: Trajet ${trajet._id} changé de ${ancienStatut} à ${nouveauStatut}`);
  }

  /**
   * Envoyer des notifications d'annulation
   */
  async envoyerNotificationsAnnulation(trajet, motif) {
    // TODO: Implémenter l'envoi de notifications aux passagers
    console.log(`Notification d'annulation pour le trajet ${trajet._id}: ${motif}`);
  }
}

module.exports = new TrajetController();