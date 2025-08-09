// =====================================================
// MIDDLEWARES DE VALIDATION POUR LES PAIEMENTS
// =====================================================

const Joi = require('joi');
const mongoose = require('mongoose');

/**
 * Schémas de validation Joi
 */
const schemas = {
  // Validation pour initier un paiement
  initierPaiement: Joi.object({
    reservationId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        'string.pattern.base': 'ID de réservation invalide',
        'any.required': 'ID de réservation requis'
      }),
    
    payeurId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        'string.pattern.base': 'ID du payeur invalide',
        'any.required': 'ID du payeur requis'
      }),
    
    beneficiaireId: Joi.string()
      .pattern(/^[0-9a-fA-F]{24}$/)
      .required()
      .messages({
        'string.pattern.base': 'ID du bénéficiaire invalide',
        'any.required': 'ID du bénéficiaire requis'
      }),
    
    montantTotal: Joi.number()
      .positive()
      .min(100)
      .max(1000000)
      .required()
      .messages({
        'number.positive': 'Le montant doit être positif',
        'number.min': 'Montant minimum: 100 FCFA',
        'number.max': 'Montant maximum: 1,000,000 FCFA',
        'any.required': 'Montant total requis'
      }),
    
    methodePaiement: Joi.string()
      .valid('WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY', 'ESPECES')
      .required()
      .messages({
        'any.only': 'Méthode de paiement non supportée',
        'any.required': 'Méthode de paiement requise'
      }),
    
    numeroTelephone: Joi.when('methodePaiement', {
      is: Joi.string().valid('WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY'),
      then: Joi.string()
        .pattern(/^(\+221|221)?[0-9]{8,9}$/)
        .required()
        .messages({
          'string.pattern.base': 'Numéro de téléphone invalide',
          'any.required': 'Numéro de téléphone requis pour le paiement mobile'
        }),
      otherwise: Joi.optional()
    }),
    
    repartitionFrais: Joi.object({
      payeurSupporteCommission: Joi.boolean().default(false),
      payeurSupporteTransaction: Joi.boolean().default(true),
      pourcentagePayeur: Joi.number().min(0).max(100).default(100)
    }).optional(),
    
    typeCourse: Joi.string()
      .valid('URBAIN', 'INTERURBAIN', 'LONGUE_DISTANCE', 'PREMIUM', 'ECONOMIQUE')
      .default('URBAIN'),
    
    metadata: Joi.object().optional()
  }),

  // Validation pour mise à jour de statut
  mettreAJourStatut: Joi.object({
    nouveauStatut: Joi.string()
      .valid('EN_ATTENTE', 'TRAITE', 'COMPLETE', 'ECHEC', 'REMBOURSE')
      .required()
      .messages({
        'any.only': 'Statut invalide',
        'any.required': 'Nouveau statut requis'
      }),
    
    motif: Joi.string()
      .min(5)
      .max(500)
      .optional()
      .messages({
        'string.min': 'Le motif doit contenir au moins 5 caractères',
        'string.max': 'Le motif ne peut dépasser 500 caractères'
      }),
    
    metadata: Joi.object().optional()
  }),

  // Validation pour remboursement
  remboursement: Joi.object({
    motifRemboursement: Joi.string()
      .min(10)
      .max(500)
      .required()
      .messages({
        'string.min': 'Le motif doit contenir au moins 10 caractères',
        'string.max': 'Le motif ne peut dépasser 500 caractères',
        'any.required': 'Motif de remboursement requis'
      }),
    
    montantRemboursement: Joi.number()
      .positive()
      .optional()
      .messages({
        'number.positive': 'Le montant de remboursement doit être positif'
      }),
    
    typeRemboursement: Joi.string()
      .valid('TOTAL', 'PARTIEL')
      .default('TOTAL')
  }),

  // Validation pour callback mobile money
  callbackMobileMoney: Joi.object({
    referenceTransaction: Joi.string()
      .required()
      .messages({
        'any.required': 'Référence de transaction requise'
      }),
    
    statutTransaction: Joi.string()
      .valid('SUCCESS', 'COMPLETED', 'PENDING', 'PROCESSING', 'FAILED', 'CANCELLED', 'EXPIRED')
      .required()
      .messages({
        'any.only': 'Statut de transaction invalide',
        'any.required': 'Statut de transaction requis'
      }),
    
    referencePaiementMobile: Joi.string().optional(),
    
    montant: Joi.number().positive().optional(),
    
    frais: Joi.number().min(0).optional(),
    
    messageProvider: Joi.string().max(200).optional(),
    
    timestampProvider: Joi.date().optional(),
    
    signature: Joi.string().optional() // Pour validation de sécurité
  }),

  // Validation pour calcul de commission
  calculCommission: Joi.object({
    montantTotal: Joi.number()
      .positive()
      .min(100)
      .required()
      .messages({
        'number.positive': 'Le montant doit être positif',
        'number.min': 'Montant minimum: 100 FCFA',
        'any.required': 'Montant total requis'
      }),
    
    typeCourse: Joi.string()
      .valid('URBAIN', 'INTERURBAIN', 'LONGUE_DISTANCE', 'PREMIUM', 'ECONOMIQUE')
      .default('URBAIN'),
    
    distanceKm: Joi.number().min(0).optional(),
    
    dureeMinutes: Joi.number().min(0).optional()
  })
};

/**
 * Middleware de validation générique
 */
const validate = (schema) => {
  return (req, res, next) => {
    const { error, value } = schema.validate(req.body, {
      abortEarly: false,
      stripUnknown: true
    });

    if (error) {
      const errors = error.details.map(detail => ({
        field: detail.path.join('.'),
        message: detail.message,
        value: detail.context?.value
      }));

      return res.status(400).json({
        success: false,
        message: 'Données de validation invalides',
        code: 'VALIDATION_ERROR',
        errors
      });
    }

    // Remplacer req.body par les données validées et nettoyées
    req.body = value;
    next();
  };
};

/**
 * Middleware de validation des paramètres URL
 */
const validateParams = (req, res, next) => {
  const { paiementId } = req.params;

  if (paiementId && !mongoose.Types.ObjectId.isValid(paiementId)) {
    return res.status(400).json({
      success: false,
      message: 'ID de paiement invalide',
      code: 'INVALID_PAYMENT_ID'
    });
  }

  next();
};

/**
 * Middleware de validation des query parameters
 */
const validateQuery = (req, res, next) => {
  const querySchema = Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limite: Joi.number().integer().min(1).max(100).default(10),
    tri: Joi.string().optional(),
    utilisateurId: Joi.string().pattern(/^[0-9a-fA-F]{24}$/).optional(),
    statutPaiement: Joi.string()
      .valid('EN_ATTENTE', 'TRAITE', 'COMPLETE', 'ECHEC', 'REMBOURSE')
      .optional(),
    methodePaiement: Joi.string()
      .valid('WAVE', 'ORANGE_MONEY', 'MTN_MONEY', 'MOOV_MONEY', 'ESPECES')
      .optional(),
    dateDebut: Joi.date().iso().optional(),
    dateFin: Joi.date().iso().min(Joi.ref('dateDebut')).optional(),
    montantMin: Joi.number().min(0).optional(),
    montantMax: Joi.number().min(Joi.ref('montantMin')).optional()
  });

  const { error, value } = querySchema.validate(req.query, {
    abortEarly: false,
    stripUnknown: true
  });

  if (error) {
    const errors = error.details.map(detail => ({
      field: detail.path.join('.'),
      message: detail.message
    }));

    return res.status(400).json({
      success: false,
      message: 'Paramètres de requête invalides',
      code: 'INVALID_QUERY_PARAMS',
      errors
    });
  }

  req.query = value;
  next();
};

/**
 * Middleware de validation de sécurité pour les callbacks
 */
const validateCallbackSecurity = (req, res, next) => {
  const { signature, timestamp } = req.body;
  const userAgent = req.headers['user-agent'];
  const clientIP = req.ip || req.connection.remoteAddress;

  // Vérification basique de l'origine
  const allowedUserAgents = process.env.ALLOWED_CALLBACK_USER_AGENTS?.split(',') || [];
  const allowedIPs = process.env.ALLOWED_CALLBACK_IPS?.split(',') || [];

  if (allowedUserAgents.length > 0) {
    const isValidUserAgent = allowedUserAgents.some(agent => 
      userAgent?.toLowerCase().includes(agent.toLowerCase())
    );

    if (!isValidUserAgent) {
      console.warn(`Callback suspect - User Agent: ${userAgent}, IP: ${clientIP}`);
      return res.status(403).json({
        success: false,
        message: 'Origine non autorisée',
        code: 'UNAUTHORIZED_CALLBACK'
      });
    }
  }

  // TODO: Implémenter la validation de signature HMAC
  // if (signature) {
  //   const expectedSignature = calculateHMAC(req.body, process.env.CALLBACK_SECRET);
  //   if (signature !== expectedSignature) {
  //     return res.status(401).json({
  //       success: false,
  //       message: 'Signature invalide',
  //       code: 'INVALID_SIGNATURE'
  //     });
  //   }
  // }

  // Vérification de la fraîcheur du timestamp (si fourni)
  if (timestamp) {
    const callbackTime = new Date(timestamp);
    const now = new Date();
    const diffMinutes = (now - callbackTime) / (1000 * 60);

    if (diffMinutes > 5) { // Plus de 5 minutes
      console.warn(`Callback périmé: ${diffMinutes} minutes de différence`);
      return res.status(400).json({
        success: false,
        message: 'Callback périmé',
        code: 'EXPIRED_CALLBACK'
      });
    }
  }

  next();
};

/**
 * Middleware pour loguer les tentatives de paiement
 */
const logPaymentAttempt = (req, res, next) => {
  const { method, url, body } = req;
  const clientIP = req.ip || req.connection.remoteAddress;
  const userAgent = req.headers['user-agent'];

  console.log(`[PAIEMENT] ${method} ${url}`, {
    ip: clientIP,
    userAgent,
    userId: req.user?.id,
    timestamp: new Date().toISOString(),
    // Masquer les données sensibles
    body: method === 'POST' ? {
      ...body,
      numeroTelephone: body.numeroTelephone ? 'XXX-XX-' + body.numeroTelephone?.slice(-2) : undefined
    } : undefined
  });

  next();
};

// Middlewares spécialisés exportés
module.exports = {
  // Validations principales
  validatePayment: [validateParams, validate(schemas.initierPaiement), logPaymentAttempt],
  validateStatusUpdate: [validateParams, validate(schemas.mettreAJourStatut)],
  validateRefund: [validateParams, validate(schemas.remboursement)],
  validateCallback: [validate(schemas.callbackMobileMoney), validateCallbackSecurity],
  validateCommissionCalculation: validate(schemas.calculCommission),
  
  // Validations utilitaires
  validateParams,
  validateQuery,
  logPaymentAttempt,
  
  // Validation générique
  validate,
  schemas
};