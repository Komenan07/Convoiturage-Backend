// middlewares/uploadMiddleware.js
// Middleware complet pour la gestion des uploads de fichiers

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { logger } = require('../utils/logger');

// Configuration des dossiers d'upload
const UPLOAD_PATHS = {
  vehicules: 'uploads/vehicules',
  documents: 'uploads/documents',
  profils: 'uploads/profils',
  temp: 'uploads/temp'
};

// Créer les dossiers s'ils n'existent pas
Object.values(UPLOAD_PATHS).forEach(uploadPath => {
  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
    console.log(`📁 Dossier d'upload créé: ${uploadPath}`);
  }
});

// Configuration des types de fichiers autorisés
const FILE_TYPES = {
  images: {
    mimeTypes: [
      'image/jpeg',
      'image/jpg', 
      'image/png',
      'image/webp',
      'image/gif'
    ],
    extensions: ['.jpg', '.jpeg', '.png', '.webp', '.gif'],
    maxSize: 5 * 1024 * 1024 // 5MB
  },
  documents: {
    mimeTypes: [
      'application/pdf',
      'image/jpeg',
      'image/jpg',
      'image/png',
      'image/webp'
    ],
    extensions: ['.pdf', '.jpg', '.jpeg', '.png', '.webp'],
    maxSize: 10 * 1024 * 1024 // 10MB
  },
  any: {
    mimeTypes: ['*/*'],
    extensions: ['*'],
    maxSize: 20 * 1024 * 1024 // 20MB
  }
};

// Fonction utilitaire pour générer un nom de fichier unique
const generateUniqueFilename = (originalname) => {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  const extension = path.extname(originalname);
  const baseName = path.basename(originalname, extension)
    .replace(/[^a-zA-Z0-9]/g, '_')
    .substring(0, 20);
  
  return `${timestamp}_${randomString}_${baseName}${extension}`;
};

// Configuration de stockage pour les véhicules
const vehiculeStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_PATHS.vehicules);
  },
  filename: (req, file, cb) => {
    const filename = generateUniqueFilename(file.originalname);
    logger.info('Upload véhicule', { 
      originalName: file.originalname,
      newFilename: filename,
      userId: req.user?.userId 
    });
    cb(null, filename);
  }
});

// Configuration de stockage pour les documents d'identité
const documentStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_PATHS.documents);
  },
  filename: (req, file, cb) => {
    const filename = generateUniqueFilename(file.originalname);
    logger.info('Upload document', { 
      originalName: file.originalname,
      newFilename: filename,
      userId: req.user?.userId 
    });
    cb(null, filename);
  }
});

// Configuration de stockage pour les photos de profil
const profilStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_PATHS.profils);
  },
  filename: (req, file, cb) => {
    const filename = generateUniqueFilename(file.originalname);
    logger.info('Upload profil', { 
      originalName: file.originalname,
      newFilename: filename,
      userId: req.user?.userId 
    });
    cb(null, filename);
  }
});

// Configuration de stockage temporaire
const tempStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_PATHS.temp);
  },
  filename: (req, file, cb) => {
    const filename = generateUniqueFilename(file.originalname);
    cb(null, filename);
  }
});

// Fonction de validation des fichiers
const createFileFilter = (allowedTypes = 'images') => {
  return (req, file, cb) => {
    const config = FILE_TYPES[allowedTypes] || FILE_TYPES.images;
    
    // Vérifier le type MIME
    if (!config.mimeTypes.includes('*/*') && !config.mimeTypes.includes(file.mimetype)) {
      const error = new Error(`Type de fichier non autorisé. Types acceptés: ${config.mimeTypes.join(', ')}`);
      error.code = 'INVALID_FILE_TYPE';
      return cb(error, false);
    }

    // Vérifier l'extension
    const fileExtension = path.extname(file.originalname).toLowerCase();
    if (!config.extensions.includes('*') && !config.extensions.includes(fileExtension)) {
      const error = new Error(`Extension de fichier non autorisée. Extensions acceptées: ${config.extensions.join(', ')}`);
      error.code = 'INVALID_FILE_EXTENSION';
      return cb(error, false);
    }

    logger.info('Fichier validé', {
      filename: file.originalname,
      mimetype: file.mimetype,
      size: file.size,
      userId: req.user?.userId
    });

    cb(null, true);
  };
};

// Configuration des limites
const createLimits = (allowedTypes = 'images') => {
  const config = FILE_TYPES[allowedTypes] || FILE_TYPES.images;
  return {
    fileSize: config.maxSize,
    files: 1,
    fields: 10
  };
};

// Middleware de gestion d'erreurs d'upload
const handleUploadError = (error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    logger.error('Erreur Multer:', error);
    
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          success: false,
          message: 'Fichier trop volumineux',
          details: `Taille maximale autorisée: ${Math.round(error.field === 'documents' ? 10 : 5)}MB`,
          error_code: 'FILE_TOO_LARGE'
        });
      
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          success: false,
          message: 'Trop de fichiers',
          details: 'Un seul fichier autorisé à la fois',
          error_code: 'TOO_MANY_FILES'
        });
      
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          success: false,
          message: 'Champ de fichier inattendu',
          details: `Champ autorisé: ${error.field}`,
          error_code: 'UNEXPECTED_FIELD'
        });
      
      default:
        return res.status(400).json({
          success: false,
          message: 'Erreur d\'upload',
          details: error.message,
          error_code: 'UPLOAD_ERROR'
        });
    }
  }

  // Erreurs personnalisées
  if (error.code === 'INVALID_FILE_TYPE' || error.code === 'INVALID_FILE_EXTENSION') {
    return res.status(400).json({
      success: false,
      message: error.message,
      error_code: error.code
    });
  }

  next(error);
};

// Middleware de nettoyage des fichiers temporaires
const cleanupTempFiles = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    // Nettoyer les fichiers temporaires en cas d'erreur
    if (req.file && req.file.path && req.file.path.includes('/temp/')) {
      fs.unlink(req.file.path, (err) => {
        if (err) logger.warn('Erreur suppression fichier temporaire:', err);
      });
    }
    
    if (req.files && Array.isArray(req.files)) {
      req.files.forEach(file => {
        if (file.path && file.path.includes('/temp/')) {
          fs.unlink(file.path, (err) => {
            if (err) logger.warn('Erreur suppression fichier temporaire:', err);
          });
        }
      });
    }
    
    originalSend.call(this, data);
  };
  
  next();
};

// =============== CONFIGURATIONS MULTER ===============

// Upload pour photos de véhicules
const uploadVehiculePhoto = multer({
  storage: vehiculeStorage,
  fileFilter: createFileFilter('images'),
  limits: createLimits('images')
});

// Upload pour documents d'identité
const uploadDocument = multer({
  storage: documentStorage,
  fileFilter: createFileFilter('documents'),
  limits: createLimits('documents')
});

// Upload pour photos de profil
const uploadProfilPhoto = multer({
  storage: profilStorage,
  fileFilter: createFileFilter('images'),
  limits: createLimits('images')
});

// Upload temporaire
const uploadTemp = multer({
  storage: tempStorage,
  fileFilter: createFileFilter('any'),
  limits: createLimits('any')
});

// Upload générique
const upload = multer({
  storage: tempStorage,
  fileFilter: createFileFilter('images'),
  limits: createLimits('images')
});

// =============== MIDDLEWARES SPÉCIALISÉS ===============

// Middleware pour optimiser les images (optionnel - nécessite sharp)
const optimizeImage = async (req, res, next) => {
  if (!req.file || !req.file.mimetype.startsWith('image/')) {
    return next();
  }

  try {
    // Vérifier si sharp est disponible
    let sharp;
    try {
      sharp = require('sharp');
    } catch (error) {
      logger.warn('Sharp non disponible, optimisation des images désactivée');
      return next();
    }

    const inputPath = req.file.path;
    const optimizedPath = inputPath.replace(/\.(jpg|jpeg|png|webp)$/i, '_optimized.webp');

    await sharp(inputPath)
      .resize(1200, 1200, { 
        fit: 'inside',
        withoutEnlargement: true 
      })
      .webp({ quality: 85 })
      .toFile(optimizedPath);

    // Remplacer le fichier original par la version optimisée
    fs.unlinkSync(inputPath);
    req.file.path = optimizedPath;
    req.file.filename = path.basename(optimizedPath);
    req.file.mimetype = 'image/webp';

    logger.info('Image optimisée', {
      original: inputPath,
      optimized: optimizedPath,
      userId: req.user?.userId
    });

    next();
  } catch (error) {
    logger.error('Erreur optimisation image:', error);
    next(); // Continuer même en cas d'erreur d'optimisation
  }
};

// Middleware de validation du propriétaire de fichier
const validateFileOwnership = (req, res, next) => {
  // Ajouter l'userId aux métadonnées du fichier
  if (req.file && req.user) {
    req.file.uploadedBy = req.user.userId;
    req.file.uploadDate = new Date();
  }

  if (req.files && req.user) {
    req.files.forEach(file => {
      file.uploadedBy = req.user.userId;
      file.uploadDate = new Date();
    });
  }

  next();
};

// Middleware de journalisation des uploads
const logUpload = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    if (req.file) {
      logger.info('Upload terminé', {
        filename: req.file.filename,
        originalName: req.file.originalname,
        size: req.file.size,
        mimetype: req.file.mimetype,
        destination: req.file.destination,
        userId: req.user?.userId,
        success: res.statusCode < 400
      });
    }
    
    originalSend.call(this, data);
  };
  
  next();
};

// =============== FONCTIONS UTILITAIRES ===============

// Supprimer un fichier de manière sécurisée
const deleteFile = async (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      await fs.promises.unlink(filePath);
      logger.info('Fichier supprimé:', filePath);
      return true;
    }
    return false;
  } catch (error) {
    logger.error('Erreur suppression fichier:', error);
    return false;
  }
};

// Nettoyer les anciens fichiers temporaires
const cleanupOldTempFiles = () => {
  const tempDir = UPLOAD_PATHS.temp;
  const maxAge = 24 * 60 * 60 * 1000; // 24 heures

  fs.readdir(tempDir, (err, files) => {
    if (err) return;

    files.forEach(file => {
      const filePath = path.join(tempDir, file);
      fs.stat(filePath, (err, stats) => {
        if (err) return;

        const now = Date.now();
        const fileAge = now - stats.mtime.getTime();

        if (fileAge > maxAge) {
          fs.unlink(filePath, (err) => {
            if (!err) {
              logger.info('Fichier temporaire ancien supprimé:', filePath);
            }
          });
        }
      });
    });
  });
};

// Démarrer le nettoyage automatique des fichiers temporaires
setInterval(cleanupOldTempFiles, 60 * 60 * 1000); // Chaque heure

// =============== EXPORTS ===============

module.exports = {
  // Configurations multer principales
  uploadVehiculePhoto,
  uploadDocument,
  uploadProfilPhoto,
  uploadTemp,
  upload,

  // Middlewares
  handleUploadError,
  cleanupTempFiles,
  optimizeImage,
  validateFileOwnership,
  logUpload,

  // Fonctions utilitaires
  deleteFile,
  cleanupOldTempFiles,
  generateUniqueFilename,

  // Configurations
  UPLOAD_PATHS,
  FILE_TYPES,

  // Configurations personnalisées
  createFileFilter,
  createLimits
};