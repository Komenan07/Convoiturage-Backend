const multer = require('multer');
const path = require('path');
const fs = require('fs');

// =====================================================
// PARTIE 1 : VOTRE CODE EXISTANT (CONSERVÉ)
// =====================================================

// Créer les dossiers s'ils n'existent pas
const ensureDirectoryExists = (dirPath) => {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
};

// Configuration de stockage local pour les uploads
const localStorage = multer.diskStorage({
  destination: (req, file, cb) => {
    let uploadPath = 'uploads/';
    
    // Déterminer le dossier selon le type de fichier
    if (file.fieldname === 'photo') {
      uploadPath += 'photos/';
    } else if (file.fieldname === 'document') {
      uploadPath += 'documents/';
    } else {
      uploadPath += 'other/';
    }
    
    ensureDirectoryExists(uploadPath);
    cb(null, uploadPath);
  },
  filename: (req, file, cb) => {
    // Générer un nom de fichier unique
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const extension = path.extname(file.originalname);
    cb(null, file.fieldname + '-' + uniqueSuffix + extension);
  }
});

// Configuration Multer pour les photos de profil
const uploadProfile = multer({
  storage: localStorage,
  limits: {
    fileSize: 5 * 1024 * 1024 // 5MB max
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers image sont autorisés'), false);
    }
  }
});

// Configuration Multer pour les photos de véhicules
const uploadVehicle = multer({
  storage: localStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers image sont autorisés'), false);
    }
  }
});

// Configuration Multer pour les documents
const uploadDocument = multer({
  storage: localStorage,
  limits: {
    fileSize: 10 * 1024 * 1024 // 10MB max
  },
  fileFilter: (req, file, cb) => {
    const allowedMimes = [
      'image/jpeg', 'image/jpg', 'image/png',
      'application/pdf'
    ];
    
    if (allowedMimes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers image (JPG, PNG) et PDF sont autorisés'), false);
    }
  }
});

// Configuration Multer pour les signalements
const uploadSignalement = multer({
  storage: localStorage,
  limits: {
    fileSize: 8 * 1024 * 1024 // 8MB max
  },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Seuls les fichiers image sont autorisés'), false);
    }
  }
});

// Fonction pour supprimer un fichier local
const deleteFile = async (filePath) => {
  try {
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return { result: 'ok' };
    }
    return { result: 'file_not_found' };
  } catch (error) {
    throw new Error(`Erreur lors de la suppression du fichier: ${error.message}`);
  }
};

// Fonction pour optimiser une URL d'image (version locale)
const optimizeImageUrl = (filePath) => {
  // Pour le stockage local, on retourne juste le chemin relatif
  return filePath ? `/uploads/${path.basename(filePath)}` : null;
};

// Fonction pour générer une URL d'image avec transformation (version locale)
const getTransformedImageUrl = (filePath) => {
  return optimizeImageUrl(filePath);
};

// Vérifier si Cloudinary est configuré (toujours false pour la version locale)
const isCloudinaryConfigured = () => {
  return false;
};

// Simuler cloudinary pour éviter les erreurs
const cloudinary = {
  uploader: {
    destroy: async (publicId) => {
      return { result: 'ok' };
    }
  },
  url: (publicId, options) => {
    return publicId;
  }
};

// =====================================================
// PARTIE 2 : NOUVEAU CODE POUR VÉRIFICATION D'IDENTITÉ
// =====================================================

// ✅ Storage en MÉMOIRE (buffer) pour upload direct vers Cloudinary
const memoryStorage = multer.memoryStorage();

// Filtre pour images de vérification (JPG/PNG uniquement, pas de PDF)
const verificationImageFilter = (req, file, cb) => {
  const allowedTypes = /jpeg|jpg|png/;
  const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
  const mimetype = allowedTypes.test(file.mimetype);

  if (mimetype && extname) {
    return cb(null, true);
  } else {
    cb(new Error(`Format non supporté pour ${file.fieldname}. Utilisez JPG ou PNG uniquement.`));
  }
};

// Configuration Multer pour la vérification d'identité (2 images)
const uploadVerificationImages = multer({
  storage: memoryStorage, // ✅ En mémoire pour Cloudinary
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max par image
    files: 2 // Maximum 2 fichiers
  },
  fileFilter: verificationImageFilter
});

// ✅ Middleware pour uploader 2 images (document + selfie)
const uploadTwoImages = uploadVerificationImages.fields([
  { name: 'documentImage', maxCount: 1 },
  { name: 'selfieWithDocumentImage', maxCount: 1 }
]);

// ✅ Gestion des erreurs Multer pour la vérification
const handleMulterError = (err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        success: false,
        code: 'FILE_TOO_LARGE',
        message: 'Fichier trop volumineux (max 10MB par image)',
        timestamp: new Date().toISOString()
      });
    }
    if (err.code === 'LIMIT_FILE_COUNT') {
      return res.status(400).json({
        success: false,
        code: 'TOO_MANY_FILES',
        message: 'Maximum 2 fichiers autorisés',
        timestamp: new Date().toISOString()
      });
    }
    if (err.code === 'LIMIT_UNEXPECTED_FILE') {
      return res.status(400).json({
        success: false,
        code: 'UNEXPECTED_FILE',
        message: 'Champs de fichiers attendus: documentImage et selfieWithDocumentImage',
        timestamp: new Date().toISOString()
      });
    }
  }
  
  if (err.message && err.message.includes('Format non supporté')) {
    return res.status(400).json({
      success: false,
      code: 'INVALID_FILE_TYPE',
      message: err.message,
      timestamp: new Date().toISOString()
    });
  }

  next(err);
};

// === Helpers pour sauvegarder en local les images issues du buffer/base64 ===
const saveBufferToLocal = async (buffer, userId, type = 'document') => {
  try {
    const folder = path.join('uploads', 'documents', String(userId));
    ensureDirectoryExists(folder);
    const ext = '.jpg';
    const filename = `${type}-${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}`;
    const fullPath = path.join(folder, filename);
    fs.writeFileSync(fullPath, buffer);
    return { url: `/${fullPath.replace(/\\/g, '/')}`, publicId: fullPath };
  } catch (err) {
    throw new Error(`Erreur sauvegarde locale: ${err.message}`);
  }
};

const saveBase64ToLocal = async (base64Image, userId, type = 'document') => {
  try {
    const match = base64Image.match(/^data:(.+);base64,(.+)$/);
    if (!match) throw new Error('Base64 invalide');
    const mime = match[1] || 'image/jpeg';
    const data = Buffer.from(match[2], 'base64');
    const ext = mime.includes('png') ? '.png' : '.jpg';
    const folder = path.join('uploads', 'documents', String(userId));
    ensureDirectoryExists(folder);
    const filename = `${type}-${Date.now()}-${Math.random().toString(36).slice(2,8)}${ext}`;
    const fullPath = path.join(folder, filename);
    fs.writeFileSync(fullPath, data);
    return { url: `/${fullPath.replace(/\\/g, '/')}`, publicId: fullPath };
  } catch (err) {
    throw new Error(`Erreur sauvegarde base64 locale: ${err.message}`);
  }
};

// =====================================================
// EXPORTS (TOUT COMBINÉ)
// =====================================================

module.exports = {
  // ✅ Exports existants (votre code conservé)
  cloudinary,
  uploadProfile,
  uploadVehicle,
  uploadDocument,
  uploadSignalement,
  deleteFile,
  optimizeImageUrl,
  getTransformedImageUrl,
  isCloudinaryConfigured,
  
  // ✅ Nouveaux exports pour la vérification d'identité
  uploadTwoImages,
  handleMulterError
  ,
  // Helpers pour stockage local des uploads en mémoire
  saveBufferToLocal,
  saveBase64ToLocal
};