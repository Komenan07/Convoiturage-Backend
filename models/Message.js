const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversationId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Conversation',
    required: [true, 'La conversation est requise'],
    index: true
  },
  expediteurId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: [true, 'L\'expéditeur est requis'],
    index: true
  },
  destinataireId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: [true, 'Le destinataire est requis'],
    index: true
  },
  
  // Contenu du message
  contenu: {
    type: String,
    maxlength: [1000, 'Le message ne peut pas dépasser 1000 caractères'],
    trim: true,
    required: function() {
      return this.typeMessage === 'TEXTE' || this.typeMessage === 'MODELE_PREDEFINI';
    }
  },
  typeMessage: {
    type: String,
    required: [true, 'Le type de message est requis'],
    enum: {
      values: ['TEXTE', 'POSITION', 'MODELE_PREDEFINI'],
      message: 'Type de message non valide'
    },
    default: 'TEXTE',
    index: true
  },
  modeleUtilise: {
    type: String,
    maxlength: [200, 'Le nom du modèle ne peut pas dépasser 200 caractères'],
    trim: true,
    required: function() {
      return this.typeMessage === 'MODELE_PREDEFINI';
    }
  },
  
  // Pièces jointes
  pieceJointe: {
    type: {
      type: String,
      enum: {
        values: ['IMAGE', 'LOCALISATION'],
        message: 'Type de pièce jointe non valide'
      }
    },
    url: {
      type: String,
      trim: true,
      validate: {
        validator: function(v) {
          if (!v) return true;
          return /^https?:\/\/.+/.test(v);
        },
        message: 'L\'URL doit être une URL valide'
      }
    },
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
            if (!coords) return true;
            return coords.length === 2 && 
                   coords[0] >= -180 && coords[0] <= 180 &&
                   coords[1] >= -90 && coords[1] <= 90;
          },
          message: 'Coordonnées invalides. Format attendu: [longitude, latitude]'
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
    maxlength: [500, 'Le motif de signalement ne peut pas dépasser 500 caractères'],
    trim: true,
    required: function() {
      return this.estSignale;
    }
  },
  moderateurId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Administrateur',
    required: function() {
      return this.estSignale;
    }
  },
  
  // Statut de lecture
  lu: {
    type: Boolean,
    default: false,
    index: true
  },
  dateLecture: {
    type: Date,
    validate: {
      validator: function(v) {
        return !v || this.lu;
      },
      message: 'La date de lecture ne peut être définie que si le message est lu'
    }
  },
  
  // Métadonnées temporelles
  dateEnvoi: {
    type: Date,
    required: [true, 'La date d\'envoi est requise'],
    default: Date.now,
    index: true
  },

  // Soft delete
  estSupprime: {
    type: Boolean,
    default: false,
    index: true
  },
  dateSuppression: {
    type: Date,
    validate: {
      validator: function(v) {
        return !v || this.estSupprime;
      },
      message: 'La date de suppression ne peut être définie que si le message est supprimé'
    }
  }
}, {
  timestamps: true,
  versionKey: false,
  collection: 'messages'
});

// Index composites pour optimiser les requêtes
messageSchema.index({ conversationId: 1, dateEnvoi: -1 });
messageSchema.index({ expediteurId: 1, dateEnvoi: -1 });
messageSchema.index({ destinataireId: 1, lu: 1 });
messageSchema.index({ estSignale: 1, moderateurId: 1 });
messageSchema.index({ estSupprime: 1, dateEnvoi: -1 });

// Index géospatial pour les coordonnées
messageSchema.index({ 'pieceJointe.coordonnees': '2dsphere' });

// Index pour la recherche textuelle
messageSchema.index({ contenu: 'text' });

// Middleware pre-save
messageSchema.pre('save', function(next) {
  // Définir automatiquement la date de lecture
  if (this.isModified('lu') && this.lu && !this.dateLecture) {
    this.dateLecture = new Date();
  }

  // Définir automatiquement la date de suppression
  if (this.isModified('estSupprime') && this.estSupprime && !this.dateSuppression) {
    this.dateSuppression = new Date();
  }

  // Validation des pièces jointes selon le type de message
  if (this.typeMessage === 'POSITION') {
    if (!this.pieceJointe || this.pieceJointe.type !== 'LOCALISATION' || !this.pieceJointe.coordonnees) {
      return next(new Error('Un message de type POSITION doit contenir des coordonnées'));
    }
  }

  next();
});

// Méthodes d'instance
messageSchema.methods.marquerCommeLu = function() {
  if (this.lu) {
    throw new Error('Ce message est déjà marqué comme lu');
  }
  
  this.lu = true;
  this.dateLecture = new Date();
  return this.save();
};

messageSchema.methods.signaler = function(motif, moderateurId) {
  if (this.estSignale) {
    throw new Error('Ce message est déjà signalé');
  }
  
  this.estSignale = true;
  this.motifSignalement = motif;
  this.moderateurId = moderateurId;
  return this.save();
};

messageSchema.methods.supprimerMessage = function() {
  if (this.estSupprime) {
    throw new Error('Ce message est déjà supprimé');
  }
  
  // Soft delete
  this.estSupprime = true;
  this.contenu = '[Message supprimé]';
  this.pieceJointe = undefined;
  this.modeleUtilise = undefined;
  this.dateSuppression = new Date();
  
  return this.save();
};

// Méthodes statiques
messageSchema.statics.envoyerMessageTexte = async function(donnees) {
  const { conversationId, expediteurId, destinataireId, contenu } = donnees;
  
  return this.create({
    conversationId,
    expediteurId,
    destinataireId,
    contenu,
    typeMessage: 'TEXTE'
  });
};

messageSchema.statics.envoyerPosition = async function(donnees) {
  const { conversationId, expediteurId, destinataireId, longitude, latitude, contenu } = donnees;
  
  return this.create({
    conversationId,
    expediteurId,
    destinataireId,
    typeMessage: 'POSITION',
    contenu: contenu || 'Position partagée',
    pieceJointe: {
      type: 'LOCALISATION',
      coordonnees: {
        type: 'Point',
        coordinates: [longitude, latitude]
      }
    }
  });
};

messageSchema.statics.utiliserModelePredefini = async function(donnees) {
  const { conversationId, expediteurId, destinataireId, modeleUtilise, contenu } = donnees;
  
  return this.create({
    conversationId,
    expediteurId,
    destinataireId,
    typeMessage: 'MODELE_PREDEFINI',
    modeleUtilise,
    contenu
  });
};

messageSchema.statics.obtenirMessagesConversation = function(conversationId, options = {}) {
  const {
    page = 1,
    limite = 50,
    depuisDate,
    inclureSupprimés = false
  } = options;
  
  const filtre = { conversationId };
  
  if (!inclureSupprimés) {
    filtre.estSupprime = false;
  }
  
  if (depuisDate) {
    filtre.dateEnvoi = { $gte: new Date(depuisDate) };
  }
  
  const skip = (page - 1) * limite;
  
  return this.find(filtre)
    .populate('expediteurId', 'nom prenom avatar')
    .populate('destinataireId', 'nom prenom avatar')
    .sort({ dateEnvoi: -1 })
    .skip(skip)
    .limit(limite);
};

messageSchema.statics.obtenirMessagesNonLus = function(utilisateurId) {
  return this.find({
    destinataireId: utilisateurId,
    lu: false,
    estSupprime: false
  })
  .populate('expediteurId', 'nom prenom avatar')
  .populate('conversationId', 'nom')
  .sort({ dateEnvoi: -1 });
};

messageSchema.statics.marquerConversationCommeLue = async function(conversationId, utilisateurId) {
  const result = await this.updateMany(
    {
      conversationId,
      destinataireId: utilisateurId,
      lu: false,
      estSupprime: false
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
};

messageSchema.statics.rechercherMessages = function(utilisateurId, termeRecherche, options = {}) {
  const {
    page = 1,
    limite = 20,
    typeMessage,
    inclureSupprimés = false
  } = options;
  
  const filtre = {
    $or: [
      { expediteurId: utilisateurId },
      { destinataireId: utilisateurId }
    ],
    $text: { $search: termeRecherche }
  };
  
  if (!inclureSupprimés) {
    filtre.estSupprime = false;
  }
  
  if (typeMessage) {
    filtre.typeMessage = typeMessage;
  }
  
  const skip = (page - 1) * limite;
  
  return this.find(filtre, { score: { $meta: 'textScore' } })
    .populate('expediteurId', 'nom prenom')
    .populate('destinataireId', 'nom prenom')
    .populate('conversationId', 'nom')
    .sort({ score: { $meta: 'textScore' }, dateEnvoi: -1 })
    .skip(skip)
    .limit(limite);
};

messageSchema.statics.obtenirStatistiques = async function(utilisateurId, periode = 30) {
  const dateDebut = new Date();
  dateDebut.setDate(dateDebut.getDate() - periode);
  
  const stats = await this.aggregate([
    {
      $match: {
        $or: [
          { expediteurId: new mongoose.Types.ObjectId(utilisateurId) },
          { destinataireId: new mongoose.Types.ObjectId(utilisateurId) }
        ],
        dateEnvoi: { $gte: dateDebut },
        estSupprime: false
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
        },
        messagesSignales: {
          $sum: {
            $cond: [{ $eq: ['$estSignale', true] }, 1, 0]
          }
        }
      }
    }
  ]);
  
  return stats[0] || {
    totalMessages: 0,
    messagesEnvoyes: 0,
    messagesRecus: 0,
    messagesNonLus: 0,
    messagesSignales: 0
  };
};

messageSchema.statics.rechercherMessagesProximite = function(longitude, latitude, rayonKm = 10, options = {}) {
  const { limite = 50, inclureSupprimés = false } = options;
  const rayonRadians = rayonKm / 6378.1; // Conversion km vers radians
  
  const filtre = {
    'pieceJointe.type': 'LOCALISATION',
    'pieceJointe.coordonnees': {
      $geoWithin: {
        $centerSphere: [[longitude, latitude], rayonRadians]
      }
    }
  };
  
  if (!inclureSupprimés) {
    filtre.estSupprime = false;
  }
  
  return this.find(filtre)
    .populate('expediteurId', 'nom prenom avatar')
    .sort({ dateEnvoi: -1 })
    .limit(limite);
};

messageSchema.statics.obtenirMessagesSignales = function(options = {}) {
  const { page = 1, limite = 20, moderateurId } = options;
  
  const filtre = { estSignale: true };
  if (moderateurId) {
    filtre.moderateurId = moderateurId;
  }
  
  const skip = (page - 1) * limite;
  
  return this.find(filtre)
    .populate('expediteurId', 'nom prenom')
    .populate('destinataireId', 'nom prenom')
    .populate('moderateurId', 'nom prenom')
    .populate('conversationId', 'nom')
    .sort({ updatedAt: -1 })
    .skip(skip)
    .limit(limite);
};

// Virtual pour le contenu affiché (masque le contenu si supprimé)
messageSchema.virtual('contenuAffiche').get(function() {
  return this.estSupprime ? '[Message supprimé]' : this.contenu;
});

// Virtual pour le statut du message
messageSchema.virtual('statutMessage').get(function() {
  if (this.estSupprime) return 'supprime';
  if (this.estSignale) return 'signale';
  if (this.lu) return 'lu';
  return 'envoye';
});

// Virtual pour formater la position
messageSchema.virtual('positionFormatee').get(function() {
  if (this.pieceJointe && this.pieceJointe.coordonnees && this.pieceJointe.coordonnees.coordinates) {
    const [lng, lat] = this.pieceJointe.coordonnees.coordinates;
    return {
      latitude: lat,
      longitude: lng,
      lien: `https://maps.google.com/?q=${lat},${lng}`
    };
  }
  return null;
});

// Transformation JSON
messageSchema.set('toJSON', {
  virtuals: true,
  transform: function(doc, ret) {
    delete ret._id;
    delete ret.__v;
    return ret;
  }
});

module.exports = mongoose.model('Message', messageSchema);