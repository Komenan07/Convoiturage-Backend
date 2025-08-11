const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Créer le répertoire de destination s'il n'existe pas
const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'photos');
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
  destination: function (_req, _file, cb) {
    cb(null, uploadDir);
  },
  filename: function (_req, file, cb) {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const cleanName = file.originalname.replace(/[^a-zA-Z0-9.-]/g, '_');
    cb(null, 'photo-' + uniqueSuffix + path.extname(cleanName));
  }
});

const fileFilter = (_req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
  if (allowed.includes(file.mimetype)) return cb(null, true);
  cb(new Error('Type de fichier invalide pour la photo de profil. Types acceptés: JPEG, PNG, JPG, WebP'));
};

const upload = multer({ 
  storage, 
  fileFilter, 
  limits: { 
    fileSize: 5 * 1024 * 1024, // 5MB
    files: 1
  } 
});

module.exports = {
  uploadSingle: upload.single('photo'),
  uploadMultiple: upload.array('photos', 5), // Max 5 photos
  // Fonction utilitaire pour générer l'URL publique
  getPublicUrl: (filename) => `/uploads/photos/${filename}`,
  // Fonction utilitaire pour nettoyer les anciens fichiers
  deleteFile: (filename) => {
    const filePath = path.join(uploadDir, filename);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
      return true;
    }
    return false;
  }
};


