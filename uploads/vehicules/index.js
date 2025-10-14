// middlewares/vehiculeUpload.js
// Upload sécurisé pour les photos de véhicules

const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

// Configuration spécifique aux véhicules
const CONFIG = {
  maxFileSize: 8 * 1024 * 1024, // 8MB (plus large pour les détails véhicules)
  maxFiles: 6,
  allowedMimeTypes: [
    'image/jpeg',
    'image/png', 
    'image/jpg', 
    'image/webp'
  ],
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
  imageQuality: {
    jpeg: 90, // Qualité plus élevée pour les véhicules
    webp: 90,
    png: { compressionLevel: 4 }
  },
  thumbnailSizes: {
    thumb: { width: 200, height: 150 },
    medium: { width: 600, height: 400 },
    large: { width: 1200, height: 800 }
  }
};

// Créer le répertoire de destination de manière sécurisée
const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'vehicules');

const ensureUploadDir = async () => {
  try {
    await fs.access(uploadDir);
  } catch {
    await fs.mkdir(uploadDir, { recursive: true });
    console.log(`Répertoire véhicules créé: ${uploadDir}`);
  }
};

// Initialiser le répertoire
ensureUploadDir().catch(console.error);

// Génération sécurisée du nom de fichier pour véhicules
const generateVehiculeFilename = (originalname, vehiculeId = null) => {
  const timestamp = Date.now();
  const randomBytes = crypto.randomBytes(12).toString('hex');
  const extension = path.extname(originalname).toLowerCase();
  
  // Préfixe spécifique avec ID véhicule si disponible
  const prefix = vehiculeId ? `vehicule-${vehiculeId}` : 'vehicule';
  
  return `${prefix}-${timestamp}-${randomBytes}${extension}`;
};

// Configuration de stockage sécurisée
const storage = multer.diskStorage({
  destination: async (req, file, cb) => {
    try {
      await ensureUploadDir();
      cb(null, uploadDir);
    } catch (error) {
      cb(error);
    }
  },
  filename: (req, file, cb) => {
    try {
      // Récupérer l'ID du véhicule depuis les paramètres ou le body
      const vehiculeId = req.params.vehiculeId || req.body.vehiculeId;
      const filename = generateVehiculeFilename(file.originalname, vehiculeId);
      
      // Log de l'upload
      console.log(`Upload photo véhicule: ${file.originalname} -> ${filename}`, {
        userId: req.user?.userId,
        vehiculeId,
        size: file.size,
        mimetype: file.mimetype
      });
      
      cb(null, filename);
    } catch (error) {
      cb(error);
    }
  }
});

// Validation renforcée des fichiers
const fileFilter = (req, file, cb) => {
  try {
    // Vérifier le MIME type
    if (!CONFIG.allowedMimeTypes.includes(file.mimetype)) {
      const error = new Error('Type de fichier non autorisé pour photo de véhicule');
      error.code = 'INVALID_MIME_TYPE';
      error.allowedTypes = CONFIG.allowedMimeTypes;
      return cb(error, false);
    }

    // Vérifier l'extension
    const extension = path.extname(file.originalname).toLowerCase();
    if (!CONFIG.allowedExtensions.includes(extension)) {
      const error = new Error('Extension de fichier non autorisée');
      error.code = 'INVALID_EXTENSION';
      error.allowedExtensions = CONFIG.allowedExtensions;
      return cb(error, false);
    }

    // Validation du nom de fichier - approche liste blanche
    const isSafeFilename = (filename) => {
      const safePattern = /^[a-zA-Z0-9\s._-]+$/;
      return safePattern.test(filename) && filename.length <= 255;
    };

    if (!isSafeFilename(file.originalname)) {
      const error = new Error('Nom de fichier contient des caractères non autorisés');
      error.code = 'INVALID_FILENAME';
      return cb(error, false);
    }

    cb(null, true);
  } catch (error) {
    cb(error, false);
  }
};

// Configuration Multer sécurisée
const upload = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: CONFIG.maxFileSize,
    files: CONFIG.maxFiles,
    fields: 15, // Plus de champs pour les données véhicule
    fieldNameSize: 100,
    fieldSize: 2048 // Plus large pour descriptions véhicule
  }
});

// Middleware de gestion d'erreurs spécialisé
const handleVehiculeUploadError = (error, req, res, next) => {
  console.error('Erreur upload photo véhicule:', error);

  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          success: false,
          message: 'Photo de véhicule trop volumineuse',
          details: `Taille maximale: ${Math.round(CONFIG.maxFileSize / (1024 * 1024))}MB`,
          error_code: 'VEHICULE_FILE_TOO_LARGE'
        });
      
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          success: false,
          message: 'Trop de photos de véhicule',
          details: `Maximum ${CONFIG.maxFiles} photos autorisées par véhicule`,
          error_code: 'TOO_MANY_VEHICULE_PHOTOS'
        });
      
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          success: false,
          message: 'Champ de fichier inattendu pour véhicule',
          details: 'Utilisez le champ "photoVehicule" ou "photos"',
          error_code: 'UNEXPECTED_VEHICULE_FIELD'
        });
    }
  }

  // Erreurs personnalisées du fileFilter
  if (error.code === 'INVALID_MIME_TYPE') {
    return res.status(400).json({
      success: false,
      message: 'Type de fichier non autorisé pour photo de véhicule',
      details: 'Types acceptés: JPEG, PNG, WebP',
      allowedTypes: error.allowedTypes,
      error_code: 'INVALID_VEHICULE_FILE_TYPE'
    });
  }

  if (error.code === 'INVALID_EXTENSION' || error.code === 'INVALID_FILENAME') {
    return res.status(400).json({
      success: false,
      message: error.message,
      error_code: error.code
    });
  }

  next(error);
};

// Middleware d'optimisation spécialisé pour véhicules
const optimizeVehiculeImage = async (req, res, next) => {
  if (!req.file || !req.file.mimetype.startsWith('image/')) {
    return next();
  }

  try {
    let sharp;
    try {
      sharp = require('sharp');
    } catch (error) {
      console.log('Sharp non disponible, optimisation des photos véhicules désactivée');
      return next();
    }

    const inputPath = req.file.path;
    const extension = path.extname(req.file.filename);
    const optimizedPath = inputPath.replace(extension, '_optimized.webp');

    // Optimisation spécifique pour photos de véhicules
    await sharp(inputPath)
      .resize(1600, 1200, { 
        fit: 'inside',
        withoutEnlargement: true 
      })
      .sharpen() // Améliorer la netteté pour les détails du véhicule
      .webp({ quality: CONFIG.imageQuality.webp })
      .toFile(optimizedPath);

    // Remplacer le fichier original
    await fs.unlink(inputPath);
    
    req.file.path = optimizedPath;
    req.file.filename = path.basename(optimizedPath);
    req.file.mimetype = 'image/webp';

    console.log(`Image véhicule optimisée: ${inputPath} -> ${optimizedPath}`);
    next();
  } catch (error) {
    console.error('Erreur optimisation image véhicule:', error);
    next();
  }
};

// Création de thumbnails spécialisés pour véhicules
const createVehiculeThumbnails = async (req, res, next) => {
  if (!req.file || !req.file.mimetype.startsWith('image/')) {
    return next();
  }

  try {
    let sharp;
    try {
      sharp = require('sharp');
    } catch (error) {
      return next();
    }

    const inputPath = req.file.path;
    const filename = req.file.filename;
    const extension = path.extname(filename);
    const baseName = filename.replace(extension, '');

    const thumbnails = [];

    // Créer les différentes tailles pour véhicules
    for (const [sizeName, dimensions] of Object.entries(CONFIG.thumbnailSizes)) {
      const outputPath = path.join(uploadDir, `${baseName}_${sizeName}.webp`);
      
      await sharp(inputPath)
        .resize(dimensions.width, dimensions.height, { 
          fit: 'cover',
          position: 'center'
        })
        .sharpen() // Important pour les détails véhicules
        .webp({ quality: 85 })
        .toFile(outputPath);

      thumbnails.push({
        size: sizeName,
        filename: `${baseName}_${sizeName}.webp`,
        url: getPublicUrl(`${baseName}_${sizeName}.webp`),
        dimensions
      });
    }

    req.file.thumbnails = thumbnails;
    console.log(`Thumbnails véhicule créés pour ${filename}`);

    next();
  } catch (error) {
    console.error('Erreur création thumbnails véhicule:', error);
    next();
  }
};

// Validation spécialisée pour photos de véhicules
const validateVehiculePhoto = async (req, res, next) => {
  if (!req.file && !req.files) return next();

  const files = req.files || [req.file];

  try {
    for (const file of files) {
      // Vérifications de base
      await fs.access(file.path);
      const stats = await fs.stat(file.path);
      
      if (stats.size > CONFIG.maxFileSize) {
        await deleteVehiculeFile(file.filename);
        return res.status(400).json({
          success: false,
          message: 'Photo de véhicule trop volumineuse',
          error_code: 'VEHICULE_FILE_SIZE_EXCEEDED'
        });
      }

      // Validation spécifique : ratio d'aspect approprié pour véhicules
      if (file.mimetype.startsWith('image/')) {
        try {
          const sharp = require('sharp');
          const metadata = await sharp(file.path).metadata();
          
          const aspectRatio = metadata.width / metadata.height;
          
          // Ratios acceptables pour photos de véhicules (0.5 à 3.0)
          if (aspectRatio < 0.5 || aspectRatio > 3.0) {
            console.log(`Ratio d'aspect inhabituel pour véhicule: ${aspectRatio}`);
          }
          
          // Résolution minimale pour photos de véhicules
          if (metadata.width < 300 || metadata.height < 200) {
            await deleteVehiculeFile(file.filename);
            return res.status(400).json({
              success: false,
              message: 'Résolution d\'image trop faible pour photo de véhicule',
              details: 'Résolution minimale: 300x200 pixels',
              error_code: 'VEHICULE_LOW_RESOLUTION'
            });
          }
          
        } catch (sharpError) {
          // Sharp non disponible, continuer sans validation avancée
        }
      }
    }

    next();
  } catch (error) {
    console.error('Erreur validation photo véhicule:', error);
    next(error);
  }
};

// Fonctions utilitaires spécialisées
const getPublicUrl = (filename) => {
  if (!filename) return null;
  return `/uploads/vehicules/${filename}`;
};

const deleteVehiculeFile = async (filename) => {
  if (!filename) return false;
  
  try {
    const filePath = path.join(uploadDir, filename);
    await fs.access(filePath);
    await fs.unlink(filePath);
    
    // Supprimer aussi les thumbnails associés
    const baseName = filename.replace(/\.(jpg|jpeg|png|webp)$/i, '');
    const thumbnailSizes = Object.keys(CONFIG.thumbnailSizes);
    
    for (const size of thumbnailSizes) {
      try {
        const thumbPath = path.join(uploadDir, `${baseName}_${size}.webp`);
        await fs.unlink(thumbPath);
      } catch {
        // Thumbnail n'existe pas, continuer
      }
    }
    
    console.log(`Photo véhicule supprimée: ${filename}`);
    return true;
  } catch (error) {
    console.error(`Erreur suppression photo véhicule ${filename}:`, error.message);
    return false;
  }
};

// Nettoyage spécialisé pour photos de véhicules
const cleanupOldVehiculePhotos = async (maxAgeHours = 168) => { // 7 jours par défaut
  try {
    const files = await fs.readdir(uploadDir);
    const maxAge = maxAgeHours * 60 * 60 * 1000;
    let deletedCount = 0;

    for (const file of files) {
      const filePath = path.join(uploadDir, file);
      const stats = await fs.stat(filePath);
      const age = Date.now() - stats.mtime.getTime();

      if (age > maxAge && file.startsWith('vehicule-')) {
        await fs.unlink(filePath);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`Nettoyage photos véhicules: ${deletedCount} fichiers anciens supprimés`);
    }
    
    return deletedCount;
  } catch (error) {
    console.error('Erreur nettoyage photos véhicules:', error);
    return 0;
  }
};

// Validation de propriété véhicule
const validateVehiculeOwnership = (req, res, next) => {
  if (req.file && req.user) {
    req.file.uploadedBy = req.user.userId;
    req.file.vehiculeId = req.params.vehiculeId || req.body.vehiculeId;
    req.file.uploadDate = new Date();
  }

  if (req.files && req.user) {
    req.files.forEach(file => {
      file.uploadedBy = req.user.userId;
      file.vehiculeId = req.params.vehiculeId || req.body.vehiculeId;
      file.uploadDate = new Date();
    });
  }

  next();
};

module.exports = {
  // Middlewares principaux
  uploadPhotoVehicule: upload.single('photoVehicule'),
  uploadMultiple: upload.array('photos', CONFIG.maxFiles),
  uploadFields: upload.fields([
    { name: 'photoVehicule', maxCount: 1 },
    { name: 'photos', maxCount: CONFIG.maxFiles },
    { name: 'photoAssurance', maxCount: 1 },
    { name: 'photoVisiteTechnique', maxCount: 1 }
  ]),
  
  // Middlewares de traitement spécialisés
  handleVehiculeUploadError,
  validateVehiculeOwnership,
  validateVehiculePhoto,
  optimizeVehiculeImage,
  createVehiculeThumbnails,
  
  // Fonctions utilitaires
  getPublicUrl,
  deleteVehiculeFile,
  cleanupOldVehiculePhotos,
  generateVehiculeFilename,
  
  // Configuration
  CONFIG,
  uploadDir
};