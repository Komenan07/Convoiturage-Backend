// MongoDB Schema pour l'entité Message
const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: true,
    index: true
  },
  expediteurId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: true,
    index: true
  },
  destinataireId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: true,
    index: true
  },
  
  // Contenu du message
  contenu: {
    type: String,
    maxlength: 1000,
    trim: true
  },
  typeMessage: {
    type: String,
    enum: ['TEXTE', 'POSITION', 'MODELE_PREDEFINI'],
    required: true,
    default: 'TEXTE'
  },
  modeleUtilise: {
    type: String,
    maxlength: 200
  },
  
  // Pièces jointes (complètement optionnelle)
  pieceJointe: {
    type: {
      type: String,
      enum: ['IMAGE', 'LOCALISATION']
    },
    url: String,
    coordonnees: {
      type: {
        type: String,
        enum: ['Point']
        // Pas de default pour éviter la création d'objets vides
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
    }
  },
  
  // Modération
  estSignale: {
    type: Boolean,
    default: false,
    index: true
  },
  motifSignalement: {
    type: String,
    maxlength: 500
  },
  moderateurId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Administrateur'
  },
  
  // Statut de lecture
  lu: {
    type: Boolean,
    default: false,
    index: true
  },
  dateLecture: Date,
  
  // Métadonnées temporelles
  dateEnvoi: {
    type: Date,
    default: Date.now,
    index: true
  }
}, {
  timestamps: true, // Ajoute createdAt et updatedAt automatiquement
  collection: 'messages'
});

// Index composites pour optimiser les requêtes
messageSchema.index({ conversationId: 1, dateEnvoi: -1 });
messageSchema.index({ expediteurId: 1, dateEnvoi: -1 });
messageSchema.index({ destinataireId: 1, lu: 1 });
messageSchema.index({ estSignale: 1, moderateurId: 1 });

// Index géospatial pour les coordonnées (sparse = ignore les documents sans ce champ)
messageSchema.index({ 'pieceJointe.coordonnees': '2dsphere' }, { sparse: true });

const Message = mongoose.model('Message', messageSchema);

// ===============================
// OPÉRATIONS CRUD
// ===============================

class MessageService {
  
  // CREATE - Envoyer message texte
  static async envoyerMessageTexte(data) {
    try {
      const message = new Message({
        conversationId: data.conversationId,
        expediteurId: data.expediteurId,
        destinataireId: data.destinataireId,
        contenu: data.contenu,
        typeMessage: 'TEXTE'
      });
      
      return await message.save();
    } catch (error) {
      throw new Error(`Erreur envoi message: ${error.message}`);
    }
  }
  
  // CREATE - Envoyer position GPS
  static async envoyerPosition(data) {
    try {
      const message = new Message({
        conversationId: data.conversationId,
        expediteurId: data.expediteurId,
        destinataireId: data.destinataireId,
        typeMessage: 'POSITION',
        contenu: data.contenu || 'Position partagée',
        pieceJointe: {
          type: 'LOCALISATION',
          coordonnees: {
            type: 'Point',
            coordinates: [data.longitude, data.latitude]
          }
        }
      });
      
      return await message.save();
    } catch (error) {
      throw new Error(`Erreur envoi position: ${error.message}`);
    }
  }
  
  // CREATE - Utiliser modèle prédéfini
  static async utiliserModelePredefini(data) {
    try {
      const message = new Message({
        conversationId: data.conversationId,
        expediteurId: data.expediteurId,
        destinataireId: data.destinataireId,
        typeMessage: 'MODELE_PREDEFINI',
        modeleUtilise: data.modeleUtilise,
        contenu: data.contenu
      });
      
      return await message.save();
    } catch (error) {
      throw new Error(`Erreur utilisation modèle: ${error.message}`);
    }
  }
  
  // READ - Obtenir messages d'une conversation
  static async obtenirMessagesConversation(conversationId, options = {}) {
    try {
      const {
        page = 1,
        limite = 50,
        depuisDate
      } = options;
      
      const filtre = { conversationId };
      if (depuisDate) {
        filtre.dateEnvoi = { $gte: new Date(depuisDate) };
      }
      
      const skip = (page - 1) * limite;
      
      const messages = await Message.find(filtre)
        .populate('expediteurId', 'nom prenom avatar')
        .populate('destinataireId', 'nom prenom avatar')
        .sort({ dateEnvoi: -1 })
        .skip(skip)
        .limit(limite)
        .lean();
      
      const total = await Message.countDocuments(filtre);
      
      return {
        messages,
        pagination: {
          page,
          limite,
          total,
          pages: Math.ceil(total / limite)
        }
      };
    } catch (error) {
      throw new Error(`Erreur récupération messages: ${error.message}`);
    }
  }
  
  // READ - Rechercher dans les messages
  static async rechercherMessages(utilisateurId, termeRecherche, options = {}) {
    try {
      const {
        page = 1,
        limite = 20,
        typeMessage
      } = options;
      
      const filtre = {
        $or: [
          { expediteurId: utilisateurId },
          { destinataireId: utilisateurId }
        ],
        contenu: { $regex: termeRecherche, $options: 'i' }
      };
      
      if (typeMessage) {
        filtre.typeMessage = typeMessage;
      }
      
      const skip = (page - 1) * limite;
      
      const messages = await Message.find(filtre)
        .populate('expediteurId', 'nom prenom')
        .populate('destinataireId', 'nom prenom')
        .populate('conversationId', 'nom')
        .sort({ dateEnvoi: -1 })
        .skip(skip)
        .limit(limite)
        .lean();
      
      const total = await Message.countDocuments(filtre);
      
      return {
        messages,
        pagination: {
          page,
          limite,
          total,
          pages: Math.ceil(total / limite)
        }
      };
    } catch (error) {
      throw new Error(`Erreur recherche messages: ${error.message}`);
    }
  }
  
  // READ - Obtenir messages non lus
  static async obtenirMessagesNonLus(utilisateurId) {
    try {
      const messages = await Message.find({
        destinataireId: utilisateurId,
        lu: false
      })
      .populate('expediteurId', 'nom prenom avatar')
      .populate('conversationId', 'nom')
      .sort({ dateEnvoi: -1 })
      .lean();
      
      const count = messages.length;
      
      return { messages, count };
    } catch (error) {
      throw new Error(`Erreur récupération messages non lus: ${error.message}`);
    }
  }
  
  // UPDATE - Marquer message comme lu
  static async marquerCommeLu(messageId, utilisateurId) {
    try {
      const message = await Message.findOneAndUpdate(
        { 
          _id: messageId,
          destinataireId: utilisateurId,
          lu: false
        },
        { 
          lu: true,
          dateLecture: new Date()
        },
        { new: true }
      );
      
      if (!message) {
        throw new Error('Message non trouvé ou déjà lu');
      }
      
      return message;
    } catch (error) {
      throw new Error(`Erreur marquage lecture: ${error.message}`);
    }
  }
  
  // UPDATE - Marquer tous les messages d'une conversation comme lus
  static async marquerConversationCommeLue(conversationId, utilisateurId) {
    try {
      const result = await Message.updateMany(
        {
          conversationId,
          destinataireId: utilisateurId,
          lu: false
        },
        {
          lu: true,
          dateLecture: new Date()
        }
      );
      
      return {
        messagesMarques: result.modifiedCount,
        message: `${result.modifiedCount} messages marqués comme lus`
      };
    } catch (error) {
      throw new Error(`Erreur marquage conversation: ${error.message}`);
    }
  }
  
  // UPDATE - Signaler message
  static async signalerMessage(messageId, motifSignalement, moderateurId) {
    try {
      const message = await Message.findByIdAndUpdate(
        messageId,
        {
          estSignale: true,
          motifSignalement,
          moderateurId
        },
        { new: true }
      );
      
      if (!message) {
        throw new Error('Message non trouvé');
      }
      
      return message;
    } catch (error) {
      throw new Error(`Erreur signalement: ${error.message}`);
    }
  }
  
  // DELETE - Supprimer message (soft delete)
  static async supprimerMessage(messageId, utilisateurId) {
    try {
      // Vérifier que l'utilisateur est l'expéditeur
      const message = await Message.findOne({
        _id: messageId,
        expediteurId: utilisateurId
      });
      
      if (!message) {
        throw new Error('Message non trouvé ou non autorisé');
      }
      
      // Soft delete - marquer comme supprimé
      message.contenu = '[Message supprimé]';
      message.pieceJointe = undefined;
      message.modeleUtilise = undefined;
      
      await message.save();
      
      return { message: 'Message supprimé avec succès' };
    } catch (error) {
      throw new Error(`Erreur suppression: ${error.message}`);
    }
  }
  
  // UTILITAIRES
  
  // Obtenir statistiques de messages
  static async obtenirStatistiques(utilisateurId, periode = 30) {
    try {
      const dateDebut = new Date();
      dateDebut.setDate(dateDebut.getDate() - periode);
      
      const stats = await Message.aggregate([
        {
          $match: {
            $or: [
              { expediteurId: new mongoose.Types.ObjectId(utilisateurId) },
              { destinataireId: new mongoose.Types.ObjectId(utilisateurId) }
            ],
            dateEnvoi: { $gte: dateDebut }
          }
        },
        {
          $group: {
            _id: null,
            totalMessages: { $sum: 1 },
            messagesEnvoyes: {
              $sum: {
                $cond: [
                  { $eq: ['$expediteurId', new mongoose.Types.ObjectId(utilisateurId)] },
                  1, 0
                ]
              }
            },
            messagesRecus: {
              $sum: {
                $cond: [
                  { $eq: ['$destinataireId', new mongoose.Types.ObjectId(utilisateurId)] },
                  1, 0
                ]
              }
            },
            messagesNonLus: {
              $sum: {
                $cond: [
                  {
                    $and: [
                      { $eq: ['$destinataireId', new mongoose.Types.ObjectId(utilisateurId)] },
                      { $eq: ['$lu', false] }
                    ]
                  },
                  1, 0
                ]
              }
            }
          }
        }
      ]);
      
      return stats[0] || {
        totalMessages: 0,
        messagesEnvoyes: 0,
        messagesRecus: 0,
        messagesNonLus: 0
      };
    } catch (error) {
      throw new Error(`Erreur calcul statistiques: ${error.message}`);
    }
  }
  
  // Recherche géospatiale de messages avec localisation
  static async rechercherMessagesProximite(longitude, latitude, rayonKm = 10) {
    try {
      const rayonRadians = rayonKm / 6378.1; // Conversion km vers radians
      
      const messages = await Message.find({
        'pieceJointe.type': 'LOCALISATION',
        'pieceJointe.coordonnees': {
          $geoWithin: {
            $centerSphere: [[longitude, latitude], rayonRadians]
          }
        }
      })
      .populate('expediteurId', 'nom prenom avatar')
      .sort({ dateEnvoi: -1 })
      .limit(50)
      .lean();
      
      return messages;
    } catch (error) {
      throw new Error(`Erreur recherche géospatiale: ${error.message}`);
    }
  }
}

module.exports = { Message, MessageService };