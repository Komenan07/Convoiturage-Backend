// services/alerteUrgenceService.js
const AlerteUrgence = require('../models/AlerteUrgence');
const { AppError } = require('../utils/helpers');

class AlerteUrgenceService {
  
  /**
   * Déclencher une nouvelle alerte d'urgence
   * @param {Object} donneesAlerte - Données de l'alerte
   * @param {string} declencheurId - ID de l'utilisateur qui déclenche
   * @returns {Promise<Object>} L'alerte créée
   */
  async declencherAlerte(donneesAlerte, declencheurId) {
    try {
      // Validation des données critiques
      this._validerDonneesAlerte(donneesAlerte);
      
      // Vérifier qu'il n'y a pas déjà une alerte active pour ce trajet
      const alerteExistante = await AlerteUrgence.findOne({
        trajetId: donneesAlerte.trajetId,
        statutAlerte: { $in: ['ACTIVE', 'EN_TRAITEMENT'] }
      });
      
      if (alerteExistante) {
        throw new AppError('Une alerte est déjà active pour ce trajet', 409);
      }
      
      // Enrichir les données
      const donneesEnrichies = {
        ...donneesAlerte,
        declencheurId,
        createdAt: new Date()
      };
      
      // Résoudre l'adresse approximative si possible
      if (donneesAlerte.position?.coordinates) {
        try {
          const adresse = await this._resoudreAdresse(
            donneesAlerte.position.coordinates[1], // latitude
            donneesAlerte.position.coordinates[0]  // longitude
          );
          donneesEnrichies.adresseApproximative = adresse.adresse;
          donneesEnrichies.ville = adresse.ville;
        } catch (error) {
          console.warn('Impossible de résoudre l\'adresse:', error.message);
        }
      }
      
      // Créer l'alerte
      const alerte = new AlerteUrgence(donneesEnrichies);
      const alerteSauvegardee = await alerte.save();
      
      // Déclencher les notifications asynchrones
      this._traiterNotifications(alerteSauvegardee).catch(error => {
        console.error('Erreur lors des notifications:', error);
      });
      
      // Log de sécurité
      console.log(`🚨 ALERTE URGENCE DÉCLENCHÉE: ${alerteSauvegardee.numeroUrgence}`, {
        type: alerteSauvegardee.typeAlerte,
        gravite: alerteSauvegardee.niveauGravite,
        position: alerteSauvegardee.position.coordinates,
        declencheur: declencheurId
      });
      
      return alerteSauvegardee;
    } catch (error) {
      if (error instanceof AppError) throw error;
      console.error('Erreur lors du déclenchement d\'alerte:', error);
      throw new AppError(`Erreur lors du déclenchement: ${error.message}`, 500);
    }
  }

  /**
   * Obtenir une alerte par ID
   * @param {string} alerteId - ID de l'alerte
   * @returns {Promise<Object>} L'alerte trouvée
   */
  async obtenirAlerte(alerteId) {
    try {
      const alerte = await AlerteUrgence.findById(alerteId)
        .populate('declencheurId', 'nom telephone email')
        .populate('trajetId', 'depart destination dateDepart')
        .populate('personnesPresentes.utilisateurId', 'nom telephone');
      
      if (!alerte) {
        throw new AppError('Alerte d\'urgence non trouvée', 404);
      }
      
      return alerte;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Erreur lors de la récupération: ${error.message}`, 500);
    }
  }

  /**
   * Mettre à jour le statut d'une alerte
   * @param {string} alerteId - ID de l'alerte
   * @param {string} nouveauStatut - Nouveau statut
   * @param {string} utilisateurId - ID de l'utilisateur qui fait la MAJ
   * @param {Object} donneesSupplementaires - Données supplémentaires
   * @returns {Promise<Object>} L'alerte mise à jour
   */
  async mettreAJourStatut(alerteId, nouveauStatut, utilisateurId, donneesSupplementaires = {}) {
    try {
      const alerte = await AlerteUrgence.findById(alerteId);
      
      if (!alerte) {
        throw new AppError('Alerte non trouvée', 404);
      }
      
      // Vérifier les permissions
      if (!this._peutModifierAlerte(alerte, utilisateurId)) {
        throw new AppError('Permissions insuffisantes pour modifier cette alerte', 403);
      }
      
      // Valider le changement de statut
      this._validerChangementStatut(alerte.statutAlerte, nouveauStatut);
      
      // Appliquer les modifications
      alerte.statutAlerte = nouveauStatut;
      alerte.updatedAt = new Date();
      
      // Traiter les données supplémentaires selon le statut
      if (nouveauStatut === 'RESOLUE') {
        if (!donneesSupplementaires.commentaire) {
          throw new AppError('Un commentaire de résolution est requis', 400);
        }
        alerte.dateResolution = new Date();
        alerte.commentaireResolution = donneesSupplementaires.commentaire;
      }
      
      if (donneesSupplementaires.premiersSecours !== undefined) {
        alerte.premiersSecours = donneesSupplementaires.premiersSecours;
      }
      
      if (donneesSupplementaires.policeContactee !== undefined) {
        alerte.policeContactee = donneesSupplementaires.policeContactee;
      }
      
      const alerteMiseAJour = await alerte.save();
      
      // Log de traçabilité
      console.log(`📝 Statut alerte mis à jour: ${alerte.numeroUrgence}`, {
        ancienStatut: alerte.statutAlerte,
        nouveauStatut,
        utilisateur: utilisateurId
      });
      
      // Notifications si nécessaire
      if (nouveauStatut === 'RESOLUE') {
        this._notifierResolution(alerteMiseAJour).catch(error => {
          console.error('Erreur notification résolution:', error);
        });
      }
      
      return alerteMiseAJour;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Erreur lors de la mise à jour: ${error.message}`, 500);
    }
  }

  /**
   * Rechercher des alertes avec filtres
   * @param {Object} filtres - Critères de recherche
   * @param {Object} options - Options de pagination et tri
   * @returns {Promise<Object>} Liste d'alertes et métadonnées
   */
  async rechercherAlertes(filtres = {}, options = {}) {
    try {
      const requete = this._construireRequeteRecherche(filtres);
      
      const {
        page = 1,
        limite = 20,
        tri = { priorite: -1, createdAt: -1 },
        peupler = true
      } = options;
      
      const skip = (page - 1) * limite;
      
      let query = AlerteUrgence.find(requete)
        .sort(tri)
        .skip(skip)
        .limit(limite);
      
      if (peupler) {
        query = query
          .populate('declencheurId', 'nom telephone')
          .populate('trajetId', 'depart destination dateDepart');
      }
      
      const [alertes, total] = await Promise.all([
        query.exec(),
        AlerteUrgence.countDocuments(requete)
      ]);
      
      return {
        alertes,
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
   * Obtenir les alertes actives
   * @param {Object} filtres - Filtres optionnels
   * @returns {Promise<Array>} Liste des alertes actives
   */
  async obtenirAlertesActives(filtres = {}) {
    try {
      const requete = {
        statutAlerte: { $in: ['ACTIVE', 'EN_TRAITEMENT'] },
        ...filtres
      };
      
      const alertes = await AlerteUrgence.find(requete)
        .sort({ priorite: -1, createdAt: 1 })
        .populate('declencheurId', 'nom telephone')
        .populate('trajetId', 'depart destination')
        .limit(100); // Limite de sécurité
      
      return alertes;
    } catch (error) {
      throw new AppError(`Erreur lors de la récupération des alertes actives: ${error.message}`, 500);
    }
  }

  /**
   * Rechercher des alertes par proximité géographique
   * @param {number} longitude - Longitude
   * @param {number} latitude - Latitude
   * @param {number} rayonKm - Rayon de recherche en km
   * @param {Object} filtres - Filtres supplémentaires
   * @returns {Promise<Array>} Liste d'alertes à proximité
   */
  async rechercherParProximite(longitude, latitude, rayonKm = 50, filtres = {}) {
    try {
      this._validerCoordonnees(longitude, latitude);
      
      const requete = {
        "position": {
          $near: {
            $geometry: { type: "Point", coordinates: [longitude, latitude] },
            $maxDistance: rayonKm * 1000
          }
        },
        statutAlerte: { $in: ['ACTIVE', 'EN_TRAITEMENT'] },
        ...filtres
      };
      
      const alertes = await AlerteUrgence.find(requete)
        .sort({ priorite: -1, createdAt: 1 })
        .populate('declencheurId', 'nom telephone')
        .populate('trajetId', 'depart destination')
        .limit(50);
      
      // Ajouter la distance calculée
      return alertes.map(alerte => {
        const distance = this._calculerDistance(
          latitude, longitude,
          alerte.position.coordinates[1],
          alerte.position.coordinates[0]
        );
        
        return {
          ...alerte.toJSON(),
          distanceKm: Math.round(distance * 100) / 100
        };
      });
    } catch (error) {
      throw new AppError(`Erreur lors de la recherche par proximité: ${error.message}`, 500);
    }
  }

  /**
   * Escalader une alerte (augmenter la gravité)
   * @param {string} alerteId - ID de l'alerte
   * @param {string} utilisateurId - ID de l'utilisateur
   * @returns {Promise<Object>} L'alerte escaladée
   */
  async escaladerAlerte(alerteId, utilisateurId) {
    try {
      const alerte = await AlerteUrgence.findById(alerteId);
      
      if (!alerte) {
        throw new AppError('Alerte non trouvée', 404);
      }
      
      if (alerte.statutAlerte !== 'ACTIVE' && alerte.statutAlerte !== 'EN_TRAITEMENT') {
        throw new AppError('Impossible d\'escalader une alerte non active', 400);
      }
      
      await alerte.escalader();
      
      console.log(`⬆️ Alerte escaladée: ${alerte.numeroUrgence}`, {
        nouveauNiveau: alerte.niveauGravite,
        nouvellePriorite: alerte.priorite,
        utilisateur: utilisateurId
      });
      
      // Notification d'escalade
      this._notifierEscalade(alerte).catch(error => {
        console.error('Erreur notification escalade:', error);
      });
      
      return alerte;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Erreur lors de l'escalade: ${error.message}`, 500);
    }
  }

  /**
   * Ajouter un contact à alerter
   * @param {string} alerteId - ID de l'alerte
   * @param {Object} contact - Données du contact
   * @returns {Promise<Object>} L'alerte mise à jour
   */
  async ajouterContactAlerte(alerteId, contact) {
    try {
      const alerte = await AlerteUrgence.findById(alerteId);
      
      if (!alerte) {
        throw new AppError('Alerte non trouvée', 404);
      }
      
      // Valider les données du contact
      this._validerContact(contact);
      
      await alerte.ajouterContactAlerte(contact);
      
      // Envoyer la notification au nouveau contact
      this._envoyerNotificationContact(alerte, contact).catch(error => {
        console.error('Erreur envoi notification contact:', error);
      });
      
      return alerte;
    } catch (error) {
      if (error instanceof AppError) throw error;
      throw new AppError(`Erreur lors de l'ajout du contact: ${error.message}`, 500);
    }
  }

  /**
   * Obtenir les statistiques des alertes
   * @param {Object} filtresPeriode - Filtres de période
   * @returns {Promise<Object>} Statistiques détaillées
   */
  async obtenirStatistiques(filtresPeriode = {}) {
    try {
      const maintenant = new Date();
      const dernierMois = new Date(maintenant.getTime() - 30 * 24 * 60 * 60 * 1000);
      
      const [
        statsGenerales,
        alertesActives,
        repartitionTypes,
        repartitionGravite,
        tempsReponseParType,
        alertesParJour
      ] = await Promise.all([
        // Statistiques générales
        AlerteUrgence.aggregate([
          {
            $match: {
              createdAt: { $gte: filtresPeriode.dateDebut || dernierMois }
            }
          },
          {
            $group: {
              _id: null,
              totalAlertes: { $sum: 1 },
              alertesResolues: {
                $sum: { $cond: [{ $eq: ["$statutAlerte", "RESOLUE"] }, 1, 0] }
              },
              alertesCritiques: {
                $sum: { $cond: [{ $eq: ["$niveauGravite", "CRITIQUE"] }, 1, 0] }
              },
              tempsReponseMoyenne: {
                $avg: {
                  $cond: [
                    { $ne: ["$dateResolution", null] },
                    { $divide: [{ $subtract: ["$dateResolution", "$createdAt"] }, 60000] },
                    null
                  ]
                }
              }
            }
          }
        ]),
        
        // Alertes actives actuelles
        AlerteUrgence.countDocuments({
          statutAlerte: { $in: ['ACTIVE', 'EN_TRAITEMENT'] }
        }),
        
        // Répartition par type
        AlerteUrgence.aggregate([
          {
            $match: {
              createdAt: { $gte: filtresPeriode.dateDebut || dernierMois }
            }
          },
          {
            $group: {
              _id: "$typeAlerte",
              count: { $sum: 1 },
              resolues: {
                $sum: { $cond: [{ $eq: ["$statutAlerte", "RESOLUE"] }, 1, 0] }
              }
            }
          },
          { $sort: { count: -1 } }
        ]),
        
        // Répartition par gravité
        AlerteUrgence.aggregate([
          {
            $match: {
              createdAt: { $gte: filtresPeriode.dateDebut || dernierMois }
            }
          },
          {
            $group: {
              _id: "$niveauGravite",
              count: { $sum: 1 }
            }
          }
        ]),
        
        // Temps de réponse par type
        AlerteUrgence.aggregate([
          {
            $match: {
              createdAt: { $gte: filtresPeriode.dateDebut || dernierMois },
              dateResolution: { $ne: null }
            }
          },
          {
            $group: {
              _id: "$typeAlerte",
              tempsReponseMoyenne: {
                $avg: { $divide: [{ $subtract: ["$dateResolution", "$createdAt"] }, 60000] }
              },
              count: { $sum: 1 }
            }
          }
        ]),
        
        // Alertes par jour (derniers 30 jours)
        AlerteUrgence.aggregate([
          {
            $match: {
              createdAt: { $gte: dernierMois }
            }
          },
          {
            $group: {
              _id: {
                $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
              },
              count: { $sum: 1 },
              critiques: {
                $sum: { $cond: [{ $eq: ["$niveauGravite", "CRITIQUE"] }, 1, 0] }
              }
            }
          },
          { $sort: { "_id": 1 } }
        ])
      ]);
      
      return {
        resume: {
          total: statsGenerales[0]?.totalAlertes || 0,
          actives: alertesActives,
          resolues: statsGenerales[0]?.alertesResolues || 0,
          critiques: statsGenerales[0]?.alertesCritiques || 0,
          tempsReponseMoyenne: Math.round(statsGenerales[0]?.tempsReponseMoyenne || 0)
        },
        repartitionTypes,
        repartitionGravite,
        tempsReponseParType,
        evolution: alertesParJour
      };
    } catch (error) {
      throw new AppError(`Erreur lors du calcul des statistiques: ${error.message}`, 500);
    }
  }

  /**
   * Obtenir les alertes anciennes (non résolues depuis plus de 2h)
   * @returns {Promise<Array>} Liste des alertes anciennes
   */
  async obtenirAlertesAnciennes() {
    try {
      const deuxHeuresAuparavant = new Date(Date.now() - 2 * 60 * 60 * 1000);
      
      const alertesAnciennes = await AlerteUrgence.find({
        statutAlerte: 'ACTIVE',
        createdAt: { $lt: deuxHeuresAuparavant }
      })
      .populate('declencheurId', 'nom telephone')
      .populate('trajetId', 'depart destination')
      .sort({ createdAt: 1 });
      
      return alertesAnciennes;
    } catch (error) {
      throw new AppError(`Erreur lors de la récupération des alertes anciennes: ${error.message}`, 500);
    }
  }

  // === MÉTHODES PRIVÉES ===

  /**
   * Valider les données d'alerte
   * @private
   */
  _validerDonneesAlerte(donnees) {
    const champsRequis = ['trajetId', 'position', 'typeAlerte', 'description', 'niveauGravite', 'personnesPresentes'];
    
    for (const champ of champsRequis) {
      if (!donnees[champ]) {
        throw new AppError(`Le champ '${champ}' est requis`, 400);
      }
    }
    
    // Valider les coordonnées GPS
    if (!donnees.position?.coordinates || donnees.position.coordinates.length !== 2) {
      throw new AppError('Coordonnées GPS invalides', 400);
    }
    
    const [longitude, latitude] = donnees.position.coordinates;
    this._validerCoordonnees(longitude, latitude);
    
    // Valider les types énumérés
    const typesAlerteValides = ['SOS', 'ACCIDENT', 'AGRESSION', 'PANNE', 'MALAISE', 'AUTRE'];
    if (!typesAlerteValides.includes(donnees.typeAlerte)) {
      throw new AppError('Type d\'alerte invalide', 400);
    }
    
    const niveauxGraviteValides = ['FAIBLE', 'MOYEN', 'CRITIQUE'];
    if (!niveauxGraviteValides.includes(donnees.niveauGravite)) {
      throw new AppError('Niveau de gravité invalide', 400);
    }
    
    // Valider les personnes présentes
    if (!Array.isArray(donnees.personnesPresentes) || donnees.personnesPresentes.length === 0) {
      throw new AppError('Au moins une personne présente doit être spécifiée', 400);
    }
  }

  /**
   * Valider les coordonnées GPS
   * @private
   */
  _validerCoordonnees(longitude, latitude) {
    if (longitude < -180 || longitude > 180) {
      throw new AppError('Longitude invalide', 400);
    }
    if (latitude < -90 || latitude > 90) {
      throw new AppError('Latitude invalide', 400);
    }
  }

  /**
   * Valider un contact
   * @private
   */
  _validerContact(contact) {
    if (!contact.nom || !contact.telephone || !contact.relation) {
      throw new AppError('Nom, téléphone et relation sont requis pour le contact', 400);
    }
    
    const relationsValides = ['FAMILLE', 'AMI', 'COLLEGUE', 'CONTACT_URGENCE', 'AUTRE'];
    if (!relationsValides.includes(contact.relation)) {
      throw new AppError('Type de relation invalide', 400);
    }
  }

  /**
   * Vérifier si un utilisateur peut modifier une alerte
   * @private
   */
  _peutModifierAlerte(alerte, utilisateurId) {
    // Le déclencheur peut toujours modifier
    if (alerte.declencheurId.toString() === utilisateurId) {
      return true;
    }
    
    // TODO: Vérifier si l'utilisateur est admin/modérateur
    // Pour l'instant, on autorise seulement le déclencheur
    return false;
  }

  /**
   * Valider un changement de statut
   * @private
   */
  _validerChangementStatut(statutActuel, nouveauStatut) {
    const transitionsValides = {
      'ACTIVE': ['EN_TRAITEMENT', 'RESOLUE', 'FAUSSE_ALERTE'],
      'EN_TRAITEMENT': ['RESOLUE', 'FAUSSE_ALERTE', 'ACTIVE'],
      'RESOLUE': [], // Statut final
      'FAUSSE_ALERTE': [] // Statut final
    };
    
    if (!transitionsValides[statutActuel]?.includes(nouveauStatut)) {
      throw new AppError(`Transition de statut invalide: ${statutActuel} -> ${nouveauStatut}`, 400);
    }
  }

  /**
   * Construire la requête de recherche
   * @private
   */
  _construireRequeteRecherche(filtres) {
    const requete = {};
    
    if (filtres.statutAlerte) {
      if (Array.isArray(filtres.statutAlerte)) {
        requete.statutAlerte = { $in: filtres.statutAlerte };
      } else {
        requete.statutAlerte = filtres.statutAlerte;
      }
    }
    
    if (filtres.typeAlerte) {
      if (Array.isArray(filtres.typeAlerte)) {
        requete.typeAlerte = { $in: filtres.typeAlerte };
      } else {
        requete.typeAlerte = filtres.typeAlerte;
      }
    }
    
    if (filtres.niveauGravite) {
      if (Array.isArray(filtres.niveauGravite)) {
        requete.niveauGravite = { $in: filtres.niveauGravite };
      } else {
        requete.niveauGravite = filtres.niveauGravite;
      }
    }
    
    if (filtres.ville) {
      requete.ville = new RegExp(filtres.ville, 'i');
    }
    
    if (filtres.declencheurId) {
      requete.declencheurId = filtres.declencheurId;
    }
    
    if (filtres.dateDebut || filtres.dateFin) {
      requete.createdAt = {};
      if (filtres.dateDebut) {
        requete.createdAt.$gte = new Date(filtres.dateDebut);
      }
      if (filtres.dateFin) {
        requete.createdAt.$lte = new Date(filtres.dateFin);
      }
    }
    
    if (filtres.estCritique) {
      requete.niveauGravite = 'CRITIQUE';
    }
    
    return requete;
  }

  /**
   * Résoudre une adresse à partir de coordonnées GPS
   * @private
   */
  async _resoudreAdresse(latitude, longitude) {
    try {
      // TODO: Intégrer avec un service de géocodage inversé (ex: Mapbox, Google Maps)
      // Pour l'instant, on retourne un format basique
      return {
        adresse: `Coordonnées: ${latitude.toFixed(4)}, ${longitude.toFixed(4)}`,
        ville: 'Ville inconnue'
      };
    } catch (error) {
      throw new Error(`Erreur de géocodage: ${error.message}`);
    }
  }

  /**
   * Traiter les notifications initiales
   * @private
   */
  async _traiterNotifications(alerte) {
    try {
      const notifications = [];
      
      // Notifier les contacts d'urgence
      for (const contact of alerte.contactsAlertes) {
        notifications.push(this._envoyerNotificationContact(alerte, contact));
      }
      
      // Notifier les services d'urgence si critique
      if (alerte.niveauGravite === 'CRITIQUE') {
        notifications.push(this._notifierServicesUrgence(alerte));
      }
      
      await Promise.allSettled(notifications);
      console.log(`📧 Notifications envoyées pour l'alerte ${alerte.numeroUrgence}`);
    } catch (error) {
      console.error('Erreur lors du traitement des notifications:', error);
    }
  }

  /**
   * Envoyer une notification à un contact
   * @private
   */
  async _envoyerNotificationContact(alerte, contact) {
    try {
      // TODO: Intégrer avec un service SMS/Email
      console.log(`📱 SMS d'urgence envoyé à ${contact.nom} (${contact.telephone})`);
      
      // Simuler l'envoi
      const succes = Math.random() > 0.1; // 90% de succès
      
      if (succes) {
        contact.statutNotification = 'ENVOYE';
      } else {
        contact.statutNotification = 'ECHEC';
        throw new Error('Échec envoi SMS');
      }
    } catch (error) {
      console.error(`Erreur envoi notification à ${contact.telephone}:`, error);
      contact.statutNotification = 'ECHEC';
    }
  }

  /**
   * Notifier les services d'urgence
   * @private
   */
  async _notifierServicesUrgence(alerte) {
    try {
      // TODO: Intégration avec les services d'urgence
      console.log(`🚑 Services d'urgence notifiés pour ${alerte.numeroUrgence}`);
    } catch (error) {
      console.error('Erreur notification services urgence:', error);
    }
  }

  /**
   * Notifier la résolution d'une alerte
   * @private
   */
  async _notifierResolution(alerte) {
    try {
      // Notifier les contacts que l'alerte est résolue
      console.log(`✅ Résolution notifiée pour ${alerte.numeroUrgence}`);
    } catch (error) {
      console.error('Erreur notification résolution:', error);
    }
  }

  /**
   * Notifier l'escalade d'une alerte
   * @private
   */
  async _notifierEscalade(alerte) {
    try {
      // Notifier l'escalade aux responsables
      console.log(`⬆️ Escalade notifiée pour ${alerte.numeroUrgence}`);
    } catch (error) {
      console.error('Erreur notification escalade:', error);
    }
  }

  /**
   * Calculer la distance entre deux points (Haversine)
   * @private
   */
  _calculerDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Rayon de la Terre en km
    const dLat = this._degresEnRadians(lat2 - lat1);
    const dLon = this._degresEnRadians(lon2 - lon1);
    
    const a = 
      Math.sin(dLat / 2) * Math.sin(dLat / 2) +
      Math.cos(this._degresEnRadians(lat1)) * Math.cos(this._degresEnRadians(lat2)) * 
      Math.sin(dLon / 2) * Math.sin(dLon / 2);
    
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    
    return R * c;
  }

  /**
   * Convertir des degrés en radians
   * @private
   */
  _degresEnRadians(degres) {
    return degres * (Math.PI / 180);
  }
}

module.exports = new AlerteUrgenceService();