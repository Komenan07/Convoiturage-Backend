// middlewares/documentUpload.js
// Upload sécurisé pour les documents d'identité

const multer = require('multer');
const path = require('path');
const fs = require('fs').promises;
const crypto = require('crypto');

// Configuration sécurisée
const CONFIG = {
  maxFileSize: 10 * 1024 * 1024, // 10MB
  maxFiles: 3,
  allowedMimeTypes: [
    'application/pdf',
    'image/jpeg', 
    'image/png', 
    'image/jpg', 
    'image/webp'
  ],
  allowedExtensions: ['.pdf', '.jpg', '.jpeg', '.png', '.webp']
};

// Créer le répertoire de destination de manière sécurisée
const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'documents');

const ensureUploadDir = async () => {
  try {
    await fs.access(uploadDir);
  } catch {
    await fs.mkdir(uploadDir, { recursive: true });
    console.log(`📁 Répertoire créé: ${uploadDir}`);
  }
};

// Initialiser le répertoire
ensureUploadDir().catch(console.error);

// Génération sécurisée du nom de fichier
const generateSecureFilename = (originalname) => {
  const timestamp = Date.now();
  const randomBytes = crypto.randomBytes(16).toString('hex');
  const extension = path.extname(originalname).toLowerCase();
  
  // Nettoyer le nom original
  const baseName = path.basename(originalname, extension)
    .replace(/[^a-zA-Z0-9.-]/g, '_')
    .substring(0, 20);
  
  return `document-${timestamp}-${randomBytes}-${baseName}${extension}`;
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
      console.log(`📄 Upload document: ${file.originalname} -> ${filename}`, {
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

    // Validation supplémentaire du nom de fichier
    if (file.originalname.length > 255) {
      const error = new Error('Nom de fichier trop long');
      error.code = 'FILENAME_TOO_LONG';
      return cb(error, false);
    }

    // Vérifier les caractères dangereux
    // eslint-disable-next-line no-control-regex
    if (/[<>:"|?*\x00-\x1f]/.test(file.originalname)) {
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
  console.error('Erreur upload document:', error);

  if (error instanceof multer.MulterError) {
    switch (error.code) {
      case 'LIMIT_FILE_SIZE':
        return res.status(400).json({
          success: false,
          message: 'Fichier trop volumineux',
          details: `Taille maximale: ${Math.round(CONFIG.maxFileSize / (1024 * 1024))}MB`,
          error_code: 'FILE_TOO_LARGE'
        });
      
      case 'LIMIT_FILE_COUNT':
        return res.status(400).json({
          success: false,
          message: 'Trop de fichiers',
          details: `Maximum ${CONFIG.maxFiles} fichiers autorisés`,
          error_code: 'TOO_MANY_FILES'
        });
      
      case 'LIMIT_UNEXPECTED_FILE':
        return res.status(400).json({
          success: false,
          message: 'Champ de fichier inattendu',
          details: 'Utilisez le champ "photoDocument" ou "documents"',
          error_code: 'UNEXPECTED_FIELD'
        });
    }
  }

  // Erreurs personnalisées du fileFilter
  if (error.code === 'INVALID_MIME_TYPE') {
    return res.status(400).json({
      success: false,
      message: 'Type de fichier non autorisé',
      details: 'Types acceptés: PDF, JPEG, PNG, WebP',
      allowedTypes: error.allowedTypes,
      error_code: 'INVALID_FILE_TYPE'
    });
  }

  if (error.code === 'INVALID_EXTENSION') {
    return res.status(400).json({
      success: false,
      message: 'Extension de fichier non autorisée',
      details: 'Extensions acceptées: .pdf, .jpg, .jpeg, .png, .webp',
      allowedExtensions: error.allowedExtensions,
      error_code: 'INVALID_EXTENSION'
    });
  }

  if (error.code === 'FILENAME_TOO_LONG' || error.code === 'INVALID_FILENAME') {
    return res.status(400).json({
      success: false,
      message: error.message,
      error_code: error.code
    });
  }

  next(error);
};

// Fonctions utilitaires améliorées
const getPublicUrl = (filename) => {
  if (!filename) return null;
  return `/uploads/documents/${filename}`;
};

const deleteFile = async (filename) => {
  if (!filename) return false;
  
  try {
    const filePath = path.join(uploadDir, filename);
    await fs.access(filePath); // Vérifier l'existence
    await fs.unlink(filePath);
    
    console.log(`🗑️ Fichier supprimé: ${filename}`);
    return true;
  } catch (error) {
    console.error(`Erreur suppression fichier ${filename}:`, error.message);
    return false;
  }
};

// Fonction de nettoyage des anciens fichiers
const cleanupOldFiles = async (maxAgeHours = 24) => {
  try {
    const files = await fs.readdir(uploadDir);
    const maxAge = maxAgeHours * 60 * 60 * 1000;
    let deletedCount = 0;

    for (const file of files) {
      const filePath = path.join(uploadDir, file);
      const stats = await fs.stat(filePath);
      const age = Date.now() - stats.mtime.getTime();

      if (age > maxAge && file.startsWith('document-')) {
        await fs.unlink(filePath);
        deletedCount++;
      }
    }

    if (deletedCount > 0) {
      console.log(`🧹 Nettoyage: ${deletedCount} fichiers anciens supprimés`);
    }
  } catch (error) {
    console.error('Erreur nettoyage fichiers:', error);
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
const validateUploadedFile = async (req, res, next) => {
  if (!req.file) return next();

  try {
    // Vérifier que le fichier existe réellement
    await fs.access(req.file.path);
    
    // Vérifier la taille réelle du fichier
    const stats = await fs.stat(req.file.path);
    if (stats.size > CONFIG.maxFileSize) {
      await deleteFile(req.file.filename);
      return res.status(400).json({
        success: false,
        message: 'Fichier trop volumineux après vérification',
        error_code: 'FILE_SIZE_EXCEEDED'
      });
    }

    next();
  } catch (error) {
    console.error('Erreur validation fichier uploadé:', error);
    next(error);
  }
};

// Programmer le nettoyage automatique (optionnel)
const startCleanupSchedule = () => {
  // Nettoyer toutes les 6 heures
  setInterval(() => {
    cleanupOldFiles(24); // Supprimer les fichiers de plus de 24h
  }, 6 * 60 * 60 * 1000);
};

module.exports = {
  // Middlewares principaux
  uploadDocument: upload.single('photoDocument'),
  uploadMultiple: upload.array('documents', CONFIG.maxFiles),
  
  // Middlewares de gestion
  handleUploadError,
  validateFileOwnership,
  validateUploadedFile,
  
  // Fonctions utilitaires
  getPublicUrl,
  deleteFile,
  cleanupOldFiles,
  startCleanupSchedule,
  generateSecureFilename,
  
  // Configuration
  CONFIG,
  uploadDir
};