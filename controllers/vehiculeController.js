// controllers/vehiculeController.js

const Vehicule = require('../models/Vehicule');
const User = require('../models/Utilisateur');
const { logger } = require('../utils/logger');
const AppError = require('../utils/AppError');
const path = require('path');
const fs = require('fs').promises;

// =============== MÉTHODES CRUD STANDARD ===============

// controllers/vehiculeController.js - creerVehicule (MODIFIÉ)

/**
 * @desc    Créer un nouveau véhicule
 * @route   POST /api/vehicules
 * @access  Private (conducteur authentifié)
 */
const creerVehicule = async (req, res, next) => {
  try {
    logger.info('🚗 Tentative de création de véhicule', { 
      userId: req.user.userId,
      role: req.user.role ,
      req: req.body
    });

    // ===== VÉRIFICATIONS =====
    
    // 1. Vérifier que l'utilisateur est conducteur
    // if (req.user.role !== 'conducteur') {
    //   return res.status(403).json({
    //     success: false,
    //     message: 'Seuls les conducteurs peuvent ajouter des véhicules',
    //     code: 'NOT_DRIVER',
    //     action: 'Devenez conducteur via POST /api/auth/passer-conducteur'
    //   });
    // }

    // 2. Récupérer l'utilisateur complet
    const utilisateur = await User.findById(req.user.userId);
    
    if (!utilisateur) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé',
        code: 'USER_NOT_FOUND'
      });
    }

    // 3. Vérifier vérification d'identité
    if (utilisateur.documentIdentite?.statutVerification !== 'VERIFIE') {
      return res.status(403).json({
        success: false,
        message: 'Votre identité doit être vérifiée pour ajouter un véhicule',
        code: 'IDENTITY_NOT_VERIFIED',
        currentStatus: utilisateur.documentIdentite?.statutVerification || 'NON_SOUMIS'
      });
    }

    // ===== PRÉPARATION DES DONNÉES =====
    
    const vehiculeData = {
      ...req.body,
      proprietaireId: req.user.userId
    };

    // ===== PARSER LES CHAMPS JSON (envoyés en multipart/form-data) =====
    
    const champsJSON = ['equipements', 'commodites', 'preferences', 'assurance', 'visiteTechnique'];
    champsJSON.forEach(champ => {
      if (vehiculeData[champ] && typeof vehiculeData[champ] === 'string') {
        try {
          vehiculeData[champ] = JSON.parse(vehiculeData[champ]);
          logger.info(`✅ ${champ} parsé avec succès`);
        } catch (error) {
          logger.error(`❌ Erreur parsing ${champ}:`, error.message);
        }
      }
    });

    // Corriger le format de l'immatriculation si nécessaire (AB-123-111 → AB-123-AB)
    if (vehiculeData.immatriculation) {
      const immat = vehiculeData.immatriculation.toUpperCase();
      // Si format AB-123-111 (avec 3 chiffres à la fin au lieu de 2 lettres)
      const match = immat.match(/^([A-Z]{2})-(\d{3})-(\d+)$/);
      if (match) {
        // Convertir en format valide: AB-123-AB
        vehiculeData.immatriculation = `${match[1]}-${match[2]}-${match[1]}`;
        logger.info(`🔧 Immatriculation corrigée: ${immat} → ${vehiculeData.immatriculation}`);
      }
    }

    // Si c'est le premier véhicule, le définir comme principal
    const vehiculesExistants = await Vehicule.countDocuments({ 
      proprietaireId: req.user.userId 
    });
    
    if (vehiculesExistants === 0) {
      vehiculeData.estPrincipal = true;
      logger.info('✅ Premier véhicule → défini comme principal :');
    }

    // ===== GESTION DES PHOTOS MULTIPLES =====

    
    if (req.files && req.files.length > 0) {
      if (!vehiculeData.photos) vehiculeData.photos = {};
      
      const typesPhotos = [
        'avant', 'arriere', 'lateral_gauche', 
        'lateral_droit', 'interieur', 'tableau_bord'
      ];
      
      // 🔥 FIX: uploadVehiculeMultiple.any() retourne un tableau, pas un objet
      req.files.forEach(file => {
        const fieldName = file.fieldname;
        
        if (typesPhotos.includes(fieldName)) {
          vehiculeData.photos[fieldName] = `/uploads/vehicules/${file.filename}`;
          logger.info(`📸 Photo ${fieldName} ajoutée: ${file.filename}`);
        } else {
          logger.warn(`⚠️ Champ photo non reconnu: ${fieldName}`);
        }
      });
      
      logger.info(`✅ ${Object.keys(vehiculeData.photos).length}/${req.files.length} photos traitées`);
    }

    // ===== VALEURS PAR DÉFAUT POUR ÉQUIPEMENTS OBLIGATOIRES =====
    
    if (!vehiculeData.equipements) {
      vehiculeData.equipements = {};
    }
    
    // Assurer les champs obligatoires avec valeurs par défaut
    vehiculeData.equipements = {
      ceintures: 'TOUTES_PLACES',
      airbags: false,
      nombreAirbags: 0,
      abs: false,
      esp: false,
      trousseSecours: false,
      extincteur: false,
      triangleSignalisation: true,
      giletSecurite: true,
      roueDeSecours: true,
      cricCle: true,
      climatisation: false,
      vitresElectriques: false,
      verrouillagesCentralises: false,
      regulateurVitesse: false,
      ...vehiculeData.equipements // Écraser avec les valeurs fournies
    };

    // ===== CRÉATION DU VÉHICULE =====
    
    const nouveauVehicule = new Vehicule(vehiculeData);
    await nouveauVehicule.save();
    await nouveauVehicule.populate('proprietaireId', 'nom prenom email telephone photoProfil');

    logger.info('✅ Véhicule créé avec succès', { 
      vehiculeId: nouveauVehicule._id, 
      userId: req.user.userId,
      immatriculation: nouveauVehicule.immatriculation,
      statut: nouveauVehicule.statut
    });

    // ===== ANALYSE DE COMPLÉTUDE =====
    
    const documentsManquants = nouveauVehicule.documentsManquants();
    const documentsValidite = nouveauVehicule.documentsValides();

    // ===== RÉPONSE =====
    
    res.status(201).json({
      success: true,
      message: '🚗 Véhicule créé avec succès !',
      data: {
        vehicule: {
          id: nouveauVehicule._id,
          marque: nouveauVehicule.marque,
          modele: nouveauVehicule.modele,
          immatriculation: nouveauVehicule.immatriculation,
          couleur: nouveauVehicule.couleur,
          annee: nouveauVehicule.annee,
          nombrePlaces: nouveauVehicule.nombrePlaces,
          placesDisponibles: nouveauVehicule.placesDisponibles,
          statut: nouveauVehicule.statut,
          estPrincipal: nouveauVehicule.estPrincipal,
          documentsComplets: nouveauVehicule.documentsComplets,
          photos: nouveauVehicule.photos,
          proprietaire: {
            id: nouveauVehicule.proprietaireId._id,
            nom: nouveauVehicule.proprietaireId.nom,
            prenom: nouveauVehicule.proprietaireId.prenom,
            telephone: nouveauVehicule.proprietaireId.telephone
          }
        },
        documentsManquants: {
          liste: documentsManquants.manquants,
          nombre: documentsManquants.nombreManquants,
          pourcentageCompletion: documentsManquants.pourcentageCompletion
        },
        documentsValidite: documentsValidite
      },
      nextSteps: documentsManquants.complet 
        ? {
            etape: 2,
            action: 'ATTENDRE_VALIDATION',
            titre: 'Validation administrative',
            description: 'Votre véhicule est en attente de validation par notre équipe (24-48h)',
            statut: 'EN_ATTENTE_VERIFICATION'
          }
        : {
            etape: 2,
            action: 'COMPLETER_DOCUMENTS',
            titre: 'Complétez les documents manquants',
            description: `Il vous reste ${documentsManquants.nombreManquants} documents à fournir`,
            route: `/api/vehicules/${nouveauVehicule._id}/documents`,
            method: 'PUT',
            documentsManquants: documentsManquants.manquants
          }
    });

  } catch (error) {
    logger.error('❌ Erreur création véhicule:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Données invalides',
        code: 'VALIDATION_ERROR',
        errors: messages
      });
    }

    if (error.code === 11000) {
      return res.status(409).json({
        success: false,
        message: 'Un véhicule avec cette immatriculation existe déjà',
        code: 'DUPLICATE_VEHICLE'
      });
    }

    return next(AppError.serverError('Erreur lors de la création du véhicule', { 
      originalError: error.message 
    }));
  }
};

/**
 * @desc Obtenir tous les véhicules de l'utilisateur
 * @route GET /api/vehicules/mes-vehicules
 * @access Privé
 */
const obtenirMesVehicules = async (req, res, next) => {
  try {
    const { 
      page = 1, 
      limit = 10, 
      tri = 'createdAt', 
      ordre = 'desc',
      statut,
      documentsComplets
    } = req.query;
    
    const skip = (page - 1) * limit;

    logger.info('Récupération des véhicules', { 
      userId: req.user.userId,
      page,
      limit 
    });

    const criteres = { proprietaireId: req.user.userId };

    // Filtres optionnels
    if (statut) criteres.statut = statut;
    if (documentsComplets !== undefined) {
      criteres.documentsComplets = documentsComplets === 'true';
    }

    const sortOptions = {};
    sortOptions[tri] = ordre === 'desc' ? -1 : 1;
    
    if (tri !== 'estPrincipal') {
      sortOptions.estPrincipal = -1;
    }

    const vehicules = await Vehicule.find(criteres)
      .sort(sortOptions)
      .skip(skip)
      .limit(parseInt(limit))
      .populate('proprietaireId', 'nom prenom email telephone photoProfil');

    const total = await Vehicule.countDocuments(criteres);

    // Enrichir avec informations de validité
    const vehiculesEnrichis = vehicules.map(vehicule => {
      const vehiculeObj = vehicule.toObject();
      vehiculeObj.documentsValidite = vehicule.documentsValides();
      vehiculeObj.documentsManquants = vehicule.documentsManquants();
      vehiculeObj.scoreSecurity = vehicule.scoreSecurity;
      vehiculeObj.scoreConfort = vehicule.scoreConfort;
      vehiculeObj.tauxFiabilite = vehicule.tauxFiabilite;
      return vehiculeObj;
    });

    res.json({
      success: true,
      data: {
        vehicules: vehiculesEnrichis,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit),
          hasNext: page * limit < total,
          hasPrev: page > 1
        },
        statistiques: {
          total: vehicules.length,
          principal: vehicules.filter(v => v.estPrincipal).length,
          actifs: vehicules.filter(v => v.statut === 'ACTIF').length,
          disponibles: vehicules.filter(v => v.statut === 'DISPONIBLE').length,
          documentsComplets: vehicules.filter(v => v.documentsComplets).length
        }
      }
    });

  } catch (error) {
    logger.error('Erreur récupération véhicules:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération des véhicules'));
  }
};

/**
 * @desc Obtenir un véhicule spécifique
 * @route GET /api/vehicules/:vehiculeId
 * @access Privé
 */
const obtenirVehicule = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;
    
    if (!vehiculeId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'ID de véhicule invalide'
      });
    }

    const vehicule = await Vehicule.findOne({
      _id: vehiculeId,
      proprietaireId: req.user.userId
    }).populate('proprietaireId', 'nom prenom email telephone photo noteMoyenne estCertifie');

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    // Enrichir avec toutes les informations
    const vehiculeObj = vehicule.toObject();
    vehiculeObj.documentsValidite = vehicule.documentsValides();
    vehiculeObj.documentsManquants = vehicule.documentsManquants();
    vehiculeObj.scoreSecurity = vehicule.scoreSecurity;
    vehiculeObj.scoreConfort = vehicule.scoreConfort;
    vehiculeObj.tauxFiabilite = vehicule.tauxFiabilite;
    vehiculeObj.scoreEligibilite = vehicule.calculerScoreEligibilite();
    vehiculeObj.disponibilitePourTrajet = vehicule.estDisponiblePourTrajet();

    res.json({
      success: true,
      data: {
        vehicule: vehiculeObj
      }
    });

  } catch (error) {
    logger.error('Erreur récupération véhicule:', error);
    return next(AppError.serverError('Erreur serveur'));
  }
};

/**
 * @desc Modifier un véhicule
 * @route PUT /api/vehicules/:vehiculeId
 * @access Privé
 */
const modifierVehicule = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;
    
    if (!vehiculeId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'ID de véhicule invalide'
      });
    }

    const vehicule = await Vehicule.findOne({
      _id: vehiculeId,
      proprietaireId: req.user.userId
    });

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    // ===== PARSER LES CHAMPS JSON (envoyés en multipart/form-data) =====
    
    const champsJSON = ['equipements', 'commodites', 'preferences', 'assurance', 'visiteTechnique'];
    champsJSON.forEach(champ => {
      if (req.body[champ] && typeof req.body[champ] === 'string') {
        try {
          req.body[champ] = JSON.parse(req.body[champ]);
          logger.info(`✅ ${champ} parsé avec succès`);
        } catch (error) {
          logger.error(`❌ Erreur parsing ${champ}:`, error.message);
        }
      }
    });

    // Champs protégés
    const champsProteges = [
      'proprietaireId', '_id', 'createdAt', 'updatedAt', 
      'statistiques', 'validation', 'audit'
    ];
    
    // Mise à jour
    Object.keys(req.body).forEach(key => {
      if (!champsProteges.includes(key)) {
        if (typeof req.body[key] === 'object' && !Array.isArray(req.body[key])) {
          vehicule[key] = { ...vehicule[key], ...req.body[key] };
        } else {
          vehicule[key] = req.body[key];
        }
      }
    });

    // Gestion des nouvelles photos
    if (req.files && req.files.length > 0) {
      if (!vehicule.photos) vehicule.photos = {};
      
      const typesPhotos = ['avant', 'arriere', 'lateral_gauche', 'lateral_droit', 'interieur', 'tableau_bord'];
      
      // 🔥 FIX: uploadVehiculeMultiple.any() retourne un tableau
      for (const file of req.files) {
        const fieldName = file.fieldname;
        
        if (typesPhotos.includes(fieldName)) {
          // Supprimer l'ancienne photo
          if (vehicule.photos[fieldName] && vehicule.photos[fieldName].startsWith('/uploads/')) {
            try {
              const oldPath = path.join(process.cwd(), 'public', vehicule.photos[fieldName]);
              await fs.unlink(oldPath);
            } catch (err) {
              logger.warn(`Erreur suppression ancienne photo ${fieldName}:`, err);
            }
          }
          vehicule.photos[fieldName] = `/uploads/vehicules/${file.filename}`;
          logger.info(`📸 Photo ${fieldName} mise à jour`);
        }
      }
    }

    // Audit
    if (!vehicule.audit) vehicule.audit = { derniereModification: {}, tentativesAcces: [] };
    vehicule.audit.derniereModification = {
      date: new Date(),
      modifiePar: req.user.userId,
      champsModifies: Object.keys(req.body),
      raisonModification: req.body.raisonModification || 'Mise à jour utilisateur'
    };

    await vehicule.save();
    await vehicule.populate('proprietaireId', 'nom prenom email');

    logger.info('Véhicule mis à jour', { vehiculeId, userId: req.user.userId });
    
    res.json({
      success: true,
      message: 'Véhicule mis à jour avec succès',
      data: {
        vehicule,
        documentsManquants: vehicule.documentsManquants()
      }
    });

  } catch (error) {
    logger.error('Erreur mise à jour véhicule:', error);

    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Données invalides',
        erreurs: messages
      });
    }

    return next(AppError.serverError('Erreur serveur'));
  }
};

/**
 * @desc Supprimer un véhicule
 * @route DELETE /api/vehicules/:vehiculeId
 * @access Privé
 */
const supprimerVehicule = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;
    
    if (!vehiculeId.match(/^[0-9a-fA-F]{24}$/)) {
      return res.status(400).json({
        success: false,
        message: 'ID de véhicule invalide'
      });
    }

    const vehicule = await Vehicule.findOne({
      _id: vehiculeId,
      proprietaireId: req.user.userId
    });

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    // Empêcher la suppression si véhicule en course
    if (vehicule.statut === 'EN_COURSE') {
      return res.status(400).json({
        success: false,
        message: 'Impossible de supprimer un véhicule en course active'
      });
    }

    // Gérer le véhicule principal
    if (vehicule.estPrincipal) {
      const autresVehicules = await Vehicule.find({
        proprietaireId: req.user.userId,
        _id: { $ne: vehiculeId }
      });

      if (autresVehicules.length > 0) {
        await autresVehicules[0].definirCommePrincipal();
      }
    }

    // Supprimer toutes les photos
    const typesPhotos = ['avant', 'arriere', 'lateral_gauche', 'lateral_droit', 'interieur', 'tableau_bord'];
    for (const type of typesPhotos) {
      if (vehicule.photos?.[type] && vehicule.photos[type].startsWith('/uploads/')) {
        try {
          const photoPath = path.join(process.cwd(), 'public', vehicule.photos[type]);
          await fs.unlink(photoPath);
        } catch (err) {
          logger.warn(`Erreur suppression photo ${type}:`, err);
        }
      }
    }

    await Vehicule.findByIdAndDelete(vehiculeId);
    
    logger.info('Véhicule supprimé', { vehiculeId, userId: req.user.userId });
    
    res.json({
      success: true,
      message: 'Véhicule supprimé avec succès'
    });

  } catch (error) {
    logger.error('Erreur suppression véhicule:', error);
    return next(AppError.serverError('Erreur serveur'));
  }
};

// =============== GESTION DES DOCUMENTS ===============

/**
 * @desc Compléter les documents d'un véhicule
 * @route PUT /api/vehicules/:vehiculeId/documents
 * @access Privé
 */
const completerDocuments = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;
    const documents = { ...req.body };

    // Logger les fichiers reçus
    if (req.files && req.files.length > 0) {
      logger.info('📎 Fichiers de documents reçus:', {
        count: req.files.length,
        files: req.files.map(f => ({ fieldname: f.fieldname, filename: f.filename }))
      });
      
      // Traiter les fichiers de documents
      req.files.forEach(file => {
        const relativePath = `/uploads/vehicules/${file.filename}`;
        
        switch (file.fieldname) {
          case 'documentCarteGrise':
            if (!documents.carteGrise) documents.carteGrise = {};
            documents.carteGrise.documentUrl = relativePath;
            logger.info(`  ✅ Document carte grise: ${relativePath}`);
            break;
            
          case 'documentAssurance':
            if (!documents.assurance) documents.assurance = {};
            documents.assurance.attestationUrl = relativePath;
            logger.info(`  ✅ Attestation assurance: ${relativePath}`);
            break;
            
          case 'documentVisite':
            if (!documents.visiteTechnique) documents.visiteTechnique = {};
            documents.visiteTechnique.certificatUrl = relativePath;
            logger.info(`  ✅ Certificat visite technique: ${relativePath}`);
            break;
            
          case 'photoVignette':
            if (!documents.vignette) documents.vignette = {};
            documents.vignette.photoVignette = relativePath;
            logger.info(`  ✅ Photo vignette: ${relativePath}`);
            break;
            
          case 'documentCarteTransport':
            if (!documents.carteTransport) documents.carteTransport = {};
            documents.carteTransport.documentUrl = relativePath;
            logger.info(`  ✅ Document carte transport: ${relativePath}`);
            break;
            
          default:
            logger.warn(`  ⚠️ Champ de fichier non reconnu: ${file.fieldname}`);
        }
      });
    }

    // Parser les champs JSON envoyés en multipart/form-data
    const champsJSON = ['carteGrise', 'assurance', 'visiteTechnique', 'vignette', 'carteTransport'];
    champsJSON.forEach(champ => {
      if (documents[champ] && typeof documents[champ] === 'string') {
        try {
          documents[champ] = JSON.parse(documents[champ]);
          logger.info(`  📝 ${champ} parsé depuis JSON`);
        } catch (e) {
          logger.warn(`  ⚠️ Impossible de parser ${champ}:`, e.message);
        }
      }
    });

    const vehicule = await Vehicule.findOne({
      _id: vehiculeId,
      proprietaireId: req.user.userId
    }).populate('proprietaireId', 'nom prenom email telephone');

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    await vehicule.completerDocuments(documents);

    const documentsManquants = vehicule.documentsManquants();
    const documentsValidite = vehicule.documentsValides();

    logger.info('Documents complétés', { 
      vehiculeId, 
      userId: req.user.userId,
      complet: documentsManquants.complet
    });

    res.json({
      success: true,
      message: documentsManquants.complet 
        ? 'Documents complétés ! Votre véhicule est en attente de vérification administrative'
        : 'Documents mis à jour',
      data: {
        vehicule,
        documentsManquants,
        documentsValidite,
        statut: vehicule.statut,
        pourcentageCompletion: documentsManquants.pourcentageCompletion
      }
    });

  } catch (error) {
    logger.error('Erreur complétion documents:', error);
    return next(AppError.serverError('Erreur serveur'));
  }
};

/**
 * @desc Vérifier validité des documents
 * @route GET /api/vehicules/:vehiculeId/validite-documents
 * @access Privé
 */
const verifierValiditeDocuments = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;

    const vehicule = await Vehicule.findOne({
      _id: vehiculeId,
      proprietaireId: req.user.userId
    });

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    const validite = vehicule.documentsValides();

    res.json({
      success: true,
      data: {
        vehicule: {
          id: vehicule._id,
          immatriculation: vehicule.immatriculation,
          marque: vehicule.marque,
          modele: vehicule.modele
        },
        documentsValidite: validite,
        recommandations: validite.alertes.filter(a => a.severite === 'CRITIQUE').length > 0
          ? 'Action urgente requise : documents expirés'
          : validite.alertes.length > 0
          ? 'Renouvelez vos documents bientôt'
          : 'Tous les documents sont valides'
      }
    });

  } catch (error) {
    logger.error('Erreur vérification documents:', error);
    return next(AppError.serverError('Erreur serveur'));
  }
};

/**
 * @desc Obtenir documents expirés/proches expiration
 * @route GET /api/vehicules/documents-expires
 * @access Privé
 */
const obtenirDocumentsExpires = async (req, res, next) => {
  try {
    const { joursAvance = 30 } = req.query;

    const vehiculesExpires = await Vehicule.documentsExpiresOuBientot(parseInt(joursAvance));
    
    const vehiculesUtilisateur = vehiculesExpires.filter(
      v => v.proprietaireId.toString() === req.user.userId
    );

    const vehiculesAvecAlertes = vehiculesUtilisateur.map(vehicule => {
      const vehiculeObj = vehicule.toObject();
      vehiculeObj.alertes = vehicule.genererAlertes();
      vehiculeObj.documentsValidite = vehicule.documentsValides();
      return vehiculeObj;
    });

    res.json({
      success: true,
      data: {
        vehicules: vehiculesAvecAlertes,
        statistiques: {
          total: vehiculesAvecAlertes.length,
          critiques: vehiculesAvecAlertes.filter(v => 
            v.alertes.some(a => a.severite === 'CRITIQUE')
          ).length,
          avertissements: vehiculesAvecAlertes.filter(v => 
            v.alertes.some(a => a.severite === 'ELEVE')
          ).length
        }
      }
    });

  } catch (error) {
    logger.error('Erreur documents expirés:', error);
    return next(AppError.serverError('Erreur serveur'));
  }
};

// =============== GESTION COVOITURAGE ===============

/**
 * @desc Activer véhicule pour covoiturage
 * @route POST /api/vehicules/:vehiculeId/activer-covoiturage
 * @access Privé
 */
const activerPourCovoiturage = async (req, res, next) => {
  let vehicule; 
  try {
    const { vehiculeId } = req.params;

    vehicule = await Vehicule.findOne({
      _id: vehiculeId,
      proprietaireId: req.user.userId
    });

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    await vehicule.activerPourCovoiturage();

    logger.info('Véhicule activé pour covoiturage', { vehiculeId, userId: req.user.userId });

    res.json({
      success: true,
      message: 'Véhicule activé pour le covoiturage',
      data: {
        vehicule,
        scoreEligibilite: vehicule.calculerScoreEligibilite()
      }
    });

  } catch (error) {
    logger.error('Erreur activation covoiturage:', error);
    
    if (error.message.includes('documents invalides') || 
        error.message.includes('non validé') ||
        error.message.includes('Équipements')) {
      return res.status(400).json({
        success: false,
        message: error.message,
        details: vehicule ? vehicule.documentsValides() : null
      });
    }

    return next(AppError.serverError('Erreur serveur'));
  }
};

/**
 * @desc Désactiver véhicule pour covoiturage
 * @route POST /api/vehicules/:vehiculeId/desactiver-covoiturage
 * @access Privé
 */
const desactiverPourCovoiturage = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;
    const { raison } = req.body;

    const vehicule = await Vehicule.findOne({
      _id: vehiculeId,
      proprietaireId: req.user.userId
    });

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    await vehicule.desactiverPourCovoiturage(raison);

    logger.info('Véhicule désactivé pour covoiturage', { vehiculeId, raison, userId: req.user.userId });

    res.json({
      success: true,
      message: 'Véhicule désactivé pour le covoiturage',
      data: { vehicule }
    });

  } catch (error) {
    logger.error('Erreur désactivation covoiturage:', error);
    return next(AppError.serverError('Erreur serveur'));
  }
};

/**
 * @desc Vérifier disponibilité pour trajet
 * @route GET /api/vehicules/:vehiculeId/disponibilite-trajet
 * @access Privé
 */
const verifierDisponibiliteTrajet = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;
    const { nombrePlaces = 1 } = req.query;

    const vehicule = await Vehicule.findOne({
      _id: vehiculeId,
      proprietaireId: req.user.userId
    });

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    const disponibilite = vehicule.estDisponiblePourTrajet(parseInt(nombrePlaces));

    res.json({
      success: true,
      data: {
        vehicule: {
          id: vehicule._id,
          immatriculation: vehicule.immatriculation,
          marque: vehicule.marque,
          modele: vehicule.modele,
          placesDisponibles: vehicule.placesDisponibles
        },
        disponibilite: disponibilite.disponible,
        raisons: disponibilite.raisons,
        scoreEligibilite: disponibilite.score
      }
    });

  } catch (error) {
    logger.error('Erreur vérification disponibilité:', error);
    return next(AppError.serverError('Erreur serveur'));
  }
};

/**
 * @desc Rechercher véhicules disponibles (pour matching)
 * @route GET /api/vehicules/disponibles
 * @access Privé
 */
const rechercherVehiculesDisponibles = async (req, res, next) => {
  try {
    const criteres = {
      nombrePlacesMin: req.query.nombrePlaces,
      noteMinimale: req.query.noteMin,
      ville: req.query.ville,
      anneeMinimum: req.query.anneeMin,
      carburant: req.query.carburant,
      equipements: {},
      commodites: {},
      preferences: {}
    };

    // Parse équipements
    if (req.query.climatisation) criteres.equipements.climatisation = true;
    if (req.query.wifi) criteres.commodites.wifi = true;
    if (req.query.chargeur) criteres.commodites.chargeurTelephone = true;
    if (req.query.animaux) criteres.preferences.animauxAutorises = req.query.animaux === 'true';
    if (req.query.fumeur) criteres.preferences.fumeurAutorise = req.query.fumeur === 'true';

    const vehicules = await Vehicule.trouverDisponibles(criteres);

    // Enrichir résultats
    const vehiculesEnrichis = vehicules.map(v => ({
      ...v.toObject(),
      scoreSecurity: v.scoreSecurity,
      scoreConfort: v.scoreConfort,
      tauxFiabilite: v.tauxFiabilite
    }));

    res.json({
      success: true,
      data: {
        vehicules: vehiculesEnrichis,
        total: vehiculesEnrichis.length
      }
    });

  } catch (error) {
    logger.error('Erreur recherche véhicules disponibles:', error);
    return next(AppError.serverError('Erreur serveur'));
  }
};

// =============== GESTION MAINTENANCE ===============

/**
 * @desc Ajouter une entrée de maintenance
 * @route POST /api/vehicules/:vehiculeId/maintenance
 * @access Privé
 */
const ajouterMaintenance = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;
    const maintenanceData = req.body;

    const vehicule = await Vehicule.findOne({
      _id: vehiculeId,
      proprietaireId: req.user.userId
    });

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    await vehicule.ajouterMaintenance(maintenanceData);

    logger.info('Maintenance ajoutée', { vehiculeId, type: maintenanceData.type });

    res.json({
      success: true,
      message: 'Entrée de maintenance ajoutée',
      data: {
        vehicule,
        maintenance: vehicule.maintenance
      }
    });

  } catch (error) {
    logger.error('Erreur ajout maintenance:', error);
    return next(AppError.serverError('Erreur serveur'));
  }
};

/**
 * @desc Mettre à jour position du véhicule
 * @route PUT /api/vehicules/:vehiculeId/position
 * @access Privé
 */
const mettreAJourPosition = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;
    const { latitude, longitude, adresse, ville } = req.body;

    if (!latitude || !longitude) {
      return res.status(400).json({
        success: false,
        message: 'Latitude et longitude requises'
      });
    }

    const vehicule = await Vehicule.findOne({
      _id: vehiculeId,
      proprietaireId: req.user.userId
    });

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    await vehicule.mettreAJourPosition(latitude, longitude, adresse, ville);

    res.json({
      success: true,
      message: 'Position mise à jour',
      data: {
        dernierePosition: vehicule.dernierePosition
      }
    });

  } catch (error) {
    logger.error('Erreur mise à jour position:', error);
    return next(AppError.serverError('Erreur serveur'));
  }
};

// =============== GESTION ADMINISTRATIVE ===============

/**
 * @desc Notifier le propriétaire des documents manquants (Admin) - Sans bloquer validation future
 * @route POST /api/vehicules/:vehiculeId/notifier-documents-manquants
 * @access Privé (Admin)
 */
const notifierProprietaireDocumentsManquants = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;
    const { messagePersonnalise } = req.body;

    const vehicule = await Vehicule.findById(vehiculeId)
      .populate('proprietaireId', 'nom prenom email telephone');

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    // ===== VÉRIFIER LES DOCUMENTS MANQUANTS =====
    const documentsManquants = vehicule.documentsManquants();
    
    if (!documentsManquants || documentsManquants.manquants.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Aucun document manquant. Le véhicule est complet à 100%.',
        code: 'DOCUMENTS_COMPLETS',
        pourcentageCompletion: documentsManquants.pourcentageCompletion
      });
    }

    // ===== ENVOYER LA NOTIFICATION =====
    await notifierDocumentsManquants(vehicule, documentsManquants.manquants, messagePersonnalise);

    // ===== ENREGISTRER L'ACTION DANS L'AUDIT =====
    if (!vehicule.audit) vehicule.audit = { derniereModification: {}, tentativesAcces: [] };
    vehicule.audit.tentativesAcces.push({
      date: new Date(),
      adminId: req.user.userId,
      action: 'NOTIFICATION_DOCUMENTS_MANQUANTS',
      details: {
        documentsManquants: documentsManquants.manquants,
        messagePersonnalise: messagePersonnalise || null
      }
    });
    await vehicule.save();

    logger.info('✅ Notification documents manquants envoyée par admin', {
      vehiculeId,
      adminId: req.user.userId,
      proprietaireId: vehicule.proprietaireId._id,
      documentsManquants: documentsManquants.manquants.length
    });

    res.json({
      success: true,
      message: 'Notification envoyée au propriétaire avec succès',
      data: {
        vehicule: {
          id: vehicule._id,
          immatriculation: vehicule.immatriculation,
          marque: vehicule.marque,
          modele: vehicule.modele,
          proprietaire: {
            nom: `${vehicule.proprietaireId.prenom} ${vehicule.proprietaireId.nom}`,
            email: vehicule.proprietaireId.email,
            telephone: vehicule.proprietaireId.telephone
          }
        },
        documentsManquants: {
          liste: documentsManquants.manquants,
          nombre: documentsManquants.nombreManquants,
          pourcentageCompletion: documentsManquants.pourcentageCompletion
        },
        notificationEnvoyee: true,
        canaux: {
          email: !!vehicule.proprietaireId.email,
          whatsapp: !!vehicule.proprietaireId.telephone
        }
      }
    });

  } catch (error) {
    logger.error('❌ Erreur notification documents manquants:', error);
    return next(AppError.serverError('Erreur serveur lors de l\'envoi de la notification'));
  }
};
/**
 * @desc Valider un véhicule (Admin)
 * @route POST /api/vehicules/:vehiculeId/valider
 * @access Privé (Admin)
 */
const validerVehicule = async (req, res, next) => {
  let vehicule = null;
  try {
    const { vehiculeId } = req.params;
    const { commentaire, forcerValidation } = req.body; // ✨ NOUVEAU: forcerValidation

    vehicule = await Vehicule.findById(vehiculeId)
      .populate('proprietaireId', 'nom prenom email telephone');

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    // ===== VÉRIFICATION DES DOCUMENTS MANQUANTS =====
    const documentsManquants = vehicule.documentsManquants();
    
    //  Si documents manquants ET validation non forcée → Bloquer
    if (documentsManquants && documentsManquants.manquants && documentsManquants.manquants.length > 0) {
      
      // Si l'admin ne force PAS la validation, on bloque
      if (!forcerValidation) {
        logger.warn('Tentative de validation avec documents manquants (non forcée)', {
          vehiculeId,
          adminId: req.user.userId,
          documentsManquants: documentsManquants.manquants
        });

        // Envoyer notification des documents manquants
        await notifierDocumentsManquants(vehicule, documentsManquants.manquants);

        return res.status(400).json({
          success: false,
          message: 'Impossible de valider le véhicule. Des documents sont manquants.',
          code: 'DOCUMENTS_MANQUANTS',
          documentsManquants: documentsManquants.manquants,
          nombreManquants: documentsManquants.nombreManquants,
          pourcentageCompletion: documentsManquants.pourcentageCompletion,
          notificationEnvoyee: true,
          suggestion: 'Utilisez forcerValidation: true pour valider malgré les documents manquants, ou utilisez POST /notifier-documents-manquants pour envoyer un message au propriétaire.'
        });
      } else {
        // ✨ Validation forcée malgré documents manquants
        logger.warn('⚠️ Validation FORCÉE avec documents manquants', {
          vehiculeId,
          adminId: req.user.userId,
          documentsManquants: documentsManquants.manquants,
          forcee: true
        });
      }
    }

    // ===== VALIDER LE VÉHICULE =====
    await vehicule.valider(req.user.userId, commentaire);

    logger.info('✅ Véhicule validé par admin', { 
      vehiculeId, 
      adminId: req.user.userId,
      proprietaire: vehicule.proprietaireId._id,
      forcee: !!forcerValidation,
      documentsComplets: documentsManquants.complet
    });

    // Envoyer notification de validation au propriétaire
    await notifierValidationVehicule(vehicule);

    res.json({
      success: true,
      message: forcerValidation 
        ? '✅ Véhicule validé avec succès (validation forcée malgré documents manquants)'
        : '✅ Véhicule validé avec succès',
      data: {
        vehicule,
        validation: vehicule.validation,
        validationForcee: !!forcerValidation,
        documentsManquants: documentsManquants.complet ? null : {
          liste: documentsManquants.manquants,
          nombre: documentsManquants.nombreManquants
        }
      }
    });

  } catch (error) {
    logger.error('❌ Erreur validation véhicule:', error);
    
    if (error.message.includes('documents incomplets')) {
      return res.status(400).json({
        success: false,
        message: error.message,
        documentsManquants: vehicule ? vehicule.documentsManquants() : null
      });
    }

    return next(AppError.serverError('Erreur serveur lors de la validation'));
  }
};

/**
 * Notifier le propriétaire des documents manquants
 * @private
 */
const notifierDocumentsManquants = async (vehicule, documentsManquants, messagePersonnalise = null) => {
  const EmailService = require('../services/emailService');
  const WhatsAppService = require('../services/whatsappService');
  
  const proprietaire = vehicule.proprietaireId;
  const nomComplet = `${proprietaire.prenom} ${proprietaire.nom}`;

  // Formater les noms des documents
  const documentsFormates = documentsManquants.map(doc => formatDocumentName(doc));

  // ===== MESSAGE PERSONNALISÉ PAR L'ADMIN (OPTIONNEL) =====
  const messageSupplement = messagePersonnalise 
    ? `\n\n📝 Message de l'équipe :\n${messagePersonnalise}\n`
    : '';

  // Préparer le message WhatsApp (texte simple)
  const messageWhatsApp = `Bonjour ${nomComplet},

🚗 Votre véhicule *${vehicule.marque} ${vehicule.modele}* (${vehicule.immatriculation}) ne peut pas être validé car les documents suivants sont manquants :

${documentsFormates.map((doc, index) => `${index + 1}. ${doc}`).join('\n')}${messageSupplement}

📱 Veuillez télécharger ces documents depuis votre application WAYZ-ECO pour que nous puissions valider votre véhicule.

Merci,
L'équipe WAYZ-ECO 🇨🇮`;

  try {
    // ===== PRIORITÉ 1 : EMAIL SI DISPONIBLE =====
    if (proprietaire.email) {
      await EmailService.envoyerEmail({
        to: proprietaire.email,
        subject: '📄 Documents manquants pour votre véhicule - WAYZ-ECO',
        template: 'documents-manquants',
        data: {
          nomComplet,
          vehicule: `${vehicule.marque} ${vehicule.modele}`,
          immatriculation: vehicule.immatriculation,
          documentsManquants: documentsFormates,
          listeDocuments: documentsFormates
            .map((doc, index) => `${index + 1}. ${doc}`)
            .join('\n'),
          messagePersonnalise: messagePersonnalise || null
        }
      });

      logger.info('✅ Email documents manquants envoyé', {
        vehiculeId: vehicule._id,
        proprietaireId: proprietaire._id,
        email: proprietaire.email,
        documentsManquants: documentsManquants.length
      });
    } 
    // ===== PRIORITÉ 2 : WHATSAPP SI PAS D'EMAIL =====
    else if (proprietaire.telephone) {
      await WhatsAppService.envoyerMessage(
        proprietaire.telephone,
        messageWhatsApp
      );

      logger.info('✅ WhatsApp documents manquants envoyé', {
        vehiculeId: vehicule._id,
        proprietaireId: proprietaire._id,
        telephone: proprietaire.telephone,
        documentsManquants: documentsManquants.length
      });
    } else {
      logger.warn('⚠️ Impossible d\'envoyer notification - ni email ni téléphone', {
        vehiculeId: vehicule._id,
        proprietaireId: proprietaire._id
      });
    }
  } catch (error) {
    logger.error('❌ Erreur envoi notification documents manquants:', {
      vehiculeId: vehicule._id,
      error: error.message,
      stack: error.stack
    });
    // On ne bloque pas le processus si la notification échoue
  }
};
/**
 * Notifier le propriétaire de la validation du véhicule
 * @private
 */
const notifierValidationVehicule = async (vehicule) => {
  const EmailService = require('../services/emailService');
  const WhatsAppService = require('../services/whatsappService');
  
  const proprietaire = vehicule.proprietaireId;
  const nomComplet = `${proprietaire.prenom} ${proprietaire.nom}`;

  // Message WhatsApp
  const messageWhatsApp = `Félicitations ${nomComplet} ! 🎉

✅ Votre véhicule *${vehicule.marque} ${vehicule.modele}* (${vehicule.immatriculation}) a été validé avec succès.

Vous pouvez maintenant commencer à l'utiliser pour vos trajets sur WAYZ-ECO.

🚗 Bonne route !
L'équipe WAYZ-ECO 🇨🇮`;

  try {
    // ===== PRIORITÉ 1 : EMAIL =====
    if (proprietaire.email) {
      await EmailService.envoyerEmail({
        to: proprietaire.email,
        subject: '✅ Votre véhicule a été validé - WAYZ-ECO',
        template: 'vehicule-valide',
        data: {
          nomComplet,
          vehicule: `${vehicule.marque} ${vehicule.modele}`,
          immatriculation: vehicule.immatriculation,
          dateValidation: new Date().toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          })
        }
      });

      logger.info('✅ Email validation véhicule envoyé', {
        vehiculeId: vehicule._id,
        proprietaireId: proprietaire._id,
        email: proprietaire.email
      });
    } 
    // ===== PRIORITÉ 2 : WHATSAPP =====
    else if (proprietaire.telephone) {
      await WhatsAppService.envoyerMessage(
        proprietaire.telephone,
        messageWhatsApp
      );

      logger.info('✅ WhatsApp validation véhicule envoyé', {
        vehiculeId: vehicule._id,
        proprietaireId: proprietaire._id,
        telephone: proprietaire.telephone
      });
    }
  } catch (error) {
    logger.error('❌ Erreur envoi notification validation:', {
      vehiculeId: vehicule._id,
      error: error.message
    });
    // On ne bloque pas le processus si la notification échoue
  }
};

/**
 * Formater le nom d'un document pour affichage
 * @private
 */
const formatDocumentName = (docCode) => {
  const documentNames = {
    carteGrise: 'Carte grise (certificat d\'immatriculation)',
    assurance: 'Attestation d\'assurance valide',
    visiteTechnique: 'Certificat de visite technique',
    permisConduire: 'Permis de conduire du propriétaire',
    photo: 'Photo du véhicule'
  };

  return documentNames[docCode] || docCode;
};

/**
 * @desc Rejeter un véhicule (Admin)
 * @route POST /api/vehicules/:vehiculeId/rejeter
 * @access Privé (Admin)
 */
const rejeterVehicule = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;
    const { raison } = req.body;

    if (!raison || raison.trim().length < 10) {
      return res.status(400).json({
        success: false,
        message: 'Raison du rejet requise (minimum 10 caractères)'
      });
    }

    const vehicule = await Vehicule.findById(vehiculeId)
      .populate('proprietaireId', 'nom prenom email telephone');

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    await vehicule.rejeter(raison, req.user.userId);

    logger.info('Véhicule rejeté par admin', { 
      vehiculeId, 
      adminId: req.user.userId,
      raison
    });

    // ✅ Envoyer notification au propriétaire
    await notifierRejetVehicule(vehicule, raison);

    res.json({
      success: true,
      message: 'Véhicule rejeté',
      data: {
        vehicule,
        raisonRejet: raison
      }
    });

  } catch (error) {
    logger.error('Erreur rejet véhicule:', error);
    return next(AppError.serverError('Erreur serveur'));
  }
};

/**
 * Notifier le propriétaire du rejet du véhicule
 * @private
 */
const notifierRejetVehicule = async (vehicule, raison) => {
  const EmailService = require('../services/emailService');
  const WhatsAppService = require('../services/whatsappService');
  
  const proprietaire = vehicule.proprietaireId;
  const nomComplet = `${proprietaire.prenom} ${proprietaire.nom}`;

  // Message WhatsApp
  const messageWhatsApp = `Bonjour ${nomComplet},

❌ Nous vous informons que votre véhicule *${vehicule.marque} ${vehicule.modele}* (${vehicule.immatriculation}) n'a pas pu être validé.

*Raison du rejet :*
${raison}

📱 Veuillez corriger les problèmes mentionnés et soumettre à nouveau votre véhicule depuis l'application WAYZ-ECO.

Notre équipe reste à votre disposition pour toute question.

L'équipe WAYZ-ECO 🇨🇮`;

  try {
    // ===== PRIORITÉ 1 : EMAIL =====
    if (proprietaire.email) {
      await EmailService.envoyerEmail({
        to: proprietaire.email,
        subject: '❌ Véhicule non validé - WAYZ-ECO',
        template: 'vehicule-rejete',
        data: {
          nomComplet,
          vehicule: `${vehicule.marque} ${vehicule.modele}`,
          immatriculation: vehicule.immatriculation,
          raison,
          dateRejet: new Date().toLocaleDateString('fr-FR', {
            day: 'numeric',
            month: 'long',
            year: 'numeric'
          })
        }
      });

      logger.info('✅ Email rejet véhicule envoyé', {
        vehiculeId: vehicule._id,
        proprietaireId: proprietaire._id,
        email: proprietaire.email
      });
    } 
    // ===== PRIORITÉ 2 : WHATSAPP =====
    else if (proprietaire.telephone) {
      await WhatsAppService.envoyerMessage(
        proprietaire.telephone,
        messageWhatsApp
      );

      logger.info('✅ WhatsApp rejet véhicule envoyé', {
        vehiculeId: vehicule._id,
        proprietaireId: proprietaire._id,
        telephone: proprietaire.telephone
      });
    }
  } catch (error) {
    logger.error('❌ Erreur envoi notification rejet:', {
      vehiculeId: vehicule._id,
      error: error.message
    });
    // On ne bloque pas le processus si la notification échoue
  }
};

/**
 * @desc Obtenir véhicules en attente de validation (Admin)
 * @route GET /api/vehicules/admin/en-attente-validation
 * @access Privé (Admin)
 */
const obtenirVehiculesEnAttenteValidation = async (req, res, next) => {
  try {
    const { page = 1, limit = 20 } = req.query;
    const skip = (page - 1) * limit;

    const vehicules = await Vehicule.enAttenteValidation()
      .skip(skip)
      .limit(parseInt(limit));

    const total = await Vehicule.countDocuments({
      documentsComplets: true,
      'validation.statutValidation': { $in: ['NON_VALIDE', 'EN_COURS'] },
      statut: 'EN_ATTENTE_VERIFICATION'
    });

    // Enrichir avec infos complètes
    const vehiculesEnrichis = vehicules.map(v => ({
      ...v.toObject(),
      documentsValidite: v.documentsValides(),
      scoreEligibilite: v.calculerScoreEligibilite(),
      scoreSecurity: v.scoreSecurity
    }));

    res.json({
      success: true,
      data: {
        vehicules: vehiculesEnrichis,
        pagination: {
          page: parseInt(page),
          limit: parseInt(limit),
          total,
          pages: Math.ceil(total / limit)
        }
      }
    });

  } catch (error) {
    logger.error('Erreur récupération véhicules en attente:', error);
    return next(AppError.serverError('Erreur serveur'));
  }
};

/**
 * @desc Ajouter un signalement
 * @route POST /api/vehicules/:vehiculeId/signaler
 * @access Privé
 */
const signalerVehicule = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;
    const { motif, description } = req.body;

    if (!motif || !description) {
      return res.status(400).json({
        success: false,
        message: 'Motif et description requis'
      });
    }

    const vehicule = await Vehicule.findById(vehiculeId);

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    await vehicule.ajouterSignalement({
      signalePar: req.user.userId,
      motif,
      description
    });

    logger.info('Véhicule signalé', { 
      vehiculeId, 
      signalePar: req.user.userId,
      motif 
    });

    res.json({
      success: true,
      message: 'Signalement enregistré',
      data: {
        signalement: vehicule.signalements[vehicule.signalements.length - 1]
      }
    });

  } catch (error) {
    logger.error('Erreur signalement:', error);
    return next(AppError.serverError('Erreur serveur'));
  }
};

/**
 * @desc Obtenir véhicules avec signalements (Admin)
 * @route GET /api/vehicules/admin/signalements
 * @access Privé (Admin)
 */
const obtenirVehiculesSignales = async (req, res, next) => {
  try {
    const vehicules = await Vehicule.avecSignalementsNonTraites();

    const vehiculesEnrichis = vehicules.map(v => ({
      ...v.toObject(),
      signalementsCritiques: v.signalements.filter(s => 
        ['DOCUMENTS_INVALIDES', 'SECURITE'].includes(s.motif) && !s.traite
      ).length
    }));

    res.json({
      success: true,
      data: {
        vehicules: vehiculesEnrichis,
        total: vehiculesEnrichis.length
      }
    });

  } catch (error) {
    logger.error('Erreur récupération signalements:', error);
    return next(AppError.serverError('Erreur serveur'));
  }
};

// =============== STATISTIQUES ===============

/**
 * @desc Obtenir statistiques des véhicules de l'utilisateur
 * @route GET /api/vehicules/statistiques
 * @access Privé
 */
const obtenirStatistiques = async (req, res, next) => {
  try {
    const stats = await Vehicule.aggregate([
      { $match: { proprietaireId: req.user.userId } },
      {
        $group: {
          _id: null,
          total: { $sum: 1 },
          actifs: { $sum: { $cond: [{ $eq: ['$statut', 'ACTIF'] }, 1, 0] } },
          disponibles: { $sum: { $cond: [{ $eq: ['$statut', 'DISPONIBLE'] }, 1, 0] } },
          enCourse: { $sum: { $cond: [{ $eq: ['$statut', 'EN_COURSE'] }, 1, 0] } },
          documentsComplets: { $sum: { $cond: ['$documentsComplets', 1, 0] } },
          avgAge: { $avg: { $subtract: [new Date().getFullYear(), '$annee'] } },
          totalTrajets: { $sum: '$statistiques.nombreTrajets' },
          totalPassagers: { $sum: '$statistiques.nombrePassagers' },
          totalKilometres: { $sum: '$statistiques.kilometresParcourus' },
          noteMoyenne: { $avg: '$statistiques.noteMoyenne' }
        }
      }
    ]);

    // Stats par carburant
    const statsCarburant = await Vehicule.aggregate([
      { $match: { proprietaireId: req.user.userId } },
      { $group: { _id: '$carburant', count: { $sum: 1 } } }
    ]);

    // Stats par statut
    const statsStatut = await Vehicule.aggregate([
      { $match: { proprietaireId: req.user.userId } },
      { $group: { _id: '$statut', count: { $sum: 1 } } }
    ]);

    const statistiques = stats[0] || {
      total: 0,
      actifs: 0,
      disponibles: 0,
      enCourse: 0,
      documentsComplets: 0,
      avgAge: 0,
      totalTrajets: 0,
      totalPassagers: 0,
      totalKilometres: 0,
      noteMoyenne: 0
    };

    res.json({
      success: true,
      data: {
        statistiques: {
          ...statistiques,
          ageMoyen: Math.round(statistiques.avgAge || 0),
          repartitionCarburant: statsCarburant.reduce((acc, s) => {
            acc[s._id || 'NON_SPECIFIE'] = s.count;
            return acc;
          }, {}),
          repartitionStatut: statsStatut.reduce((acc, s) => {
            acc[s._id] = s.count;
            return acc;
          }, {})
        }
      }
    });

  } catch (error) {
    logger.error('Erreur statistiques:', error);
    return next(AppError.serverError('Erreur serveur'));
  }
};

/**
 * @desc Obtenir statistiques globales (Admin)
 * @route GET /api/vehicules/admin/statistiques-globales
 * @access Privé (Admin)
 */
const obtenirStatistiquesGlobales = async (req, res, next) => {
  try {
    const stats = await Vehicule.statistiquesGlobales();

    res.json({
      success: true,
      data: { statistiques: stats }
    });

  } catch (error) {
    logger.error('Erreur statistiques globales:', error);
    return next(AppError.serverError('Erreur serveur'));
  }
};

/**
 * @desc Obtenir top véhicules par note
 * @route GET /api/vehicules/top-notes
 * @access Public
 */
const obtenirTopVehicules = async (req, res, next) => {
  try {
    const { limite = 10 } = req.query;

    const vehicules = await Vehicule.topParNote(parseInt(limite));

    const vehiculesEnrichis = vehicules.map(v => ({
      ...v.toPublicJSON(),
      scoreSecurity: v.scoreSecurity,
      scoreConfort: v.scoreConfort
    }));

    res.json({
      success: true,
      data: {
        vehicules: vehiculesEnrichis,
        total: vehiculesEnrichis.length
      }
    });

  } catch (error) {
    logger.error('Erreur top véhicules:', error);
    return next(AppError.serverError('Erreur serveur'));
  }
};

// =============== MÉTHODES SPÉCIFIQUES ===============

/**
 * @desc Définir véhicule comme principal
 * @route PATCH /api/vehicules/:vehiculeId/principal
 * @access Privé
 */
const definirVehiculePrincipal = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;

    const vehicule = await Vehicule.findOne({
      _id: vehiculeId,
      proprietaireId: req.user.userId
    });

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    if (vehicule.estPrincipal) {
      return res.status(400).json({
        success: false,
        message: 'Ce véhicule est déjà principal'
      });
    }

    await vehicule.definirCommePrincipal();

    logger.info('Véhicule défini comme principal', { vehiculeId, userId: req.user.userId });

    res.json({
      success: true,
      message: 'Véhicule défini comme principal',
      data: { vehicule }
    });

  } catch (error) {
    logger.error('Erreur définition principal:', error);
    return next(AppError.serverError('Erreur serveur'));
  }
};

/**
 * @desc Obtenir véhicule principal
 * @route GET /api/vehicules/principal
 * @access Privé
 */
const obtenirVehiculePrincipal = async (req, res, next) => {
  try {
    const vehiculePrincipal = await Vehicule.findOne({
      proprietaireId: req.user.userId,
      estPrincipal: true
    }).populate('proprietaireId', 'nom prenom email telephone photoProfil');

    if (!vehiculePrincipal) {
      return res.status(404).json({
        success: false,
        message: 'Aucun véhicule principal trouvé'
      });
    }

    const vehiculeObj = vehiculePrincipal.toObject();
    vehiculeObj.documentsValidite = vehiculePrincipal.documentsValides();
    vehiculeObj.scoreSecurity = vehiculePrincipal.scoreSecurity;
    vehiculeObj.scoreConfort = vehiculePrincipal.scoreConfort;

    res.json({
      success: true,
      data: { vehicule: vehiculeObj }
    });

  } catch (error) {
    logger.error('Erreur récupération véhicule principal:', error);
    return next(AppError.serverError('Erreur serveur'));
  }
};

/**
 * @desc Mettre à jour photos multiples
 * @route PUT /api/vehicules/:vehiculeId/photos
 * @access Privé
 */
const mettreAJourPhotos = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;

    if (!req.files || Object.keys(req.files).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Au moins une photo requise'
      });
    }

    const vehicule = await Vehicule.findOne({
      _id: vehiculeId,
      proprietaireId: req.user.userId
    });

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    if (!vehicule.photos) vehicule.photos = {};

    const typesPhotos = ['avant', 'arriere', 'lateral_gauche', 'lateral_droit', 'interieur', 'tableau_bord'];
    const photosAjoutees = [];

    // 🔥 FIX: uploadVehiculeMultiple.any() retourne un tableau
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const fieldName = file.fieldname;
        
        if (typesPhotos.includes(fieldName)) {
          // Supprimer ancienne photo
          if (vehicule.photos[fieldName] && vehicule.photos[fieldName].startsWith('/uploads/')) {
            try {
              const oldPath = path.join(process.cwd(), 'public', vehicule.photos[fieldName]);
              await fs.unlink(oldPath);
            } catch (err) {
              logger.warn(`Erreur suppression photo ${fieldName}:`, err);
            }
          }
          
          vehicule.photos[fieldName] = `/uploads/vehicules/${file.filename}`;
          photosAjoutees.push(fieldName);
          logger.info(`📸 Photo ${fieldName} ajoutée`);
        }
      }
    }

    await vehicule.save();

    logger.info('Photos mises à jour', { 
      vehiculeId, 
      photosAjoutees, 
      userId: req.user.userId 
    });

    res.json({
      success: true,
      message: `${photosAjoutees.length} photo(s) mise(s) à jour`,
      data: {
        vehicule,
        photosAjoutees,
        photos: vehicule.photos
      }
    });

  } catch (error) {
    logger.error('Erreur mise à jour photos:', error);
    return next(AppError.serverError('Erreur serveur'));
  }
};

/**
 * @desc Archiver véhicule
 * @route PATCH /api/vehicules/:vehiculeId/archiver
 * @access Privé
 */
const archiverVehicule = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;
    const { raison } = req.body;

    const vehicule = await Vehicule.findOne({
      _id: vehiculeId,
      proprietaireId: req.user.userId
    });

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    await vehicule.archiver(raison);

    logger.info('Véhicule archivé', { vehiculeId, raison, userId: req.user.userId });

    res.json({
      success: true,
      message: 'Véhicule archivé',
      data: { vehicule }
    });

  } catch (error) {
    logger.error('Erreur archivage:', error);
    return next(AppError.serverError('Erreur serveur'));
  }
};

/**
 * @desc Enregistrer un trajet complété
 * @route POST /api/vehicules/:vehiculeId/enregistrer-trajet
 * @access Privé
 */
const enregistrerTrajet = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;
    const { nombrePassagers, kilometresParcourus } = req.body;

    if (!nombrePassagers || nombrePassagers < 1) {
      return res.status(400).json({
        success: false,
        message: 'Nombre de passagers invalide'
      });
    }

    const vehicule = await Vehicule.findOne({
      _id: vehiculeId,
      proprietaireId: req.user.userId
    });

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    await vehicule.enregistrerTrajet(
      parseInt(nombrePassagers), 
      parseInt(kilometresParcourus) || 0
    );

    logger.info('Trajet enregistré', { 
      vehiculeId, 
      nombrePassagers, 
      kilometresParcourus,
      userId: req.user.userId 
    });

    res.json({
      success: true,
      message: 'Trajet enregistré',
      data: {
        statistiques: vehicule.statistiques,
        kilometrageTotal: vehicule.kilometrage
      }
    });

  } catch (error) {
    logger.error('Erreur enregistrement trajet:', error);
    return next(AppError.serverError('Erreur serveur'));
  }
};

/**
 * @desc Mettre à jour note du véhicule
 * @route POST /api/vehicules/:vehiculeId/noter
 * @access Privé
 */
const noterVehicule = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;
    const { note } = req.body;

    if (!note || note < 0 || note > 5) {
      return res.status(400).json({
        success: false,
        message: 'Note invalide (0-5 requis)'
      });
    }

    const vehicule = await Vehicule.findById(vehiculeId);

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    await vehicule.mettreAJourNote(parseFloat(note));

    logger.info('Note ajoutée', { vehiculeId, note, userId: req.user.userId });

    res.json({
      success: true,
      message: 'Note enregistrée',
      data: {
        noteMoyenne: vehicule.statistiques.noteMoyenne,
        nombreAvis: vehicule.statistiques.nombreAvis
      }
    });

  } catch (error) {
    logger.error('Erreur notation:', error);
    return next(AppError.serverError('Erreur serveur'));
  }
};

/**
 * @desc Recherche avancée de véhicules
 * @route GET /api/vehicules/recherche-avancee
 * @access Privé
 */
const rechercheAvancee = async (req, res, next) => {
  try {
    const filtres = {
      marque: req.query.marque,
      modele: req.query.modele,
      couleur: req.query.couleur,
      anneeMin: req.query.anneeMin ? parseInt(req.query.anneeMin) : undefined,
      anneeMax: req.query.anneeMax ? parseInt(req.query.anneeMax) : undefined,
      nombrePlacesMin: req.query.nombrePlaces ? parseInt(req.query.nombrePlaces) : undefined,
      noteMin: req.query.noteMin ? parseFloat(req.query.noteMin) : undefined,
      carburant: req.query.carburant,
      typeCarrosserie: req.query.typeCarrosserie,
      transmission: req.query.transmission,
      climatisation: req.query.climatisation === 'true',
      ville: req.query.ville,
      scoreSecuriteMin: req.query.scoreSecuriteMin ? parseInt(req.query.scoreSecuriteMin) : undefined
    };

    const vehicules = await Vehicule.rechercheAvancee(filtres);

    const vehiculesEnrichis = vehicules.map(v => ({
      ...v.toObject(),
      scoreSecurity: v.scoreSecurity,
      scoreConfort: v.scoreConfort,
      tauxFiabilite: v.tauxFiabilite
    }));

    res.json({
      success: true,
      data: {
        vehicules: vehiculesEnrichis,
        total: vehiculesEnrichis.length,
        filtresAppliques: Object.keys(filtres).filter(k => filtres[k] !== undefined)
      }
    });

  } catch (error) {
    logger.error('Erreur recherche avancée:', error);
    return next(AppError.serverError('Erreur serveur'));
  }
};

/**
 * @desc Obtenir véhicules nécessitant maintenance
 * @route GET /api/vehicules/maintenance-requise
 * @access Privé
 */
const obtenirVehiculesMaintenanceRequise = async (req, res, next) => {
  try {
    const vehicules = await Vehicule.maintenanceRequise();

        const vehiculesUtilisateur = vehicules.filter(v => {
      if (!v.proprietaireId) {
        logger.warn('Véhicule sans propriétaire trouvé', { vehiculeId: v._id });
        return false;
      }
      
      const proprietaireIdStr = typeof v.proprietaireId === 'string' 
        ? v.proprietaireId 
        : v.proprietaireId.toString();
      
      return proprietaireIdStr === req.user.userId;
    });

    const vehiculesEnrichis = vehiculesUtilisateur.map(v => {
      const vehiculeObj = v.toObject();
      
      const raisons = [];
      if (v.maintenance?.prochainEntretien && v.maintenance.prochainEntretien <= new Date()) {
        raisons.push('Date d\'entretien dépassée');
      }
      if (v.maintenance?.prochainEntretienKm && v.kilometrage >= v.maintenance.prochainEntretienKm) {
        raisons.push('Kilométrage d\'entretien atteint');
      }

      vehiculeObj.raisons = raisons;
      return vehiculeObj;
    });

    res.json({
      success: true,
      data: {
        vehicules: vehiculesEnrichis,
        total: vehiculesEnrichis.length
      }
    });

  } catch (error) {
    logger.error('Erreur maintenance requise:', error);
    return next(AppError.serverError('Erreur serveur'));
  }
};

/**
 * @desc Exporter données véhicule (PDF/Excel)
 * @route GET /api/vehicules/:vehiculeId/exporter
 * @access Privé
 */
const exporterDonneesVehicule = async (req, res, next) => {
  try {
    const { vehiculeId } = req.params;
    const { format = 'json' } = req.query;

    const vehicule = await Vehicule.findOne({
      _id: vehiculeId,
      proprietaireId: req.user.userId
    }).populate('proprietaireId', 'nom prenom email telephone');

    if (!vehicule) {
      return res.status(404).json({
        success: false,
        message: 'Véhicule non trouvé'
      });
    }

    const donneesExport = vehicule.toAdminJSON();

    if (format === 'json') {
      res.json({
        success: true,
        data: donneesExport
      });
    } else {
      // TODO: Implémenter export PDF/Excel
      res.status(501).json({
        success: false,
        message: 'Format non encore supporté'
      });
    }

  } catch (error) {
    logger.error('Erreur export:', error);
    return next(AppError.serverError('Erreur serveur'));
  }
};

// =============== EXPORTS ===============

module.exports = {
  // CRUD standard
  creerVehicule,
  obtenirMesVehicules,
  obtenirVehicule,
  modifierVehicule,
  supprimerVehicule,

  // Gestion documents
  completerDocuments,
  verifierValiditeDocuments,
  obtenirDocumentsExpires,

  // Covoiturage
  activerPourCovoiturage,
  desactiverPourCovoiturage,
  verifierDisponibiliteTrajet,
  rechercherVehiculesDisponibles,

  // Maintenance
  ajouterMaintenance,
  mettreAJourPosition,
  obtenirVehiculesMaintenanceRequise,

  // Administration
  validerVehicule,
  rejeterVehicule,
  notifierProprietaireDocumentsManquants,
  obtenirVehiculesEnAttenteValidation,
  signalerVehicule,
  obtenirVehiculesSignales,

  // Statistiques
  obtenirStatistiques,
  obtenirStatistiquesGlobales,
  obtenirTopVehicules,

  // Méthodes spécifiques
  definirVehiculePrincipal,
  obtenirVehiculePrincipal,
  mettreAJourPhotos,
  archiverVehicule,
  enregistrerTrajet,
  noterVehicule,
  rechercheAvancee,
  exporterDonneesVehicule
};