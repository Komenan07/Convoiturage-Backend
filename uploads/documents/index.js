const multer = require('multer');
const path = require('path');
const fs = require('fs');

// Créer le répertoire de destination s'il n'existe pas
const uploadDir = path.join(__dirname, '..', '..', 'public', 'uploads', 'documents');
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
    cb(null, 'document-' + uniqueSuffix + path.extname(cleanName));
  }
});

const fileFilter = (_req, file, cb) => {
  const allowed = ['application/pdf', 'image/jpeg', 'image/png', 'image/jpg', 'image/webp'];
  if (allowed.includes(file.mimetype)) return cb(null, true);
  cb(new Error('Type de fichier invalide pour le document d\'identité. Types acceptés: PDF, JPEG, PNG, JPG, WebP'));
};

const upload = multer({ 
  storage, 
  fileFilter, 
  limits: { 
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 1
  } 
});

module.exports = {
  uploadDocument: upload.single('photoDocument'),
  uploadMultiple: upload.array('documents', 3), // Max 3 documents
  // Fonction utilitaire pour générer l'URL publique
  getPublicUrl: (filename) => `/uploads/documents/${filename}`,
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


