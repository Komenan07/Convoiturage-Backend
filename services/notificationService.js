// const Notification = require('../models/Notification'); // À décommenter quand le modèle sera créé
const Utilisateur = require('../models/Utilisateur');
const { emailService } = require('./emailService');

// Optionnel: intégration SMS (Twilio) si variables d'environnement présentes
let twilioClient = null;
try {
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    twilioClient = require('twilio')(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
  }
} catch (e) {
  // pas critique en dev
}

const notificationService = {
  /**
   * Notifier l'ajout d'un nouveau participant à une conversation
   */
  notifierNouveauParticipant: async (conversationId, nouveauParticipantId, participantsExistants) => {
    try {
      const nouveauParticipant = await Utilisateur.findById(nouveauParticipantId);
      if (!nouveauParticipant) return;

      const notifications = participantsExistants.map(participantId => ({
        destinataire: participantId,
        type: 'nouveau_participant',
        titre: 'Nouveau participant',
        message: `${nouveauParticipant.nom} ${nouveauParticipant.prenom} a rejoint la conversation`,
        donnees: {
          conversationId,
          nouveauParticipantId,
          nomComplet: `${nouveauParticipant.nom} ${nouveauParticipant.prenom}`
        }
      }));

      // TODO: Implémenter avec le modèle Notification quand il sera créé
      // await Notification.insertMany(notifications);
      
      // Pour l'instant, juste un log
      console.log('✓ Notifications nouveau participant envoyées:', notifications.length);
      
      return notifications;
    } catch (error) {
      console.error('Erreur notification nouveau participant:', error);
    }
  },

  /**
   * Notifier un nouveau message dans une conversation
   */
  notifierNouveauMessage: async (conversationId, expediteurId, contenu, destinataires) => {
    try {
      const expediteur = await Utilisateur.findById(expediteurId);
      if (!expediteur) return;

      const contenuTronque = contenu.length > 50 
        ? contenu.substring(0, 50) + '...' 
        : contenu;

      const notifications = destinataires.map(destinataire => ({
        destinataire: destinataire._id || destinataire,
        type: 'nouveau_message',
        titre: 'Nouveau message',
        message: `${expediteur.nom} ${expediteur.prenom}: ${contenuTronque}`,
        donnees: {
          conversationId,
          expediteurId,
          expediteurNom: `${expediteur.nom} ${expediteur.prenom}`,
          apercu: contenuTronque
        }
      }));

      // TODO: Implémenter avec le modèle Notification quand il sera créé
      // await Notification.insertMany(notifications);
      
      // Pour l'instant, juste un log
      console.log('✓ Notifications nouveau message envoyées:', notifications.length);
      
      return notifications;
    } catch (error) {
      console.error('Erreur notification nouveau message:', error);
    }
  },

  /**
   * Envoyer un SMS (Twilio si configuré, sinon simulation/log)
   */
  sendSMS: async (numero, message) => {
    try {
      if (!numero || !message) throw new Error('Numéro ou message manquant');
      if (twilioClient && process.env.TWILIO_FROM) {
        const result = await twilioClient.messages.create({
          to: numero,
          from: process.env.TWILIO_FROM,
          body: message
        });
        console.log('✓ SMS envoyé via Twilio:', { sid: result.sid, to: numero });
        return { success: true, provider: 'twilio', sid: result.sid };
      }
      // Simulation
      console.log(`(SIMULATION) SMS -> ${numero}: ${message}`);
      return { success: true, provider: 'simulated' };
    } catch (error) {
      console.error('Erreur envoi SMS:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Envoyer un email via le service d'emails interne
   */
  sendEmail: async (to, subject, text) => {
    try {
      const res = await emailService.sendEmail(to, subject, text);
      return res;
    } catch (error) {
      console.error('Erreur envoi email:', error);
      return { success: false, error: error.message };
    }
  },

  /**
   * Envoyer une notification push (à implémenter selon votre service)
   */
  envoyerNotificationPush: async (utilisateurId, titre, message, donnees = {}) => {
    try {
      // Ici vous pourriez intégrer Firebase, OneSignal, etc.
      console.log(`Notification push pour ${utilisateurId}: ${titre} - ${message}`);
      
      // Exemple d'implémentation avec Firebase (à adapter)
      /*
      const user = await Utilisateur.findById(utilisateurId);
      if (user && user.fcmToken) {
        const payload = {
          notification: { title: titre, body: message },
          data: donnees,
          token: user.fcmToken
        };
        
        await admin.messaging().send(payload);
      }
      */
      
      return true;
    } catch (error) {
      console.error('Erreur notification push:', error);
      return false;
    }
  },

  /**
   * Marquer les notifications comme lues
   */
  marquerCommeLues: async (utilisateurId, notificationIds = []) => {
    try {
      let query = { destinataire: utilisateurId, estLue: false };
      
      if (notificationIds.length > 0) {
        query._id = { $in: notificationIds };
      }

      // TODO: Implémenter avec le modèle Notification quand il sera créé
      // const result = await Notification.updateMany(query, { 
      //   estLue: true, 
      //   dateLecture: new Date() 
      // });
      
      console.log(`✓ Notifications marquées comme lues pour l'utilisateur ${utilisateurId}`);
      
      // return result.modifiedCount;
      return 0; // Temporaire
    } catch (error) {
      console.error('Erreur marquage notifications lues:', error);
      return 0;
    }
  },

  /**
   * Obtenir les notifications d'un utilisateur
   */
  obtenirNotifications: async (utilisateurId, options = {}) => {
    try {
      const { page = 1, limit = 20, nonLuesUniquement = false } = options;
      
      let query = { destinataire: utilisateurId };
      
      if (nonLuesUniquement) {
        query.estLue = false;
      }

      // TODO: Implémenter avec le modèle Notification quand il sera créé
      /*
      const notifications = await Notification.find(query)
        .sort({ createdAt: -1 })
        .limit(limit)
        .skip((page - 1) * limit)
        .lean();
      
      const total = await Notification.countDocuments(query);
      
      return {
        notifications,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };
      */
      
      // Retour temporaire
      return {
        notifications: [],
        pagination: { page: 1, limit: 20, total: 0, pages: 0 }
      };
    } catch (error) {
      console.error('Erreur récupération notifications:', error);
      return { notifications: [], pagination: {} };
    }
  },

  /**
   * Nettoyer les anciennes notifications
   */
  nettoyerAnciennesNotifications: async (joursAnciennete = 30) => {
    try {
      const dateLimit = new Date();
      dateLimit.setDate(dateLimit.getDate() - joursAnciennete);

      // TODO: Implémenter avec le modèle Notification quand il sera créé
      // const result = await Notification.deleteMany({
      //   createdAt: { $lt: dateLimit },
      //   estLue: true
      // });
      
      console.log(`✓ Nettoyage des notifications de plus de ${joursAnciennete} jours effectué`);
      
      // return result.deletedCount;
      return 0; // Temporaire
    } catch (error) {
      console.error('Erreur nettoyage notifications:', error);
      return 0;
    }
  }
};

module.exports = notificationService;