/**
 * Schémas réutilisables pour les localisations géographiques
 * 
 * Deux versions disponibles:
 * 1. localisationCompletSchema - Version détaillée avec commune/quartier (pour Trajet)
 * 2. localisationSimpleSchema - Version simplifiée (pour Evenement, Reservation)
 * 
 * Ces schémas standardisent la structure des points géographiques dans toute l'application.
 * Ils utilisent coordonneesSchema pour garantir la cohérence des coordonnées GPS.
 * 
 * Utilisation:
 * - Trajet: pointDepart, pointArrivee, arretsIntermediaires (complet)
 * - Evenement: lieu (simple)
 * - Reservation: pointPriseEnCharge, pointDepose (simple)
 * - AlerteUrgence: adresseApproximative (texte uniquement, position séparée)
 */

const mongoose = require('mongoose');
const coordonneesSchema = require('./coordonneesSchema');

// =============== VILLES DE CÔTE D'IVOIRE ===============
const VILLES_COTE_IVOIRE = [
  'Abidjan', 'Yamoussoukro', 'Bouaké', 'Daloa', 'San-Pédro',
  'Korhogo', 'Man', 'Gagnoa', 'Abengourou', 'Divo',
  'Soubré', 'Agboville', 'Grand-Bassam', 'Dimbokro', 'Issia',
  'Bondoukou', 'Oumé', 'Bingerville', 'Adzopé', 'Dabou',
  'Tiassalé', 'Sassandra', 'Ferkessédougou', 'Toumodi',
  'Séguéla', 'Katiola', 'Odienné', 'Toulepleu', 'Lakota',
  'M\'bahiakro', 'Sakassou', 'Vavoua', 'Zouan-Hounien',
  'Anyama', 'Abobo', 'Adjamé', 'Cocody', 'Koumassi',
  'Marcory', 'Plateau', 'Port-Bouët', 'Treichville', 'Yopougon',
  'Autre'
];

// =============== COMMUNES D'ABIDJAN ===============
const COMMUNES_ABIDJAN = [
  'Abobo', 'Adjamé', 'Anyama', 'Attécoubé', 'Bingerville',
  'Cocody', 'Koumassi', 'Marcory', 'Plateau', 'Port-Bouët',
  'Treichville', 'Yopougon', 'Songon'
];

/**
 * ============================================================
 * VERSION COMPLÈTE - Pour trajets nécessitant détails précis
 * ============================================================
 */
const localisationCompletSchema = new mongoose.Schema({
  nom: {
    type: String,
    trim: true,
    maxlength: [200, 'Le nom du lieu ne peut dépasser 200 caractères'],
    index: true
  },
  
  adresse: {
    type: String,
    required: [true, 'L\'adresse est obligatoire'],
    trim: true,
    maxlength: [500, 'L\'adresse ne peut dépasser 500 caractères']
  },
  
  ville: {
    type: String,
    required: [true, 'La ville est obligatoire'],
    trim: true,
    maxlength: [100, 'Le nom de la ville ne peut dépasser 100 caractères'],
    enum: {
      values: VILLES_COTE_IVOIRE,
      message: 'Ville non reconnue en Côte d\'Ivoire. Sélectionnez "Autre" si votre ville n\'est pas dans la liste.'
    },
    index: true
  },
  
  commune: {
    type: String,
    trim: true,
    maxlength: [100, 'Le nom de la commune ne peut dépasser 100 caractères'],
    validate: {
      validator: function(commune) {
        // Si la ville est Abidjan, valider que la commune fait partie des communes d'Abidjan
        if (this.ville === 'Abidjan' && commune) {
          return COMMUNES_ABIDJAN.includes(commune);
        }
        return true; // Valide pour les autres villes
      },
      message: 'Commune invalide pour Abidjan. Sélectionnez une commune valide.'
    },
    index: true
  },
  
  quartier: {
    type: String,
    trim: true,
    maxlength: [100, 'Le nom du quartier ne peut dépasser 100 caractères']
  },
  
  coordonnees: {
    type: coordonneesSchema,
    required: [true, 'Les coordonnées GPS sont obligatoires']
  },
  
  // Métadonnées optionnelles
  codePostal: {
    type: String,
    trim: true,
    maxlength: [10, 'Le code postal ne peut dépasser 10 caractères']
  },
  
  instructions: {
    type: String,
    trim: true,
    maxlength: [500, 'Les instructions ne peuvent dépasser 500 caractères']
  }
}, { 
  _id: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

/**
 * ============================================================
 * VERSION SIMPLIFIÉE - Pour localisations basiques
 * ============================================================
 */
const localisationSimpleSchema = new mongoose.Schema({
  nom: {
    type: String,
    trim: true,
    maxlength: [200, 'Le nom du lieu ne peut dépasser 200 caractères'],
    index: true
  },
  
  adresse: {
    type: String,
    required: [true, 'L\'adresse est obligatoire'],
    trim: true,
    maxlength: [500, 'L\'adresse ne peut dépasser 500 caractères']
  },
  
  ville: {
    type: String,
    trim: true,
    maxlength: [100, 'Le nom de la ville ne peut dépasser 100 caractères'],
    enum: {
      values: VILLES_COTE_IVOIRE,
      message: 'Ville non reconnue en Côte d\'Ivoire'
    },
    index: true
  },
  
  coordonnees: {
    type: coordonneesSchema,
    required: [true, 'Les coordonnées GPS sont obligatoires']
  }
}, { 
  _id: false,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

// =============== PROPRIÉTÉS VIRTUELLES (COMPLET) ===============

/**
 * Adresse complète formatée
 */
localisationCompletSchema.virtual('adresseComplete').get(function() {
  const parts = [
    this.nom,
    this.adresse,
    this.quartier,
    this.commune,
    this.ville
  ].filter(Boolean); // Retirer les valeurs null/undefined
  
  return parts.join(', ');
});

/**
 * Adresse courte (sans nom)
 */
localisationCompletSchema.virtual('adresseCourte').get(function() {
  const parts = [
    this.quartier,
    this.commune,
    this.ville
  ].filter(Boolean);
  
  return parts.join(', ');
});

/**
 * Est à Abidjan
 */
localisationCompletSchema.virtual('estAbidjan').get(function() {
  return this.ville === 'Abidjan';
});

// =============== PROPRIÉTÉS VIRTUELLES (SIMPLE) ===============

localisationSimpleSchema.virtual('adresseComplete').get(function() {
  const parts = [
    this.nom,
    this.adresse,
    this.ville
  ].filter(Boolean);
  
  return parts.join(', ');
});

// =============== MÉTHODES D'INSTANCE (COMPLET) ===============

/**
 * Calcule la distance vers une autre localisation
 * @param {Object} autreLieu - Autre localisation
 * @returns {Number} Distance en km
 */
localisationCompletSchema.methods.distanceVers = function(autreLieu) {
  if (!autreLieu || !autreLieu.coordonnees) {
    throw new Error('Localisation de destination invalide');
  }
  
  return this.coordonnees.distanceVers(autreLieu.coordonnees);
};

/**
 * Vérifie si deux localisations sont dans la même zone
 * @param {Object} autreLieu 
 * @returns {Boolean}
 */
localisationCompletSchema.methods.memeSecteur = function(autreLieu) {
  if (!autreLieu) return false;
  
  // Même quartier = secteur identique
  if (this.quartier && autreLieu.quartier && this.quartier === autreLieu.quartier) {
    return true;
  }
  
  // Même commune = secteur proche
  if (this.commune && autreLieu.commune && this.commune === autreLieu.commune) {
    return true;
  }
  
  // Même ville
  return this.ville === autreLieu.ville;
};

/**
 * Génère un résumé textuel de la localisation
 * @returns {String}
 */
localisationCompletSchema.methods.resumer = function() {
  if (this.nom) {
    return `${this.nom} (${this.commune || this.ville})`;
  }
  
  return this.commune ? `${this.commune}, ${this.ville}` : this.ville;
};

// =============== MÉTHODES D'INSTANCE (SIMPLE) ===============

localisationSimpleSchema.methods.distanceVers = function(autreLieu) {
  if (!autreLieu || !autreLieu.coordonnees) {
    throw new Error('Localisation de destination invalide');
  }
  
  return this.coordonnees.distanceVers(autreLieu.coordonnees);
};

localisationSimpleSchema.methods.resumer = function() {
  return this.nom ? `${this.nom} (${this.ville})` : this.ville;
};

// =============== MÉTHODES STATIQUES ===============

/**
 * Recherche les villes par nom partiel
 * @param {String} recherche 
 * @returns {Array} Villes correspondantes
 */
localisationCompletSchema.statics.rechercherVilles = function(recherche) {
  if (!recherche || typeof recherche !== 'string') {
    return VILLES_COTE_IVOIRE;
  }
  
  const terme = recherche.toLowerCase();
  return VILLES_COTE_IVOIRE.filter(ville => 
    ville.toLowerCase().includes(terme)
  );
};

/**
 * Obtenir toutes les communes d'Abidjan
 * @returns {Array} Liste des communes
 */
localisationCompletSchema.statics.communesAbidjan = function() {
  return [...COMMUNES_ABIDJAN]; // Copie pour éviter les modifications
};

/**
 * Valide une ville
 * @param {String} ville 
 * @returns {Boolean}
 */
localisationCompletSchema.statics.villeValide = function(ville) {
  return VILLES_COTE_IVOIRE.includes(ville);
};

// =============== HOOKS ===============

/**
 * Pre-save: Normaliser les données
 */
localisationCompletSchema.pre('validate', function(next) {
  // Capitaliser la première lettre de chaque mot
  if (this.ville) {
    this.ville = this.ville
      .split(' ')
      .map(mot => mot.charAt(0).toUpperCase() + mot.slice(1).toLowerCase())
      .join(' ');
  }
  
  if (this.commune) {
    this.commune = this.commune
      .split(' ')
      .map(mot => mot.charAt(0).toUpperCase() + mot.slice(1).toLowerCase())
      .join(' ');
  }
  
  next();
});

localisationSimpleSchema.pre('validate', function(next) {
  if (this.ville) {
    this.ville = this.ville
      .split(' ')
      .map(mot => mot.charAt(0).toUpperCase() + mot.slice(1).toLowerCase())
      .join(' ');
  }
  
  next();
});

// =============== INDEX GÉOSPATIAUX ===============

// Les index 2dsphere doivent être créés au niveau du modèle parent
// Exemple dans Trajet.js:
// trajetSchema.index({ 'pointDepart.coordonnees': '2dsphere' });
// trajetSchema.index({ 'pointArrivee.coordonnees': '2dsphere' });

// =============== EXPORTS ===============

module.exports = {
  localisationCompletSchema,
  localisationSimpleSchema,
  VILLES_COTE_IVOIRE,
  COMMUNES_ABIDJAN
};
