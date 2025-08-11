const multer = require('multer');
const path = require('path');
const fs = require('fs');

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

module.exports = {
  cloudinary,
  uploadProfile,
  uploadVehicle,
  uploadDocument,
  uploadSignalement,
  deleteFile,
  optimizeImageUrl,
  getTransformedImageUrl,
  isCloudinaryConfigured
};