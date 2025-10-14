const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  trajetId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Trajet',
    required: true,
    index: true
  },
  
  participants: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Utilisateur',
    required: true
  }],
  
  // Métadonnées
  derniereActivite: {
    type: Date,
    default: Date.now,
    index: true
  },
  
  nombreMessagesNonLus: {
    type: Map,
    of: Number,
    default: new Map() // clé: userId, valeur: nombre de messages non lus
  },
  
  estArchivee: {
    type: Boolean,
    default: false,
    index: true
  },
  
  // Champs additionnels utiles
  titre: {
    type: String,
    maxlength: 100
  },
  
  type: {
    type: String,
    enum: ['trajet', 'groupe', 'prive'],
    default: 'trajet'
  },
  
  parametres: {
    notificationsActivees: {
      type: Boolean,
      default: true
    },
    accesPermanent: {
      type: Boolean,
      default: false
    }
  },
  
  statistiques: {
    nombreTotalMessages: {
      type: Number,
      default: 0
    },
    dernierMessagePar: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Utilisateur'
    },
    dernierMessageContenu: {
      type: String,
      maxlength: 100
    }
  },
  
  // Permissions
  permissions: {
    peutEcrire: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Utilisateur'
    }],
    peutLire: [{
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Utilisateur'
    }]
  }
}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// Index composé pour les requêtes fréquentes
conversationSchema.index({ participants: 1, estArchivee: 1 });
conversationSchema.index({ trajetId: 1, estArchivee: 1 });
conversationSchema.index({ derniereActivite: -1 });

// Virtual pour obtenir le nombre de participants
conversationSchema.virtual('nombreParticipants').get(function() {
  return this.participants.length;
});

// Virtual pour vérifier si l'utilisateur est participant
conversationSchema.virtual('estParticipant').get(function() {
  return (userId) => this.participants.includes(userId);
});

// Méthodes d'instance
conversationSchema.methods.ajouterParticipant = function(userId) {
  if (!this.participants.includes(userId)) {
    this.participants.push(userId);
    // Initialiser les messages non lus pour le nouveau participant
    this.nombreMessagesNonLus.set(userId.toString(), 0);
  }
  return this;
};

conversationSchema.methods.retirerParticipant = function(userId) {
  this.participants.pull(userId);
  this.nombreMessagesNonLus.delete(userId.toString());
  return this;
};

conversationSchema.methods.marquerCommeNonLu = function(userId, increment = 1) {
  const userIdStr = userId.toString();
  const current = this.nombreMessagesNonLus.get(userIdStr) || 0;
  this.nombreMessagesNonLus.set(userIdStr, current + increment);
  return this;
};

conversationSchema.methods.marquerCommeLu = function(userId) {
  this.nombreMessagesNonLus.set(userId.toString(), 0);
  return this;
};

conversationSchema.methods.peutAcceder = function(userId) {
  return this.participants.includes(userId) && 
         (this.permissions.peutLire.length === 0 || 
          this.permissions.peutLire.includes(userId));
};

conversationSchema.methods.peutEcrire = function(userId) {
  return this.participants.includes(userId) && 
         (this.permissions.peutEcrire.length === 0 || 
          this.permissions.peutEcrire.includes(userId));
};

// Méthodes statiques
conversationSchema.statics.findByUtilisateur = function(userId, options = {}) {
  const query = {
    participants: userId,
    estArchivee: options.includeArchived || false
  };
  
  return this.find(query)
    .populate('trajetId', 'depart destination dateDepart')
    .populate('participants', 'nom prenom avatar')
    .populate('statistiques.dernierMessagePar', 'nom prenom')
    .sort({ derniereActivite: -1 })
    .limit(options.limit || 50);
};

conversationSchema.statics.findByTrajet = function(trajetId) {
  return this.findOne({ trajetId })
    .populate('participants', 'nom prenom avatar')
    .populate('trajetId');
};

// Middleware pre-save
conversationSchema.pre('save', function(next) {
  // Mettre à jour la dernière activité si des modifications sont apportées
  if (this.isModified() && !this.isModified('derniereActivite')) {
    this.derniereActivite = new Date();
  }
  
  // S'assurer que tous les participants ont une entrée dans nombreMessagesNonLus
  this.participants.forEach(participantId => {
    const userIdStr = participantId.toString();
    if (!this.nombreMessagesNonLus.has(userIdStr)) {
      this.nombreMessagesNonLus.set(userIdStr, 0);
    }
  });
  
  next();
});

// Middleware pour la suppression
conversationSchema.pre('deleteOne', { document: true, query: false }, async function() {
  // Supprimer tous les messages associés
  await mongoose.model('Message').deleteMany({ conversationId: this._id });
});

module.exports = mongoose.model('Conversation', conversationSchema);