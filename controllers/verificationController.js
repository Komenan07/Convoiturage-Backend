// controllers/auth/verificationController-extensions.js
// Fonctions additionnelles pour le système de vérification

const User = require('../models/Utilisateur');
const { logger } = require('../utils/logger');
const AppError = require('../utils/AppError');
const sendEmail = require('../utils/emailService');

/**
 * Télécharger la photo d'un document (ADMIN)
 */
const telechargerPhotoDocument = async (req, res, next) => {
  try {
    const { userId } = req.params;

    const user = await User.findById(userId).select('documentIdentite nom prenom');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    if (!user.documentIdentite || !user.documentIdentite.photoDocument) {
      return res.status(404).json({
        success: false,
        message: 'Aucune photo de document disponible'
      });
    }

    // Si la photo est stockée en base64
    if (user.documentIdentite.photoDocument.startsWith('data:image/')) {
      const base64Data = user.documentIdentite.photoDocument.split(',')[1];
      const imageBuffer = Buffer.from(base64Data, 'base64');
      
      res.set({
        'Content-Type': 'image/jpeg',
        'Content-Disposition': `attachment; filename="document_${user.nom}_${user.prenom}.jpg"`
      });
      
      return res.send(imageBuffer);
    }

    // Si c'est une URL ou un chemin de fichier
    return res.json({
      success: true,
      photoUrl: user.documentIdentite.photoDocument
    });

  } catch (error) {
    logger.error('Erreur téléchargement photo document:', error);
    return next(AppError.serverError('Erreur serveur lors du téléchargement', { 
      originalError: error.message 
    }));
  }
};

/**
 * Marquer un document comme en cours de révision (ADMIN)
 */
const marquerEnCoursRevision = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const adminId = req.user.userId;

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    if (!user.documentIdentite || user.documentIdentite.statutVerification !== 'EN_ATTENTE') {
      return res.status(400).json({
        success: false,
        message: 'Document non disponible pour révision'
      });
    }

    // Ajouter une note interne ou un statut temporaire
    user.documentIdentite.enCoursRevision = {
      adminId,
      dateDebut: new Date()
    };

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
        message: 'Utilisateur non trouvé'
      });
    }

    // Filtrer l'historique lié à la vérification
    const historiqueVerification = user.historiqueStatuts.filter(statut => 
      statut.nouveauStatut.includes('VERIFIE') || 
      statut.ancienStatut.includes('VERIFIE') ||
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
        raisonRejet: user.documentIdentite.raisonRejet
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
    const { userIds } = req.body; // Array d'IDs d'utilisateurs

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Liste d\'utilisateurs requise'
      });
    }

    const utilisateurs = await User.find({
      _id: { $in: userIds },
      documentIdentite: { $exists: false }
    }).select('nom prenom email');

    let envoisReussis = 0;
    let envoisEchoues = 0;

    for (const user of utilisateurs) {
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
                <li>Téléchargez-la via votre espace personnel</li>
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
      } catch (emailError) {
        logger.error(`Erreur envoi rappel à ${user.email}:`, emailError);
        envoisEchoues++;
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
      statistiques: {
        utilisateursCibles: utilisateurs.length,
        envoisReussis,
        envoisEchoues
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
    const dans30Jours = new Date();
    dans30Jours.setDate(dans30Jours.getDate() + 30);

    // Documents expirés (vérifiés il y a plus de 2 ans)
    const il2Ans = new Date();
    il2Ans.setFullYear(il2Ans.getFullYear() - 2);

    const documentsExpires = await User.find({
      'documentIdentite.statutVerification': 'VERIFIE',
      'documentIdentite.dateVerification': { $lt: il2Ans }
    }).select('nom prenom email documentIdentite');

    // Documents à renouveler bientôt (vérifiés il y a plus de 1 an et 10 mois)
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
        message: 'Utilisateur non trouvé'
      });
    }

    // Marquer le document comme nécessitant un renouvellement
    if (user.documentIdentite) {
      user.documentIdentite.statutVerification = 'EN_ATTENTE';
      user.documentIdentite.raisonRejet = raison || 'Renouvellement de vérification requis';
      user.documentIdentite.dateVerification = null;
    }

    await user.save();

    // Envoyer un email à l'utilisateur
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

            <p>Veuillez soumettre un nouveau document d'identité via votre espace personnel.</p>

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
    const adminId = req.user.userId;

    if (!userIds || !Array.isArray(userIds) || userIds.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Liste d\'utilisateurs requise'
      });
    }

    const utilisateurs = await User.find({
      _id: { $in: userIds },
      'documentIdentite.statutVerification': 'EN_ATTENTE'
    });

    let approbationsReussies = 0;
    let approbationsEchouees = 0;

    for (const user of utilisateurs) {
      try {
        user.documentIdentite.statutVerification = 'VERIFIE';
        user.documentIdentite.dateVerification = new Date();
        user.documentIdentite.verificateurId = adminId;
        user.documentIdentite.raisonRejet = null;
        
        await user.save();
        approbationsReussies++;

        // Envoyer email de confirmation (optionnel, pour éviter le spam)
      } catch (saveError) {
        logger.error(`Erreur approbation utilisateur ${user._id}:`, saveError);
        approbationsEchouees++;
      }
    }

    logger.info('Approbation en lot effectuée', { 
      approbationsReussies, 
      approbationsEchouees, 
      adminId 
    });

    res.json({
      success: true,
      message: 'Approbation en lot terminée',
      statistiques: {
        utilisateursCibles: utilisateurs.length,
        approbationsReussies,
        approbationsEchouees
      }
    });

  } catch (error) {
    logger.error('Erreur approbation en lot:', error);
    return next(AppError.serverError('Erreur serveur', { originalError: error.message }));
  }
};

// module.exports temporarily removed and re-declared at end of file

/**
 * Soumettre un document de vérification (USER)
 */
const soumettreDocumentVerification = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { type, numero, dateExpiration, photoDocument } = req.body;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    const ancienStatut = user.documentIdentite?.statutVerification || 'NOT_SUBMITTED';

    user.documentIdentite = {
      type,
      numero,
      dateExpiration: dateExpiration ? new Date(dateExpiration) : null,
      photoDocument,
      statutVerification: 'EN_ATTENTE',
      dateUpload: new Date()
    };

    user.historiqueStatuts = user.historiqueStatuts || [];
    user.historiqueStatuts.push({
      ancienStatut,
      nouveauStatut: 'EN_ATTENTE',
      raison: 'Soumission du document',
      dateModification: new Date()
    });

    await user.save();

    logger.info('Document soumis pour vérification', { userId });

    return res.json({ success: true, message: 'Document soumis, en attente de vérification' });
  } catch (error) {
    logger.error('Erreur soumission document:', error);
    return next(AppError.serverError('Erreur serveur lors de la soumission', { originalError: error.message }));
  }
};

/**
 * Obtenir le statut de vérification de l'utilisateur (USER)
 */
const obtenirStatutVerification = async (req, res, next) => {
  try {
    // Si le middleware a déjà calculé le statut
    if (req.verificationStatus) {
      return res.json({ success: true, data: req.verificationStatus });
    }

    const userId = req.user.userId;
    const user = await User.findById(userId).select('documentIdentite');
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });

    const doc = user.documentIdentite;
    const status = doc ? {
      hasDocument: true,
      status: doc.statutVerification,
      dateVerification: doc.dateVerification || null,
      dateUpload: doc.dateUpload || null,
      isVerified: doc.statutVerification === 'VERIFIE',
      isPending: doc.statutVerification === 'EN_ATTENTE',
      isRejected: doc.statutVerification === 'REJETE'
    } : { hasDocument: false, status: 'NOT_SUBMITTED' };

    return res.json({ success: true, data: status });
  } catch (error) {
    logger.error('Erreur obtenir statut vérification:', error);
    return next(AppError.serverError('Erreur serveur', { originalError: error.message }));
  }
};

/**
 * Obtenir la liste des documents en attente (ADMIN)
 */
const obtenirDocumentsEnAttente = async (req, res, next) => {
  try {
    const page = Math.max(parseInt(req.query.page || '1', 10), 1);
    const limit = Math.min(parseInt(req.query.limit || '20', 10), 100);
    const skip = (page - 1) * limit;

    const query = { 'documentIdentite.statutVerification': 'EN_ATTENTE' };

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select('nom prenom email documentIdentite')
      .sort({ 'documentIdentite.dateUpload': -1 })
      .skip(skip)
      .limit(limit);

    const results = users.map(u => ({
      userId: u._id,
      nomComplet: `${u.prenom} ${u.nom}`,
      email: u.email,
      document: u.documentIdentite
    }));

    return res.json({
      success: true,
      data: {
        page,
        limit,
        total,
        results
      }
    });
  } catch (error) {
    logger.error('Erreur obtenir documents en attente:', error);
    return next(AppError.serverError('Erreur serveur', { originalError: error.message }));
  }
};

/**
 * Approuver un document (ADMIN)
 */
const approuverDocument = async (req, res, next) => {
  try {
    const { userId } = req.params;
    const adminId = req.user.userId;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });

    if (!user.documentIdentite || user.documentIdentite.statutVerification !== 'EN_ATTENTE') {
      return res.status(400).json({ success: false, message: 'Aucun document en attente pour cet utilisateur' });
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
      raison: 'Approbation manuelle',
      verificateurId: adminId,
      dateModification: new Date()
    });

    await user.save();

    // Notification optionnelle (email)
    try {
      await sendEmail({
        to: user.email,
        subject: 'Vérification de compte - Approuvé',
        html: `<p>Bonjour ${user.prenom}, votre document a été vérifié et approuvé.</p>`
      });
    } catch (notifErr) {
      logger.warn('Impossible d\'envoyer l\'email d\'approbation:', notifErr.message || notifErr);
    }

    logger.info('Document approuvé', { userId, adminId });

    return res.json({ success: true, message: 'Document approuvé' });
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
    const adminId = req.user.userId;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });

    if (!user.documentIdentite || user.documentIdentite.statutVerification !== 'EN_ATTENTE') {
      return res.status(400).json({ success: false, message: 'Aucun document en attente pour cet utilisateur' });
    }

    const ancienStatut = user.documentIdentite.statutVerification;

    user.documentIdentite.statutVerification = 'REJETE';
    user.documentIdentite.raisonRejet = raison || 'Rejeté par l\'administrateur';

    user.historiqueStatuts = user.historiqueStatuts || [];
    user.historiqueStatuts.push({
      ancienStatut,
      nouveauStatut: 'REJETE',
      raison: raison || 'Rejeté par l\'administrateur',
      verificateurId: adminId,
      dateModification: new Date()
    });

    await user.save();

    // Notification optionnelle (email)
    try {
      await sendEmail({
        to: user.email,
        subject: 'Vérification de compte - Rejeté',
        html: `<p>Bonjour ${user.prenom}, votre document a été rejeté. Raison : ${user.documentIdentite.raisonRejet}</p>`
      });
    } catch (notifErr) {
      logger.warn('Impossible d\'envoyer l\'email de rejet:', notifErr.message || notifErr);
    }

    logger.info('Document rejeté', { userId, adminId });

    return res.json({ success: true, message: 'Document rejeté' });
  } catch (error) {
    logger.error('Erreur rejeter document:', error);
    return next(AppError.serverError('Erreur serveur', { originalError: error.message }));
  }
};

// Exporter toutes les fonctions du contrôleur
module.exports = {
  telechargerPhotoDocument,
  marquerEnCoursRevision,
  obtenirHistoriqueVerifications,
  envoyerRappelVerification,
  obtenirDocumentsExpires,
  demanderRenouvellement,
  approuverEnLot,
  // User endpoints
  soumettreDocumentVerification,
  obtenirStatutVerification,
  // Admin endpoints
  obtenirDocumentsEnAttente,
  approuverDocument,
  rejeterDocument
};