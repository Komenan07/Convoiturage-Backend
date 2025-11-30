// middlewares/uploadMiddleware.js
// Middleware complet pour la gestion des uploads de fichiers

const multer = require('multer');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { logger } = require('../utils/logger');

// =====================================================
// CONFIGURATION DES DOSSIERS D'UPLOAD
// =====================================================

const UPLOAD_PATHS = {
  vehicules: 'uploads/vehicules',
  documents: 'uploads/documents',
  profils: 'uploads/profils',
  selfies: 'uploads/selfies', // Nouveau dossier pour les selfies
  temp: 'uploads/temp'
};

// Créer les dossiers s'ils n'existent pas
Object.values(UPLOAD_PATHS).forEach(uploadPath => {
  if (!fs.existsSync(uploadPath)) {
    fs.mkdirSync(uploadPath, { recursive: true });
    console.log(`📁 Dossier d'upload créé: ${uploadPath}`);
  }
});

// =====================================================
// CONFIGURATION DES TYPES DE FICHIERS AUTORISÉS
// =====================================================

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
    maxSize: 10 * 1024 * 1024 // 5MB
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

// =====================================================
// FONCTION UTILITAIRE
// =====================================================

/**
 * Générer un nom de fichier unique
 */
const generateUniqueFilename = (originalname) => {
  const timestamp = Date.now();
  const randomString = crypto.randomBytes(8).toString('hex');
  const extension = path.extname(originalname);
  const baseName = path.basename(originalname, extension)
    .replace(/[^a-zA-Z0-9]/g, '_')
    .substring(0, 20);
  
  return `${timestamp}_${randomString}_${baseName}${extension}`;
};

// =====================================================
// CONFIGURATION SPÉCIALE POUR VÉRIFICATION D'IDENTITÉ
// =====================================================

/**
 * Configuration Multer spécifique pour la vérification d'identité
 * Accepte 2 fichiers : document + selfie
 */
const verificationStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Déterminer le dossier selon le type de fichier
    const destination = file.fieldname === 'selfieWithDocumentImage' 
      ? UPLOAD_PATHS.selfies
      : UPLOAD_PATHS.documents;
    
    // Créer le dossier s'il n'existe pas (sécurité supplémentaire)
    if (!fs.existsSync(destination)) {
      fs.mkdirSync(destination, { recursive: true });
    }
    
    cb(null, destination);
  },
  filename: (req, file, cb) => {
    const filename = generateUniqueFilename(file.originalname);
    
    logger.info('📤 Upload vérification', { 
      fieldname: file.fieldname,
      originalName: file.originalname,
      newFilename: filename,
      userId: req.user?.userId 
    });
    
    cb(null, filename);
  }
});

/**
 * Filtre de validation pour les images de vérification
 */
const verificationFileFilter = (req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/jpg', 'image/png', 'image/webp'];
  const allowedFields = ['documentImage', 'selfieWithDocumentImage'];
  
  // Vérifier que le champ est autorisé
  if (!allowedFields.includes(file.fieldname)) {
    const error = new Error(`Champ non autorisé: ${file.fieldname}. Champs acceptés: documentImage, selfieWithDocumentImage`);
    error.code = 'INVALID_FIELD_NAME';
    logger.error('❌ Champ invalide:', { fieldname: file.fieldname });
    return cb(error, false);
  }
  
  // Vérifier le type MIME
  if (!allowedMimes.includes(file.mimetype)) {
    const error = new Error(`Type de fichier non autorisé: ${file.mimetype}. Types acceptés: JPG, PNG, WEBP`);
    error.code = 'INVALID_FILE_TYPE';
    logger.error('❌ Type MIME invalide:', { mimetype: file.mimetype });
    return cb(error, false);
  }
  
  // Vérifier l'extension
  const fileExtension = path.extname(file.originalname).toLowerCase();
  const allowedExtensions = ['.jpg', '.jpeg', '.png', '.webp'];
  
  if (!allowedExtensions.includes(fileExtension)) {
    const error = new Error(`Extension non autorisée: ${fileExtension}. Extensions acceptées: .jpg, .png, .webp`);
    error.code = 'INVALID_FILE_EXTENSION';
    logger.error('❌ Extension invalide:', { extension: fileExtension });
    return cb(error, false);
  }
  
  logger.info('✅ Fichier vérification validé', {
    fieldname: file.fieldname,
    filename: file.originalname,
    mimetype: file.mimetype,
    size: file.size,
    userId: req.user?.userId
  });
  
  cb(null, true);
};

/**
 * Configuration des limites pour la vérification
 */
const verificationLimits = {
  fileSize: 10 * 1024 * 1024, // 10MB par fichier
  files: 2, // Maximum 2 fichiers (document + selfie)
  fields: 10, // Nombre de champs form-data
  parts: 15 // Nombre total de parties dans multipart/form-data
};

/**
 * Instance Multer pour la vérification d'identité
 */
const uploadVerification = multer({
  storage: verificationStorage,
  fileFilter: verificationFileFilter,
  limits: verificationLimits
});

/**
 * Middleware pour gérer les 2 fichiers de vérification
 * - documentImage: Photo du document d'identité
 * - selfieWithDocumentImage: Selfie avec le document
 */
const uploadVerificationFiles = uploadVerification.fields([
  { name: 'documentImage', maxCount: 1 },
  { name: 'selfieWithDocumentImage', maxCount: 1 }
]);

/**
 * Middleware de gestion d'erreurs spécifique à la vérification
 */
const handleVerificationUploadError = (error, req, res, next) => {
  // Log détaillé de l'erreur
  logger.error('❌ Erreur upload vérification:', {
    errorType: error.constructor.name,
    errorCode: error.code,
    errorMessage: error.message,
    errorField: error.field,
    filesReceived: req.files ? Object.keys(req.files) : [],
    userId: req.user?.userId
  });
  
  // Erreurs Multer
  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          success: false,
          code: 'FILE_TOO_LARGE',
          message: 'Fichier trop volumineux',
          details: 'Taille maximale autorisée: 10MB par fichier',
          field: error.field,
          timestamp: new Date().toISOString()
        });
      
      case 'LIMIT_FILE_COUNT':{
        const receivedCount = req.files 
          ? Object.keys(req.files).reduce((acc, key) => acc + req.files[key].length, 0) 
          : 0;
        
        return res.status(400).json({
          success: false,
          code: 'TOO_MANY_FILES',
          message: 'Trop de fichiers envoyés',
          details: {
            maximum: 2,
            received: receivedCount,
            expected: 'Envoyez exactement 2 fichiers: documentImage + selfieWithDocumentImage'
          },
          timestamp: new Date().toISOString()
        });
      }
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          success: false,
          code: 'UNEXPECTED_FILE_FIELD',
          message: `Champ de fichier inattendu: ${error.field}`,
          details: {
            receivedField: error.field,
            expectedFields: ['documentImage', 'selfieWithDocumentImage']
          },
          timestamp: new Date().toISOString()
        });
      
      case 'LIMIT_PART_COUNT':
        return res.status(400).json({
          success: false,
          code: 'TOO_MANY_PARTS',
          message: 'Trop de parties dans la requête multipart',
          details: 'Vérifiez que vous n\'envoyez pas de champs en double',
          timestamp: new Date().toISOString()
        });
      
      case 'LIMIT_FIELD_COUNT':
        return res.status(400).json({
          success: false,
          code: 'TOO_MANY_FIELDS',
          message: 'Trop de champs dans la requête',
          timestamp: new Date().toISOString()
        });
      
      default:
        return res.status(400).json({
          success: false,
          code: 'MULTER_ERROR',
          message: 'Erreur lors de l\'upload',
          details: error.message,
          errorCode: error.code,
          timestamp: new Date().toISOString()
        });
    }
  }
  
  
  // Erreurs personnalisées de validation
  if (error.code === 'INVALID_FILE_TYPE' || 
      error.code === 'INVALID_FILE_EXTENSION' || 
      error.code === 'INVALID_FIELD_NAME') {
    return res.status(400).json({
      success: false,
      code: error.code,
      message: error.message,
      timestamp: new Date().toISOString()
    });
  }
  
  // Autres erreurs
  next(error);
};

/**
 * Middleware de débogage pour les uploads de vérification
 */
const debugVerificationUpload = (req, res, next) => {
  console.log('\n' + '='.repeat(70));
  console.log('🔍 DEBUG - UPLOAD VÉRIFICATION');
  console.log('='.repeat(70));
  
  console.log('\n📋 Headers:');
  console.log('  Content-Type:', req.headers['content-type']);
  console.log('  Content-Length:', req.headers['content-length']);
  console.log('  Authorization:', req.headers.authorization ? '✅ Présent' : '❌ Manquant');
  
  console.log('\n📦 Body (champs texte):');
  console.log('  Keys:', Object.keys(req.body));
  Object.keys(req.body).forEach(key => {
    console.log(`  ${key}:`, req.body[key]);
  });
  
  console.log('\n📁 Files:');
  if (req.files) {
    const fields = Object.keys(req.files);
    console.log('  Nombre de champs:', fields.length);
    console.log('  Champs:', fields);
    
    fields.forEach(field => {
      const fileArray = req.files[field];
      console.log(`\n  📄 ${field}:`);
      fileArray.forEach((file, index) => {
        console.log(`    [${index}] Nom: ${file.originalname}`);
        console.log(`        Taille: ${(file.size / 1024).toFixed(2)} KB`);
        console.log(`        Type: ${file.mimetype}`);
        console.log(`        Chemin: ${file.path}`);
      });
    });
    
    const totalFiles = fields.reduce((acc, key) => acc + req.files[key].length, 0);
    console.log(`\n  ✅ Total fichiers: ${totalFiles}`);
  } else {
    console.log('  ❌ Aucun fichier reçu');
  }
  
  if (req.file) {
    console.log('\n⚠️  req.file (mode single) détecté - Ceci ne devrait pas arriver!');
    console.log('    Fieldname:', req.file.fieldname);
    console.log('    Filename:', req.file.originalname);
  }
  
  console.log('\n' + '='.repeat(70) + '\n');
  
  next();
};

/**
 * Middleware de nettoyage des fichiers de vérification en cas d'erreur
 */
const cleanupVerificationFiles = (req, res, next) => {
  const originalSend = res.send;
  
  res.send = function(data) {
    // Si la réponse est une erreur, supprimer les fichiers uploadés
    if (res.statusCode >= 400 && req.files) {
      Object.keys(req.files).forEach(field => {
        req.files[field].forEach(file => {
          if (file.path && fs.existsSync(file.path)) {
            fs.unlink(file.path, (err) => {
              if (err) {
                logger.warn('⚠️ Erreur suppression fichier vérification:', {
                  path: file.path,
                  error: err.message
                });
              } else {
                logger.info('🗑️ Fichier vérification supprimé après erreur:', file.path);
              }
            });
          }
        });
      });
    }
    
    originalSend.call(this, data);
  };
  
  next();
};

// =====================================================
// CONFIGURATIONS POUR AUTRES TYPES D'UPLOADS
// =====================================================

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
      destination: UPLOAD_PATHS.profils, 
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
const createLimits = (allowedTypes = 'images', maxFiles = 1) => {
  const config = FILE_TYPES[allowedTypes] || FILE_TYPES.images;
  return {
    fileSize: config.maxSize,
    files: maxFiles,
    fields: 30, // 🔥 Augmenté de 10 à 30 pour supporter plus de champs texte
    parts: 50  // 🔥 Ajouté: limite totale de parties dans multipart/form-data
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

// Upload pour photos de véhicules (supporte plusieurs fichiers)
const uploadVehiculePhoto = multer({
  storage: vehiculeStorage,
  fileFilter: createFileFilter('images'),
  limits: {
    fileSize: FILE_TYPES.images.maxSize,
    files: 10, // 🔥 Support jusqu'à 10 photos de véhicule
    fields: 30, // 🔥 Support de nombreux champs texte
    parts: 50 // 🔥 Nombre total de parties multipart
  }
});

// 🔥 NOUVEAU: Middleware spécifique pour accepter N'IMPORTE QUEL fichier photo/document de véhicule
const uploadVehiculeMultiple = multer({
  storage: vehiculeStorage,
  fileFilter: createFileFilter('images'),
  limits: {
    fileSize: FILE_TYPES.images.maxSize,
    files: 15, // 🔥 Accepte jusqu'à 15 fichiers (photos + documents)
    fields: 30,
    parts: 60
  }
}).any(); // 🔥 .any() accepte tous les champs de fichiers

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
    Object.keys(req.files).forEach(field => {
      if (Array.isArray(req.files[field])) {
        req.files[field].forEach(file => {
          file.uploadedBy = req.user.userId;
          file.uploadDate = new Date();
        });
      }
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

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  // 🆕 CONFIGURATION POUR VÉRIFICATION D'IDENTITÉ (2 fichiers)
  uploadVerification,
  uploadVerificationFiles,
  handleVerificationUploadError,
  debugVerificationUpload,
  cleanupVerificationFiles,
  verificationStorage,
  verificationFileFilter,
  verificationLimits,

  // Configurations multer principales
  uploadVehiculePhoto,
  uploadVehiculeMultiple, // 🔥 NOUVEAU: Upload flexible pour véhicules
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