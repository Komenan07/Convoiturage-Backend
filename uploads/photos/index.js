// middlewares/photoUpload.js
// Upload sécurisé pour les photos

const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

// Configuration sécurisée
const CONFIG = {
  maxFileSize: 5 * 1024 * 1024, // 5MB
  maxFiles: 5,
  allowedMimeTypes: [
    'image/jpeg',
    'image/png', 
    'image/jpg', 
    'image/webp'
  ],
  allowedExtensions: ['.jpg', '.jpeg', '.png', '.webp'],
  quality: {
    jpeg: 85,
    webp: 85,
    png: { compressionLevel: 6 }
  }
};

// Créer le répertoire de destination de manière sécurisée
const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'photos');

const ensureUploadDir = async () => {
  try {
    await fs.access(uploadDir);
  } catch {
    await fs.mkdir(uploadDir, { recursive: true });
    console.log(`📁 Répertoire photos créé: ${uploadDir}`);
  }
};

// Initialiser le répertoire
ensureUploadDir().catch(console.error);

// Génération sécurisée du nom de fichier
const generateSecureFilename = (originalname, prefix = 'photo') => {
  const timestamp = Date.now();
  const randomBytes = crypto.randomBytes(12).toString('hex');
  const extension = path.extname(originalname).toLowerCase();
  
  // Nettoyer le nom original (optionnel)
  const baseName = path.basename(originalname, extension)
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .substring(0, 15);
  
  return `${prefix}-${timestamp}-${randomBytes}-${baseName}${extension}`;
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
      const filename = generateSecureFilename(file.originalname);
      
      // Log de l'upload
      console.log(`📸 Upload photo: ${file.originalname} -> ${filename}`, {
        userId: req.user?.userId,
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
      const error = new Error('Type de fichier non autorisé');
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
      // Autoriser uniquement : lettres, chiffres, espaces, points, tirets, underscores
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
    fields: 10,
    fieldNameSize: 100,
    fieldSize: 1024
  }
});

// Middleware de gestion d'erreurs
const handleUploadError = (error, req, res, next) => {
  console.error('Erreur upload photo:', error);

  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          success: false,
          message: 'Photo trop volumineuse',
          details: `Taille maximale: ${Math.round(CONFIG.maxFileSize / (1024 * 1024))}MB`,
          error_code: 'FILE_TOO_LARGE'
        });
      
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          success: false,
          message: 'Trop de photos',
          details: `Maximum ${CONFIG.maxFiles} photos autorisées`,
          error_code: 'TOO_MANY_FILES'
        });
      
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          success: false,
          message: 'Champ de fichier inattendu',
          details: 'Utilisez le champ "photo" ou "photos"',
          error_code: 'UNEXPECTED_FIELD'
        });
    }
  }

  // Erreurs personnalisées du fileFilter
  if (error.code === 'INVALID_MIME_TYPE') {
    return res.status(400).json({
      success: false,
      message: 'Type de fichier non autorisé',
      details: 'Types acceptés: JPEG, PNG, WebP',
      allowedTypes: error.allowedTypes,
      error_code: 'INVALID_FILE_TYPE'
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

// Middleware d'optimisation d'images (optionnel)
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
      console.log('Sharp non disponible, optimisation des images désactivée');
      return next();
    }

    const inputPath = req.file.path;
    const extension = path.extname(req.file.filename);
    const optimizedPath = inputPath.replace(extension, '_optimized.webp');

    // Optimiser l'image
    await sharp(inputPath)
      .resize(1200, 1200, { 
        fit: 'inside',
        withoutEnlargement: true 
      })
      .webp({ quality: CONFIG.quality.webp })
      .toFile(optimizedPath);

    // Remplacer le fichier original par la version optimisée
    await fs.unlink(inputPath);
    
    // Mettre à jour les informations du fichier
    req.file.path = optimizedPath;
    req.file.filename = path.basename(optimizedPath);
    req.file.mimetype = 'image/webp';

    console.log(`🎨 Image optimisée: ${inputPath} -> ${optimizedPath}`);
    next();
  } catch (error) {
    console.error('Erreur optimisation image:', error);
    next(); // Continuer même en cas d'erreur d'optimisation
  }
};

// Fonctions utilitaires améliorées
const getPublicUrl = (filename) => {
  if (!filename) return null;
  return `/uploads/photos/${filename}`;
};

const deleteFile = async (filename) => {
  if (!filename) return false;
  
  try {
    const filePath = path.join(uploadDir, filename);
    await fs.access(filePath); // Vérifier l'existence
    await fs.unlink(filePath);
    
    console.log(`🗑️ Photo supprimée: ${filename}`);
    return true;
  } catch (error) {
    console.error(`Erreur suppression photo ${filename}:`, error.message);
    return false;
  }
};

// Supprimer plusieurs fichiers
const deleteFiles = async (filenames) => {
  if (!Array.isArray(filenames)) return false;
  
  const results = await Promise.allSettled(
    filenames.map(filename => deleteFile(filename))
  );
  
  const deletedCount = results.filter(result => 
    result.status === 'fulfilled' && result.value === true
  ).length;
  
  console.log(`🗑️ ${deletedCount}/${filenames.length} photos supprimées`);
  return deletedCount;
};

// Fonction de nettoyage des anciennes photos
const cleanupOldPhotos = async (maxAgeHours = 72) => {
  try {
    const files = await fs.readdir(uploadDir);
    const maxAge = maxAgeHours * 60 * 60 * 1000;
    let deletedCount = 0;

    for (const file of files) {
      const filePath = path.join(uploadDir, file);
      const stats = await fs.stat(filePath);
      const age = Date.now() - stats.mtime.getTime();

      if (age > maxAge && file.startsWith('photo-')) {
        await fs.unlink(filePath);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`🧹 Nettoyage photos: ${deletedCount} fichiers anciens supprimés`);
    }
    
    return deletedCount;
  } catch (error) {
    console.error('Erreur nettoyage photos:', error);
    return 0;
  }
};

// Validation de la propriété du fichier
const validateFileOwnership = (req, res, next) => {
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

// Middleware de validation post-upload
const validateUploadedPhoto = async (req, res, next) => {
  if (!req.file && !req.files) return next();

  const files = req.files || [req.file];

  try {
    for (const file of files) {
      // Vérifier que le fichier existe réellement
      await fs.access(file.path);
      
      // Vérifier la taille réelle du fichier
      const stats = await fs.stat(file.path);
      if (stats.size > CONFIG.maxFileSize) {
        await deleteFile(file.filename);
        return res.status(400).json({
          success: false,
          message: 'Photo trop volumineuse après vérification',
          error_code: 'FILE_SIZE_EXCEEDED'
        });
      }

      // Validation supplémentaire : vérifier que c'est vraiment une image
      if (file.mimetype.startsWith('image/') && stats.size < 100) {
        await deleteFile(file.filename);
        return res.status(400).json({
          success: false,
          message: 'Fichier image invalide ou corrompu',
          error_code: 'INVALID_IMAGE'
        });
      }
    }

    next();
  } catch (error) {
    console.error('Erreur validation photo uploadée:', error);
    next(error);
  }
};

// Redimensionnement pour différentes tailles
const createThumbnails = async (req, res, next) => {
  if (!req.file || !req.file.mimetype.startsWith('image/')) {
    return next();
  }

  try {
    let sharp;
    try {
      sharp = require('sharp');
    } catch (error) {
      return next(); // Sharp non disponible
    }

    const inputPath = req.file.path;
    const filename = req.file.filename;
    const extension = path.extname(filename);
    const baseName = filename.replace(extension, '');

    // Créer différentes tailles
    const sizes = [
      { suffix: '_thumb', width: 150, height: 150 },
      { suffix: '_medium', width: 400, height: 400 },
      { suffix: '_large', width: 800, height: 800 }
    ];

    const thumbnails = [];

    for (const size of sizes) {
      const outputPath = path.join(uploadDir, `${baseName}${size.suffix}.webp`);
      
      await sharp(inputPath)
        .resize(size.width, size.height, { 
          fit: 'cover',
          position: 'center'
        })
        .webp({ quality: 80 })
        .toFile(outputPath);

      thumbnails.push({
        size: size.suffix.replace('_', ''),
        filename: `${baseName}${size.suffix}.webp`,
        url: getPublicUrl(`${baseName}${size.suffix}.webp`)
      });
    }

    // Ajouter les thumbnails aux informations du fichier
    req.file.thumbnails = thumbnails;
    console.log(`🖼️ Thumbnails créés pour ${filename}`);

    next();
  } catch (error) {
    console.error('Erreur création thumbnails:', error);
    next(); // Continuer même en cas d'erreur
  }
};

module.exports = {
  // Middlewares principaux
  uploadSingle: upload.single('photo'),
  uploadMultiple: upload.array('photos', CONFIG.maxFiles),
  uploadFields: upload.fields([
    { name: 'photo', maxCount: 1 },
    { name: 'photos', maxCount: CONFIG.maxFiles }
  ]),
  
  // Middlewares de traitement
  handleUploadError,
  validateFileOwnership,
  validateUploadedPhoto,
  optimizeImage,
  createThumbnails,
  
  // Fonctions utilitaires
  getPublicUrl,
  deleteFile,
  deleteFiles,
  cleanupOldPhotos,
  generateSecureFilename,
  
  // Configuration
  CONFIG,
  uploadDir
};