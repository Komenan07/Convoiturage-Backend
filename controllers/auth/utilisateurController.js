// controllers/auth/utilisateurController.js
const User = require('../../models/Utilisateur');
const bcrypt = require('bcryptjs');
const { logger } = require('../../utils/logger');
const AppError = require('../../utils/AppError');
const sendEmail = require('../../utils/emailService');
const fs = require('fs');
const path = require('path');

/**
 * Mettre à jour le profil utilisateur
 */
const mettreAJourProfil = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const updateData = req.body;

    // Champs autorisés pour la mise à jour
    const champsAutorises = [
      'nom', 'prenom', 'dateNaissance', 'sexe', 'photoProfil',
      'adresse', 'preferences', 'contactsUrgence'
    ];

    // Filtrer les données pour ne garder que les champs autorisés
    const donneesFiltre = {};
    Object.keys(updateData).forEach(key => {
      if (champsAutorises.includes(key)) {
        donneesFiltre[key] = updateData[key];
      }
    });

    if (Object.keys(donneesFiltre).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Aucune donnée valide à mettre à jour',
        champsAutorises
      });
    }

    const user = await User.findByIdAndUpdate(
      userId,
      donneesFiltre,
      { 
        new: true, 
        runValidators: true,
        select: '-motDePasse -tokenConfirmationEmail -expirationTokenConfirmation -tokenResetMotDePasse -expirationTokenReset'
      }
    );

    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    logger.info('Profil mis à jour', { userId, champsModifies: Object.keys(donneesFiltre) });

    res.json({
      success: true,
      message: 'Profil mis à jour avec succès',
      user: {
        id: user._id,
        nom: user.nom,
        prenom: user.prenom,
        nomComplet: user.nomComplet,
        email: user.email,
        telephone: user.telephone,
        dateNaissance: user.dateNaissance,
        age: user.age,
        sexe: user.sexe,
        photoProfil: user.photoProfil,
        role: user.role,
        adresse: user.adresse,
        preferences: user.preferences,
        contactsUrgence: user.contactsUrgence,
        compteCovoiturage: user.obtenirResumeCompte()
      }
    });

  } catch (error) {
    logger.error('Erreur mise à jour profil:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation',
        details: messages
      });
    }

    return next(AppError.serverError('Erreur serveur lors de la mise à jour du profil', { 
      originalError: error.message 
    }));
  }
};

/**
 * Changer le mot de passe
 */
const changerMotDePasse = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { motDePasseActuel, nouveauMotDePasse } = req.body;

    if (!motDePasseActuel || !nouveauMotDePasse) {
      return res.status(400).json({
        success: false,
        message: 'Mot de passe actuel et nouveau mot de passe sont requis'
      });
    }

    // Récupérer l'utilisateur avec le mot de passe
    const user = await User.findById(userId).select('+motDePasse');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Vérifier le mot de passe actuel
    const isMatch = await user.verifierMotDePasse(motDePasseActuel);
    if (!isMatch) {
      logger.warn('Changement mot de passe - Mot de passe actuel incorrect', { userId });
      return res.status(401).json({
        success: false,
        message: 'Mot de passe actuel incorrect',
        champ: 'motDePasseActuel'
      });
    }

    // Validation du nouveau mot de passe (sera aussi validée par le modèle)
    if (nouveauMotDePasse.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'Le nouveau mot de passe doit contenir au moins 8 caractères',
        champ: 'nouveauMotDePasse'
      });
    }

    // Le nouveau mot de passe sera hashé par le middleware pre-save
    user.motDePasse = nouveauMotDePasse;
    await user.save();

    logger.info('Mot de passe changé avec succès', { userId });

    res.json({
      success: true,
      message: 'Mot de passe changé avec succès'
    });

  } catch (error) {
    logger.error('Erreur changement mot de passe:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation du nouveau mot de passe',
        details: messages
      });
    }

    return next(AppError.serverError('Erreur serveur lors du changement de mot de passe', { 
      originalError: error.message 
    }));
  }
};

/**
 * Mettre à jour les informations du véhicule (pour conducteurs)
 */
const mettreAJourVehicule = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const vehiculeData = req.body;

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Vérifier que l'utilisateur peut être conducteur
    if (user.role !== 'conducteur' && user.role !== 'les_deux') {
      return res.status(403).json({
        success: false,
        message: 'Seuls les conducteurs peuvent mettre à jour les informations du véhicule'
      });
    }

    // Champs autorisés pour le véhicule
    const champsVehiculeAutorises = [
      'marque', 'modele', 'couleur', 'immatriculation', 'nombrePlaces',
      'photoVehicule', 'assurance', 'visiteTechnique'
    ];

    // Filtrer les données du véhicule
    const vehiculeFiltre = {};
    Object.keys(vehiculeData).forEach(key => {
      if (champsVehiculeAutorises.includes(key)) {
        vehiculeFiltre[key] = vehiculeData[key];
      }
    });

    if (Object.keys(vehiculeFiltre).length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Aucune donnée valide à mettre à jour pour le véhicule',
        champsAutorises: champsVehiculeAutorises
      });
    }

    // Mettre à jour le véhicule
    user.vehicule = { ...user.vehicule, ...vehiculeFiltre };
    await user.save();

    logger.info('Informations véhicule mises à jour', { userId, champsModifies: Object.keys(vehiculeFiltre) });

    res.json({
      success: true,
      message: 'Informations du véhicule mises à jour avec succès',
      vehicule: user.vehicule
    });

  } catch (error) {
    logger.error('Erreur mise à jour véhicule:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation des données du véhicule',
        details: messages
      });
    }

    return next(AppError.serverError('Erreur serveur lors de la mise à jour du véhicule', { 
      originalError: error.message 
    }));
  }
};

/**
 * Changer le rôle de l'utilisateur (passager <-> conducteur)
 */
const changerRole = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { nouveauRole } = req.body;

    if (!nouveauRole || !['passager', 'conducteur', 'les_deux'].includes(nouveauRole)) {
      return res.status(400).json({
        success: false,
        message: 'Rôle invalide',
        rolesAutorises: ['passager', 'conducteur', 'les_deux']
      });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const ancienRole = user.role;
    user.role = nouveauRole;

    // Si l'utilisateur devient conducteur et n'a pas de véhicule, initialiser
    if ((nouveauRole === 'conducteur' || nouveauRole === 'les_deux') && !user.vehicule.marque) {
      user.vehicule = {
        marque: '',
        modele: '',
        couleur: '',
        immatriculation: '',
        nombrePlaces: 4,
        photoVehicule: null,
        assurance: {},
        visiteTechnique: {}
      };
    }

    await user.save();

    // Ajouter à l'historique des statuts si nécessaire
    if (ancienRole !== nouveauRole) {
      user.historiqueStatuts.push({
        ancienStatut: `role_${ancienRole}`,
        nouveauStatut: `role_${nouveauRole}`,
        raison: 'Changement de rôle par l\'utilisateur',
        dateModification: new Date()
      });
      await user.save();
    }

    logger.info('Rôle utilisateur changé', { userId, ancienRole, nouveauRole });

    res.json({
      success: true,
      message: `Rôle changé avec succès de ${ancienRole} à ${nouveauRole}`,
      user: {
        id: user._id,
        role: user.role,
        peutAccepterCourses: user.peutAccepterCourses,
        vehicule: user.vehicule,
        compteCovoiturage: user.obtenirResumeCompte()
      }
    });

  } catch (error) {
    logger.error('Erreur changement rôle:', error);
    return next(AppError.serverError('Erreur serveur lors du changement de rôle', { 
      originalError: error.message 
    }));
  }
};

/**
 * Supprimer le compte utilisateur
 */
const supprimerCompte = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { motDePasse, confirmation } = req.body;

    if (!motDePasse || confirmation !== 'SUPPRIMER_MON_COMPTE') {
      return res.status(400).json({
        success: false,
        message: 'Mot de passe et confirmation requis',
        confirmation: 'SUPPRIMER_MON_COMPTE'
      });
    }

    const user = await User.findById(userId).select('+motDePasse');
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Vérifier le mot de passe
    const isMatch = await user.verifierMotDePasse(motDePasse);
    if (!isMatch) {
      return res.status(401).json({
        success: false,
        message: 'Mot de passe incorrect',
        champ: 'motDePasse'
      });
    }

    // Vérifier s'il y a des courses en cours ou des fonds dans le compte
    if (user.compteCovoiturage.solde > 0) {
      return res.status(409).json({
        success: false,
        message: 'Impossible de supprimer le compte : solde non nul',
        details: `Solde actuel : ${user.compteCovoiturage.solde} FCFA. Veuillez retirer vos fonds avant de supprimer votre compte.`
      });
    }

    // TODO: Vérifier s'il y a des trajets en cours
    // Cette logique dépendra de votre modèle de trajet

    // Anonymiser les données au lieu de supprimer complètement
    const dateSupression = new Date();
    user.nom = `Utilisateur_${user._id}`;
    user.prenom = 'Supprimé';
    user.email = `deleted_${user._id}@wayzeco.local`;
    user.telephone = `+225${Date.now().toString().slice(-8)}`;
    user.motDePasse = undefined;
    user.photoProfil = null;
    user.statutCompte = 'BLOQUE';
    user.contactsUrgence = [];
    user.adresse = {};
    user.preferences = {};
    
    // Marquer comme supprimé dans l'historique
    user.historiqueStatuts.push({
      ancienStatut: user.statutCompte,
      nouveauStatut: 'COMPTE_SUPPRIME',
      raison: 'Suppression demandée par l\'utilisateur',
      dateModification: dateSupression
    });

    await user.save();

    logger.info('Compte utilisateur supprimé', { userId, dateSupression });

    res.json({
      success: true,
      message: 'Compte supprimé avec succès',
      dateSupression
    });

  } catch (error) {
    logger.error('Erreur suppression compte:', error);
    return next(AppError.serverError('Erreur serveur lors de la suppression du compte', { 
      originalError: error.message 
    }));
  }
};

/**
 * Obtenir les statistiques personnelles de l'utilisateur
 */
const obtenirStatistiquesPersonnelles = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    
    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const maintenant = new Date();
    const inscriptionDepuis = Math.floor((maintenant - user.dateInscription) / (1000 * 60 * 60 * 24));

    const statistiques = {
      profil: {
        dateInscription: user.dateInscription,
        inscriptionDepuis: `${inscriptionDepuis} jours`,
        scoreConfiance: user.scoreConfiance,
        noteGenerale: user.noteGenerale,
        badges: user.badges,
        estVerifie: user.estVerifie
      },
      activite: {
        nombreTrajetsEffectues: user.nombreTrajetsEffectues,
        nombreTrajetsAnnules: user.nombreTrajetsAnnules,
        tauxAnnulation: user.tauxAnnulation,
        derniereConnexion: user.derniereConnexion
      },
      compteCovoiturage: user.obtenirResumeCompte()
    };

    // Ajouter des statistiques spécifiques aux conducteurs
    if (user.role === 'conducteur' || user.role === 'les_deux') {
      statistiques.conducteur = {
        vehiculeConfigured: !!(user.vehicule && user.vehicule.marque),
        compteRechargeActif: user.compteRechargeActif,
        peutAccepterCourses: user.peutAccepterCourses
      };
    }

    res.json({
      success: true,
      data: statistiques
    });

  } catch (error) {
    logger.error('Erreur statistiques personnelles:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération des statistiques', { 
      originalError: error.message 
    }));
  }
};

/**
 * Mettre à jour les préférences utilisateur
 */
const mettreAJourPreferences = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { preferences } = req.body;

    if (!preferences || typeof preferences !== 'object') {
      return res.status(400).json({
        success: false,
        message: 'Préférences requises'
      });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Valider les préférences
    const preferencesValides = {};
    
    if (preferences.musique !== undefined) {
      preferencesValides.musique = Boolean(preferences.musique);
    }
    
    if (preferences.climatisation !== undefined) {
      preferencesValides.climatisation = Boolean(preferences.climatisation);
    }
    
    if (preferences.conversation !== undefined) {
      const conversationValide = ['BAVARD', 'CALME', 'NEUTRE'];
      if (conversationValide.includes(preferences.conversation)) {
        preferencesValides.conversation = preferences.conversation;
      }
    }
    
    if (preferences.languePreferee !== undefined) {
      const languesValides = ['FR', 'ANG'];
      if (languesValides.includes(preferences.languePreferee)) {
        preferencesValides.languePreferee = preferences.languePreferee;
      }
    }

    // Mettre à jour les préférences
    user.preferences = { ...user.preferences, ...preferencesValides };
    await user.save();

    logger.info('Préférences mises à jour', { userId, preferences: preferencesValides });

    res.json({
      success: true,
      message: 'Préférences mises à jour avec succès',
      preferences: user.preferences
    });

  } catch (error) {
    logger.error('Erreur mise à jour préférences:', error);
    return next(AppError.serverError('Erreur serveur lors de la mise à jour des préférences', { 
      originalError: error.message 
    }));
  }
};

/**
 * Ajouter un contact d'urgence
 */
const ajouterContactUrgence = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { nom, telephone, relation } = req.body;

    if (!nom || !telephone || !relation) {
      return res.status(400).json({
        success: false,
        message: 'Nom, téléphone et relation sont requis'
      });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Vérifier le nombre maximum de contacts (par exemple 3)
    if (user.contactsUrgence.length >= 3) {
      return res.status(400).json({
        success: false,
        message: 'Nombre maximum de contacts d\'urgence atteint (3)'
      });
    }

    // Vérifier si le numéro existe déjà
    const numeroExiste = user.contactsUrgence.some(contact => contact.telephone === telephone);
    if (numeroExiste) {
      return res.status(409).json({
        success: false,
        message: 'Ce numéro de téléphone existe déjà dans vos contacts d\'urgence'
      });
    }

    const nouveauContact = {
      nom: nom.trim(),
      telephone: telephone.trim(),
      relation
    };

    user.contactsUrgence.push(nouveauContact);
    await user.save();

    logger.info('Contact d\'urgence ajouté', { userId, contact: nouveauContact });

    res.json({
      success: true,
      message: 'Contact d\'urgence ajouté avec succès',
      contact: nouveauContact,
      contactsUrgence: user.contactsUrgence
    });

  } catch (error) {
    logger.error('Erreur ajout contact urgence:', error);
    
    if (error.name === 'ValidationError') {
      const messages = Object.values(error.errors).map(err => err.message);
      return res.status(400).json({
        success: false,
        message: 'Erreur de validation',
        details: messages
      });
    }

    return next(AppError.serverError('Erreur serveur lors de l\'ajout du contact d\'urgence', { 
      originalError: error.message 
    }));
  }
};

/**
 * Supprimer un contact d'urgence
 */
const supprimerContactUrgence = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { contactId } = req.params;

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    const contactIndex = user.contactsUrgence.findIndex(
      contact => contact._id.toString() === contactId
    );

    if (contactIndex === -1) {
      return res.status(404).json({
        success: false,
        message: 'Contact d\'urgence non trouvé'
      });
    }

    const contactSupprime = user.contactsUrgence[contactIndex];
    user.contactsUrgence.splice(contactIndex, 1);
    await user.save();

    logger.info('Contact d\'urgence supprimé', { userId, contactSupprime });

    res.json({
      success: true,
      message: 'Contact d\'urgence supprimé avec succès',
      contactsUrgence: user.contactsUrgence
    });

  } catch (error) {
    logger.error('Erreur suppression contact urgence:', error);
    return next(AppError.serverError('Erreur serveur lors de la suppression du contact d\'urgence', { 
      originalError: error.message 
    }));
  }
};

/**
 * Configurer les paramètres de retrait des gains
 */
const configurerParametresRetrait = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { numeroMobile, operateur, nomTitulaire } = req.body;

    if (!numeroMobile || !operateur || !nomTitulaire) {
      return res.status(400).json({
        success: false,
        message: 'Numéro mobile, opérateur et nom du titulaire sont requis'
      });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Vérifier que l'utilisateur peut être conducteur
    if (user.role !== 'conducteur' && user.role !== 'les_deux') {
      return res.status(403).json({
        success: false,
        message: 'Seuls les conducteurs peuvent configurer les paramètres de retrait'
      });
    }

    try {
      await user.configurerRetraitGains(numeroMobile, operateur, nomTitulaire);
      
      logger.info('Paramètres de retrait configurés', { userId, operateur });

      res.json({
        success: true,
        message: 'Paramètres de retrait configurés avec succès',
        parametresRetrait: user.compteCovoiturage.parametresRetrait,
        peutRetirerGains: user.peutRetirerGains
      });

    } catch (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError.message
      });
    }

  } catch (error) {
    logger.error('Erreur configuration paramètres retrait:', error);
    return next(AppError.serverError('Erreur serveur lors de la configuration', { 
      originalError: error.message 
    }));
  }
};

/**
 * Configurer la recharge automatique
 */
const configurerAutoRecharge = async (req, res, next) => {
  try {
    const userId = req.user.userId;
    const { seuilAutoRecharge, montantAutoRecharge, methodePaiementAuto } = req.body;

    if (!seuilAutoRecharge || !montantAutoRecharge || !methodePaiementAuto) {
      return res.status(400).json({
        success: false,
        message: 'Seuil, montant et méthode de paiement automatique sont requis'
      });
    }

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Vérifier que l'utilisateur peut être conducteur
    if (user.role !== 'conducteur' && user.role !== 'les_deux') {
      return res.status(403).json({
        success: false,
        message: 'Seuls les conducteurs peuvent configurer la recharge automatique'
      });
    }

    try {
      await user.configurerAutoRecharge(seuilAutoRecharge, montantAutoRecharge, methodePaiementAuto);
      
      logger.info('Recharge automatique configurée', { userId, seuil: seuilAutoRecharge, montant: montantAutoRecharge });

      res.json({
        success: true,
        message: 'Recharge automatique configurée avec succès',
        modeAutoRecharge: user.compteCovoiturage.modeAutoRecharge
      });

    } catch (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError.message
      });
    }

  } catch (error) {
    logger.error('Erreur configuration auto-recharge:', error);
    return next(AppError.serverError('Erreur serveur lors de la configuration', { 
      originalError: error.message 
    }));
  }
};

/**
 * Désactiver la recharge automatique
 */
const desactiverAutoRecharge = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    await user.desactiverAutoRecharge();
    
    logger.info('Recharge automatique désactivée', { userId });

    res.json({
      success: true,
      message: 'Recharge automatique désactivée avec succès',
      modeAutoRecharge: user.compteCovoiturage.modeAutoRecharge
    });

  } catch (error) {
    logger.error('Erreur désactivation auto-recharge:', error);
    return next(AppError.serverError('Erreur serveur lors de la désactivation', { 
      originalError: error.message 
    }));
  }
};

/**
 * Obtenir le dashboard utilisateur avec toutes les informations essentielles
 */
const obtenirDashboard = async (req, res, next) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId);
    
    if (!user) {
      return res.status(404).json({
        success: false,
        message: 'Utilisateur non trouvé'
      });
    }

    // Données du dashboard
    const dashboard = {
      utilisateur: {
        id: user._id,
        nomComplet: user.nomComplet,
        email: user.email,
        photoProfil: user.photoProfil,
        role: user.role,
        scoreConfiance: user.scoreConfiance,
        noteGenerale: user.noteGenerale,
        badges: user.badges,
        estVerifie: user.estVerifie
      },
      statistiques: {
        nombreTrajetsEffectues: user.nombreTrajetsEffectues,
        nombreTrajetsAnnules: user.nombreTrajetsAnnules,
        tauxAnnulation: user.tauxAnnulation
      },
      compteCovoiturage: user.obtenirResumeCompte(),
      alertes: []
    };

    // Ajouter des alertes importantes
    if (!user.estVerifie) {
      dashboard.alertes.push({
        type: 'warning',
        message: 'Votre document d\'identité n\'est pas encore vérifié',
        action: 'verifier_identite'
      });
    }

    if ((user.role === 'conducteur' || user.role === 'les_deux') && !user.vehicule.marque) {
      dashboard.alertes.push({
        type: 'info',
        message: 'Complétez les informations de votre véhicule',
        action: 'configurer_vehicule'
      });
    }

    if ((user.role === 'conducteur' || user.role === 'les_deux') && user.compteCovoiturage.totalGagnes > 0 && !user.peutRetirerGains) {
      dashboard.alertes.push({
        type: 'info',
        message: 'Configurez vos paramètres de retrait pour récupérer vos gains',
        action: 'configurer_retrait'
      });
    }

    // Vérifier si une recharge automatique est nécessaire
    const autoRecharge = user.verifierAutoRecharge();
    if (autoRecharge.necessite) {
      dashboard.alertes.push({
        type: 'warning',
        message: `Recharge automatique nécessaire: ${autoRecharge.montant} FCFA`,
        action: 'recharge_auto'
      });
    }

    res.json({
      success: true,
      data: dashboard
    });

  } catch (error) {
    logger.error('Erreur dashboard:', error);
    return next(AppError.serverError('Erreur serveur lors de la récupération du dashboard', { 
      originalError: error.message 
    }));
  }
};

module.exports = {
  mettreAJourProfil,
  changerMotDePasse,
  mettreAJourVehicule,
  changerRole,
  supprimerCompte,
  obtenirStatistiquesPersonnelles,
  mettreAJourPreferences,
  ajouterContactUrgence,
  supprimerContactUrgence,
  configurerParametresRetrait,
  configurerAutoRecharge,
  desactiverAutoRecharge,
  obtenirDashboard
};