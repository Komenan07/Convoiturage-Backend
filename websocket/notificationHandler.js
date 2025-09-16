// notificationHandler.js
const mongoose = require('mongoose');

// Schéma pour les notifications
const notificationSchema = new mongoose.Schema({
  // Destinataire
  destinataireId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: [true, 'Le destinataire est requis'],
    index: true
  },

  // Expéditeur (optionnel pour notifications système)
  expediteurId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: false
  },

  // Type de notification
  type: {
    type: String,
    enum: {
      values: [
        // Trajets
        'nouveau_trajet_disponible',
        'trajet_annule',
        'trajet_modifie',
        'trajet_demarre',
        'trajet_termine',
        'conducteur_arrive',
        
        // Réservations
        'nouvelle_reservation',
        'reservation_acceptee',
        'reservation_refusee',
        'reservation_annulee',
        'reservation_expiree',
        
        // Paiements
        'paiement_recu',
        'paiement_echoue',
        'recharge_confirmee',
        'solde_faible',
        'commission_prelevee',
        'retrait_effectue',
        
        // Messages
        'nouveau_message',
        'message_important',
        
        // Système
        'compte_verifie',
        'document_rejete',
        'maintenance_programmee',
        'mise_a_jour_app',
        'alerte_securite',
        'promotion',
        
        // Urgences
        'urgence_trajet',
        'alerte_securite_immediate',
        
        // Évaluations
        'nouvelle_evaluation',
        'evaluation_negative',
        
        // Social
        'nouveau_badge',
        'objectif_atteint',
        'anniversaire_inscription'
      ],
      message: 'Type de notification invalide'
    },
    required: true
  },

  // Titre de la notification
  titre: {
    type: String,
    required: [true, 'Le titre est requis'],
    trim: true,
    maxlength: [100, 'Le titre ne peut dépasser 100 caractères']
  },

  // Contenu de la notification
  message: {
    type: String,
    required: [true, 'Le message est requis'],
    trim: true,
    maxlength: [500, 'Le message ne peut dépasser 500 caractères']
  },

  // Données contextuelles
  donnees: {
    // Trajet
    trajetId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Trajet'
    },
    
    // Réservation
    reservationId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Reservation'
    },
    
    // Paiement
    paiementId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Paiement'
    },
    
    // Montant (pour notifications financières)
    montant: Number,
    devise: {
      type: String,
      default: 'FCFA'
    },
    
    // URL d'action
    urlAction: String,
    
    // Action à effectuer
    actionRequise: {
      type: String,
      enum: ['aucune', 'voir_details', 'accepter_refuser', 'payer', 'evaluer', 'mettre_a_jour']
    },
    
    // Données personnalisées
    metadonnees: mongoose.Schema.Types.Mixed,
    
    // Géolocalisation (pour notifications basées sur la position)
    coordonnees: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: [Number]
    },
    
    // Rayon d'action pour notifications géolocalisées (en mètres)
    rayon: Number
  },

  // Priorité
  priorite: {
    type: String,
    enum: {
      values: ['basse', 'normale', 'haute', 'critique'],
      message: 'Priorité invalide'
    },
    default: 'normale'
  },

  // Catégorie pour regroupement
  categorie: {
    type: String,
    enum: {
      values: ['trajet', 'paiement', 'social', 'systeme', 'urgence', 'marketing'],
      message: 'Catégorie invalide'
    },
    required: true
  },

  // Statut de la notification
  statut: {
    type: String,
    enum: {
      values: ['non_lue', 'lue', 'archivee', 'supprimee'],
      message: 'Statut invalide'
    },
    default: 'non_lue',
    index: true
  },

  // Dates
  dateLecture: Date,
  dateExpiration: Date,

  // Canaux de diffusion
  canaux: {
    push: {
      envoye: { type: Boolean, default: false },
      dateEnvoi: Date,
      reponse: mongoose.Schema.Types.Mixed
    },
    email: {
      envoye: { type: Boolean, default: false },
      dateEnvoi: Date,
      reponse: mongoose.Schema.Types.Mixed
    },
    sms: {
      envoye: { type: Boolean, default: false },
      dateEnvoi: Date,
      reponse: mongoose.Schema.Types.Mixed
    },
    inApp: {
      affiche: { type: Boolean, default: false },
      dateAffichage: Date
    }
  },

  // Programmation
  programmee: {
    type: Boolean,
    default: false
  },
  
  dateEnvoiProgramme: Date,

  // Groupement (pour éviter le spam)
  groupeId: String,
  estGroupe: {
    type: Boolean,
    default: false
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index pour optimiser les requêtes
notificationSchema.index({ destinataireId: 1, statut: 1, createdAt: -1 });
notificationSchema.index({ type: 1, createdAt: -1 });
notificationSchema.index({ priorite: 1, createdAt: -1 });
notificationSchema.index({ 'donnees.coordonnees': '2dsphere' });
notificationSchema.index({ dateEnvoiProgramme: 1, programmee: 1 });
notificationSchema.index({ dateExpiration: 1 });

// Schéma pour les préférences de notification
const preferencesNotificationSchema = new mongoose.Schema({
  utilisateurId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: true,
    unique: true
  },

  // Préférences générales
  general: {
    actives: { type: Boolean, default: true },
    heuresCalmes: {
      debut: { type: String, default: '22:00' }, // Format HH:mm
      fin: { type: String, default: '07:00' }
    },
    weekend: { type: Boolean, default: true }
  },

  // Préférences par canal
  canaux: {
    push: {
      active: { type: Boolean, default: true },
      types: [{
        type: String,
        enum: [
          'nouveau_trajet_disponible', 'nouvelle_reservation', 'reservation_acceptee',
          'trajet_demarre', 'conducteur_arrive', 'paiement_recu', 'nouveau_message',
          'urgence_trajet', 'alerte_securite_immediate'
        ]
      }]
    },
    email: {
      active: { type: Boolean, default: true },
      frequence: {
        type: String,
        enum: ['immediate', 'quotidien', 'hebdomadaire'],
        default: 'immediate'
      },
      types: [{
        type: String,
        enum: [
          'reservation_acceptee', 'paiement_recu', 'compte_verifie', 'document_rejete',
          'maintenance_programmee', 'promotion'
        ]
      }]
    },
    sms: {
      active: { type: Boolean, default: false },
      types: [{
        type: String,
        enum: [
          'urgence_trajet', 'alerte_securite_immediate', 'code_verification'
        ]
      }]
    }
  },

  // Préférences par type
  types: {
    trajets: { type: Boolean, default: true },
    paiements: { type: Boolean, default: true },
    messages: { type: Boolean, default: true },
    promotions: { type: Boolean, default: false },
    systeme: { type: Boolean, default: true },
    urgences: { type: Boolean, default: true }
  },

  // Paramètres géographiques
  geolocalisation: {
    rayonNotifications: { type: Number, default: 10000 }, // 10km par défaut
    villesAbonnees: [String],
    trajetsProches: { type: Boolean, default: true }
  }

}, {
  timestamps: true
});

// Modèles
const Notification = mongoose.model('Notification', notificationSchema, 'notifications');
const PreferencesNotification = mongoose.model('PreferencesNotification', preferencesNotificationSchema, 'preferences_notifications');

class NotificationHandler {
  constructor(io, socketHandler) {
    this.io = io;
    this.socketHandler = socketHandler;
    this.servicesExternes = new Map();
    this.templatesNotifications = new Map();
    this.filesAttente = new Map(); // Pour gérer les files d'attente par utilisateur
    
    this.initialiserTemplates();
    this.demarrerTachesAutomatiques();
    
    console.log('🔔 Notification Handler initialisé');
  }

  // =========================
  // INITIALISATION
  // =========================
  
  initialiserTemplates() {
    // Templates pour différents types de notifications
    this.templatesNotifications.set('nouveau_trajet_disponible', {
      titre: 'Nouveau trajet disponible',
      message: 'Un trajet de {depart} vers {arrivee} est disponible pour {prix} FCFA',
      priorite: 'normale',
      categorie: 'trajet'
    });

    this.templatesNotifications.set('nouvelle_reservation', {
      titre: 'Nouvelle demande de réservation',
      message: '{nom} souhaite réserver {places} place(s) pour votre trajet',
      priorite: 'haute',
      categorie: 'trajet'
    });

    this.templatesNotifications.set('reservation_acceptee', {
      titre: 'Réservation acceptée',
      message: 'Votre réservation pour le trajet de {depart} vers {arrivee} a été acceptée',
      priorite: 'haute',
      categorie: 'trajet'
    });

    this.templatesNotifications.set('paiement_recu', {
      titre: 'Paiement reçu',
      message: 'Vous avez reçu un paiement de {montant} FCFA',
      priorite: 'normale',
      categorie: 'paiement'
    });

    this.templatesNotifications.set('solde_faible', {
      titre: 'Solde faible',
      message: 'Votre solde est de {solde} FCFA. Rechargez pour continuer à accepter des courses',
      priorite: 'haute',
      categorie: 'paiement'
    });

    this.templatesNotifications.set('urgence_trajet', {
      titre: 'URGENCE - Trajet',
      message: 'Une situation d\'urgence a été signalée sur votre trajet',
      priorite: 'critique',
      categorie: 'urgence'
    });

    console.log('📝 Templates de notifications initialisés');
  }

  // =========================
  // ENVOI DE NOTIFICATIONS
  // =========================
  
  async envoyerNotification(destinataireId, type, donnees = {}, options = {}) {
    try {
      // Obtenir les préférences utilisateur
      const preferences = await this.obtenirPreferences(destinataireId);
      
      // Vérifier si les notifications sont activées
      if (!this.doitEnvoyerNotification(type, preferences, options)) {
        return { success: false, raison: 'Notifications désactivées' };
      }

      // Générer la notification depuis le template
      const notificationData = await this.genererNotification(type, donnees, options);
      
      // Créer la notification en base
      const notification = new Notification({
        destinataireId,
        expediteurId: options.expediteurId || null,
        type,
        titre: notificationData.titre,
        message: notificationData.message,
        donnees: {
          ...donnees,
          metadonnees: options.metadonnees || {}
        },
        priorite: options.priorite || notificationData.priorite,
        categorie: options.categorie || notificationData.categorie,
        dateExpiration: options.dateExpiration || null,
        programmee: options.programmee || false,
        dateEnvoiProgramme: options.dateEnvoiProgramme || null
      });

      await notification.save();

      // Envoyer selon les canaux configurés
      const resultatsEnvoi = await this.diffuserNotification(notification, preferences);

      return {
        success: true,
        notificationId: notification._id,
        canaux: resultatsEnvoi
      };

    } catch (error) {
      console.error('❌ Erreur envoi notification:', error);
      throw error;
    }
  }

  async genererNotification(type, donnees, options) {
    const template = this.templatesNotifications.get(type);
    
    if (!template) {
      throw new Error(`Template non trouvé pour le type: ${type}`);
    }

    // Remplacer les variables dans le template
    let titre = options.titre || template.titre;
    let message = options.message || template.message;

    // Variables de remplacement
    const variables = {
      '{nom}': donnees.nom || '',
      '{depart}': donnees.depart || '',
      '{arrivee}': donnees.arrivee || '',
      '{prix}': donnees.prix || '',
      '{montant}': donnees.montant || '',
      '{solde}': donnees.solde || '',
      '{places}': donnees.places || '1',
      '{date}': donnees.date ? new Date(donnees.date).toLocaleDateString('fr-FR') : '',
      '{heure}': donnees.heure || ''
    };

    // Remplacer toutes les variables
    Object.entries(variables).forEach(([placeholder, value]) => {
      titre = titre.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
      message = message.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
    });

    return {
      titre,
      message,
      priorite: template.priorite,
      categorie: template.categorie
    };
  }

  async diffuserNotification(notification, preferences) {
    const resultats = {};

    // 1. Notification in-app (WebSocket)
    resultats.inApp = await this.envoyerNotificationInApp(notification);

    // 2. Push notification
    if (preferences.canaux.push.active && 
        this.doitEnvoyerParCanal('push', notification.type, preferences)) {
      resultats.push = await this.envoyerPushNotification(notification);
    }

    // 3. Email
    if (preferences.canaux.email.active && 
        this.doitEnvoyerParCanal('email', notification.type, preferences)) {
      resultats.email = await this.envoyerEmailNotification(notification);
    }

    // 4. SMS (pour urgences uniquement)
    if (preferences.canaux.sms.active && 
        this.doitEnvoyerParCanal('sms', notification.type, preferences)) {
      resultats.sms = await this.envoyerSMSNotification(notification);
    }

    return resultats;
  }

  async envoyerNotificationInApp(notification) {
    try {
      const destinataireSocketId = this.socketHandler.connectedUsers.get(
        notification.destinataireId.toString()
      );

      if (destinataireSocketId) {
        this.io.to(destinataireSocketId).emit('nouvelle_notification', {
          id: notification._id,
          type: notification.type,
          titre: notification.titre,
          message: notification.message,
          donnees: notification.donnees,
          priorite: notification.priorite,
          categorie: notification.categorie,
          dateEnvoi: notification.createdAt
        });

        // Marquer comme affichée
        await Notification.findByIdAndUpdate(notification._id, {
          'canaux.inApp.affiche': true,
          'canaux.inApp.dateAffichage': new Date()
        });

        return { success: true, canal: 'inApp' };
      }

      return { success: false, raison: 'Utilisateur hors ligne' };

    } catch (error) {
      console.error('❌ Erreur notification in-app:', error);
      return { success: false, erreur: error.message };
    }
  }

  async envoyerPushNotification(notification) {
    try {
      // Intégration avec service push (Firebase, OneSignal, etc.)
      const servicesPush = this.servicesExternes.get('push');
      
      if (!servicesPush) {
        console.warn('⚠️ Service push non configuré');
        return { success: false, raison: 'Service non configuré' };
      }

      const payload = {
        title: notification.titre,
        body: notification.message,
        data: {
          notificationId: notification._id.toString(),
          type: notification.type,
          ...notification.donnees
        },
        priority: this.convertirPriorite(notification.priorite)
      };

      // Envoi via le service configuré
      const resultat = await servicesPush.envoyer(notification.destinataireId, payload);

      // Mettre à jour le statut
      await Notification.findByIdAndUpdate(notification._id, {
        'canaux.push.envoye': resultat.success,
        'canaux.push.dateEnvoi': new Date(),
        'canaux.push.reponse': resultat
      });

      return resultat;

    } catch (error) {
      console.error('❌ Erreur push notification:', error);
      return { success: false, erreur: error.message };
    }
  }

  async envoyerEmailNotification(notification) {
    try {
      const serviceEmail = this.servicesExternes.get('email');
      
      if (!serviceEmail) {
        console.warn('⚠️ Service email non configuré');
        return { success: false, raison: 'Service non configuré' };
      }

      // Récupérer l'utilisateur pour avoir l'email
      const Utilisateur = mongoose.model('Utilisateur');
      const utilisateur = await Utilisateur.findById(notification.destinataireId)
        .select('email nom prenom');

      if (!utilisateur?.email) {
        return { success: false, raison: 'Email utilisateur non trouvé' };
      }

      const emailData = {
        to: utilisateur.email,
        subject: notification.titre,
        html: await this.genererTemplateEmail(notification, utilisateur),
        category: notification.categorie
      };

      const resultat = await serviceEmail.envoyer(emailData);

      // Mettre à jour le statut
      await Notification.findByIdAndUpdate(notification._id, {
        'canaux.email.envoye': resultat.success,
        'canaux.email.dateEnvoi': new Date(),
        'canaux.email.reponse': resultat
      });

      return resultat;

    } catch (error) {
      console.error('❌ Erreur email notification:', error);
      return { success: false, erreur: error.message };
    }
  }

  async envoyerSMSNotification(notification) {
    try {
      // SMS uniquement pour les urgences critiques
      if (notification.priorite !== 'critique') {
        return { success: false, raison: 'SMS réservé aux urgences critiques' };
      }

      const serviceSMS = this.servicesExternes.get('sms');
      
      if (!serviceSMS) {
        console.warn('⚠️ Service SMS non configuré');
        return { success: false, raison: 'Service non configuré' };
      }

      // Récupérer le téléphone de l'utilisateur
      const Utilisateur = mongoose.model('Utilisateur');
      const utilisateur = await Utilisateur.findById(notification.destinataireId)
        .select('telephone nom');

      if (!utilisateur?.telephone) {
        return { success: false, raison: 'Téléphone utilisateur non trouvé' };
      }

      const smsData = {
        to: utilisateur.telephone,
        message: `${notification.titre}: ${notification.message}`,
        urgence: true
      };

      const resultat = await serviceSMS.envoyer(smsData);

      // Mettre à jour le statut
      await Notification.findByIdAndUpdate(notification._id, {
        'canaux.sms.envoye': resultat.success,
        'canaux.sms.dateEnvoi': new Date(),
        'canaux.sms.reponse': resultat
      });

      return resultat;

    } catch (error) {
      console.error('❌ Erreur SMS notification:', error);
      return { success: false, erreur: error.message };
    }
  }

  // =========================
  // NOTIFICATIONS SPÉCIALISÉES
  // =========================
  
  async notifierNouveauTrajet(trajetData, rayonKm = 10) {
    try {
      if (!trajetData.coordonnees) {
        console.warn('⚠️ Pas de coordonnées pour notification trajet');
        return;
      }

      // Trouver les utilisateurs dans la zone
      const Utilisateur = mongoose.model('Utilisateur');
      const utilisateursProches = await Utilisateur.find({
        'adresse.coordonnees': {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: trajetData.coordonnees
            },
            $maxDistance: rayonKm * 1000
          }
        },
        role: { $in: ['passager', 'les_deux'] },
        statutCompte: 'ACTIF'
      }).select('_id');

      // Envoyer à chaque utilisateur proche
      const promesses = utilisateursProches.map(user => 
        this.envoyerNotification(user._id, 'nouveau_trajet_disponible', {
          depart: trajetData.depart,
          arrivee: trajetData.arrivee,
          prix: trajetData.prix,
          trajetId: trajetData.id,
          coordonnees: trajetData.coordonnees
        }, {
          priorite: 'normale'
        })
      );

      await Promise.all(promesses);
      console.log(`🚗 Notifications trajet envoyées à ${utilisateursProches.length} utilisateurs`);

    } catch (error) {
      console.error('❌ Erreur notification nouveau trajet:', error);
    }
  }

  async notifierReservation(conducteurId, reservationData) {
    return this.envoyerNotification(conducteurId, 'nouvelle_reservation', {
      nom: reservationData.passagerNom,
      places: reservationData.nombrePlaces,
      reservationId: reservationData.id,
      depart: reservationData.depart,
      arrivee: reservationData.arrivee
    }, {
      priorite: 'haute',
      expediteurId: reservationData.passagerId
    });
  }

  async notifierSoldeFaible(conducteurId, soldeActuel, seuil) {
    if (soldeActuel > seuil) return;

    return this.envoyerNotification(conducteurId, 'solde_faible', {
      solde: soldeActuel,
      seuil: seuil
    }, {
      priorite: 'haute'
    });
  }

  async notifierUrgence(participantsIds, typeUrgence, donneesUrgence) {
    const promesses = participantsIds.map(userId => 
      this.envoyerNotification(userId, 'urgence_trajet', {
        typeUrgence,
        ...donneesUrgence
      }, {
        priorite: 'critique'
      })
    );

    return Promise.all(promesses);
  }

  // =========================
  // GESTION DES PRÉFÉRENCES
  // =========================
  
  async obtenirPreferences(utilisateurId) {
    try {
      let preferences = await PreferencesNotification.findOne({ 
        utilisateurId 
      });

      // Créer des préférences par défaut si elles n'existent pas
      if (!preferences) {
        preferences = new PreferencesNotification({
          utilisateurId,
          // Les valeurs par défaut sont définies dans le schéma
        });
        await preferences.save();
      }

      return preferences;

    } catch (error) {
      console.error('❌ Erreur obtenir préférences:', error);
      // Retourner des préférences par défaut en cas d'erreur
      return this.obtenirPreferencesParDefaut();
    }
  }

  async mettreAJourPreferences(utilisateurId, nouvellesPreferences) {
    try {
      const preferences = await PreferencesNotification.findOneAndUpdate(
        { utilisateurId },
        { $set: nouvellesPreferences },
        { new: true, upsert: true }
      );

      return { success: true, preferences };

    } catch (error) {
      console.error('❌ Erreur mise à jour préférences:', error);
      throw error;
    }
  }

  doitEnvoyerNotification(type, preferences, options = {}) {
    // Vérifier si les notifications sont activées
    if (!preferences.general.actives) {
      return false;
    }

    // Vérifier les heures calmes
    if (this.estDansHeuresCalmes(preferences.general.heuresCalmes)) {
      // Permettre uniquement les urgences critiques
      return options.priorite === 'critique';
    }

    // Vérifier les préférences par type
    const categorie = this.obtenirCategorieType(type);
    if (!preferences.types[categorie]) {
      return false;
    }

    return true;
  }

  doitEnvoyerParCanal(canal, type, preferences) {
    if (!preferences.canaux[canal]?.active) {
      return false;
    }

    // Vérifier si le type est autorisé pour ce canal
    const typesAutorises = preferences.canaux[canal].types || [];
    if (typesAutorises.length > 0 && !typesAutorises.includes(type)) {
      return false;
    }

    return true;
  }

  estDansHeuresCalmes(heuresCalmes) {
    if (!heuresCalmes.debut || !heuresCalmes.fin) {
      return false;
    }

    const maintenant = new Date();
    const heureActuelle = maintenant.getHours() * 60 + maintenant.getMinutes();
    
    const [debutH, debutM] = heuresCalmes.debut.split(':').map(Number);
    const [finH, finM] = heuresCalmes.fin.split(':').map(Number);
    
    const debutMinutes = debutH * 60 + debutM;
    const finMinutes = finH * 60 + finM;

    // Gérer le cas où les heures calmes traversent minuit
    if (debutMinutes > finMinutes) {
      return heureActuelle >= debutMinutes || heureActuelle <= finMinutes;
    } else {
      return heureActuelle >= debutMinutes && heureActuelle <= finMinutes;
    }
  }

  obtenirCategorieType(type) {
    const categoriesMap = {
      'nouveau_trajet_disponible': 'trajets',
      'nouvelle_reservation': 'trajets',
      'reservation_acceptee': 'trajets',
      'trajet_demarre': 'trajets',
      'paiement_recu': 'paiements',
      'solde_faible': 'paiements',
      'nouveau_message': 'messages',
      'urgence_trajet': 'urgences',
      'promotion': 'promotions'
    };

    return categoriesMap[type] || 'systeme';
  }

  // =========================
  // GESTION DES NOTIFICATIONS EN BASE
  // =========================
  
  async obtenirNotifications(utilisateurId, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        statut = null,
        categorie = null,
        priorite = null,
        dateDebut = null,
        dateFin = null
      } = options;

      const skip = (page - 1) * limit;
      
      // Construire le filtre
      const filtre = {
        destinataireId: utilisateurId,
        statut: { $ne: 'supprimee' }
      };

      if (statut) filtre.statut = statut;
      if (categorie) filtre.categorie = categorie;
      if (priorite) filtre.priorite = priorite;
      
      if (dateDebut || dateFin) {
        filtre.createdAt = {};
        if (dateDebut) filtre.createdAt.$gte = new Date(dateDebut);
        if (dateFin) filtre.createdAt.$lte = new Date(dateFin);
      }

      const notifications = await Notification.find(filtre)
        .populate([
          { path: 'expediteurId', select: 'nom prenom photoProfil' },
          { path: 'donnees.trajetId', select: 'depart arrivee heureDepart' },
          { path: 'donnees.reservationId', select: 'nombrePlaces montant statut' }
        ])
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await Notification.countDocuments(filtre);
      const nonLues = await Notification.countDocuments({
        ...filtre,
        statut: 'non_lue'
      });

      return {
        notifications,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        },
        nonLues
      };

    } catch (error) {
      console.error('❌ Erreur obtenir notifications:', error);
      throw error;
    }
  }

  async marquerCommeLue(notificationId, utilisateurId) {
    try {
      const notification = await Notification.findOneAndUpdate(
        {
          _id: notificationId,
          destinataireId: utilisateurId,
          statut: 'non_lue'
        },
        {
          $set: {
            statut: 'lue',
            dateLecture: new Date()
          }
        },
        { new: true }
      );

      if (!notification) {
        throw new Error('Notification introuvable ou déjà lue');
      }

      // Notifier via WebSocket
      const socketId = this.socketHandler.connectedUsers.get(utilisateurId);
      if (socketId) {
        this.io.to(socketId).emit('notification_lue', {
          notificationId,
          dateLecture: notification.dateLecture
        });
      }

      return { success: true, notification };

    } catch (error) {
      console.error('❌ Erreur marquer notification lue:', error);
      throw error;
    }
  }

  async marquerToutesCommeLues(utilisateurId) {
    try {
      const result = await Notification.updateMany(
        {
          destinataireId: utilisateurId,
          statut: 'non_lue'
        },
        {
          $set: {
            statut: 'lue',
            dateLecture: new Date()
          }
        }
      );

      // Notifier via WebSocket
      const socketId = this.socketHandler.connectedUsers.get(utilisateurId);
      if (socketId) {
        this.io.to(socketId).emit('toutes_notifications_lues', {
          nombreLues: result.modifiedCount
        });
      }

      return { success: true, nombreLues: result.modifiedCount };

    } catch (error) {
      console.error('❌ Erreur marquer toutes lues:', error);
      throw error;
    }
  }

  async supprimerNotification(notificationId, utilisateurId) {
    try {
      const notification = await Notification.findOneAndUpdate(
        {
          _id: notificationId,
          destinataireId: utilisateurId
        },
        {
          $set: { statut: 'supprimee' }
        }
      );

      if (!notification) {
        throw new Error('Notification introuvable');
      }

      return { success: true };

    } catch (error) {
      console.error('❌ Erreur suppression notification:', error);
      throw error;
    }
  }

  // =========================
  // NOTIFICATIONS PROGRAMMÉES
  // =========================
  
  async programmerNotification(destinataireId, type, donnees, dateEnvoi, options = {}) {
    try {
      const notification = await this.envoyerNotification(destinataireId, type, donnees, {
        ...options,
        programmee: true,
        dateEnvoiProgramme: new Date(dateEnvoi)
      });

      console.log(`⏰ Notification programmée pour ${dateEnvoi}`);
      return notification;

    } catch (error) {
      console.error('❌ Erreur programmation notification:', error);
      throw error;
    }
  }

  async traiterNotificationsProgrammees() {
    try {
      const maintenant = new Date();
      
      const notificationsProgrammees = await Notification.find({
        programmee: true,
        dateEnvoiProgramme: { $lte: maintenant },
        statut: 'non_lue'
      }).limit(100);

      console.log(`📅 Traitement de ${notificationsProgrammees.length} notifications programmées`);

      for (const notification of notificationsProgrammees) {
        try {
          const preferences = await this.obtenirPreferences(notification.destinataireId);
          await this.diffuserNotification(notification, preferences);
          
          // Marquer comme traitée
          notification.programmee = false;
          await notification.save();

        } catch (error) {
          console.error(`❌ Erreur traitement notification ${notification._id}:`, error);
        }
      }

    } catch (error) {
      console.error('❌ Erreur traitement notifications programmées:', error);
    }
  }

  // =========================
  // NOTIFICATIONS EN MASSE
  // =========================
  
  async diffuserNotificationMasse(criteres, type, donnees, options = {}) {
    try {
      const Utilisateur = mongoose.model('Utilisateur');
      
      // Construire la requête selon les critères
      let requete = { statutCompte: 'ACTIF' };
      
      if (criteres.roles) {
        requete.role = { $in: criteres.roles };
      }
      
      if (criteres.ville) {
        requete['adresse.ville'] = criteres.ville;
      }
      
      if (criteres.compteRecharge) {
        requete['compteCovoiturage.estRecharge'] = criteres.compteRecharge;
      }

      const utilisateurs = await Utilisateur.find(requete).select('_id');
      
      console.log(`📢 Diffusion masse à ${utilisateurs.length} utilisateurs`);

      // Envoyer par lots pour éviter la surcharge
      const tailleLot = 100;
      for (let i = 0; i < utilisateurs.length; i += tailleLot) {
        const lot = utilisateurs.slice(i, i + tailleLot);
        
        const promesses = lot.map(user => 
          this.envoyerNotification(user._id, type, donnees, {
            ...options,
            groupeId: `masse_${Date.now()}`
          }).catch(err => {
            console.error(`Erreur envoi à ${user._id}:`, err);
            return null;
          })
        );

        await Promise.all(promesses);
        
        // Pause entre les lots
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      return { success: true, nombreDestinaires: utilisateurs.length };

    } catch (error) {
      console.error('❌ Erreur diffusion masse:', error);
      throw error;
    }
  }

  // =========================
  // CONFIGURATIONS DES SERVICES
  // =========================
  
  configurerServicePush(service) {
    this.servicesExternes.set('push', service);
    console.log('📱 Service push configuré');
  }

  configurerServiceEmail(service) {
    this.servicesExternes.set('email', service);
    console.log('📧 Service email configuré');
  }

  configurerServiceSMS(service) {
    this.servicesExternes.set('sms', service);
    console.log('📱 Service SMS configuré');
  }

  // =========================
  // UTILITAIRES
  // =========================
  
  convertirPriorite(priorite) {
    const priorites = {
      'basse': 'low',
      'normale': 'normal',
      'haute': 'high',
      'critique': 'max'
    };
    return priorites[priorite] || 'normal';
  }

  async genererTemplateEmail(notification, utilisateur) {
    // Template HTML basique - à personnaliser selon vos besoins
    return `
      <html>
        <body style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
          <div style="background-color: #f8f9fa; padding: 20px; text-align: center;">
            <h1 style="color: #007bff;">🚗 CovoiturageApp</h1>
          </div>
          
          <div style="padding: 20px;">
            <h2 style="color: #333;">${notification.titre}</h2>
            <p style="color: #666; font-size: 16px; line-height: 1.5;">
              Bonjour ${utilisateur.nom} ${utilisateur.prenom},
            </p>
            <p style="color: #333; font-size: 16px; line-height: 1.5;">
              ${notification.message}
            </p>
            
            ${notification.donnees.urlAction ? `
              <div style="text-align: center; margin: 30px 0;">
                <a href="${notification.donnees.urlAction}" 
                   style="background-color: #007bff; color: white; padding: 12px 24px; 
                          text-decoration: none; border-radius: 5px; display: inline-block;">
                  Voir les détails
                </a>
              </div>
            ` : ''}
          </div>
          
          <div style="background-color: #f8f9fa; padding: 15px; text-align: center; 
                      font-size: 12px; color: #666;">
            <p>Vous recevez cet email car vous êtes inscrit sur CovoiturageApp.</p>
            <p>Pour modifier vos préférences de notification, connectez-vous à votre compte.</p>
          </div>
        </body>
      </html>
    `;
  }

  obtenirPreferencesParDefaut() {
    return {
      general: { actives: true, heuresCalmes: { debut: '22:00', fin: '07:00' } },
      canaux: {
        push: { active: true, types: [] },
        email: { active: true, types: [] },
        sms: { active: false, types: [] }
      },
      types: {
        trajets: true,
        paiements: true,
        messages: true,
        promotions: false,
        systeme: true,
        urgences: true
      }
    };
  }

  // =========================
  // STATISTIQUES ET MONITORING
  // =========================
  
  async obtenirStatistiquesNotifications(options = {}) {
    try {
      const {
        dateDebut = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 jours
        dateFin = new Date(),
        groupeParJour = false
      } = options;

      const filtre = {
        createdAt: { $gte: dateDebut, $lte: dateFin }
      };

      // Statistiques générales
      const stats = await Notification.aggregate([
        { $match: filtre },
        {
          $group: {
            _id: null,
            total: { $sum: 1 },
            nonLues: { $sum: { $cond: [{ $eq: ['$statut', 'non_lue'] }, 1, 0] } },
            lues: { $sum: { $cond: [{ $eq: ['$statut', 'lue'] }, 1, 0] } },
            parType: {
              $push: {
                type: '$type',
                priorite: '$priorite',
                categorie: '$categorie'
              }
            }
          }
        }
      ]);

      // Statistiques par canal
      const statsCanaux = await Notification.aggregate([
        { $match: filtre },
        {
          $group: {
            _id: null,
            pushEnvoyes: { $sum: { $cond: ['$canaux.push.envoye', 1, 0] } },
            emailEnvoyes: { $sum: { $cond: ['$canaux.email.envoye', 1, 0] } },
            smsEnvoyes: { $sum: { $cond: ['$canaux.sms.envoye', 1, 0] } },
            inAppAffiches: { $sum: { $cond: ['$canaux.inApp.affiche', 1, 0] } }
          }
        }
      ]);

      // Évolution par jour si demandé
      let evolution = null;
      if (groupeParJour) {
        evolution = await Notification.aggregate([
          { $match: filtre },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$createdAt' }
              },
              count: { $sum: 1 }
            }
          },
          { $sort: { _id: 1 } }
        ]);
      }

      return {
        generale: stats[0] || { total: 0, nonLues: 0, lues: 0, parType: [] },
        canaux: statsCanaux[0] || {},
        evolution
      };

    } catch (error) {
      console.error('❌ Erreur statistiques notifications:', error);
      throw error;
    }
  }

  // =========================
  // INTÉGRATION SOCKET
  // =========================
  
  setupSocketEvents() {
    this.io.on('connection', (socket) => {
      // Obtenir notifications
      socket.on('obtenir_notifications', async (data = {}) => {
        try {
          const utilisateurId = socket.user?.userId;
          if (!utilisateurId) return;

          const result = await this.obtenirNotifications(utilisateurId, data);
          socket.emit('notifications_obtenues', result);

        } catch (error) {
          socket.emit('notification_error', { message: error.message });
        }
      });

      // Marquer comme lue
      socket.on('marquer_notification_lue', async (data) => {
        try {
          const { notificationId } = data;
          const utilisateurId = socket.user?.userId;

          if (!utilisateurId) return;

          await this.marquerCommeLue(notificationId, utilisateurId);

        } catch (error) {
          socket.emit('notification_error', { message: error.message });
        }
      });

      // Marquer toutes comme lues
      socket.on('marquer_toutes_lues', async () => {
        try {
          const utilisateurId = socket.user?.userId;
          if (!utilisateurId) return;

          await this.marquerToutesCommeLues(utilisateurId);

        } catch (error) {
          socket.emit('notification_error', { message: error.message });
        }
      });

      // Supprimer notification
      socket.on('supprimer_notification', async (data) => {
        try {
          const { notificationId } = data;
          const utilisateurId = socket.user?.userId;

          if (!utilisateurId) return;

          await this.supprimerNotification(notificationId, utilisateurId);
          socket.emit('notification_supprimee', { notificationId });

        } catch (error) {
          socket.emit('notification_error', { message: error.message });
        }
      });

      // Mettre à jour préférences
      socket.on('mettre_a_jour_preferences_notifications', async (data) => {
        try {
          const { preferences } = data;
          const utilisateurId = socket.user?.userId;

          if (!utilisateurId) return;

          const result = await this.mettreAJourPreferences(utilisateurId, preferences);
          socket.emit('preferences_mises_a_jour', result);

        } catch (error) {
          socket.emit('notification_error', { message: error.message });
        }
      });

      // Obtenir préférences
      socket.on('obtenir_preferences_notifications', async () => {
        try {
          const utilisateurId = socket.user?.userId;
          if (!utilisateurId) return;

          const preferences = await this.obtenirPreferences(utilisateurId);
          socket.emit('preferences_obtenues', { preferences });

        } catch (error) {
          socket.emit('notification_error', { message: error.message });
        }
      });
    });
  }

  // =========================
  // TÂCHES AUTOMATIQUES
  // =========================
  
  demarrerTachesAutomatiques() {
    // Traiter les notifications programmées toutes les minutes
    setInterval(() => {
      this.traiterNotificationsProgrammees().catch(console.error);
    }, 60 * 1000);

    // Nettoyer les notifications expirées toutes les heures
    setInterval(() => {
      this.nettoyerNotificationsExpirees().catch(console.error);
    }, 60 * 60 * 1000);

    // Envoyer les rapports quotidiens à 9h
    setInterval(() => {
      const maintenant = new Date();
      if (maintenant.getHours() === 9 && maintenant.getMinutes() === 0) {
        this.envoyerRapportsQuotidiens().catch(console.error);
      }
    }, 60 * 1000);

    console.log('⏰ Tâches automatiques de notifications démarrées');
  }

  async nettoyerNotificationsExpirees() {
    try {
      const maintenant = new Date();
      
      const result = await Notification.updateMany(
        {
          dateExpiration: { $lt: maintenant },
          statut: { $ne: 'supprimee' }
        },
        {
          $set: { statut: 'supprimee' }
        }
      );

      if (result.modifiedCount > 0) {
        console.log(`🧹 ${result.modifiedCount} notifications expirées nettoyées`);
      }

    } catch (error) {
      console.error('❌ Erreur nettoyage notifications expirées:', error);
    }
  }

  async envoyerRapportsQuotidiens() {
    try {
      // Envoyer un rapport aux administrateurs
      const stats = await this.obtenirStatistiquesNotifications({
        dateDebut: new Date(Date.now() - 24 * 60 * 60 * 1000)
      });

      const Utilisateur = mongoose.model('Utilisateur');
      const admins = await Utilisateur.find({ role: 'admin' }).select('_id');

      const promesses = admins.map(admin =>
        this.envoyerNotification(admin._id, 'rapport_quotidien', {
          stats: stats.generale,
          canaux: stats.canaux
        }, {
          titre: 'Rapport quotidien des notifications',
          message: `${stats.generale.total} notifications envoyées hier`,
          priorite: 'basse',
          categorie: 'systeme'
        })
      );

      await Promise.all(promesses);
      console.log('📊 Rapports quotidiens envoyés aux administrateurs');

    } catch (error) {
      console.error('❌ Erreur rapport quotidien:', error);
    }
  }

  // =========================
  // MÉTHODES PUBLIQUES POUR L'API
  // =========================
  
  async testerNotification(utilisateurId, canal = 'inApp') {
    return this.envoyerNotification(utilisateurId, 'test_notification', {
      canal
    }, {
      titre: 'Test de notification',
      message: `Test du canal ${canal} - ${new Date().toLocaleString()}`,
      priorite: 'basse',
      categorie: 'systeme'
    });
  }

  async obtenirResumeUtilisateur(utilisateurId) {
    try {
      const [notifications, preferences] = await Promise.all([
        this.obtenirNotifications(utilisateurId, { limit: 1 }),
        this.obtenirPreferences(utilisateurId)
      ]);

      return {
        nombreNonLues: notifications.nonLues,
        derniereNotification: notifications.notifications[0] || null,
        preferences: preferences.toObject()
      };

    } catch (error) {
      console.error('❌ Erreur résumé utilisateur:', error);
      throw error;
    }
  }
}

// Export
module.exports = {
  NotificationHandler,
  Notification,
  PreferencesNotification
};