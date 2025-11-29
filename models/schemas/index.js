/**
 * Point d'entrée centralisé pour tous les schémas réutilisables
 * 
 * Ce fichier permet d'importer tous les schémas depuis un seul endroit:
 * 
 * const { coordonneesSchema, localisationCompletSchema, vehiculeReferenceSchema } = require('./schemas');
 * 
 * Au lieu de:
 * const coordonneesSchema = require('./schemas/coordonneesSchema');
 * const { localisationCompletSchema } = require('./schemas/localisationSchema');
 * const vehiculeReferenceSchema = require('./schemas/vehiculeReferenceSchema');
 */

const coordonneesSchema = require('./coordonneesSchema');
const {
  localisationCompletSchema,
  localisationSimpleSchema,
  VILLES_COTE_IVOIRE,
  COMMUNES_ABIDJAN
} = require('./localisationSchema');
const vehiculeReferenceSchema = require('./vehiculeReferenceSchema');

module.exports = {
  // Schémas
  coordonneesSchema,
  localisationCompletSchema,
  localisationSimpleSchema,
  vehiculeReferenceSchema,
  
  // Constantes
  VILLES_COTE_IVOIRE,
  COMMUNES_ABIDJAN
};
