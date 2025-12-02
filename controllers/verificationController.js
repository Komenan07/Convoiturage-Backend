// controllers/verificationController.js
// =====================================================
// CONTRÔLEUR DE VÉRIFICATION - Version Locale (CORRIGÉE)
// Compatible Admin + Flutter (2 images) - Stockage LOCAL
// =====================================================

const User = require('../models/Utilisateur');
const { logger } = require('../utils/logger');
const AppError = require('../utils/AppError');
const sendEmail = require('../utils/emailService');
const path = require('path');
const fs = require('fs').promises;

// =====================================================
// CONSTANTES
// =====================================================

const TYPE_DOCUMENT_IDENTITE = {
  CNI: 'CNI',
  PASSEPORT: 'PASSEPORT',
  PERMIS_CONDUIRE: 'PERMIS_CONDUIRE',
  ATTESTATION_IDENTITE: 'ATTESTATION_IDENTITE'
};

const TYPES_DOCUMENTS_VALIDES = Object.values(TYPE_DOCUMENT_IDENTITE);

const STATUT_VERIFICATION = {
  NON_SOUMIS: 'NON_SOUMIS',
  EN_ATTENTE: 'EN_ATTENTE',
  VERIFIE: 'VERIFIE',
  REJETE: 'REJETE'
};

const TAILLE_MAX_IMAGE = 10 * 1024 * 1024; // 10MB
const FORMATS_IMAGE_VALIDES = ['image/jpeg', 'image/png', 'image/jpg'];

// Chemins de base pour les uploads
const BASE_URL = process.env.BASE_URL || 'http://localhost:5000';
// Note: UPLOAD_BASE_PATH retiré car non utilisé (fichiers déjà dans uploads/documents via Multer)

// =====================================================
// FONCTIONS UTILITAIRES DE GESTION DE FICHIERS
// =====================================================

/**
 * Générer l'URL publique d'un fichier
 * @param {String} filePath - Chemin relatif du fichier
 * @returns {String} - URL complète
 */
const genererUrlPublique = (filePath) => {
  if (!filePath) return null;
  // Retourne l'URL complète accessible depuis le frontend
  return `${BASE_URL}/${filePath}`;
};

/**
 * Supprimer un fichier local de manière sécurisée
 * @param {String} filePath - Chemin relatif du fichier (ex: uploads/documents/xxx.jpg)
 */
const supprimerFichierLocal = async (filePath) => {
  try {
    if (!filePath) {
      logger.info('Chemin de fichier vide, ignoré');
      return;
    }
    
    // Construire le chemin absolu
    const absolutePath = path.join(process.cwd(), filePath);
    
    logger.info(`🗑️ Tentative de suppression: ${absolutePath}`);
    
    // Vérifier si le fichier existe
    try {
      await fs.access(absolutePath);
      // Le fichier existe, on le supprime
      await fs.unlink(absolutePath);
      logger.info('✅ Fichier local supprimé:', filePath);
      return true;
    } catch (err) {
      if (err.code === 'ENOENT') {
        // Fichier introuvable, ce n'est pas grave
        logger.warn('⚠️ Fichier introuvable (déjà supprimé?):', filePath);
        return false;
      } else {
        // Autre erreur (permissions, etc.)
        logger.error('❌ Erreur lors de la suppression:', {
          fichier: filePath,
          erreur: err.message,
          code: err.code
        });
        throw err;
      }
    }
  } catch (error) {
    logger.error('💥 Erreur critique suppression fichier local:', {
      fichier: filePath,
      erreur: error.message,
      stack: error.stack
    });
    // Ne pas throw pour ne pas bloquer l'annulation de la vérification
    return false;
  }
};

/**
 * Supprimer les anciennes images d'un utilisateur
 * @param {Object} documentIdentite - Objet documentIdentite de l'utilisateur
 */
const supprimerAnciennesImages = async (documentIdentite) => {
  if (!documentIdentite) return;

  const fichiersASupprimer = [
    documentIdentite.photoDocument,
    documentIdentite.photoSelfie
  ].filter(Boolean);

  await Promise.allSettled(
    fichiersASupprimer.map(fichier => supprimerFichierLocal(fichier))
  );
};

// =====================================================
// VALIDATION
// =====================================================

/**
 * Valider les données de vérification (pour Flutter)
 * @param {String} type - Type de document
 * @param {String} numero - Numéro du document
 * @param {Boolean} hasDocumentImage - Document image présent?
 * @param {Boolean} hasSelfieImage - Selfie présent?
 * @returns {Array} - Liste des erreurs de validation
 */
const validerDonneesVerification = (type, numero, hasDocumentImage, hasSelfieImage) => {
  const erreurs = [];

  if (!type || !TYPES_DOCUMENTS_VALIDES.includes(type)) {
    erreurs.push({
      field: 'type',
      message: 'Type de document invalide',
      value: type,
      allowedValues: TYPES_DOCUMENTS_VALIDES
    });
  }

  if (!numero || typeof numero !== 'string' || numero.trim() === '') {
    erreurs.push({
      field: 'numero',
      message: 'Numéro de document requis',
      value: numero || ''
    });
  } else if (numero.trim().length < 5 || numero.trim().length > 50) {
    erreurs.push({
      field: 'numero',
      message: 'Numéro de document invalide (5-50 caractères)',
      value: numero
    });
  }

  if (!hasDocumentImage) {
    erreurs.push({
      field: 'documentImage',
      message: 'Photo du document requise'
    });
  }

  if (!hasSelfieImage) {
    erreurs.push({
      field: 'selfieWithDocumentImage',
      message: 'Photo selfie avec le document requise'
    });
  }

  return erreurs;
};

/**
 * Valider les données d'un document (pour base64)
 * @param {String} type - Type de document
 * @param {String} numero - Numéro du document
 * @param {String} dateExpiration - Date d'expiration
 * @param {String} photoDocument - Photo en base64
 * @returns {Array} - Liste des erreurs
 */
const validerDonneesDocument = (type, numero, dateExpiration, photoDocument) => {
  const erreurs = [];

  if (!type || !TYPES_DOCUMENTS_VALIDES.includes(type)) {
    erreurs.push(`Type de document invalide. Types acceptés : ${TYPES_DOCUMENTS_VALIDES.join(', ')}`);
  }

  if (!numero || numero.trim().length < 5) {
    erreurs.push('Numéro de document invalide (minimum 5 caractères)');
  }

  if (dateExpiration) {
    const dateExp = new Date(dateExpiration);
    const maintenant = new Date();
    
    if (isNaN(dateExp.getTime())) {
      erreurs.push('Format de date d\'expiration invalide');
    } else if (dateExp <= maintenant) {
      erreurs.push('Le document est expiré ou expire aujourd\'hui');
    }
  }

  if (photoDocument && photoDocument.startsWith('data:image/')) {
    const base64Data = photoDocument.split(',')[1];
    const taille = Buffer.from(base64Data, 'base64').length;
    
    if (taille > TAILLE_MAX_IMAGE) {
      erreurs.push(`Image trop volumineuse (max ${TAILLE_MAX_IMAGE / (1024 * 1024)}MB)`);
    }

    const mimeMatch = photoDocument.match(/data:([^;]+);/);
    if (mimeMatch && !FORMATS_IMAGE_VALIDES.includes(mimeMatch[1])) {
      erreurs.push(`Format d'image non supporté. Formats acceptés : ${FORMATS_IMAGE_VALIDES.join(', ')}`);
    }
  }

  return erreurs;
};

// =====================================================
// FONCTIONS UTILISATEUR
// =====================================================

/**
 * Soumettre une demande de vérification d'identité (Flutter - 2 images)
 * @route POST /api/verification/submit
 * @access Private (utilisateur connecté)
 */
const soumettreVerification = async (req, res, next) => {
  try {
    console.log('🔍 [1] Début soumettreVerification');
    
    const userId = req.user.userId || req.user.id;
    console.log('🔍 [2] userId:', userId);
    
    const { type, numero } = req.body;
    console.log('🔍 [3] type:', type, 'numero:', numero);
    
    const documentImage = req.files?.documentImage?.[0];
    const selfieImage = req.files?.selfieWithDocumentImage?.[0];
    console.log('🔍 [4] documentImage:', !!documentImage, 'selfieImage:', !!selfieImage);

    logger.info('Soumission vérification:', { 
      userId, 
      type, 
      hasDocument: !!documentImage, 
      hasSelfie: !!selfieImage 
    });

    console.log('🔍 [5] Validation des données...');
    const erreursValidation = validerDonneesVerification(
      type, 
      numero, 
      !!documentImage, 
      !!selfieImage
    );
    console.log('🔍 [6] Erreurs validation:', erreursValidation);

    if (erreursValidation.length > 0) {
      if (documentImage) await supprimerFichierLocal(documentImage.path);
      if (selfieImage) await supprimerFichierLocal(selfieImage.path);
      
      return res.status(400).json({
        success: false,
        message: 'Erreurs de validation',
        code: 'VALIDATION_ERROR',
        errors: erreursValidation
      });
    }

    console.log('🔍 [7] Recherche utilisateur...');
    const user = await User.findById(userId);
    console.log('🔍 [8] Utilisateur trouvé:', !!user);
    
    if (!user) {
      if (documentImage) await supprimerFichierLocal(documentImage.path);
      if (selfieImage) await supprimerFichierLocal(selfieImage.path);
      
      return res.status(404).json({ 
        success: false, 
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

    console.log('🔍 [9] Statut actuel:', user.documentIdentite?.statutVerification);

    if (user.documentIdentite?.statutVerification === STATUT_VERIFICATION.EN_ATTENTE) {
      if (documentImage) await supprimerFichierLocal(documentImage.path);
      if (selfieImage) await supprimerFichierLocal(selfieImage.path);
      
      return res.status(400).json({
        success: false,
        message: 'Une demande de vérification est déjà en cours de traitement',
        code: 'VERIFICATION_PENDING'
      });
    }

    if (user.documentIdentite?.statutVerification === STATUT_VERIFICATION.VERIFIE) {
      if (documentImage) await supprimerFichierLocal(documentImage.path);
      if (selfieImage) await supprimerFichierLocal(selfieImage.path);
      
      return res.status(400).json({
        success: false,
        message: 'Votre identité est déjà vérifiée',
        code: 'ALREADY_VERIFIED'
      });
    }

    console.log('🔍 [10] Préparation des données...');
    const ancienStatut = user.documentIdentite?.statutVerification || STATUT_VERIFICATION.NON_SOUMIS;

    const documentPath = documentImage.path;
    const selfiePath = selfieImage.path;

    console.log('🔍 [11] Génération URLs...');
    const documentUrl = genererUrlPublique(documentPath);
    const selfieUrl = genererUrlPublique(selfiePath);

    logger.info('Fichiers sauvegardés localement', {
      documentPath,
      selfiePath,
      documentUrl,
      selfieUrl
    });

    console.log('🔍 [12] Suppression anciennes images...');
    try {
      await supprimerAnciennesImages(user.documentIdentite);
      console.log('✅ [12a] Anciennes images supprimées');
    } catch (deleteError) {
      console.warn('⚠️ [12b] Erreur suppression (non bloquant):', deleteError.message);
    }

    console.log('🔍 [13] Mise à jour documentIdentite...');
    if (!user.documentIdentite) {
      user.documentIdentite = {};
    }

    user.documentIdentite.type = type;
    user.documentIdentite.numero = numero.trim().toUpperCase();
    user.documentIdentite.photoDocument = documentPath;
    user.documentIdentite.photoSelfie = selfiePath;
    user.documentIdentite.statutVerification = STATUT_VERIFICATION.EN_ATTENTE;
    user.documentIdentite.dateUpload = new Date();
    user.documentIdentite.raisonRejet = undefined;

    console.log('🔍 [14] Ajout historique...');
    if (!user.historiqueStatuts) {
      user.historiqueStatuts = [];
    }
    
    user.historiqueStatuts.push({
      ancienStatut,
      nouveauStatut: STATUT_VERIFICATION.EN_ATTENTE,
      raison: ancienStatut === STATUT_VERIFICATION.REJETE 
        ? 'Nouvelle soumission après rejet' 
        : 'Première soumission de vérification',
      dateModification: new Date()
    });

    console.log('🔍 [15] Sauvegarde utilisateur...');
    
    try {
      await user.save();
      console.log('✅ [16] Utilisateur sauvegardé');
    } catch (saveError) {
      console.error('💥 [16] Erreur lors de la sauvegarde:', saveError);
      
      // Supprimer les fichiers uploadés en cas d'erreur
      if (documentImage) await supprimerFichierLocal(documentImage.path);
      if (selfieImage) await supprimerFichierLocal(selfieImage.path);
      
      // Capturer les erreurs de validation Mongoose
      if (saveError.name === 'ValidationError') {
        const erreurs = Object.keys(saveError.errors).map(field => {
          const error = saveError.errors[field];
          
          // Erreur spécifique pour le numéro d'identité
          if (field === 'documentIdentite.numero') {
            return {
              champ: 'numero',
              message: getNumeroErrorMessage(type, numero)
            };
          }
          
          return {
            champ: field.replace('documentIdentite.', ''),
            message: error.message
          };
        });
        
        return res.status(400).json({
          success: false,
          message: 'Erreur de validation des données',
          code: 'VALIDATION_ERROR',
          errors: erreurs
        });
      }
      
      // Autres erreurs Mongoose
      if (saveError.name === 'MongoServerError' && saveError.code === 11000) {
        return res.status(400).json({
          success: false,
          message: 'Ce numéro de document existe déjà',
          code: 'DUPLICATE_DOCUMENT_NUMBER'
        });
      }
      
      // Erreur générique
      throw saveError;
    }

    logger.info('Vérification soumise avec succès', { 
      userId, 
      type,
      documentPath,
      selfiePath
    });

    console.log('🔍 [17] Envoi email...');
    try {
      await sendEmail({
        to: user.email,
        subject: '📋 Demande de vérification reçue - WAYZ-ECO',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #6C3FF7;">📋 Demande de vérification reçue</h2>
            <p>Bonjour ${user.prenom},</p>
            <p>Nous avons bien reçu votre demande de vérification d'identité.</p>
            
            <div style="background-color: #f8f9fa; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #6C3FF7;">Documents soumis :</h3>
              <ul style="margin-bottom: 0;">
                <li>Type de document : <strong>${type}</strong></li>
                <li>Numéro : <strong>${numero.trim().toUpperCase()}</strong></li>
                <li>✅ Photo du document</li>
                <li>✅ Photo selfie avec document</li>
              </ul>
            </div>

            <div style="background-color: #fff3cd; padding: 15px; border-left: 4px solid #ffc107; margin: 20px 0;">
              <p style="margin: 0;"><strong>⏱️ Délai de traitement : 24-48 heures</strong></p>
              <p style="margin: 8px 0 0 0; font-size: 14px;">Notre équipe examinera vos documents et vous notifiera du résultat.</p>
            </div>

            <p style="color: #666;">Merci de votre patience !</p>
            <p style="color: #666; font-size: 14px;">L'équipe WAYZ-ECO</p>
          </div>
        `
      });
      console.log('✅ [18] Email envoyé');
    } catch (emailError) {
      console.warn('⚠️ [18] Erreur email (non bloquant):', emailError.message);
      logger.warn('Impossible d\'envoyer l\'email de confirmation:', emailError.message);
    }

    console.log('✅ [19] Envoi réponse succès');
    return res.status(200).json({ 
      success: true, 
      message: 'Demande de vérification envoyée avec succès. Vous serez notifié sous 24-48h.',
      data: {
        statutVerification: STATUT_VERIFICATION.EN_ATTENTE,
        dateUpload: user.documentIdentite.dateUpload,
        documentType: type,
        documentNumero: numero.trim().toUpperCase(),
        hasDocument: true,
        hasSelfie: true,
        delaiTraitement: '24-48 heures',
        documentUrl: documentUrl,
        selfieUrl: selfieUrl
      }
    });

  } catch (error) {
    console.error('💥 [CATCH] Erreur capturée:', {
      message: error.message,
      stack: error.stack,
      name: error.name
    });
    
    logger.error('Erreur soumission vérification:', error);
    
    if (req.files?.documentImage?.[0]) {
      await supprimerFichierLocal(req.files.documentImage[0].path).catch(() => {});
    }
    if (req.files?.selfieWithDocumentImage?.[0]) {
      await supprimerFichierLocal(req.files.selfieWithDocumentImage[0].path).catch(() => {});
    }
    
    return next(AppError.serverError('Une erreur est survenue lors de la soumission', { 
      originalError: error.message,
      stack: process.env.NODE_ENV === 'development' ? error.stack : undefined
    }));
  }
};

// Fonction helper pour générer le message d'erreur approprié
function getNumeroErrorMessage(type, numero) {
  switch (type) {
    case 'CNI':
      return `Le numéro de CNI doit suivre le format: 2 lettres suivies de 8 chiffres (ex: CI12345678). Numéro fourni: ${numero}`;
    case 'PASSEPORT':
      return `Le numéro de passeport doit contenir entre 6 et 9 caractères alphanumériques (ex: AB123456). Numéro fourni: ${numero}`;
    case 'PERMIS_CONDUIRE':
      return `Le numéro de permis de conduire doit contenir entre 6 et 12 caractères alphanumériques. Numéro fourni: ${numero}`;
    default:
      return `Format de numéro de document invalide pour le type ${type}`;
  }
}

/**
 * Obtenir le statut de vérification de l'utilisateur connecté
 * @route GET /api/verification/status
 * @access Private
 */
const obtenirStatutVerification = async (req, res, next) => {
  try {
    const userId = req.user.id;

    const user = await User.findById(userId).select('documentIdentite statutCompte estVerifie');
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

    const doc = user.documentIdentite;
    
    const status = doc ? {
      hasDocument: !!doc.photoDocument,
      hasSelfie: !!doc.photoSelfie,
      documentType: doc.type || null,
      documentNumero: doc.numero || null,
      status: doc.statutVerification || STATUT_VERIFICATION.NON_SOUMIS,
      dateUpload: doc.dateUpload || null,
      dateVerification: doc.dateVerification || null,
      raisonRejet: doc.raisonRejet || null,
      
      documentUrl: genererUrlPublique(doc.photoDocument),
      selfieUrl: genererUrlPublique(doc.photoSelfie),
      
      isVerified: doc.statutVerification === STATUT_VERIFICATION.VERIFIE,
      isPending: doc.statutVerification === STATUT_VERIFICATION.EN_ATTENTE,
      isRejected: doc.statutVerification === STATUT_VERIFICATION.REJETE,
      isNotSubmitted: !doc.statutVerification || doc.statutVerification === STATUT_VERIFICATION.NON_SOUMIS,
      
      accountStatus: user.statutCompte,
      accountVerified: user.estVerifie
    } : { 
      hasDocument: false,
      hasSelfie: false,
      documentType: null,
      documentNumero: null,
      status: STATUT_VERIFICATION.NON_SOUMIS,
      dateUpload: null,
      dateVerification: null,
      raisonRejet: null,
      documentUrl: null,
      selfieUrl: null,
      
      isVerified: false,
      isPending: false,
      isRejected: false,
      isNotSubmitted: true,
      
      accountStatus: user.statutCompte,
      accountVerified: false
    };

    return res.json({ 
      success: true, 
      data: status 
    });

  } catch (error) {
    logger.error('Erreur obtenir statut vérification:', error);
    return next(new AppError('Erreur lors de la récupération du statut', 500, { 
      originalError: error.message 
    }));
  }
};

/**
 * Annuler une demande de vérification en attente
 * @route DELETE /api/verification/cancel
 * @access Private
 */
const annulerVerification = async (req, res, next) => {
  try {
    const userId = req.user.userId || req.user.id;

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

    if (!user.documentIdentite || user.documentIdentite.statutVerification !== STATUT_VERIFICATION.EN_ATTENTE) {
      return res.status(400).json({
        success: false,
        message: 'Aucune demande en attente à annuler',
        code: 'NO_PENDING_VERIFICATION'
      });
    }

    // Suppression des images
    try {
      await supprimerAnciennesImages(user.documentIdentite);
    } catch (deleteError) {
      logger.warn('Erreur suppression images (non bloquant):', deleteError);
    }

    // ✅ Réinitialiser en gardant la structure mais avec undefined
    Object.assign(user.documentIdentite, {
      type: undefined,
      numero: undefined,
      photoDocument: undefined,
      photoSelfie: undefined,
      statutVerification: STATUT_VERIFICATION.NON_SOUMIS,
      dateUpload: undefined
    });

    user.markModified('documentIdentite'); // Important pour Mongoose

    // Historique
    if (!user.historiqueStatuts) {
      user.historiqueStatuts = [];
    }
    
    user.historiqueStatuts.push({
      ancienStatut: STATUT_VERIFICATION.EN_ATTENTE,
      nouveauStatut: STATUT_VERIFICATION.NON_SOUMIS,
      raison: 'Annulation par l\'utilisateur',
      dateModification: new Date()
    });

    await user.save();

    logger.info('✅ Vérification annulée avec succès', { userId });

    return res.status(200).json({
      success: true,
      message: 'Demande de vérification annulée avec succès',
      code: 'VERIFICATION_CANCELLED'
    });

  } catch (error) {
    logger.error('❌ Erreur annulation vérification:', error);
    return next(AppError.serverError('Erreur lors de l\'annulation', { 
      originalError: error.message 
    }));
  }
};

// =====================================================
// FONCTIONS ADMIN
// =====================================================

/**
 * Obtenir la liste des documents en attente (ADMIN)
 */
const obtenirDocumentsEnAttente = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const skip = (page - 1) * limit;
    const sortBy = req.query.sortBy || 'dateUpload';
    const sortOrder = req.query.sortOrder === 'asc' ? 1 : -1;
    const typeFilter = req.query.type;

    const query = { 'documentIdentite.statutVerification': 'EN_ATTENTE' };
    
    if (typeFilter && TYPES_DOCUMENTS_VALIDES.includes(typeFilter)) {
      query['documentIdentite.type'] = typeFilter;
    }

    const total = await User.countDocuments(query);
    
    let sortField = 'documentIdentite.dateUpload';
    if (sortBy === 'nom') sortField = 'nom';
    if (sortBy === 'type') sortField = 'documentIdentite.type';

    const users = await User.find(query)
      .select('nom prenom email documentIdentite')
      .sort({ [sortField]: sortOrder })
      .skip(skip)
      .limit(limit);

    const results = users.map(u => ({
      userId: u._id,
      nomComplet: `${u.prenom} ${u.nom}`,
      email: u.email,
      document: {
        type: u.documentIdentite.type,
        numero: u.documentIdentite.numero,
        dateUpload: u.documentIdentite.dateUpload,
        dateExpiration: u.documentIdentite.dateExpiration,
        photoDocumentUrl: genererUrlPublique(u.documentIdentite.photoDocument),
        photoSelfieUrl: genererUrlPublique(u.documentIdentite.photoSelfie),
        hasSelfie: !!u.documentIdentite.photoSelfie
      }
    }));

    return res.json({
      success: true,
      data: {
        results,
        pagination: {
          page,
          limit,
          total,
          totalPages: Math.ceil(total / limit),
          hasNextPage: page < Math.ceil(total / limit),
          hasPrevPage: page > 1
        }
      }
    });
  } catch (error) {
    logger.error('Erreur obtenir documents en attente:', error);
    return next(AppError.serverError('Erreur serveur', { originalError: error.message }));
  }
};

/**
 * Télécharger les photos d'un document (ADMIN)
 */
const telechargerPhotoDocument = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('documentIdentite nom prenom');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

    if (!user.documentIdentite || !user.documentIdentite.photoDocument) {
      return res.status(404).json({
        success: false,
        message: 'Aucune photo de document disponible',
        code: 'NO_DOCUMENT_PHOTO'
      });
    }

    return res.json({
      success: true,
      data: {
        photoDocumentUrl: genererUrlPublique(user.documentIdentite.photoDocument),
        photoSelfieUrl: genererUrlPublique(user.documentIdentite.photoSelfie),
        hasSelfie: !!user.documentIdentite.photoSelfie
      }
    });

  } catch (error) {
    logger.error('Erreur téléchargement photos:', error);
    return next(AppError.serverError('Erreur serveur', { originalError: error.message }));
  }
};

/**
 * Approuver un document (ADMIN)
 */
const approuverDocument = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const adminId = req.user.id;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

    if (!user.documentIdentite || user.documentIdentite.statutVerification !== 'EN_ATTENTE') {
      return res.status(400).json({ 
        success: false, 
        message: 'Aucun document en attente pour cet utilisateur',
        code: 'NO_PENDING_DOCUMENT'
      });
    }

    const ancienStatut = user.documentIdentite.statutVerification;

    user.documentIdentite.statutVerification = 'VERIFIE';
    user.documentIdentite.dateVerification = new Date();
    user.documentIdentite.verificateurId = adminId;
    user.documentIdentite.raisonRejet = null;

    user.historiqueStatuts = user.historiqueStatuts || [];
    user.historiqueStatuts.push({
      ancienStatut,
      nouveauStatut: 'VERIFIE',
      raison: 'Approbation manuelle par administrateur',
      verificateurId: adminId,
      dateModification: new Date()
    });

    await user.save();

    try {
      await sendEmail({
        to: user.email,
        subject: '✅ Vérification de compte approuvée - WAYZ-ECO',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #28a745;">✅ Vérification approuvée !</h2>
            <p>Bonjour ${user.prenom},</p>
            <p>Excellente nouvelle ! Votre document d'identité a été vérifié et approuvé par notre équipe.</p>
            
            <div style="background-color: #d4edda; padding: 20px; border-radius: 8px; margin: 20px 0;">
              <h3 style="margin-top: 0; color: #155724;">Votre compte est maintenant entièrement vérifié</h3>
              <p style="margin-bottom: 0;">Vous avez maintenant accès à toutes les fonctionnalités de WAYZ-ECO !</p>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/dashboard" 
                 style="background-color: #28a745; color: white; padding: 15px 30px; 
                        text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                Accéder à mon compte
              </a>
            </div>

            <p>Merci de votre confiance !</p>
            <p style="color: #666; font-size: 14px;">L'équipe WAYZ-ECO</p>
          </div>
        `
      });
    } catch (notifErr) {
      logger.warn('Impossible d\'envoyer l\'email d\'approbation:', notifErr.message);
    }

    logger.info('Document approuvé', { userId, adminId });

    return res.json({ 
      success: true, 
      message: 'Document approuvé avec succès' 
    });
  } catch (error) {
    logger.error('Erreur approuver document:', error);
    return next(AppError.serverError('Erreur serveur', { originalError: error.message }));
  }
};

/**
 * Rejeter un document (ADMIN)
 */
const rejeterDocument = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { raison } = req.body;
    const adminId = req.user.id;

    if (!raison || raison.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Une raison détaillée est requise (minimum 10 caractères)',
        code: 'INVALID_REASON'
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

    if (!user.documentIdentite || user.documentIdentite.statutVerification !== 'EN_ATTENTE') {
      return res.status(400).json({ 
        success: false, 
        message: 'Aucun document en attente pour cet utilisateur',
        code: 'NO_PENDING_DOCUMENT'
      });
    }

    const ancienStatut = user.documentIdentite.statutVerification;

    user.documentIdentite.statutVerification = 'REJETE';
    user.documentIdentite.raisonRejet = raison.trim();
    user.documentIdentite.dateRejet = new Date();

    user.historiqueStatuts = user.historiqueStatuts || [];
    user.historiqueStatuts.push({
      ancienStatut,
      nouveauStatut: 'REJETE',
      raison: raison.trim(),
      verificateurId: adminId,
      dateModification: new Date()
    });

    await user.save();

    try {
      await sendEmail({
        to: user.email,
        subject: 'Document de vérification - Action requise - WAYZ-ECO',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #dc3545;">Document non validé</h2>
            <p>Bonjour ${user.prenom},</p>
            <p>Malheureusement, nous n'avons pas pu valider votre document d'identité.</p>
            
            <div style="background-color: #f8d7da; padding: 15px; border-left: 4px solid #dc3545; margin: 20px 0;">
              <h4 style="margin-top: 0; color: #721c24;">Raison du rejet :</h4>
              <p style="margin-bottom: 0;">${raison}</p>
            </div>

            <p><strong>Que faire maintenant ?</strong></p>
            <ol>
              <li>Vérifiez que votre document est valide et non expiré</li>
              <li>Assurez-vous que les photos sont claires et lisibles</li>
              <li>Soumettez de nouveaux documents via votre espace personnel</li>
            </ol>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/verification" 
                 style="background-color: #dc3545; color: white; padding: 15px 30px; 
                        text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                Soumettre de nouveaux documents
              </a>
            </div>

            <p style="color: #666;">Notre équipe reste à votre disposition pour toute question.</p>
            <p style="color: #666; font-size: 14px;">L'équipe WAYZ-ECO</p>
          </div>
        `
      });
    } catch (notifErr) {
      logger.warn('Impossible d\'envoyer l\'email de rejet:', notifErr.message);
    }

    logger.info('Document rejeté', { userId, adminId, raison });

    return res.json({ 
      success: true, 
      message: 'Document rejeté, utilisateur notifié' 
    });
  } catch (error) {
    logger.error('Erreur rejeter document:', error);
    return next(AppError.serverError('Erreur serveur', { originalError: error.message }));
  }
};

/**
 * Marquer un document comme en cours de révision (ADMIN)
 */
const marquerEnCoursRevision = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const adminId = req.user.id;

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

    if (!user.documentIdentite || user.documentIdentite.statutVerification !== 'EN_ATTENTE') {
      return res.status(400).json({
        success: false,
        message: 'Document non disponible pour révision ou déjà traité',
        code: 'DOCUMENT_NOT_AVAILABLE'
      });
    }

    user.historiqueStatuts = user.historiqueStatuts || [];
    user.historiqueStatuts.push({
      ancienStatut: user.documentIdentite.statutVerification,
      nouveauStatut: 'EN_COURS_REVISION',
      raison: `Document pris en révision par l'admin ${adminId}`,
      verificateurId: adminId,
      dateModification: new Date()
    });

    await user.save();

    logger.info('Document marqué en cours de révision', { userId, adminId });

    res.json({
      success: true,
      message: 'Document marqué en cours de révision'
    });

  } catch (error) {
    logger.error('Erreur marquage révision:', error);
    return next(AppError.serverError('Erreur serveur', { originalError: error.message }));
  }
};

/**
 * Obtenir l'historique des vérifications d'un utilisateur (ADMIN)
 */
const obtenirHistoriqueVerifications = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId)
      .select('nom prenom email historiqueStatuts documentIdentite')
      .populate('documentIdentite.verificateurId', 'nom prenom email');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

    const historiqueVerification = user.historiqueStatuts.filter(statut => 
      statut.nouveauStatut.includes('VERIFIE') || 
      statut.ancienStatut.includes('VERIFIE') ||
      statut.nouveauStatut.includes('EN_ATTENTE') ||
      statut.nouveauStatut.includes('REJETE') ||
      statut.raison.toLowerCase().includes('vérification') ||
      statut.raison.toLowerCase().includes('document')
    );

    const historique = {
      utilisateur: {
        id: user._id,
        nomComplet: `${user.prenom} ${user.nom}`,
        email: user.email
      },
      documentActuel: user.documentIdentite ? {
        type: user.documentIdentite.type,
        numero: user.documentIdentite.numero,
        statutVerification: user.documentIdentite.statutVerification,
        dateVerification: user.documentIdentite.dateVerification,
        verificateur: user.documentIdentite.verificateurId,
        raisonRejet: user.documentIdentite.raisonRejet,
        hasSelfie: !!user.documentIdentite.photoSelfie,
        documentUrl: genererUrlPublique(user.documentIdentite.photoDocument),
        selfieUrl: genererUrlPublique(user.documentIdentite.photoSelfie)
      } : null,
      historiqueStatuts: historiqueVerification,
      statistiques: {
        nombreChangementsStatut: historiqueVerification.length,
        derniereModification: historiqueVerification.length > 0 ? 
          historiqueVerification[historiqueVerification.length - 1].dateModification : null
      }
    };

    res.json({
      success: true,
      data: historique
    });

  } catch (error) {
    logger.error('Erreur historique vérifications:', error);
    return next(AppError.serverError('Erreur serveur', { originalError: error.message }));
  }
};

/**
 * Envoyer un rappel de vérification aux utilisateurs (ADMIN)
 */
const envoyerRappelVerification = async (req, res, next) => {
  try {
    const { userIds } = req.body;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Liste d\'utilisateurs requise',
        code: 'INVALID_INPUT'
      });
    }

    if (userIds.length > 100) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 100 utilisateurs par envoi',
        code: 'LIMIT_EXCEEDED'
      });
    }

    const utilisateurs = await User.find({
      _id: { $in: userIds },
      $or: [
        { documentIdentite: { $exists: false } },
        { 'documentIdentite.statutVerification': { $in: ['REJETE', null] } }
      ]
    }).select('nom prenom email');

    let envoisReussis = 0;
    let envoisEchoues = 0;
    const erreursDetail = [];

    for (let i = 0; i < utilisateurs.length; i++) {
      const user = utilisateurs[i];
      
      try {
        await sendEmail({
          to: user.email,
          subject: 'Vérifiez votre compte pour accéder à tous nos services - WAYZ-ECO',
          html: `
            <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
              <h2 style="color: #007bff;">Vérification de compte en attente</h2>
              <p>Bonjour ${user.prenom},</p>
              <p>Nous espérons que vous appréciez WAYZ-ECO ! Pour accéder à tous nos services et fonctionnalités, 
                 il ne vous reste plus qu'à vérifier votre identité.</p>
              
              <div style="background-color: #e3f2fd; padding: 20px; border-radius: 8px; margin: 20px 0;">
                <h3 style="margin-top: 0; color: #1976d2;">Pourquoi vérifier votre identité ?</h3>
                <ul style="color: #555;">
                  <li>✅ Accès complet à toutes les fonctionnalités</li>
                  <li>✅ Augmentation de votre score de confiance</li>
                  <li>✅ Possibilité de proposer des trajets (conducteurs)</li>
                  <li>✅ Transactions sécurisées</li>
                </ul>
              </div>

              <p><strong>C'est simple et rapide :</strong></p>
              <ol>
                <li>Prenez une photo claire de votre CNI ou passeport</li>
                <li>Prenez un selfie avec le document</li>
                <li>Téléchargez-les via votre espace personnel</li>
                <li>Nous vérifions sous 24-48h</li>
              </ol>

              <div style="text-align: center; margin: 30px 0;">
                <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/verification" 
                   style="background-color: #007bff; color: white; padding: 15px 30px; 
                          text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                  Vérifier mon identité maintenant
                </a>
              </div>

              <p style="color: #666; font-size: 14px;">
                Vos données sont protégées et utilisées uniquement pour la vérification de votre compte.
              </p>
            </div>
          `
        });
        
        envoisReussis++;
        
        if (i < utilisateurs.length - 1) {
          await new Promise(resolve => setTimeout(resolve, 100));
        }
      } catch (emailError) {
        logger.error(`Erreur envoi rappel à ${user.email}:`, emailError);
        envoisEchoues++;
        erreursDetail.push({
          email: user.email,
          erreur: emailError.message
        });
      }
    }

    logger.info('Rappels de vérification envoyés', { 
      envoisReussis, 
      envoisEchoues, 
      totalUtilisateurs: utilisateurs.length 
    });

    res.json({
      success: true,
      message: 'Rappels de vérification envoyés',
      data: {
        utilisateursCibles: utilisateurs.length,
        envoisReussis,
        envoisEchoues,
        ...(envoisEchoues > 0 && { erreursDetail })
      }
    });

  } catch (error) {
    logger.error('Erreur envoi rappels:', error);
    return next(AppError.serverError('Erreur serveur', { originalError: error.message }));
  }
};

/**
 * Obtenir les documents expirés ou à renouveler (ADMIN)
 */
const obtenirDocumentsExpires = async (req, res, next) => {
  try {
    const maintenant = new Date();
    const il2Ans = new Date();
    il2Ans.setFullYear(il2Ans.getFullYear() - 2);

    const documentsExpires = await User.find({
      'documentIdentite.statutVerification': 'VERIFIE',
      'documentIdentite.dateVerification': { $lt: il2Ans }
    }).select('nom prenom email documentIdentite');

    const il22Mois = new Date();
    il22Mois.setMonth(il22Mois.getMonth() - 22);

    const documentsARenouveler = await User.find({
      'documentIdentite.statutVerification': 'VERIFIE',
      'documentIdentite.dateVerification': { 
        $lt: il22Mois,
        $gte: il2Ans
      }
    }).select('nom prenom email documentIdentite');

    const documentsFormates = {
      expires: documentsExpires.map(user => ({
        userId: user._id,
        nomComplet: `${user.prenom} ${user.nom}`,
        email: user.email,
        typeDocument: user.documentIdentite.type,
        dateVerification: user.documentIdentite.dateVerification,
        anciennete: Math.floor((maintenant - user.documentIdentite.dateVerification) / (1000 * 60 * 60 * 24))
      })),
      aRenouveler: documentsARenouveler.map(user => ({
        userId: user._id,
        nomComplet: `${user.prenom} ${user.nom}`,
        email: user.email,
        typeDocument: user.documentIdentite.type,
        dateVerification: user.documentIdentite.dateVerification,
        anciennete: Math.floor((maintenant - user.documentIdentite.dateVerification) / (1000 * 60 * 60 * 24))
      }))
    };

    res.json({
      success: true,
      data: {
        ...documentsFormates,
        statistiques: {
          nombreExpires: documentsExpires.length,
          nombreARenouveler: documentsARenouveler.length,
          total: documentsExpires.length + documentsARenouveler.length
        }
      }
    });

  } catch (error) {
    logger.error('Erreur documents expirés:', error);
    return next(AppError.serverError('Erreur serveur', { originalError: error.message }));
  }
};

/**
 * Demander un renouvellement de vérification (ADMIN vers USER)
 */
const demanderRenouvellement = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const { raison } = req.body;

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

    if (user.documentIdentite) {
      const ancienStatut = user.documentIdentite.statutVerification;
      
      user.documentIdentite.statutVerification = 'EN_ATTENTE';
      user.documentIdentite.raisonRejet = raison || 'Renouvellement de vérification requis';
      user.documentIdentite.dateVerification = null;

      user.historiqueStatuts = user.historiqueStatuts || [];
      user.historiqueStatuts.push({
        ancienStatut,
        nouveauStatut: 'EN_ATTENTE',
        raison: raison || 'Demande de renouvellement',
        dateModification: new Date()
      });
    }

    await user.save();

    try {
      await sendEmail({
        to: user.email,
        subject: 'Renouvellement de vérification requis - WAYZ-ECO',
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
            <h2 style="color: #ff6b35;">Renouvellement de vérification requis</h2>
            <p>Bonjour ${user.prenom},</p>
            <p>Dans le cadre de nos mesures de sécurité, nous vous demandons de renouveler 
               la vérification de votre document d'identité.</p>
            
            ${raison ? `
            <div style="background-color: #fff3cd; padding: 15px; border-left: 4px solid #ff6b35; margin: 20px 0;">
              <h4 style="margin-top: 0; color: #856404;">Raison :</h4>
              <p style="margin-bottom: 0;">${raison}</p>
            </div>
            ` : ''}

            <p>Veuillez soumettre de nouveaux documents via votre espace personnel.</p>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:3000'}/verification" 
                 style="background-color: #ff6b35; color: white; padding: 15px 30px; 
                        text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
                Renouveler ma vérification
              </a>
            </div>

            <p style="color: #666;">Merci de votre compréhension et de votre coopération.</p>
          </div>
        `
      });
    } catch (emailError) {
      logger.error('Erreur envoi email renouvellement:', emailError);
    }

    logger.info('Renouvellement de vérification demandé', { userId, raison });

    res.json({
      success: true,
      message: 'Demande de renouvellement envoyée avec succès'
    });

  } catch (error) {
    logger.error('Erreur demande renouvellement:', error);
    return next(AppError.serverError('Erreur serveur', { originalError: error.message }));
  }
};

/**
 * Approuver en lot plusieurs documents (ADMIN)
 */
const approuverEnLot = async (req, res, next) => {
  try {
    const { userIds } = req.body;
    const adminId = req.user.id;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Liste d\'utilisateurs requise',
        code: 'INVALID_INPUT'
      });
    }

    if (userIds.length > 50) {
      return res.status(400).json({
        success: false,
        message: 'Maximum 50 documents par lot',
        code: 'LIMIT_EXCEEDED'
      });
    }

    const utilisateurs = await User.find({
      _id: { $in: userIds },
      'documentIdentite.statutVerification': 'EN_ATTENTE'
    });

    if (utilisateurs.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Aucun document en attente trouvé pour les IDs fournis',
        code: 'NO_PENDING_DOCUMENTS'
      });
    }

    const dateVerification = new Date();
    const bulkOps = utilisateurs.map(user => ({
      updateOne: {
        filter: { _id: user._id },
        update: {
          $set: {
            'documentIdentite.statutVerification': 'VERIFIE',
            'documentIdentite.dateVerification': dateVerification,
            'documentIdentite.verificateurId': adminId,
            'documentIdentite.raisonRejet': null
          },
          $push: {
            historiqueStatuts: {
              ancienStatut: 'EN_ATTENTE',
              nouveauStatut: 'VERIFIE',
              raison: 'Approbation en lot',
              verificateurId: adminId,
              dateModification: dateVerification
            }
          }
        }
      }
    }));

    const result = await User.bulkWrite(bulkOps);

    logger.info('Approbation en lot effectuée', { 
      approbationsReussies: result.modifiedCount, 
      adminId 
    });

    res.json({
      success: true,
      message: 'Approbation en lot terminée',
      data: {
        utilisateursCibles: utilisateurs.length,
        approbationsReussies: result.modifiedCount,
        approbationsEchouees: utilisateurs.length - result.modifiedCount
      }
    });

  } catch (error) {
    logger.error('Erreur approbation en lot:', error);
    return next(AppError.serverError('Erreur serveur', { originalError: error.message }));
  }
};

// =====================================================
// EXPORTS
// =====================================================

module.exports = {
  // Fonctions UTILISATEUR (Flutter compatible)
  soumettreVerification,
  obtenirStatutVerification,
  annulerVerification,
  
  // Fonctions ADMIN
  obtenirDocumentsEnAttente,
  telechargerPhotoDocument,
  approuverDocument,
  rejeterDocument,
  marquerEnCoursRevision,
  obtenirHistoriqueVerifications,
  envoyerRappelVerification,
  obtenirDocumentsExpires,
  demanderRenouvellement,
  approuverEnLot,
  
  // Fonctions utilitaires
  validerDonneesVerification,
  validerDonneesDocument,
  supprimerFichierLocal,
  genererUrlPublique
};