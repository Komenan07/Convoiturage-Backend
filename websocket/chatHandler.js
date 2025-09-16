// chatHandler.js
const mongoose = require('mongoose');

// Schéma pour les messages de chat
const messageSchema = new mongoose.Schema({
  // Identifiants
  expediteurId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: [true, 'L\'expéditeur est requis']
  },
  
  destinataireId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: [true, 'Le destinataire est requis']
  },
  
  // Contexte du message
  trajetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trajet',
    required: false
  },
  
  reservationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Reservation',
    required: false
  },
  
  // Contenu du message
  contenu: {
    type: String,
    required: [true, 'Le contenu du message est requis'],
    trim: true,
    maxlength: [1000, 'Le message ne peut dépasser 1000 caractères']
  },
  
  typeMessage: {
    type: String,
    enum: {
      values: ['texte', 'image', 'localisation', 'systeme', 'audio', 'document'],
      message: 'Type de message invalide'
    },
    default: 'texte'
  },
  
  // Métadonnées pour différents types
  metadonnees: {
    // Pour les images
    urlImage: String,
    tailleImage: Number,
    
    // Pour les localisations
    coordonnees: {
      type: {
        type: String,
        enum: ['Point'],
        default: 'Point'
      },
      coordinates: {
        type: [Number],
        validate: {
          validator: function(coords) {
            return coords.length === 2 && 
                   coords[0] >= -180 && coords[0] <= 180 &&
                   coords[1] >= -90 && coords[1] <= 90;
          },
          message: 'Coordonnées invalides'
        }
      }
    },
    adresse: String,
    
    // Pour les fichiers audio
    dureeAudio: Number,
    urlAudio: String,
    
    // Pour les documents
    urlDocument: String,
    nomDocument: String,
    tailleDocument: Number,
    typeDocument: String,
    
    // Messages système
    typeSysteme: {
      type: String,
      enum: ['reservation_acceptee', 'reservation_refusee', 'trajet_demarre', 'trajet_termine', 'paiement_effectue', 'notification']
    },
    donneesSysteme: mongoose.Schema.Types.Mixed
  },
  
  // Statut du message
  statut: {
    type: String,
    enum: {
      values: ['envoye', 'livre', 'lu', 'echec'],
      message: 'Statut invalide'
    },
    default: 'envoye'
  },
  
  // Dates
  dateLivraison: Date,
  dateLecture: Date,
  
  // Réponse à un message
  messageReponduId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Message'
  },
  
  // Message supprimé
  estSupprime: {
    type: Boolean,
    default: false
  },
  
  dateSuppression: Date,
  
  // Message signalé
  estSignale: {
    type: Boolean,
    default: false
  },
  
  signalements: [{
    utilisateurId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Utilisateur'
    },
    raison: {
      type: String,
      enum: ['spam', 'harcelement', 'contenu_inapproprie', 'faux_profil', 'autre']
    },
    description: String,
    dateSignalement: {
      type: Date,
      default: Date.now
    }
  }]
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index pour optimiser les requêtes
messageSchema.index({ expediteurId: 1, destinataireId: 1, createdAt: -1 });
messageSchema.index({ trajetId: 1, createdAt: -1 });
messageSchema.index({ createdAt: -1 });
messageSchema.index({ statut: 1 });

// Schéma pour les conversations
const conversationSchema = new mongoose.Schema({
  participants: [{
    utilisateurId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Utilisateur',
      required: true
    },
    surnom: String,
    estActif: {
      type: Boolean,
      default: true
    },
    dateAjout: {
      type: Date,
      default: Date.now
    }
  }],
  
  // Contexte de la conversation
  trajetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trajet'
  },
  
  typeConversation: {
    type: String,
    enum: {
      values: ['privee', 'trajet', 'groupe'],
      message: 'Type de conversation invalide'
    },
    default: 'privee'
  },
  
  // Métadonnées
  nom: {
    type: String,
    trim: true,
    maxlength: [100, 'Le nom ne peut dépasser 100 caractères']
  },
  
  description: {
    type: String,
    maxlength: [500, 'La description ne peut dépasser 500 caractères']
  },
  
  // Dernier message pour optimisation
  dernierMessage: {
    messageId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Message'
    },
    contenu: String,
    expediteurId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Utilisateur'
    },
    dateEnvoi: Date,
    typeMessage: String
  },
  
  // Statistiques
  nombreMessages: {
    type: Number,
    default: 0
  },
  
  messagesNonLus: [{
    utilisateurId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Utilisateur'
    },
    nombre: {
      type: Number,
      default: 0
    }
  }],
  
  // Paramètres
  estArchivee: {
    type: Boolean,
    default: false
  },
  
  estMutee: [{
    utilisateurId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Utilisateur'
    },
    dateFin: Date
  }]
  
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index pour les conversations
conversationSchema.index({ 'participants.utilisateurId': 1, updatedAt: -1 });
conversationSchema.index({ trajetId: 1 });
conversationSchema.index({ typeConversation: 1 });

// Modèles
const Message = mongoose.model('Message', messageSchema, 'messages');
const Conversation = mongoose.model('Conversation', conversationSchema, 'conversations');

class ChatHandler {
  constructor(io, socketHandler) {
    this.io = io;
    this.socketHandler = socketHandler;
    this.conversationsActives = new Map(); // conversationId -> participants actifs
    
    console.log('💬 Chat Handler initialisé');
  }

  // =========================
  // GESTION DES MESSAGES
  // =========================
  
  async envoyerMessage(expediteurId, destinataireId, contenu, options = {}) {
    try {
      const {
        typeMessage = 'texte',
        trajetId = null,
        reservationId = null,
        metadonnees = {},
        messageReponduId = null
      } = options;

      // Validation
      if (!contenu?.trim() && typeMessage === 'texte') {
        throw new Error('Le contenu du message est requis');
      }

      // Vérifier que les utilisateurs existent
      const Utilisateur = mongoose.model('Utilisateur');
      const [expediteur, destinataire] = await Promise.all([
        Utilisateur.findById(expediteurId),
        Utilisateur.findById(destinataireId)
      ]);

      if (!expediteur) {
        throw new Error('Expéditeur introuvable');
      }
      if (!destinataire) {
        throw new Error('Destinataire introuvable');
      }

      // Créer le message
      const message = new Message({
        expediteurId,
        destinataireId,
        contenu: contenu?.trim() || '',
        typeMessage,
        trajetId,
        reservationId,
        metadonnees,
        messageReponduId,
        statut: 'envoye'
      });

      await message.save();

      // Peupler les références
      await message.populate([
        { path: 'expediteurId', select: 'nom prenom photoProfil' },
        { path: 'destinataireId', select: 'nom prenom photoProfil' },
        { path: 'messageReponduId', select: 'contenu expediteurId typeMessage' }
      ]);

      // Trouver ou créer la conversation
      const conversation = await this.obtenirOuCreerConversation(expediteurId, destinataireId, trajetId);
      
      // Mettre à jour la conversation
      await this.mettreAJourConversation(conversation._id, message);

      // Envoyer via WebSocket si en ligne
      await this.diffuserMessage(message, conversation);

      // Marquer comme livré si le destinataire est en ligne
      if (this.socketHandler.connectedUsers.has(destinataireId)) {
        message.statut = 'livre';
        message.dateLivraison = new Date();
        await message.save();
      }

      return {
        success: true,
        message: message.toJSON(),
        conversationId: conversation._id
      };

    } catch (error) {
      console.error('❌ Erreur envoi message:', error);
      throw error;
    }
  }

  async obtenirOuCreerConversation(utilisateur1Id, utilisateur2Id, trajetId = null) {
    try {
      // Chercher une conversation existante
      let conversation = await Conversation.findOne({
        $and: [
          { 'participants.utilisateurId': utilisateur1Id },
          { 'participants.utilisateurId': utilisateur2Id },
          { typeConversation: trajetId ? 'trajet' : 'privee' },
          ...(trajetId ? [{ trajetId }] : [])
        ]
      });

      if (!conversation) {
        // Créer une nouvelle conversation
        conversation = new Conversation({
          participants: [
            { utilisateurId: utilisateur1Id },
            { utilisateurId: utilisateur2Id }
          ],
          trajetId,
          typeConversation: trajetId ? 'trajet' : 'privee',
          messagesNonLus: [
            { utilisateurId: utilisateur1Id, nombre: 0 },
            { utilisateurId: utilisateur2Id, nombre: 0 }
          ]
        });

        await conversation.save();
      }

      return conversation;

    } catch (error) {
      console.error('❌ Erreur conversation:', error);
      throw error;
    }
  }

  async mettreAJourConversation(conversationId, message) {
    try {
      // Incrémenter le nombre de messages non lus pour le destinataire
      await Conversation.findByIdAndUpdate(conversationId, {
        $set: {
          'dernierMessage.messageId': message._id,
          'dernierMessage.contenu': message.contenu,
          'dernierMessage.expediteurId': message.expediteurId,
          'dernierMessage.dateEnvoi': message.createdAt,
          'dernierMessage.typeMessage': message.typeMessage,
          updatedAt: new Date()
        },
        $inc: {
          nombreMessages: 1,
          'messagesNonLus.$[destinataire].nombre': 1
        }
      }, {
        arrayFilters: [
          { 'destinataire.utilisateurId': message.destinataireId }
        ]
      });

    } catch (error) {
      console.error('❌ Erreur mise à jour conversation:', error);
    }
  }

  async diffuserMessage(message, conversation) {
    try {
      const messageData = {
        id: message._id,
        conversationId: conversation._id,
        expediteur: {
          id: message.expediteurId._id,
          nom: message.expediteurId.nom,
          prenom: message.expediteurId.prenom,
          photoProfil: message.expediteurId.photoProfil
        },
        contenu: message.contenu,
        typeMessage: message.typeMessage,
        metadonnees: message.metadonnees,
        messageRepondu: message.messageReponduId ? {
          id: message.messageReponduId._id,
          contenu: message.messageReponduId.contenu,
          typeMessage: message.messageReponduId.typeMessage
        } : null,
        dateEnvoi: message.createdAt,
        statut: message.statut
      };

      // Envoyer au destinataire
      const destinataireSocketId = this.socketHandler.connectedUsers.get(message.destinataireId.toString());
      if (destinataireSocketId) {
        this.io.to(destinataireSocketId).emit('nouveau_message', messageData);
        
        // Envoyer aussi la mise à jour de conversation
        this.io.to(destinataireSocketId).emit('conversation_mise_a_jour', {
          conversationId: conversation._id,
          dernierMessage: messageData,
          messagesNonLus: await this.obtenirNombreMessagesNonLus(conversation._id, message.destinataireId)
        });
      }

      // Confirmer à l'expéditeur
      const expediteurSocketId = this.socketHandler.connectedUsers.get(message.expediteurId._id.toString());
      if (expediteurSocketId) {
        this.io.to(expediteurSocketId).emit('message_envoye', {
          messageId: message._id,
          conversationId: conversation._id,
          statut: message.statut,
          dateEnvoi: message.createdAt
        });
      }

    } catch (error) {
      console.error('❌ Erreur diffusion message:', error);
    }
  }

  // =========================
  // GESTION DES LECTURES
  // =========================
  
  async marquerMessageLu(messageId, utilisateurId) {
    try {
      const message = await Message.findById(messageId);
      
      if (!message) {
        throw new Error('Message introuvable');
      }

      // Vérifier que l'utilisateur est le destinataire
      if (message.destinataireId.toString() !== utilisateurId) {
        throw new Error('Non autorisé à marquer ce message comme lu');
      }

      if (message.statut !== 'lu') {
        message.statut = 'lu';
        message.dateLecture = new Date();
        await message.save();

        // Trouver la conversation
        const conversation = await this.obtenirConversationPourMessage(messageId);
        if (conversation) {
          // Décrémenter les messages non lus
          await Conversation.findByIdAndUpdate(conversation._id, {
            $inc: {
              'messagesNonLus.$[utilisateur].nombre': -1
            }
          }, {
            arrayFilters: [
              { 'utilisateur.utilisateurId': utilisateurId }
            ]
          });

          // Notifier l'expéditeur
          const expediteurSocketId = this.socketHandler.connectedUsers.get(message.expediteurId.toString());
          if (expediteurSocketId) {
            this.io.to(expediteurSocketId).emit('message_lu', {
              messageId: message._id,
              conversationId: conversation._id,
              lecteurId: utilisateurId,
              dateLecture: message.dateLecture
            });
          }
        }
      }

      return { success: true };

    } catch (error) {
      console.error('❌ Erreur marquer lu:', error);
      throw error;
    }
  }

  async marquerConversationLue(conversationId, utilisateurId) {
    try {
      // Marquer tous les messages non lus de cette conversation
      await Message.updateMany({
        destinataireId: utilisateurId,
        statut: { $in: ['envoye', 'livre'] }
      }, {
        $set: {
          statut: 'lu',
          dateLecture: new Date()
        }
      });

      // Remettre à zéro le compteur de messages non lus
      await Conversation.findByIdAndUpdate(conversationId, {
        $set: {
          'messagesNonLus.$[utilisateur].nombre': 0
        }
      }, {
        arrayFilters: [
          { 'utilisateur.utilisateurId': utilisateurId }
        ]
      });

      return { success: true };

    } catch (error) {
      console.error('❌ Erreur marquer conversation lue:', error);
      throw error;
    }
  }

  // =========================
  // RÉCUPÉRATION DES DONNÉES
  // =========================
  
  async obtenirConversations(utilisateurId, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        typeConversation = null,
        recherche = null
      } = options;

      const skip = (page - 1) * limit;
      
      // Construire le filtre
      const filtre = {
        'participants.utilisateurId': utilisateurId,
        'participants.estActif': true
      };

      if (typeConversation) {
        filtre.typeConversation = typeConversation;
      }

      if (recherche) {
        filtre.$or = [
          { nom: { $regex: recherche, $options: 'i' } },
          { 'dernierMessage.contenu': { $regex: recherche, $options: 'i' } }
        ];
      }

      const conversations = await Conversation.find(filtre)
        .populate([
          {
            path: 'participants.utilisateurId',
            select: 'nom prenom photoProfil statutCompte derniereConnexion'
          },
          {
            path: 'dernierMessage.expediteurId',
            select: 'nom prenom photoProfil'
          },
          {
            path: 'trajetId',
            select: 'depart arrivee heureDepart statut'
          }
        ])
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      // Ajouter le nombre de messages non lus pour cet utilisateur
      const conversationsAvecNonLus = conversations.map(conv => {
        const messagesNonLus = conv.messagesNonLus?.find(
          m => m.utilisateurId.toString() === utilisateurId
        );
        
        return {
          ...conv,
          messagesNonLus: messagesNonLus?.nombre || 0,
          autreParticipant: conv.participants.find(
            p => p.utilisateurId._id.toString() !== utilisateurId
          )?.utilisateurId
        };
      });

      const total = await Conversation.countDocuments(filtre);

      return {
        conversations: conversationsAvecNonLus,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      console.error('❌ Erreur obtenir conversations:', error);
      throw error;
    }
  }

  async obtenirMessages(conversationId, utilisateurId, options = {}) {
    try {
      const {
        page = 1,
        limit = 50,
        avant = null, // Date pour pagination par curseur
        apres = null
      } = options;

      // Vérifier que l'utilisateur fait partie de la conversation
      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.utilisateurId': utilisateurId
      });

      if (!conversation) {
        throw new Error('Conversation introuvable ou accès non autorisé');
      }

      // Construire le filtre pour les messages
      const filtre = {
        $or: [
          { expediteurId: utilisateurId, destinataireId: { $in: conversation.participants.map(p => p.utilisateurId) } },
          { destinataireId: utilisateurId, expediteurId: { $in: conversation.participants.map(p => p.utilisateurId) } }
        ],
        estSupprime: false
      };

      // Ajouter les filtres de date
      if (avant) {
        filtre.createdAt = { $lt: new Date(avant) };
      }
      if (apres) {
        filtre.createdAt = { ...filtre.createdAt, $gt: new Date(apres) };
      }

      // Calcul de l'offset si pagination par page
    const offset = (page - 1) * limit;
      const messages = await Message.find(filtre)
        .populate([
          { path: 'expediteurId', select: 'nom prenom photoProfil' },
          { path: 'messageReponduId', select: 'contenu expediteurId typeMessage createdAt' }
        ])
        .sort({ createdAt: -1 })
        .skip(offset)
        .limit(limit)
        .lean();

      // Inverser l'ordre pour avoir les plus récents en bas
      messages.reverse();

      return {
        messages,
        conversationId,
        hasMore: messages.length === limit
      };

    } catch (error) {
      console.error('❌ Erreur obtenir messages:', error);
      throw error;
    }
  }

  // =========================
  // GESTION DES CONVERSATIONS DE TRAJET
  // =========================
  
  async creerConversationTrajet(trajetId, conducteurId, passagersIds) {
    try {
      // Vérifier si une conversation existe déjà
      let conversation = await Conversation.findOne({
        trajetId,
        typeConversation: 'trajet'
      });

      if (!conversation) {
        const participants = [
          { utilisateurId: conducteurId },
          ...passagersIds.map(id => ({ utilisateurId: id }))
        ];

        conversation = new Conversation({
          participants,
          trajetId,
          typeConversation: 'trajet',
          nom: `Trajet - ${new Date().toLocaleDateString()}`,
          messagesNonLus: participants.map(p => ({ 
            utilisateurId: p.utilisateurId, 
            nombre: 0 
          }))
        });

        await conversation.save();

        // Envoyer un message de bienvenue
        await this.envoyerMessageSysteme(
          conversation._id,
          'Conversation créée pour ce trajet. Bon voyage !',
          'notification'
        );
      } else {
        // Ajouter les nouveaux passagers s'ils ne sont pas déjà dans la conversation
        const participantsExistants = conversation.participants.map(p => p.utilisateurId.toString());
        const nouveauxPassagers = passagersIds.filter(id => !participantsExistants.includes(id));

        if (nouveauxPassagers.length > 0) {
          conversation.participants.push(
            ...nouveauxPassagers.map(id => ({ utilisateurId: id }))
          );
          conversation.messagesNonLus.push(
            ...nouveauxPassagers.map(id => ({ utilisateurId: id, nombre: 0 }))
          );
          await conversation.save();
        }
      }

      return conversation;

    } catch (error) {
      console.error('❌ Erreur conversation trajet:', error);
      throw error;
    }
  }

  async envoyerMessageSysteme(conversationId, contenu, typeSysteme, donneesSysteme = {}) {
    try {
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) {
        throw new Error('Conversation introuvable');
      }

      const message = new Message({
        expediteurId: conversation.participants[0].utilisateurId, // Premier participant comme expéditeur système
        destinataireId: conversation.participants[0].utilisateurId, // Même destinataire
        contenu,
        typeMessage: 'systeme',
        metadonnees: {
          typeSysteme,
          donneesSysteme
        },
        statut: 'livre'
      });

      await message.save();
      await this.mettreAJourConversation(conversationId, message);

      // Diffuser à tous les participants
      const participantsSocketIds = conversation.participants
        .map(p => this.socketHandler.connectedUsers.get(p.utilisateurId.toString()))
        .filter(Boolean);

      participantsSocketIds.forEach(socketId => {
        this.io.to(socketId).emit('message_systeme', {
          conversationId,
          contenu,
          typeSysteme,
          donneesSysteme,
          dateEnvoi: message.createdAt
        });
      });

      return { success: true };

    } catch (error) {
      console.error('❌ Erreur message système:', error);
      throw error;
    }
  }

  // =========================
  // MODÉRATION
  // =========================
  
  async signalerMessage(messageId, utilisateurId, raison, description = '') {
    try {
      const message = await Message.findById(messageId);
      if (!message) {
        throw new Error('Message introuvable');
      }

      // Vérifier que l'utilisateur n'a pas déjà signalé ce message
      const dejaSignale = message.signalements.some(
        s => s.utilisateurId.toString() === utilisateurId
      );

      if (dejaSignale) {
        throw new Error('Message déjà signalé par cet utilisateur');
      }

      // Ajouter le signalement
      message.signalements.push({
        utilisateurId,
        raison,
        description,
        dateSignalement: new Date()
      });

      message.estSignale = true;
      await message.save();

      // Notifier les administrateurs
      this.io.to('admin').emit('nouveau_signalement_message', {
        messageId: message._id,
        expediteurId: message.expediteurId,
        contenu: message.contenu,
        raison,
        signaleurId: utilisateurId,
        dateSignalement: new Date()
      });

      return { success: true };

    } catch (error) {
      console.error('❌ Erreur signalement message:', error);
      throw error;
    }
  }

  async supprimerMessage(messageId, utilisateurId, estAdmin = false) {
    try {
      const message = await Message.findById(messageId);
      if (!message) {
        throw new Error('Message introuvable');
      }

      // Vérifier les permissions
      if (!estAdmin && message.expediteurId.toString() !== utilisateurId) {
        throw new Error('Non autorisé à supprimer ce message');
      }

      message.estSupprime = true;
      message.dateSuppression = new Date();
      await message.save();

      // Notifier les participants de la conversation
      const conversation = await this.obtenirConversationPourMessage(messageId);
      if (conversation) {
        const participantsSocketIds = conversation.participants
          .map(p => this.socketHandler.connectedUsers.get(p.utilisateurId.toString()))
          .filter(Boolean);

        participantsSocketIds.forEach(socketId => {
          this.io.to(socketId).emit('message_supprime', {
            messageId: message._id,
            conversationId: conversation._id,
            supprimePar: utilisateurId,
            estAdmin
          });
        });
      }

      return { success: true };

    } catch (error) {
      console.error('❌ Erreur suppression message:', error);
      throw error;
    }
  }

  // =========================
  // UTILITAIRES
  // =========================
  
  async obtenirConversationPourMessage(messageId) {
    try {
      const message = await Message.findById(messageId);
      if (!message) return null;

      return await Conversation.findOne({
        $and: [
          { 'participants.utilisateurId': message.expediteurId },
          { 'participants.utilisateurId': message.destinataireId }
        ]
      });

    } catch (error) {
      console.error('❌ Erreur conversation pour message:', error);
      return null;
    }
  }

  async obtenirNombreMessagesNonLus(conversationId, utilisateurId) {
    try {
      const conversation = await Conversation.findById(conversationId);
      if (!conversation) return 0;

      const messagesNonLus = conversation.messagesNonLus.find(
        m => m.utilisateurId.toString() === utilisateurId
      );

      return messagesNonLus?.nombre || 0;

    } catch (error) {
      console.error('❌ Erreur messages non lus:', error);
      return 0;
    }
  }

  async obtenirStatistiquesChat(utilisateurId) {
    try {
      const stats = await Promise.all([
        // Nombre total de conversations
        Conversation.countDocuments({
          'participants.utilisateurId': utilisateurId,
          'participants.estActif': true
        }),
        
        // Nombre total de messages envoyés
        Message.countDocuments({
          expediteurId: utilisateurId,
          estSupprime: false
        }),
        
        // Nombre total de messages reçus
        Message.countDocuments({
          destinataireId: utilisateurId,
          estSupprime: false
        }),
        
        // Messages non lus pour cet utilisateur
        Conversation.aggregate([
          { $match: { 'participants.utilisateurId': mongoose.Types.ObjectId(utilisateurId) } },
          { $unwind: '$messagesNonLus' },
          { $match: { 'messagesNonLus.utilisateurId': mongoose.Types.ObjectId(utilisateurId) } },
          { $group: { _id: null, totalNonLus: { $sum: '$messagesNonLus.nombre' } } }
        ])
      ]);

      return {
        conversationsTotal: stats[0],
        messagesEnvoyes: stats[1],
        messagesRecus: stats[2],
        messagesNonLus: stats[3][0]?.totalNonLus || 0
      };

    } catch (error) {
      console.error('❌ Erreur statistiques chat:', error);
      return {
        conversationsTotal: 0,
        messagesEnvoyes: 0,
        messagesRecus: 0,
        messagesNonLus: 0
      };
    }
  }

  // =========================
  // GESTION AVANCÉE
  // =========================
  
  async archiverConversation(conversationId, utilisateurId) {
    try {
      const conversation = await Conversation.findOne({
        _id: conversationId,
        'participants.utilisateurId': utilisateurId
      });

      if (!conversation) {
        throw new Error('Conversation introuvable');
      }

      // Marquer le participant comme inactif
      await Conversation.findOneAndUpdate(
        {
          _id: conversationId,
          'participants.utilisateurId': utilisateurId
        },
        {
          $set: { 'participants.$.estActif': false }
        }
      );

      return { success: true };

    } catch (error) {
      console.error('❌ Erreur archiver conversation:', error);
      throw error;
    }
  }

  async muterConversation(conversationId, utilisateurId, duree = 24) {
    try {
      const dateFin = new Date();
      dateFin.setHours(dateFin.getHours() + duree);

      await Conversation.findByIdAndUpdate(conversationId, {
        $push: {
          estMutee: {
            utilisateurId,
            dateFin
          }
        }
      });

      return { success: true, dateFin };

    } catch (error) {
      console.error('❌ Erreur muter conversation:', error);
      throw error;
    }
  }

  async rechercherMessages(utilisateurId, termeRecherche, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        typeMessage = null,
        dateDebut = null,
        dateFin = null,
        conversationId = null
      } = options;

      const skip = (page - 1) * limit;

      // Construire le filtre
      const filtre = {
        $or: [
          { expediteurId: utilisateurId },
          { destinataireId: utilisateurId }
        ],
        contenu: { $regex: termeRecherche, $options: 'i' },
        estSupprime: false
      };

      if (typeMessage) {
        filtre.typeMessage = typeMessage;
      }

      if (dateDebut) {
        filtre.createdAt = { $gte: new Date(dateDebut) };
      }

      if (dateFin) {
        filtre.createdAt = { ...filtre.createdAt, $lte: new Date(dateFin) };
      }

      if (conversationId) {
        // Récupérer la conversation pour obtenir les participants
        const conversation = await Conversation.findById(conversationId);
        if (conversation) {
          const participantsIds = conversation.participants.map(p => p.utilisateurId);
          filtre.$or = [
            { expediteurId: { $in: participantsIds }, destinataireId: { $in: participantsIds } }
          ];
        }
      }

      const messages = await Message.find(filtre)
        .populate([
          { path: 'expediteurId', select: 'nom prenom photoProfil' },
          { path: 'destinataireId', select: 'nom prenom photoProfil' }
        ])
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await Message.countDocuments(filtre);

      return {
        messages,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      console.error('❌ Erreur recherche messages:', error);
      throw error;
    }
  }

  // =========================
  // INTÉGRATION SOCKET
  // =========================
  
  setupSocketEvents() {
    this.io.on('connection', (socket) => {
      // Chat privé
      socket.on('envoyer_message_prive', async (data) => {
        try {
          const { destinataireId, contenu, typeMessage, metadonnees } = data;
          const expediteurId = socket.user?.userId;
          
          if (!expediteurId) {
            socket.emit('chat_error', { message: 'Utilisateur non authentifié' });
            return;
          }

          const result = await this.envoyerMessage(expediteurId, destinataireId, contenu, {
            typeMessage,
            metadonnees
          });

          socket.emit('message_prive_envoye', result);

        } catch (error) {
          socket.emit('chat_error', { message: error.message });
        }
      });

      // Marquer message comme lu
      socket.on('marquer_message_lu', async (data) => {
        try {
          const { messageId } = data;
          const utilisateurId = socket.user?.userId;

          if (!utilisateurId) return;

          await this.marquerMessageLu(messageId, utilisateurId);
          socket.emit('message_marque_lu', { messageId });

        } catch (error) {
          socket.emit('chat_error', { message: error.message });
        }
      });

      // Marquer conversation comme lue
      socket.on('marquer_conversation_lue', async (data) => {
        try {
          const { conversationId } = data;
          const utilisateurId = socket.user?.userId;

          if (!utilisateurId) return;

          await this.marquerConversationLue(conversationId, utilisateurId);
          socket.emit('conversation_marquee_lue', { conversationId });

        } catch (error) {
          socket.emit('chat_error', { message: error.message });
        }
      });

      // Récupérer conversations
      socket.on('obtenir_conversations', async (data = {}) => {
        try {
          const utilisateurId = socket.user?.userId;
          if (!utilisateurId) return;

          const result = await this.obtenirConversations(utilisateurId, data);
          socket.emit('conversations_obtenues', result);

        } catch (error) {
          socket.emit('chat_error', { message: error.message });
        }
      });

      // Récupérer messages d'une conversation
      socket.on('obtenir_messages', async (data) => {
        try {
          const { conversationId, ...options } = data;
          const utilisateurId = socket.user?.userId;

          if (!utilisateurId) return;

          const result = await this.obtenirMessages(conversationId, utilisateurId, options);
          socket.emit('messages_obtenus', result);

        } catch (error) {
          socket.emit('chat_error', { message: error.message });
        }
      });

      // Signaler un message
      socket.on('signaler_message', async (data) => {
        try {
          const { messageId, raison, description } = data;
          const utilisateurId = socket.user?.userId;

          if (!utilisateurId) return;

          await this.signalerMessage(messageId, utilisateurId, raison, description);
          socket.emit('message_signale', { messageId });

        } catch (error) {
          socket.emit('chat_error', { message: error.message });
        }
      });

      // Supprimer un message
      socket.on('supprimer_message', async (data) => {
        try {
          const { messageId } = data;
          const utilisateurId = socket.user?.userId;
          const estAdmin = socket.user?.role === 'admin';

          if (!utilisateurId) return;

          await this.supprimerMessage(messageId, utilisateurId, estAdmin);
          socket.emit('message_supprime_confirme', { messageId });

        } catch (error) {
          socket.emit('chat_error', { message: error.message });
        }
      });

      // Rechercher messages
      socket.on('rechercher_messages', async (data) => {
        try {
          const { termeRecherche, ...options } = data;
          const utilisateurId = socket.user?.userId;

          if (!utilisateurId) return;

          const result = await this.rechercherMessages(utilisateurId, termeRecherche, options);
          socket.emit('messages_recherche_resultats', result);

        } catch (error) {
          socket.emit('chat_error', { message: error.message });
        }
      });

      // Obtenir statistiques
      socket.on('obtenir_stats_chat', async () => {
        try {
          const utilisateurId = socket.user?.userId;
          if (!utilisateurId) return;

          const stats = await this.obtenirStatistiquesChat(utilisateurId);
          socket.emit('stats_chat_obtenues', stats);

        } catch (error) {
          socket.emit('chat_error', { message: error.message });
        }
      });

      // Typing indicators
      socket.on('utilisateur_tape', (data) => {
        const { conversationId, destinataireId } = data;
        const expediteurId = socket.user?.userId;

        if (!expediteurId) return;

        // Notifier le destinataire
        const destinataireSocketId = this.socketHandler.connectedUsers.get(destinataireId);
        if (destinataireSocketId) {
          this.io.to(destinataireSocketId).emit('utilisateur_tape', {
            conversationId,
            expediteurId,
            nom: socket.user?.nom
          });
        }
      });

      socket.on('utilisateur_arrete_taper', (data) => {
        const { conversationId, destinataireId } = data;
        const expediteurId = socket.user?.userId;

        if (!expediteurId) return;

        const destinataireSocketId = this.socketHandler.connectedUsers.get(destinataireId);
        if (destinataireSocketId) {
          this.io.to(destinataireSocketId).emit('utilisateur_arrete_taper', {
            conversationId,
            expediteurId
          });
        }
      });
    });
  }

  // =========================
  // MÉTHODES PUBLIQUES D'ADMINISTRATION
  // =========================
  
  async obtenirMessagesSignales(options = {}) {
    try {
      const {
        page = 1,
        limit = 50,
        statut = 'ouvert' // ouvert, traite, rejete
      } = options;

      const skip = (page - 1) * limit;

      const messages = await Message.find({
        estSignale: true,
        statut 
        // Ajouter filtre par statut si nécessaire
      })
        .populate([
          { path: 'expediteurId', select: 'nom prenom email photoProfil' },
          { path: 'signalements.utilisateurId', select: 'nom prenom email' }
        ])
        .sort({ updatedAt: -1 })
        .skip(skip)
        .limit(limit)
        .lean();

      const total = await Message.countDocuments({ estSignale: true });

      return {
        messages,
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        }
      };

    } catch (error) {
      console.error('❌ Erreur messages signalés:', error);
      throw error;
    }
  }

  async modererMessage(messageId, action, adminId, motif = '') {
    try {
      const message = await Message.findById(messageId);
      if (!message) {
        throw new Error('Message introuvable');
      }

      switch (action) {
        case 'approuver':
          message.estSignale = false;
          message.signalements = [];
          break;
          
        case 'supprimer':
          message.estSupprime = true;
          message.dateSuppression = new Date();
          break;
          
        case 'avertir':
          // Envoyer un avertissement à l'expéditeur
          await this.envoyerMessageSysteme(
            null,
            `Votre message a été signalé et fait l'objet d'un avertissement. Motif: ${motif}`,
            'avertissement',
            { messageId, motif }
          );
          break;
      }

      await message.save();

      // Logger l'action de modération
      console.log(`🛡️ Message ${messageId} ${action} par admin ${adminId}. Motif: ${motif}`);

      return { success: true };

    } catch (error) {
      console.error('❌ Erreur modération message:', error);
      throw error;
    }
  }

  // =========================
  // NETTOYAGE ET MAINTENANCE
  // =========================
  
  async nettoyerMessagesAnciens(joursAnciennete = 90) {
    try {
      const dateLimit = new Date();
      dateLimit.setDate(dateLimit.getDate() - joursAnciennete);

      // Supprimer les messages très anciens et déjà supprimés
      const result = await Message.deleteMany({
        estSupprime: true,
        dateSuppression: { $lt: dateLimit }
      });

      console.log(`🧹 ${result.deletedCount} messages anciens supprimés`);
      return { messagesSupprimes: result.deletedCount };

    } catch (error) {
      console.error('❌ Erreur nettoyage messages:', error);
      throw error;
    }
  }

  async nettoyerConversationsInactives(joursInactivite = 30) {
    try {
      const dateLimit = new Date();
      dateLimit.setDate(dateLimit.getDate() - joursInactivite);

      // Archiver les conversations sans messages récents
      const result = await Conversation.updateMany({
        updatedAt: { $lt: dateLimit },
        estArchivee: false,
        typeConversation: 'privee'
      }, {
        $set: { estArchivee: true }
      });

      console.log(`📦 ${result.modifiedCount} conversations archivées automatiquement`);
      return { conversationsArchivees: result.modifiedCount };

    } catch (error) {
      console.error('❌ Erreur nettoyage conversations:', error);
      throw error;
    }
  }

  // Démarrer les tâches de maintenance
  demarrerMaintenance() {
    // Nettoyer les messages anciens chaque semaine
    setInterval(() => {
      this.nettoyerMessagesAnciens();
    }, 7 * 24 * 60 * 60 * 1000);

    // Nettoyer les conversations inactives chaque jour
    setInterval(() => {
      this.nettoyerConversationsInactives();
    }, 24 * 60 * 60 * 1000);

    console.log('🔧 Maintenance automatique du chat démarrée');
  }
}

// Export des modèles et de la classe
module.exports = {
  ChatHandler,
  Message,
  Conversation
};