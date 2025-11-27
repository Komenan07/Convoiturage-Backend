// config/cloudinary.js
// Configuration Cloudinary pour WAYZ-ECO

const cloudinary = require('cloudinary').v2;
const { logger } = require('../utils/logger');

// Configuration Cloudinary
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
  secure: true // Toujours utiliser HTTPS
});

// Vérifier la configuration au démarrage
const verifierConfiguration = async () => {
  try {
    const result = await cloudinary.api.ping();
    logger.info('✅ Cloudinary connecté avec succès', { status: result.status });
    return true;
  } catch (error) {
    logger.error('❌ Erreur de connexion Cloudinary:', {
      message: error.message,
      help: 'Vérifiez vos variables d\'environnement CLOUDINARY_*'
    });
    return false;
  }
};

// Fonction helper pour upload avec retry
const uploadAvecRetry = async (file, options, maxRetries = 3) => {
  let lastError;
  
  for (let tentative = 1; tentative <= maxRetries; tentative++) {
    try {
      logger.info(`Upload Cloudinary (tentative ${tentative}/${maxRetries})`);
      const result = await cloudinary.uploader.upload(file, options);
      logger.info('Upload Cloudinary réussi', { 
        publicId: result.public_id,
        url: result.secure_url 
      });
      return result;
    } catch (error) {
      lastError = error;
      logger.warn(`Échec upload (tentative ${tentative})`, { 
        error: error.message 
      });
      
      // Attendre avant de réessayer
      if (tentative < maxRetries) {
        await new Promise(resolve => setTimeout(resolve, 1000 * tentative));
      }
    }
  }
  
  throw lastError;
};

// Fonction helper pour suppression avec gestion d'erreur
const supprimerAvecGestionErreur = async (publicId) => {
  try {
    const result = await cloudinary.uploader.destroy(publicId);
    logger.info('Image Cloudinary supprimée', { publicId, result: result.result });
    return result;
  } catch (error) {
    logger.error('Erreur suppression Cloudinary', { 
      publicId, 
      error: error.message 
    });
    // Ne pas throw - on continue même si la suppression échoue
    return { result: 'error', error: error.message };
  }
};

// Fonction pour obtenir des URLs optimisées
const obtenirUrlOptimisee = (publicId, options = {}) => {
  const defaultOptions = {
    quality: 'auto:good',
    fetch_format: 'auto',
    ...options
  };
  
  return cloudinary.url(publicId, defaultOptions);
};

// Fonction pour obtenir des URLs de différentes tailles
const obtenirUrlsMultiTailles = (publicId) => {
  return {
    thumbnail: cloudinary.url(publicId, {
      width: 150,
      height: 150,
      crop: 'thumb',
      quality: 'auto:good'
    }),
    medium: cloudinary.url(publicId, {
      width: 500,
      height: 500,
      crop: 'limit',
      quality: 'auto:good'
    }),
    large: cloudinary.url(publicId, {
      width: 1200,
      height: 1200,
      crop: 'limit',
      quality: 'auto:good'
    }),
    original: cloudinary.url(publicId, {
      quality: 'auto:best'
    })
  };
};

// Stats d'utilisation (optionnel)
const obtenirStats = async () => {
  try {
    const usage = await cloudinary.api.usage();
    return {
      credits: usage.credits,
      utilisationCredits: usage.credits_usage,
      limite: usage.limit,
      stockage: {
        utilise: usage.storage.used,
        limite: usage.storage.limit,
        pourcentage: ((usage.storage.used / usage.storage.limit) * 100).toFixed(2)
      },
      bande_passante: {
        utilise: usage.bandwidth.used,
        limite: usage.bandwidth.limit,
        pourcentage: ((usage.bandwidth.used / usage.bandwidth.limit) * 100).toFixed(2)
      }
    };
  } catch (error) {
    logger.error('Erreur obtention stats Cloudinary:', error);
    return null;
  }
};

module.exports = cloudinary;

// Exporter aussi les fonctions helpers
module.exports.verifierConfiguration = verifierConfiguration;
module.exports.uploadAvecRetry = uploadAvecRetry;
module.exports.supprimerAvecGestionErreur = supprimerAvecGestionErreur;
module.exports.obtenirUrlOptimisee = obtenirUrlOptimisee;
module.exports.obtenirUrlsMultiTailles = obtenirUrlsMultiTailles;
module.exports.obtenirStats = obtenirStats;