// controllers/verificationController.js
// =====================================================
// CONTRÔLEUR DE VÉRIFICATION - Version Complète
// Compatible Admin + Flutter (2 images)
// =====================================================

const User = require('../models/Utilisateur');
const { logger } = require('../utils/logger');
const AppError = require('../utils/AppError');
const sendEmail = require('../utils/emailService');
const cloudinary = require('../utils/cloudinaryConfig');

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

// =====================================================
// FONCTIONS UTILITAIRES D'UPLOAD
// =====================================================

/**
 * Uploader un buffer vers Cloudinary (pour Flutter/Multer)
 * @param {Buffer} buffer - Buffer du fichier
 * @param {String} userId - ID de l'utilisateur
 * @param {String} type - Type d'upload ('document' ou 'selfie')
 * @returns {Promise<Object>} - {url, publicId}
 */
const uploaderBufferVersCloudinary = (buffer, userId, type = 'document') => {
  return new Promise((resolve, reject) => {
    const folder = type === 'selfie' 
      ? `wayz-eco/selfies/${userId}`
      : `wayz-eco/documents/${userId}`;

    const uploadStream = cloudinary.uploader.upload_stream(
      {
        folder: folder,
        resource_type: 'auto',
        transformation: [
          { quality: 'auto:good' },
          { fetch_format: 'auto' }
        ]
      },
      (error, result) => {
        if (error) {
          logger.error(`Erreur upload Cloudinary (${type}):`, error);
          reject(error);
        } else {
          resolve({
            url: result.secure_url,
            publicId: result.public_id
          });
        }
      }
    );

    // Convertir le buffer en stream
    const stream = require('stream');
    const bufferStream = new stream.PassThrough();
    bufferStream.end(buffer);
    bufferStream.pipe(uploadStream);
  });
};

/**
 * Uploader une image base64 vers Cloudinary (pour compatibilité)
 * @param {String} base64Image - Image en base64
 * @param {String} userId - ID de l'utilisateur
 * @returns {Promise<Object>} - {url, publicId}
 */
const uploaderBase64VersCloudinary = async (base64Image, userId) => {
  try {
    const result = await cloudinary.uploader.upload(base64Image, {
      folder: `wayz-eco/documents/${userId}`,
      resource_type: 'image',
      format: 'jpg',
      transformation: [
        { quality: 'auto:good' },
        { fetch_format: 'auto' }
      ]
    });

    return {
      url: result.secure_url,
      publicId: result.public_id
    };
  } catch (error) {
    logger.error('Erreur upload Cloudinary (base64):', error);
    throw new Error('Échec de l\'upload de l\'image');
  }
};

/**
 * Supprimer une image de Cloudinary
 * @param {String} publicId - Public ID Cloudinary
 */
const supprimerDeCloudinary = async (publicId) => {
  try {
    if (publicId) {
      await cloudinary.uploader.destroy(publicId);
      logger.info('Image supprimée de Cloudinary:', publicId);
    }
  } catch (error) {
    logger.warn('Erreur suppression Cloudinary:', error);
  }
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
    const userId = req.user.id;
    const { type, numero } = req.body;
    
    // Les fichiers uploadés via Multer
    const documentImage = req.files?.documentImage?.[0];
    const selfieImage = req.files?.selfieWithDocumentImage?.[0];

    logger.info('Soumission vérification:', { 
      userId, 
      type, 
      hasDocument: !!documentImage, 
      hasSelfie: !!selfieImage 
    });

    // Validation des données
    const erreursValidation = validerDonneesVerification(
      type, 
      numero, 
      !!documentImage, 
      !!selfieImage
    );

    if (erreursValidation.length > 0) {
      return res.status(400).json({
        success: false,
        message: 'Erreurs de validation',
        code: 'VALIDATION_ERROR',
        errors: erreursValidation
      });
    }

    // Récupérer l'utilisateur
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ 
        success: false, 
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

    // Vérifier si un document est déjà en attente
    if (user.documentIdentite?.statutVerification === STATUT_VERIFICATION.EN_ATTENTE) {
      return res.status(400).json({
        success: false,
        message: 'Une demande de vérification est déjà en cours de traitement',
        code: 'VERIFICATION_PENDING'
      });
    }

    // Vérifier si déjà vérifié
    if (user.documentIdentite?.statutVerification === STATUT_VERIFICATION.VERIFIE) {
      return res.status(400).json({
        success: false,
        message: 'Votre identité est déjà vérifiée',
        code: 'ALREADY_VERIFIED'
      });
    }

    const ancienStatut = user.documentIdentite?.statutVerification || STATUT_VERIFICATION.NON_SOUMIS;

    // ===== UPLOAD DU DOCUMENT VERS CLOUDINARY =====
    let documentUrl, documentPublicId;
    try {
      logger.info('Upload document vers Cloudinary...', { 
        size: documentImage.size, 
        mimetype: documentImage.mimetype 
      });

      const uploadResult = await uploaderBufferVersCloudinary(
        documentImage.buffer, 
        userId, 
        'document'
      );
      
      documentUrl = uploadResult.url;
      documentPublicId = uploadResult.publicId;

      logger.info('Document uploadé avec succès:', documentPublicId);
    } catch (uploadError) {
      logger.error('Erreur upload document:', uploadError);
      return res.status(500).json({
        success: false,
        message: 'Erreur lors du téléchargement du document',
        code: 'DOCUMENT_UPLOAD_ERROR',
        details: uploadError.message
      });
    }

    // ===== UPLOAD DU SELFIE VERS CLOUDINARY =====
    let selfieUrl, selfiePublicId;
    try {
      logger.info('Upload selfie vers Cloudinary...', { 
        size: selfieImage.size, 
        mimetype: selfieImage.mimetype 
      });

      const uploadResult = await uploaderBufferVersCloudinary(
        selfieImage.buffer, 
        userId, 
        'selfie'
      );
      
      selfieUrl = uploadResult.url;
      selfiePublicId = uploadResult.publicId;

      logger.info('Selfie uploadé avec succès:', selfiePublicId);
    } catch (uploadError) {
      logger.error('Erreur upload selfie:', uploadError);
      
      // Supprimer le document déjà uploadé
      await supprimerDeCloudinary(documentPublicId);

      return res.status(500).json({
        success: false,
        message: 'Erreur lors du téléchargement du selfie',
        code: 'SELFIE_UPLOAD_ERROR',
        details: uploadError.message
      });
    }

    // ===== SUPPRIMER LES ANCIENNES IMAGES =====
    if (user.documentIdentite?.cloudinaryPublicIdDocument) {
      await supprimerDeCloudinary(user.documentIdentite.cloudinaryPublicIdDocument);
    }
    if (user.documentIdentite?.cloudinaryPublicIdSelfie) {
      await supprimerDeCloudinary(user.documentIdentite.cloudinaryPublicIdSelfie);
    }

    // ===== MISE À JOUR DE L'UTILISATEUR =====
    if (!user.documentIdentite) {
      user.documentIdentite = {};
    }

    user.documentIdentite.type = type;
    user.documentIdentite.numero = numero.trim().toUpperCase();
    user.documentIdentite.photoDocument = documentUrl;
    user.documentIdentite.cloudinaryPublicIdDocument = documentPublicId;
    user.documentIdentite.photoSelfie = selfieUrl;
    user.documentIdentite.cloudinaryPublicIdSelfie = selfiePublicId;
    user.documentIdentite.statutVerification = STATUT_VERIFICATION.EN_ATTENTE;
    user.documentIdentite.dateUpload = new Date();
    user.documentIdentite.raisonRejet = null;

    // Ajouter à l'historique
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

    await user.save();

    logger.info('Vérification soumise avec succès', { 
      userId, 
      type,
      documentUrl,
      selfieUrl
    });

    // ===== ENVOYER EMAIL DE CONFIRMATION =====
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
    } catch (emailError) {
      logger.warn('Impossible d\'envoyer l\'email de confirmation:', emailError.message);
    }

    // ===== RÉPONSE DE SUCCÈS =====
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
        delaiTraitement: '24-48 heures'
      }
    });

  } catch (error) {
    logger.error('Erreur soumission vérification:', error);
    return next(new AppError('Une erreur est survenue lors de la soumission', 500, { 
      originalError: error.message 
    }));
  }
};

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
    const userId = req.user.id;

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

    // Supprimer les images de Cloudinary
    if (user.documentIdentite.cloudinaryPublicIdDocument) {
      await supprimerDeCloudinary(user.documentIdentite.cloudinaryPublicIdDocument);
    }
    if (user.documentIdentite.cloudinaryPublicIdSelfie) {
      await supprimerDeCloudinary(user.documentIdentite.cloudinaryPublicIdSelfie);
    }

    // Réinitialiser les données
    user.documentIdentite = {
      type: null,
      numero: null,
      photoDocument: null,
      photoSelfie: null,
      cloudinaryPublicIdDocument: null,
      cloudinaryPublicIdSelfie: null,
      statutVerification: STATUT_VERIFICATION.NON_SOUMIS,
      dateUpload: null
    };

    user.historiqueStatuts = user.historiqueStatuts || [];
    user.historiqueStatuts.push({
      ancienStatut: STATUT_VERIFICATION.EN_ATTENTE,
      nouveauStatut: STATUT_VERIFICATION.NON_SOUMIS,
      raison: 'Annulation par l\'utilisateur',
      dateModification: new Date()
    });

    await user.save();

    logger.info('Vérification annulée', { userId });

    return res.json({
      success: true,
      message: 'Demande de vérification annulée avec succès'
    });

  } catch (error) {
    logger.error('Erreur annulation vérification:', error);
    return next(new AppError('Erreur lors de l\'annulation', 500, { 
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
        photoDocumentUrl: u.documentIdentite.photoDocument,
        photoSelfieUrl: u.documentIdentite.photoSelfie,
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
        photoDocumentUrl: user.documentIdentite.photoDocument,
        photoSelfieUrl: user.documentIdentite.photoSelfie || null,
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
        hasSelfie: !!user.documentIdentite.photoSelfie
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
  uploaderBufferVersCloudinary,
  uploaderBase64VersCloudinary,
  supprimerDeCloudinary
};