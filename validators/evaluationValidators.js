// validators/evaluationValidators.js
const { body, param, query, validationResult } = require('express-validator');

// Middleware de gestion des erreurs de validation
const handleValidationErrors = (req, res, next) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({
      success: false,
      message: 'Erreurs de validation',
      errors: errors.array()
    });
  }
  next();
};

// Validation pour créer une évaluation
const validateCreerEvaluation = [
  body('trajetId')
    .isMongoId()
    .withMessage('ID trajet invalide'),
  
  body('evalueId')
    .optional()
    .isMongoId()
    .withMessage('ID évalué invalide'),
  
  body('notes.ponctualite')
    .isInt({ min: 1, max: 5 })
    .withMessage('Note ponctualité doit être entre 1 et 5'),
  
  body('notes.proprete')
    .isInt({ min: 1, max: 5 })
    .withMessage('Note propreté doit être entre 1 et 5'),
  
  body('notes.qualiteConduite')
    .isInt({ min: 1, max: 5 })
    .withMessage('Note qualité conduite doit être entre 1 et 5'),
  
  body('notes.respect')
    .isInt({ min: 1, max: 5 })
    .withMessage('Note respect doit être entre 1 et 5'),
  
  body('notes.communication')
    .isInt({ min: 1, max: 5 })
    .withMessage('Note communication doit être entre 1 et 5'),
  
  body('commentaire')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Commentaire ne peut dépasser 500 caractères')
    .trim(),
  
  body('aspectsPositifs')
    .optional()
    .isArray()
    .withMessage('Aspects positifs doit être un tableau')
    .custom((value) => {
      const aspectsValides = [
        'PONCTUEL', 'SYMPATHIQUE', 'VEHICULE_PROPRE', 'BONNE_CONDUITE',
        'RESPECTUEUX', 'COMMUNICATIF', 'SERVIABLE', 'COURTOIS'
      ];
      return value.every(aspect => aspectsValides.includes(aspect));
    })
    .withMessage('Aspects positifs contiennent des valeurs invalides'),
  
  body('aspectsAmeliorer')
    .optional()
    .isArray()
    .withMessage('Aspects à améliorer doit être un tableau')
    .custom((value) => {
      const aspectsValides = [
        'PONCTUALITE', 'PROPRETE', 'CONDUITE', 'COMMUNICATION',
        'RESPECT', 'PATIENCE', 'ORGANISATION'
      ];
      return value.every(aspect => aspectsValides.includes(aspect));
    })
    .withMessage('Aspects à améliorer contiennent des valeurs invalides'),
  
  body('estSignalement')
    .optional()
    .isBoolean()
    .withMessage('estSignalement doit être un booléen'),
  
  body('motifSignalement')
    .optional()
    .isIn([
      'COMPORTEMENT_INAPPROPRIE', 'CONDUITE_DANGEREUSE', 'RETARD_EXCESSIF',
      'VEHICULE_INSALUBRE', 'MANQUE_RESPECT', 'AUTRE'
    ])
    .withMessage('Motif de signalement invalide'),
  
  body('gravite')
    .optional()
    .isIn(['LEGER', 'MOYEN', 'GRAVE'])
    .withMessage('Gravité doit être LEGER, MOYEN ou GRAVE'),
  
  // Validation conditionnelle : si signalement, motif et gravité requis
  body('motifSignalement')
    .if(body('estSignalement').equals(true))
    .notEmpty()
    .withMessage('Motif requis pour un signalement'),
  
  body('gravite')
    .if(body('estSignalement').equals(true))
    .notEmpty()
    .withMessage('Gravité requise pour un signalement'),
  
  handleValidationErrors
];

// Validation pour répondre à une évaluation
const validateRepondreEvaluation = [
  param('id')
    .isMongoId()
    .withMessage('ID évaluation invalide'),
  
  body('reponse')
    .notEmpty()
    .withMessage('Réponse requise')
    .isLength({ min: 10, max: 300 })
    .withMessage('Réponse doit contenir entre 10 et 300 caractères')
    .trim(),
  
  handleValidationErrors
];

// Validation pour signaler une évaluation
const validateSignalerEvaluation = [
  param('id')
    .isMongoId()
    .withMessage('ID évaluation invalide'),
  
  body('motif')
    .notEmpty()
    .withMessage('Motif de signalement requis')
    .isLength({ min: 10, max: 200 })
    .withMessage('Motif doit contenir entre 10 et 200 caractères')
    .trim(),
  
  handleValidationErrors
];

// Validation pour les paramètres d'URL
const validateUserId = [
  param('userId')
    .isMongoId()
    .withMessage('ID utilisateur invalide'),
  
  handleValidationErrors
];

const validateTrajetId = [
  param('trajetId')
    .isMongoId()
    .withMessage('ID trajet invalide'),
  
  handleValidationErrors
];

const validateEvaluationId = [
  param('id')
    .isMongoId()
    .withMessage('ID évaluation invalide'),
  
  handleValidationErrors
];

// Validation pour les paramètres de requête
const validateQueryParams = [
  query('page')
    .optional()
    .isInt({ min: 1 })
    .withMessage('Page doit être un entier positif'),
  
  query('limit')
    .optional()
    .isInt({ min: 1, max: 100 })
    .withMessage('Limite doit être entre 1 et 100'),
  
  query('typeEvaluateur')
    .optional()
    .isIn(['CONDUCTEUR', 'PASSAGER'])
    .withMessage('Type évaluateur doit être CONDUCTEUR ou PASSAGER'),
  
  query('notesMinimum')
    .optional()
    .isFloat({ min: 1, max: 5 })
    .withMessage('Note minimum doit être entre 1 et 5'),
  
  handleValidationErrors
];

module.exports = {
  validateCreerEvaluation,
  validateRepondreEvaluation,
  validateSignalerEvaluation,
  validateUserId,
  validateTrajetId,
  validateEvaluationId,
  validateQueryParams,
  handleValidationErrors
};