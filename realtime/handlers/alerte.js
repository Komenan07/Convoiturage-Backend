const AlerteUrgence = require('../../models/AlerteUrgence');
const Utilisateur = require('../../models/Utilisateur');
const Reservation = require('../../models/Reservation');
const Trajet = require('../../models/Trajet');

module.exports = (socket, io) => {

  // Déclencher une alerte d'urgence
  socket.on('triggerEmergency', async (alerteData) => {
    try {
      const { 
        typeAlerte, 
        description, 
        position, 
        trajetId,
        niveauGravite = 'CRITIQUE' 
      } = alerteData;

      // Validation des données obligatoires
      if (!typeAlerte || !position) {
        socket.emit('error', { 
          type: 'ALERT_ERROR',
          message: 'Données d\'alerte incomplètes' 
        });
        return;
      }

      // Récupérer les informations de l'utilisateur
      const utilisateur = await Utilisateur.findById(socket.user.id);
      
      if (!utilisateur) {
        socket.emit('error', { 
          type: 'ALERT_ERROR',
          message: 'Utilisateur non trouvé' 
        });
        return;
      }

      // Créer l'alerte en base de données
      const alerte = new AlerteUrgence({
        declencheurId: socket.user.id,
        trajetId: trajetId || null,
        typeAlerte,
        description: description || `Alerte ${typeAlerte} déclenchée`,
        niveauGravite,
        position: {
          type: 'Point',
          coordinates: position.coordinates || position
        },
        statutAlerte: 'ACTIVE',
        personnesPresentes: [{
          utilisateurId: socket.user.id,
          nom: `${utilisateur.nom} ${utilisateur.prenom}`,
          telephone: utilisateur.telephone
        }]
      });

      await alerte.save();

      // Gestion des contacts d'urgence
      const contactsAlertes = [];
      
      if (utilisateur.contactsUrgence && utilisateur.contactsUrgence.length > 0) {
        for (const contact of utilisateur.contactsUrgence) {
          const alerteContact = {
            nom: contact.nom,
            telephone: contact.telephone,
            relation: contact.relation,
            dateNotification: new Date(),
            statutNotification: 'ENVOYE'
          };
          
          contactsAlertes.push(alerteContact);
          
          // Simulation d'envoi SMS - Remplacez par votre service SMS réel
          console.log(`📱 SMS d'urgence envoyé à ${contact.nom} (${contact.telephone}):
ALERTE ${typeAlerte} - ${utilisateur.nom} ${utilisateur.prenom}
Position: ${position.coordinates ? position.coordinates.join(', ') : 'Non disponible'}
Description: ${description || 'Aucune description'}
Heure: ${new Date().toLocaleString()}
Contactez immédiatement les secours si nécessaire.`);
        }

        // Mettre à jour l'alerte avec les contacts notifiés
        alerte.contactsAlertes = contactsAlertes;
        await alerte.save();
      }

      // Si l'alerte est liée à un trajet
      if (trajetId) {
        try {
          // Récupérer toutes les personnes dans le trajet
          const [trajet, reservations] = await Promise.all([
            Trajet.findById(trajetId).populate('conducteurId', 'nom prenom telephone'),
            Reservation.find({
              trajetId,
              statutReservation: 'CONFIRMEE',
              passagerId: { $ne: socket.user.id }
            }).populate('passagerId', 'nom prenom telephone')
          ]);

          if (trajet) {
            // Ajouter le conducteur aux personnes présentes s'il n'est pas celui qui déclenche
            if (trajet.conducteurId._id.toString() !== socket.user.id) {
              alerte.personnesPresentes.push({
                utilisateurId: trajet.conducteurId._id,
                nom: `${trajet.conducteurId.nom} ${trajet.conducteurId.prenom}`,
                telephone: trajet.conducteurId.telephone
              });

              // Notifier le conducteur
              io.to(`user_${trajet.conducteurId._id}`).emit('emergencyAlert', {
                alerteId: alerte._id,
                type: typeAlerte,
                declencheur: {
                  nom: utilisateur.nom,
                  prenom: utilisateur.prenom
                },
                position,
                trajetId,
                niveauGravite,
                message: `⚠️ ALERTE ${typeAlerte} déclenchée dans votre trajet par ${utilisateur.nom}`
              });
            }

            // Ajouter et notifier les autres passagers
            for (const reservation of reservations) {
              alerte.personnesPresentes.push({
                utilisateurId: reservation.passagerId._id,
                nom: `${reservation.passagerId.nom} ${reservation.passagerId.prenom}`,
                telephone: reservation.passagerId.telephone
              });

              // Notifier chaque passager
              io.to(`user_${reservation.passagerId._id}`).emit('emergencyAlert', {
                alerteId: alerte._id,
                type: typeAlerte,
                declencheur: {
                  nom: utilisateur.nom,
                  prenom: utilisateur.prenom
                },
                position,
                trajetId,
                niveauGravite,
                message: `🚨 ALERTE ${typeAlerte} dans votre trajet!`
              });
            }

            // Diffuser à tous les participants du trajet
            socket.to(`trip_${trajetId}`).emit('tripEmergency', {
              alerteId: alerte._id,
              typeAlerte,
              declencheur: utilisateur.nom,
              position,
              personnesPresentes: alerte.personnesPresentes.length
            });

            await alerte.save();
          }
        } catch (trajetError) {
          console.error('Erreur lors de la gestion du trajet:', trajetError);
        }
      }

      // Notifier tous les administrateurs connectés
      io.to('admin_room').emit('newEmergency', {
        alerteId: alerte._id,
        typeAlerte,
        niveauGravite,
        utilisateur: {
          id: utilisateur._id,
          nom: utilisateur.nom,
          prenom: utilisateur.prenom,
          telephone: utilisateur.telephone
        },
        position,
        trajetId,
        personnesPresentes: alerte.personnesPresentes.length,
        contactsNotifies: contactsAlertes.length,
        timestamp: new Date(),
        description
      });

      // Confirmer à l'utilisateur qui a déclenché l'alerte
      socket.emit('emergencyTriggered', {
        alerteId: alerte._id,
        message: `Alerte ${typeAlerte} envoyée avec succès`,
        contactsNotifies: contactsAlertes.length,
        personnesAlertes: alerte.personnesPresentes.length
      });

      console.log(`🚨 Alerte ${typeAlerte} déclenchée par ${utilisateur.nom} - ID: ${alerte._id}`);

    } catch (error) {
      console.error('Erreur triggerEmergency:', error);
      socket.emit('error', { 
        type: 'ALERT_ERROR',
        message: 'Erreur lors du déclenchement de l\'alerte d\'urgence' 
      });
    }
  });

  // Mettre à jour le statut d'une alerte (pour les admins)
  socket.on('updateEmergencyStatus', async (data) => {
    try {
      const { alerteId, nouveauStatut, commentaire, actionsPrises = [] } = data;

      // Vérifier que l'utilisateur est admin
      if (!socket.user.role || !['SUPER_ADMIN', 'MODERATEUR', 'SUPPORT'].includes(socket.user.role)) {
        socket.emit('error', { 
          type: 'AUTH_ERROR',
          message: 'Accès refusé. Privilèges administrateur requis.' 
        });
        return;
      }

      const updateData = {
        statutAlerte: nouveauStatut
      };

      if (nouveauStatut === 'EN_TRAITEMENT') {
        updateData.moderateurId = socket.user.id;
      } else if (nouveauStatut === 'RESOLUE') {
        updateData.dateResolution = new Date();
        updateData.commentaireResolution = commentaire;
        updateData.actionsPrises = actionsPrises;
      }

      const alerte = await AlerteUrgence.findByIdAndUpdate(
        alerteId,
        updateData,
        { new: true }
      ).populate('declencheurId', 'nom prenom');

      if (!alerte) {
        socket.emit('error', { 
          type: 'ALERT_ERROR',
          message: 'Alerte non trouvée' 
        });
        return;
      }

      // Notifier l'utilisateur qui a déclenché l'alerte
      io.to(`user_${alerte.declencheurId._id}`).emit('emergencyStatusUpdate', {
        alerteId,
        nouveauStatut,
        message: getStatusMessage(nouveauStatut),
        commentaire,
        actionsPrises,
        admin: {
          nom: socket.user.nom,
          prenom: socket.user.prenom
        }
      });

      // Notifier les autres admins
      socket.to('admin_room').emit('emergencyUpdated', {
        alerteId,
        nouveauStatut,
        updatedBy: socket.user.nom,
        commentaire
      });

      socket.emit('emergencyUpdateConfirmed', { 
        alerteId,
        nouveauStatut 
      });

      console.log(`🚨 Alerte ${alerteId} mise à jour: ${nouveauStatut} par ${socket.user.nom}`);

    } catch (error) {
      console.error('Erreur updateEmergencyStatus:', error);
      socket.emit('error', { 
        type: 'ALERT_ERROR',
        message: 'Erreur lors de la mise à jour de l\'alerte' 
      });
    }
  });

  // Obtenir les alertes actives (pour les admins)
  socket.on('getActiveEmergencies', async () => {
    try {
      // Vérifier les privilèges admin
      if (!socket.user.role || !['SUPER_ADMIN', 'MODERATEUR', 'SUPPORT'].includes(socket.user.role)) {
        socket.emit('error', { 
          type: 'AUTH_ERROR',
          message: 'Accès refusé' 
        });
        return;
      }

      const alertesActives = await AlerteUrgence.find({
        statutAlerte: { $in: ['ACTIVE', 'EN_TRAITEMENT'] }
      })
      .populate('declencheurId', 'nom prenom telephone')
      .populate('trajetId', 'pointDepart pointArrivee')
      .sort({ createdAt: -1 })
      .limit(50);

      socket.emit('activeEmergencies', alertesActives);

    } catch (error) {
      console.error('Erreur getActiveEmergencies:', error);
      socket.emit('error', { 
        type: 'ALERT_ERROR',
        message: 'Erreur lors de la récupération des alertes' 
      });
    }
  });

  // Ajouter des informations supplémentaires à une alerte
  socket.on('addEmergencyInfo', async (data) => {
    try {
      const { alerteId, info } = data;
      const { premiersSecours, policeContactee, commentaireSupplementaire } = info;

      // Vérifier que l'utilisateur est admin ou la personne qui a déclenché l'alerte
      const alerte = await AlerteUrgence.findById(alerteId);
      
      if (!alerte) {
        socket.emit('error', { 
          type: 'ALERT_ERROR',
          message: 'Alerte non trouvée' 
        });
        return;
      }

      const isOwner = alerte.declencheurId.toString() === socket.user.id;
      const isAdmin = socket.user.role && ['SUPER_ADMIN', 'MODERATEUR', 'SUPPORT'].includes(socket.user.role);

      if (!isOwner && !isAdmin) {
        socket.emit('error', { 
          type: 'AUTH_ERROR',
          message: 'Non autorisé à modifier cette alerte' 
        });
        return;
      }

      const updateData = {};
      if (premiersSecours !== undefined) updateData.premiersSecours = premiersSecours;
      if (policeContactee !== undefined) updateData.policeContactee = policeContactee;
      if (commentaireSupplementaire) {
        updateData.commentaireResolution = commentaireSupplementaire;
      }

      await AlerteUrgence.findByIdAndUpdate(alerteId, updateData);

      // Notifier les admins des mises à jour
      io.to('admin_room').emit('emergencyInfoAdded', {
        alerteId,
        info,
        updatedBy: socket.user.nom
      });

      socket.emit('emergencyInfoAdded', { alerteId, message: 'Informations ajoutées' });

    } catch (error) {
      console.error('Erreur addEmergencyInfo:', error);
      socket.emit('error', { 
        type: 'ALERT_ERROR',
        message: 'Erreur lors de l\'ajout d\'informations' 
      });
    }
  });

  // Envoyer une fausse alerte (si l'utilisateur s'est trompé)
  socket.on('reportFalseAlarm', async (data) => {
    try {
      const { alerteId, reason } = data;

      const alerte = await AlerteUrgence.findOne({
        _id: alerteId,
        declencheurId: socket.user.id,
        statutAlerte: { $in: ['ACTIVE', 'EN_TRAITEMENT'] }
      });

      if (!alerte) {
        socket.emit('error', { 
          type: 'ALERT_ERROR',
          message: 'Alerte non trouvée ou non modifiable' 
        });
        return;
      }

      await AlerteUrgence.findByIdAndUpdate(alerteId, {
        statutAlerte: 'FAUSSE_ALERTE',
        commentaireResolution: reason || 'Fausse alerte signalée par l\'utilisateur',
        dateResolution: new Date()
      });

      // Notifier les admins
      io.to('admin_room').emit('falseAlarmReported', {
        alerteId,
        declencheur: socket.user.nom,
        reason: reason || 'Pas de raison spécifiée'
      });

      socket.emit('falseAlarmReported', { 
        alerteId,
        message: 'Fausse alerte signalée' 
      });

      console.log(`🚨 Fausse alerte signalée pour ${alerteId} par ${socket.user.nom}`);

    } catch (error) {
      console.error('Erreur reportFalseAlarm:', error);
      socket.emit('error', { 
        type: 'ALERT_ERROR',
        message: 'Erreur lors du signalement de fausse alerte' 
      });
    }
  });

  console.log(`🚨 Alerte handler initialisé pour ${socket.user.nom}`);
};

// Fonction utilitaire pour les messages de statut
function getStatusMessage(statut) {
  const messages = {
    'ACTIVE': 'Votre alerte est active et en cours de traitement',
    'EN_TRAITEMENT': 'Votre alerte est prise en charge par notre équipe',
    'RESOLUE': 'Votre alerte a été résolue',
    'FAUSSE_ALERTE': 'Cette alerte a été marquée comme fausse alerte'
  };
  
  return messages[statut] || 'Statut de votre alerte mis à jour';
}