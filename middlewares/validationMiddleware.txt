const { validationResult } = require('express-validator');

// Middleware général de gestion des erreurs de validation
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Erreurs de validation',
      errors: errors.array().map(error => ({
        field: error.path || error.param,
        message: error.msg,
        value: error.value
      }))
    });
  }
  next();
};

// Version avec format "succes" pour cohérence avec certaines routes
const handleValidationErrorsSucces = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      succes: false,
      erreur: 'Erreurs de validation',
      details: errors.array().map(error => ({
        champ: error.path || error.param,
        message: error.msg,
        valeur: error.value
      }))
    });
  }
  next();
};

// Middleware pour vérifier si un ID MongoDB est valide
const validateMongoId = (paramName) => {
  return (req, res, next) => {
    const id = req.params[paramName];
    if (!id || !id.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'ID invalide',
        details: `Le paramètre ${paramName} doit être un ID MongoDB valide`
      });
    }
    next();
  };
};

// Middleware de pagination
const validatePagination = (req, res, next) => {
  const page = parseInt(req.query.page) || 1;
  const limit = parseInt(req.query.limit) || 10;
  
  if (page < 1) {
    return res.status(400).json({
      success: false,
      message: 'Le numéro de page doit être supérieur à 0'
    });
  }
  
  if (limit < 1 || limit > 100) {
    return res.status(400).json({
      success: false,
      message: 'La limite doit être entre 1 et 100'
    });
  }
  
  req.pagination = { page, limit, skip: (page - 1) * limit };
  next();
};

// Middleware pour nettoyer et valider les données d'entrée
const sanitizeInput = (req, res, next) => {
  // Nettoyer les chaînes de caractères dans le body
  if (req.body) {
    Object.keys(req.body).forEach(key => {
      if (typeof req.body[key] === 'string') {
        req.body[key] = req.body[key].trim();
      }
    });
  }
  
  // Nettoyer les paramètres de requête
  if (req.query) {
    Object.keys(req.query).forEach(key => {
      if (typeof req.query[key] === 'string') {
        req.query[key] = req.query[key].trim();
      }
    });
  }
  
  next();
};

// Middleware pour vérifier les champs requis
const requireFields = (fields) => {
  return (req, res, next) => {
    const missingFields = [];
    
    fields.forEach(field => {
      if (!req.body[field] || (typeof req.body[field] === 'string' && req.body[field].trim() === '')) {
        missingFields.push(field);
      }
    });
    
    if (missingFields.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Champs requis manquants',
        missingFields
      });
    }
    
    next();
  };
};

// Middleware pour valider les coordonnées GPS
const validateCoordinates = (req, res, next) => {
  const { longitude, latitude } = req.body.coordonnees || req.body;
  
  if (longitude !== undefined && latitude !== undefined) {
    if (typeof longitude !== 'number' || typeof latitude !== 'number') {
      return res.status(400).json({
        success: false,
        message: 'Les coordonnées doivent être des nombres'
      });
    }
    
    if (longitude < -180 || longitude > 180) {
      return res.status(400).json({
        success: false,
        message: 'La longitude doit être entre -180 et 180'
      });
    }
    
    if (latitude < -90 || latitude > 90) {
      return res.status(400).json({
        success: false,
        message: 'La latitude doit être entre -90 et 90'
      });
    }
  }
  
  next();
};

// Middleware pour valider les dates
const validateDates = (req, res, next) => {
  const dateFields = ['dateDepart', 'dateDebut', 'dateFin', 'dateNaissance'];
  
  for (const field of dateFields) {
    if (req.body[field]) {
      const date = new Date(req.body[field]);
      if (isNaN(date.getTime())) {
        return res.status(400).json({
          success: false,
          message: `Format de date invalide pour le champ ${field}`
        });
      }
      
      // Convertir en objet Date pour MongoDB
      req.body[field] = date;
    }
  }
  
  next();
};

// Middleware pour limiter la taille des fichiers uploadés
const validateFileSize = (maxSize = 5 * 1024 * 1024) => { // 5MB par défaut
  return (req, res, next) => {
    if (req.file && req.file.size > maxSize) {
      return res.status(400).json({
        success: false,
        message: `La taille du fichier ne doit pas dépasser ${maxSize / (1024 * 1024)}MB`
      });
    }
    next();
  };
};

// Middleware pour valider les types de fichiers
const validateFileType = (allowedTypes = ['image/jpeg', 'image/png', 'image/jpg']) => {
  return (req, res, next) => {
    if (req.file && !allowedTypes.includes(req.file.mimetype)) {
      return res.status(400).json({
        success: false,
        message: `Type de fichier non autorisé. Types acceptés: ${allowedTypes.join(', ')}`
      });
    }
    next();
  };
};

module.exports = {
  handleValidationErrors,
  handleValidationErrorsSucces,
  validateMongoId,
  validatePagination,
  sanitizeInput,
  requireFields,
  validateCoordinates,
  validateDates,
  validateFileSize,
  validateFileType
};