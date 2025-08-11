const multer = require('multer');
const path = require('path');
const Signalement = require('../models/Signalement');
const AppError = require('../utils/appError');

// Configuration du stockage Multer
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, 'uploads/signalements/');
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = `${Date.now()}-${Math.round(Math.random() * 1e9)}`;
    cb(
      null,
      `${file.fieldname}-${uniqueSuffix}${path.extname(file.originalname)}`
    );
  }
});

// Filtrage des fichiers
const fileFilter = (req, file, cb) => {
  const allowedTypes = [
    'image/jpeg',
    'image/png',
    'image/gif',
    'application/pdf',
    'video/mp4',
    'video/quicktime'
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new AppError('Type de fichier non autorisé pour les preuves', 400), false);
  }
};

// Middleware d'upload Multer
const uploadPreuves = multer({
  storage,
  fileFilter,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB
    files: 5 // Maximum 5 fichiers
  }
}).array('preuves', 5);

// Middleware de vérification d'existence du signalement
const checkSignalementExists = async (req, res, next) => {
  try {
    const signalement = await Signalement.findById(req.params.id);
    
    if (!signalement) {
      return next(new AppError('Signalement non trouvé', 404));
    }
    
    req.signalement = signalement;
    next();
  } catch (error) {
    next(new AppError('Erreur de vérification du signalement', 500));
  }
};

// Middleware de vérification des permissions
const checkPermissions = (requiredRole) => {
  return (req, res, next) => {
    const isAdmin = req.user.roles.includes('ADMIN');
    const isModerator = req.user.roles.includes('MODERATEUR');
    const isOwner = req.signalement.signaleurId.equals(req.user._id);

    if (requiredRole === 'ADMIN' && !isAdmin) {
      return next(new AppError('Accès non autorisé', 403));
    }
    
    if (requiredRole === 'MODERATION' && !(isAdmin || isModerator)) {
      return next(new AppError('Accès non autorisé', 403));
    }
    
    if (requiredRole === 'OWNER' && !(isOwner || isAdmin || isModerator)) {
      return next(new AppError('Accès non autorisé', 403));
    }

    next();
  };
};

// Middleware de calcul de priorité
const calculerPriorite = (req, res, next) => {
  const { typeSignalement, motif } = req.body;
  
  const prioriteMap = {
    SECURITE: {
      CONDUITE_DANGEREUSE: 'CRITIQUE',
      VEHICULE_NON_CONFORME: 'HAUTE',
      USURPATION_IDENTITE: 'HAUTE',
      MENACES: 'CRITIQUE'
    },
    FRAUDE: {
      FAUX_PROFIL: 'HAUTE',
      PRIX_ABUSIFS: 'NORMALE',
      ANNULATION_ABUSIVE: 'NORMALE',
      FAUSSE_EVALUATION: 'BASSE'
    },
    COMPORTEMENT: {
      HARCELEMENT: 'HAUTE',
      DISCRIMINATION: 'HAUTE',
      VIOLENCE_VERBALE: 'NORMALE',
      COMPORTEMENT_INAPPROPRIE: 'NORMALE'
    },
    CONTENU: {
      CONTENU_OFFENSANT: 'NORMALE',
      SPAM: 'BASSE',
      FAUSSES_INFORMATIONS: 'HAUTE'
    }
  };

  req.body.priorite = prioriteMap[typeSignalement]?.[motif] || 'NORMALE';
  next();
};

module.exports = {
  uploadPreuves,
  checkSignalementExists,
  checkPermissions,
  calculerPriorite
};