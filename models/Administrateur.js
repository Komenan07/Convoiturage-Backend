// =====================================================
// MODÈLE ADMINISTRATEUR
// =====================================================

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const administrateurSchema = new mongoose.Schema({
  // Informations de base
  email: {
    type: String,
    required: [true, 'L\'email est requis'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
      'Format d\'email invalide'
    ]
  },

  motDePasse: {
    type: String,
    required: [true, 'Le mot de passe est requis'],
    minlength: [8, 'Le mot de passe doit contenir au moins 8 caractères'],
    select: false // Ne pas inclure par défaut dans les requêtes
  },

  nom: {
    type: String,
    required: [true, 'Le nom est requis'],
    trim: true,
    maxlength: [50, 'Le nom ne peut pas dépasser 50 caractères']
  },

  prenom: {
    type: String,
    required: [true, 'Le prénom est requis'],
    trim: true,
    maxlength: [50, 'Le prénom ne peut pas dépasser 50 caractères']
  },

  // Permissions et rôles
  role: {
    type: String,
    enum: {
      values: ['SUPER_ADMIN', 'MODERATEUR', 'SUPPORT'],
      message: 'Rôle invalide'
    },
    default: 'SUPER_ADMIN'
  },

  permissions: {
    type: [String],
    enum: {
      values: ['ALL', 'GESTION_UTILISATEURS', 'MODERATION', 'ANALYTICS', 'RAPPORTS_FINANCIERS', 'CONFIGURATION_SYSTEME'],
      message: 'Permission invalide'
    },
    default: ['ALL']
  },

  // Activité et statut
  derniereConnexion: {
    type: Date,
    default: null
  },

  statutCompte: {
    type: String,
    enum: {
      values: ['ACTIF', 'SUSPENDU'],
      message: 'Statut de compte invalide'
    },
    default: 'ACTIF'
  },

  // Métadonnées
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Administrateur',
    default: null
  },

  modifiedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Administrateur',
    default: null
  }

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// =====================================================
// INDEXES
// =====================================================

administrateurSchema.index({ email: 1 });
administrateurSchema.index({ role: 1 });
administrateurSchema.index({ statutCompte: 1 });
administrateurSchema.index({ createdAt: -1 });

// =====================================================
// VIRTUALS
// =====================================================

administrateurSchema.virtual('nomComplet').get(function() {
  return `${this.prenom} ${this.nom}`;
});

administrateurSchema.virtual('estSuperAdmin').get(function() {
  return this.role === 'SUPER_ADMIN' || this.permissions.includes('ALL');
});

administrateurSchema.virtual('estActif').get(function() {
  return this.statutCompte === 'ACTIF';
});

// =====================================================
// MIDDLEWARES PRE-SAVE
// =====================================================

// Hasher le mot de passe avant sauvegarde
administrateurSchema.pre('save', async function(next) {
  // Si le mot de passe n'a pas été modifié, passer
  if (!this.isModified('motDePasse')) return next();

  try {
    // Hasher le mot de passe
    const salt = await bcrypt.genSalt(12);
    this.motDePasse = await bcrypt.hash(this.motDePasse, salt);
    next();
  } catch (error) {
    next(error);
  }
});

// Valider les permissions selon le rôle
administrateurSchema.pre('save', function(next) {
  // Si SUPER_ADMIN, s'assurer qu'il a la permission ALL
  if (this.role === 'SUPER_ADMIN' && !this.permissions.includes('ALL')) {
    this.permissions.push('ALL');
  }

  // Si pas SUPER_ADMIN, retirer la permission ALL
  if (this.role !== 'SUPER_ADMIN' && this.permissions.includes('ALL')) {
    this.permissions = this.permissions.filter(p => p !== 'ALL');
  }

  next();
});

// =====================================================
// MÉTHODES D'INSTANCE
// =====================================================

// Vérifier le mot de passe
administrateurSchema.methods.verifierMotDePasse = async function(motDePasse) {
  return await bcrypt.compare(motDePasse, this.motDePasse);
};

// Vérifier si l'admin a une permission spécifique
administrateurSchema.methods.aPermission = function(permission) {
  return this.permissions.includes('ALL') || this.permissions.includes(permission);
};

// Mettre à jour la dernière connexion
administrateurSchema.methods.mettreAJourConnexion = async function() {
  this.derniereConnexion = new Date();
  await this.save({ validateBeforeSave: false });
};

// Changer le statut du compte
administrateurSchema.methods.changerStatut = async function(nouveauStatut, adminId) {
  this.statutCompte = nouveauStatut;
  this.modifiedBy = adminId;
  await this.save();
};

// =====================================================
// MÉTHODES STATIQUES
// =====================================================

// Créer un administrateur
administrateurSchema.statics.creerAdmin = async function(donnees, createdBy = null) {
  const admin = new this({
    ...donnees,
    createdBy
  });
  await admin.save();
  return admin;
};

// Trouver par email
administrateurSchema.statics.trouverParEmail = async function(email) {
  return await this.findOne({ email }).select('+motDePasse');
};

// Obtenir les statistiques des admins
administrateurSchema.statics.obtenirStatistiques = async function() {
  const stats = await this.aggregate([
    {
      $group: {
        _id: null,
        totalAdmins: { $sum: 1 },
        adminsActifs: {
          $sum: { $cond: [{ $eq: ['$statutCompte', 'ACTIF'] }, 1, 0] }
        },
        adminsSuspendus: {
          $sum: { $cond: [{ $eq: ['$statutCompte', 'SUSPENDU'] }, 1, 0] }
        },
        superAdmins: {
          $sum: { $cond: [{ $eq: ['$role', 'SUPER_ADMIN'] }, 1, 0] }
        },
        moderateurs: {
          $sum: { $cond: [{ $eq: ['$role', 'MODERATEUR'] }, 1, 0] }
        },
        support: {
          $sum: { $cond: [{ $eq: ['$role', 'SUPPORT'] }, 1, 0] }
        }
      }
    }
  ]);

  return stats[0] || {
    totalAdmins: 0,
    adminsActifs: 0,
    adminsSuspendus: 0,
    superAdmins: 0,
    moderateurs: 0,
    support: 0
  };
};

// Recherche avancée
administrateurSchema.statics.rechercheAvancee = async function(filtres, options = {}) {
  const {
    page = 1,
    limit = 10,
    sort = '-createdAt',
    populate = false
  } = options;

  const query = {};

  // Filtres
  if (filtres.email) {
    query.email = { $regex: filtres.email, $options: 'i' };
  }

  if (filtres.nom) {
    query.$or = [
      { nom: { $regex: filtres.nom, $options: 'i' } },
      { prenom: { $regex: filtres.nom, $options: 'i' } }
    ];
  }

  if (filtres.role) {
    query.role = filtres.role;
  }

  if (filtres.statutCompte) {
    query.statutCompte = filtres.statutCompte;
  }

  if (filtres.dateCreation) {
    const { debut, fin } = filtres.dateCreation;
    if (debut || fin) {
      query.createdAt = {};
      if (debut) query.createdAt.$gte = new Date(debut);
      if (fin) query.createdAt.$lte = new Date(fin);
    }
  }

  // Exécution de la requête
  let queryBuilder = this.find(query)
    .sort(sort)
    .limit(limit * 1)
    .skip((page - 1) * limit);

  if (populate) {
    queryBuilder = queryBuilder.populate('createdBy modifiedBy', 'nom prenom email');
  }

  const admins = await queryBuilder;
  const total = await this.countDocuments(query);

  return {
    admins,
    pagination: {
      page,
      limit,
      total,
      pages: Math.ceil(total / limit)
    }
  };
};

// =====================================================
// MIDDLEWARE POST
// =====================================================

// Exclure le mot de passe des réponses JSON
administrateurSchema.methods.toJSON = function() {
  const admin = this.toObject();
  delete admin.motDePasse;
  return admin;
};

module.exports = mongoose.model('Administrateur', administrateurSchema);