const Reservation = require('../models/Reservation');
const Trajet = require('../models/Trajet');
const Utilisateur = require('../models/Utilisateur');
const NotificationService = require('../services/NotificationService');
const PaiementService = require('../services/PaiementService');

class ReservationController {
  /**
   * Service de notifications automatiques pour les réservations
   */
  static async envoyerNotificationsAutomatiques() {
    try {
      const maintenant = new Date();
      
      // Trouver toutes les notifications à envoyer
      const reservations = await Reservation.find({
        'notificationsPrevues.envoye': false,
        'notificationsPrevues.heureEnvoi': { $lte: maintenant },
        statutReservation: 'CONFIRMEE'
      }).populate([
        {
          path: 'trajetId',
          populate: {
            path: 'conducteurId',
            select: 'nom prenom telephone'
          }
        },
        {
          path: 'passagerId',
          select: 'nom prenom telephone'
        }
      ]);

      for (const reservation of reservations) {
        for (const notification of reservation.notificationsPrevues) {
          if (!notification.envoye && notification.heureEnvoi <= maintenant) {
            await this.envoyerNotification(reservation, notification);
            notification.envoye = true;
          }
        }
        await reservation.save();
      }

      console.log(`${reservations.length} notifications traitées`);
    } catch (error) {
      console.error('Erreur lors de l\'envoi des notifications automatiques:', error);
    }
  }

  /**
   * Envoyer une notification spécifique
   */
  static async envoyerNotification(reservation, notification) {
    try {
      const passager = reservation.passagerId;
      const conducteur = reservation.trajetId.conducteurId;

      let message = '';
      let destinataire = passager;

      switch (notification.type) {
        case 'RAPPEL_DEPART':
          message = `Rappel: Votre trajet avec ${conducteur.nom} ${conducteur.prenom} part dans 2 heures. Point de prise en charge: ${reservation.pointPriseEnCharge.nom}`;
          break;
          
        case 'CONDUCTEUR_PROCHE':
          message = `${conducteur.nom} ${conducteur.prenom} arrive bientôt à votre point de prise en charge: ${reservation.pointPriseEnCharge.nom}`;
          break;
          
        case 'ARRIVEE':
          message = `Vous êtes arrivé à destination: ${reservation.pointDepose.nom}. N'oubliez pas d'évaluer votre conducteur !`;
          break;
      }

      // Envoyer SMS
      await NotificationService.envoyerSMS(destinataire.telephone, message);
      
      // Envoyer notification push si disponible
      await NotificationService.envoyerPushNotification(destinataire._id, {
        title: 'Covoiturage - ' + notification.type.replace('_', ' '),
        body: message,
        data: {
          reservationId: reservation._id.toString(),
          type: notification.type
        }
      });

      console.log(`Notification ${notification.type} envoyée à ${destinataire.nom}`);
    } catch (error) {
      console.error(`Erreur lors de l'envoi de la notification ${notification.type}:`, error);
    }
  }

  /**
   * Calculer les statistiques avancées pour les réservations
   */
  static async calculerStatistiquesAvancees(userId) {
    try {
      const pipeline = [
        {
          $facet: {
            // Statistiques comme passager
            commePassager: [
              { $match: { passagerId: mongoose.Types.ObjectId(userId) } },
              {
                $group: {
                  _id: null,
                  totalReservations: { $sum: 1 },
                  reservationsConfirmees: {
                    $sum: { $cond: [{ $eq: ['$statutReservation', 'CONFIRMEE'] }, 1, 0] }
                  },
                  reservationsTerminees: {
                    $sum: { $cond: [{ $eq: ['$statutReservation', 'TERMINEE'] }, 1, 0] }
                  },
                  reservationsAnnulees: {
                    $sum: { $cond: [{ $eq: ['$statutReservation', 'ANNULEE'] }, 1, 0] }
                  },
                  montantTotalDepense: { $sum: '$montantTotal' },
                  distanceTotaleParcourue: { $sum: { $ifNull: ['$distanceParcourue', 0] } }
                }
              }
            ],
            
            // Statistiques comme conducteur
            commeConducteur: [
              {
                $lookup: {
                  from: 'trajets',
                  localField: 'trajetId',
                  foreignField: '_id',
                  as: 'trajet'
                }
              },
              { $unwind: '$trajet' },
              { $match: { 'trajet.conducteurId': mongoose.Types.ObjectId(userId) } },
              {
                $group: {
                  _id: null,
                  totalReservationsRecues: { $sum: 1 },
                  reservationsAcceptees: {
                    $sum: { $cond: [{ $eq: ['$statutReservation', 'CONFIRMEE'] }, 1, 0] }
                  },
                  reservationsTerminees: {
                    $sum: { $cond: [{ $eq: ['$statutReservation', 'TERMINEE'] }, 1, 0] }
                  },
                  montantTotalGagne: { $sum: '$montantTotal' },
                  tauxAcceptation: {
                    $avg: {
                      $cond: [
                        { $in: ['$statutReservation', ['CONFIRMEE', 'TERMINEE']] },
                        1, 0
                      ]
                    }
                  }
                }
              }
            ],

            // Répartition par mois (6 derniers mois)
            parMois: [
              {
                $match: {
                  dateReservation: {
                    $gte: new Date(new Date().setMonth(new Date().getMonth() - 6))
                  }
                }
              },
              {
                $group: {
                  _id: {
                    mois: { $month: '$dateReservation' },
                    annee: { $year: '$dateReservation' }
                  },
                  nombreReservations: { $sum: 1 },
                  montantTotal: { $sum: '$montantTotal' }
                }
              },
              { $sort: { '_id.annee': 1, '_id.mois': 1 } }
            ]
          }
        }
      ];

      const resultats = await Reservation.aggregate(pipeline);
      return resultats[0];
    } catch (error) {
      console.error('Erreur lors du calcul des statistiques avancées:', error);
      throw error;
    }
  }

  /**
   * Gérer les remboursements automatiques
   */
  static async gererRemboursements() {
    try {
      // Trouver les réservations annulées qui nécessitent un remboursement
      const reservationsARembourser = await Reservation.find({
        statutReservation: 'ANNULEE',
        statutPaiement: 'PAYE'
      }).populate('trajetId');

      for (const reservation of reservationsARemourser) {
        const montantRemboursement = reservation.calculerRemboursement(
          reservation.trajetId.dateDepart
        );

        if (montantRemboursement > 0) {
          try {
            // Traiter le remboursement via l'API de paiement
            const resultatRemboursement = await PaiementService.traiterRemboursement({
              reservationId: reservation._id,
              montant: montantRemboursement,
              methodePaiement: reservation.methodePaiement,
              referencePaiement: reservation.referencePaiement
            });

            if (resultatRemboursement.success) {
              reservation.statutPaiement = 'REMBOURSE';
              await reservation.save();
              
              console.log(`Remboursement de ${montantRemboursement} FCFA traité pour la réservation ${reservation._id}`);
            }
          } catch (error) {
            console.error(`Erreur lors du remboursement de la réservation ${reservation._id}:`, error);
          }
        }
      }
    } catch (error) {
      console.error('Erreur lors de la gestion des remboursements:', error);
    }
  }

  /**
   * Nettoyer les anciennes réservations
   */
  static async nettoyerAnciennesReservations() {
    try {
      const dateExpiration = new Date();
      dateExpiration.setMonth(dateExpiration.getMonth() - 12); // Garder 12 mois

      // Supprimer les réservations très anciennes (gardees pour historique)
      const resultat = await Reservation.deleteMany({
        updatedAt: { $lt: dateExpiration },
        statutReservation: { $in: ['ANNULEE', 'REFUSEE'] }
      });

      console.log(`${resultat.deletedCount} anciennes réservations supprimées`);
    } catch (error) {
      console.error('Erreur lors du nettoyage:', error);
    }
  }

  /**
   * Synchroniser les positions en temps réel
   */
  static async synchroniserPositions(io) {
    try {
      // Trouver toutes les réservations confirmées avec positions récentes
      const reservationsActives = await Reservation.find({
        statutReservation: 'CONFIRMEE',
        'positionEnTempsReel.lastUpdate': {
          $gte: new Date(Date.now() - 10 * 60 * 1000) // Dernières 10 minutes
        }
      }).populate('passagerId', '_id');

      // Envoyer les positions via WebSocket aux passagers
      for (const reservation of reservationsActives) {
        const passagerId = reservation.passagerId._id.toString();
        const position = reservation.positionEnTempsReel;

        // Calculer la distance estimée jusqu'au point de prise en charge
        const distanceEstimee = this.calculerDistance(
          position.coordonnees.coordinates,
          reservation.pointPriseEnCharge.coordonnees.coordinates
        );

        // Envoyer la position au passager via Socket.IO
        io.to(`user_${passagerId}`).emit('position_conducteur', {
          reservationId: reservation._id,
          position: position.coordonnees.coordinates,
          lastUpdate: position.lastUpdate,
          distanceEstimee,
          tempsArriveEstime: Math.round(distanceEstimee * 2) // Estimation simple: 2 min par km
        });
      }

      console.log(`Positions synchronisées pour ${reservationsActives.length} réservations`);
    } catch (error) {
      console.error('Erreur lors de la synchronisation des positions:', error);
    }
  }

  /**
   * Calculer la distance entre deux points GPS
   */
  static calculerDistance(coord1, coord2) {
    const [lon1, lat1] = coord1;
    const [lon2, lat2] = coord2;
    
    const R = 6371; // Rayon de la Terre en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  /**
   * Analyser les tendances de réservation
   */
  static async analyserTendances(periode = '30d') {
    try {
      let dateDebut;
      switch (periode) {
        case '7d':
          dateDebut = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
          break;
        case '30d':
          dateDebut = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
          break;
        case '90d':
          dateDebut = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000);
          break;
        default:
          dateDebut = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      }

      const tendances = await Reservation.aggregate([
        {
          $match: {
            dateReservation: { $gte: dateDebut }
          }
        },
        {
          $group: {
            _id: {
              jour: { $dayOfYear: '$dateReservation' },
              annee: { $year: '$dateReservation' }
            },
            nombreReservations: { $sum: 1 },
            reservationsConfirmees: {
              $sum: { $cond: [{ $eq: ['$statutReservation', 'CONFIRMEE'] }, 1, 0] }
            },
            reservationsTerminees: {
              $sum: { $cond: [{ $eq: ['$statutReservation', 'TERMINEE'] }, 1, 0] }
            },
            chiffreAffaires: { $sum: '$montantTotal' },
            tauxConfirmation: {
              $avg: {
                $cond: [
                  { $in: ['$statutReservation', ['CONFIRMEE', 'TERMINEE']] },
                  1, 0
                ]
              }
            }
          }
        },
        {
          $sort: { '_id.annee': 1, '_id.jour': 1 }
        }
      ]);

      // Calculer les moyennes et évolutions
      const moyennes = {
        reservationsParJour: tendances.reduce((acc, t) => acc + t.nombreReservations, 0) / tendances.length,
        tauxConfirmationMoyen: tendances.reduce((acc, t) => acc + t.tauxConfirmation, 0) / tendances.length,
        chiffreAffairesMoyen: tendances.reduce((acc, t) => acc + t.chiffreAffaires, 0) / tendances.length
      };

      return {
        tendances,
        moyennes,
        periode
      };
    } catch (error) {
      console.error('Erreur lors de l\'analyse des tendances:', error);
      throw error;
    }
  }

  /**
   * Optimiser les correspondances trajet-réservation
   */
  static async optimiserCorrespondances() {
    try {
      // Trouver les trajets avec des places disponibles
      const trajetsDisponibles = await Trajet.find({
        statutTrajet: 'PROGRAMME',
        nombrePlacesDisponibles: { $gt: 0 },
        dateDepart: { $gte: new Date() }
      });

      // Analyser les préférences des utilisateurs pour suggérer des correspondances
      for (const trajet of trajetsDisponibles) {
        const utilisateursCompatibles = await this.rechercherUtilisateursCompatibles(trajet);
        
        if (utilisateursCompatibles.length > 0) {
          await NotificationService.envoyerNotificationPersonnalisee(
            utilisateursCompatibles,
            'SUGGESTION_TRAJET',
            {
              trajetId: trajet._id,
              pointDepart: trajet.pointDepart.nom,
              pointArrivee: trajet.pointArrivee.nom,
              dateDepart: trajet.dateDepart,
              prix: trajet.prixParPassager
            }
          );
        }
      }
    } catch (error) {
      console.error('Erreur lors de l\'optimisation des correspondances:', error);
    }
  }

  /**
   * Rechercher les utilisateurs compatibles pour un trajet
   */
  static async rechercherUtilisateursCompatibles(trajet) {
    try {
      // Recherche basée sur l'historique et les préférences géographiques
      const utilisateursCompatibles = await Utilisateur.find({
        statutCompte: 'ACTIF',
        // Exclure le conducteur
        _id: { $ne: trajet.conducteurId },
        // Critères de compatibilité géographique (dans un rayon de 5km)
        'adresse.coordonnees': {
          $near: {
            $geometry: trajet.pointDepart.coordonnees,
            $maxDistance: 5000 // 5km en mètres
          }
        }
      }).limit(20);

      // Filtrer selon l'historique de réservations similaires
      const utilisateursFiltres = [];
      for (const utilisateur of utilisateursCompatibles) {
        const historiqueCompatible = await Reservation.findOne({
          passagerId: utilisateur._id,
          statutReservation: { $in: ['CONFIRMEE', 'TERMINEE'] },
          // Recherche de trajets dans la même zone géographique
          'pointPriseEnCharge.coordonnees': {
            $near: {
              $geometry: trajet.pointDepart.coordonnees,
              $maxDistance: 3000
            }
          }
        });

        if (historiqueCompatible || utilisateur.preferences) {
          utilisateursFiltres.push(utilisateur._id);
        }
      }

      return utilisateursFiltres;
    } catch (error) {
      console.error('Erreur lors de la recherche d\'utilisateurs compatibles:', error);
      return [];
    }
  }

  /**
   * Gérer les alertes de sécurité automatiques
   */
  static async gererAlertesSecurite() {
    try {
      const maintenant = new Date();
      
      // Détecter les trajets en retard significatif
      const trajetsEnRetard = await Reservation.find({
        statutReservation: 'CONFIRMEE',
        'positionEnTempsReel.lastUpdate': {
          $lt: new Date(maintenant.getTime() - 30 * 60 * 1000) // Pas de mise à jour depuis 30 min
        }
      }).populate([
        { path: 'trajetId', select: 'dateDepart heureDepart conducteurId' },
        { path: 'passagerId', select: 'nom telephone contactsUrgence' }
      ]);

      for (const reservation of trajetsEnRetard) {
        const trajet = reservation.trajetId;
        const heureDepart = new Date(trajet.dateDepart);
        const tempsEcoule = maintenant - heureDepart;

        // Si le trajet devrait être terminé depuis plus de 2 heures
        if (tempsEcoule > 2 * 60 * 60 * 1000) {
          // Alerter les contacts d'urgence
          const passager = reservation.passagerId;
          for (const contact of passager.contactsUrgence) {
            await NotificationService.envoyerSMS(contact.telephone, 
              `Alerte: ${passager.nom} est en retard sur son trajet de covoiturage. Dernière position connue non mise à jour depuis plus de 30 minutes.`
            );
          }

          // Créer une alerte d'urgence
          const AlerteUrgence = require('../models/AlerteUrgence');
          await new AlerteUrgence({
            declencheurId: reservation.passagerId._id,
            trajetId: reservation.trajetId._id,
            typeAlerte: 'RETARD_SIGNIFICATIF',
            description: 'Réservation en retard significatif sans mise à jour de position',
            niveauGravite: 'MOYEN',
            position: reservation.positionEnTempsReel?.coordonnees || trajet.pointDepart.coordonnees,
            statutAlerte: 'ACTIVE'
          }).save();

          console.log(`Alerte de sécurité créée pour la réservation ${reservation._id}`);
        }
      }
    } catch (error) {
      console.error('Erreur lors de la gestion des alertes de sécurité:', error);
    }
  }

  /**
   * Générer un rapport d'activité des réservations
   */
  static async genererRapportActivite(dateDebut, dateFin) {
    try {
      const rapport = await Reservation.aggregate([
        {
          $match: {
            dateReservation: { $gte: dateDebut, $lte: dateFin }
          }
        },
        {
          $facet: {
            // Statistiques globales
            global: [
              {
                $group: {
                  _id: null,
                  totalReservations: { $sum: 1 },
                  montantTotalTransactions: { $sum: '$montantTotal' },
                  reservationsConfirmees: {
                    $sum: { $cond: [{ $eq: ['$statutReservation', 'CONFIRMEE'] }, 1, 0] }
                  },
                  reservationsTerminees: {
                    $sum: { $cond: [{ $eq: ['$statutReservation', 'TERMINEE'] }, 1, 0] }
                  },
                  reservationsAnnulees: {
                    $sum: { $cond: [{ $eq: ['$statutReservation', 'ANNULEE'] }, 1, 0] }
                  },
                  tauxConfirmation: {
                    $avg: {
                      $cond: [
                        { $ne: ['$statutReservation', 'EN_ATTENTE'] },
                        { $cond: [{ $in: ['$statutReservation', ['CONFIRMEE', 'TERMINEE']] }, 1, 0] },
                        null
                      ]
                    }
                  }
                }
              }
            ],

            // Répartition par méthode de paiement
            paiements: [
              {
                $group: {
                  _id: '$methodePaiement',
                  nombre: { $sum: 1 },
                  montantTotal: { $sum: '$montantTotal' }
                }
              }
            ],

            // Top utilisateurs actifs
            topUtilisateurs: [
              {
                $group: {
                  _id: '$passagerId',
                  nombreReservations: { $sum: 1 },
                  montantTotal: { $sum: '$montantTotal' }
                }
              },
              { $sort: { nombreReservations: -1 } },
              { $limit: 10 },
              {
                $lookup: {
                  from: 'utilisateurs',
                  localField: '_id',
                  foreignField: '_id',
                  as: 'utilisateur'
                }
              }
            ]
          }
        }
      ]);

      return {
        periode: { dateDebut, dateFin },
        donnees: rapport[0],
        dateGeneration: new Date()
      };
    } catch (error) {
      console.error('Erreur lors de la génération du rapport:', error);
      throw error;
    }
  }
}

module.exports = ReservationController;