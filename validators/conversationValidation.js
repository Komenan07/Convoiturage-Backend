import { body } from 'express-validator';

export default {
  create: [
    body('trajetId')
      .notEmpty().withMessage('L\'ID du trajet est requis')
      .isMongoId().withMessage('ID de trajet invalide'),
    
    body('participants')
      .optional()
      .isArray({ min: 1 }).withMessage('Les participants doivent être un tableau non vide'),
    
    body('titre')
      .optional()
      .trim()
      .isLength({ max: 100 }).withMessage('Le titre ne doit pas dépasser 100 caractères'),
    
    body('type')
      .optional()
      .isIn(['trajet', 'groupe']).withMessage('Type de conversation invalide')
  ]
};