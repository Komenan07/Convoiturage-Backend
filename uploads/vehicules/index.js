const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Créer le répertoire de destination s'il n'existe pas
const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'vehicules');
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
    cb(null, 'vehicule-' + uniqueSuffix + path.extname(cleanName));
  }
});

const fileFilter = (_req, file, cb) => {
  const allowed = ['image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
  if (allowed.includes(file.mimetype)) return cb(null, true);
  cb(new Error('Type de fichier invalide pour la photo de véhicule. Types acceptés: JPEG, PNG, JPG, WebP'));
};

const upload = multer({ 
  storage, 
  fileFilter, 
  limits: { 
    fileSize: 8 * 1024 * 1024, // 8MB
    files: 1
  } 
});

module.exports = {
  uploadPhotoVehicule: upload.single('photoVehicule'),
  uploadMultiple: upload.array('photos', 6), // Max 6 photos de véhicule
  // Fonction utilitaire pour générer l'URL publique
  getPublicUrl: (filename) => `/uploads/vehicules/${filename}`,
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
