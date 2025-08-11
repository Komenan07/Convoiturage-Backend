const Utilisateur = require('../models/Utilisateur');
const bcrypt = require('bcryptjs');
const validator = require('validator');

// =============== CREATE ===============
const creerUtilisateur = async (req, res) => {
  try {
    const {
      email,
      telephone,
      motDePasse,
      nom,
      prenom,
      dateNaissance,
      sexe,
      adresse,
      preferences,
      contactsUrgence
    } = req.body;

    if (!validator.isEmail(email || '')) {
      return res.status(400).json({ success: false, message: 'Email invalide' });
    }
    if (!validator.isMobilePhone(telephone || '', 'any', { strictMode: false })) {
      return res.status(400).json({ success: false, message: 'Numéro de téléphone invalide' });
    }

    const utilisateurExistant = await Utilisateur.findOne({ $or: [{ email }, { telephone }] });
    if (utilisateurExistant) {
      return res.status(400).json({ success: false, message: 'Un utilisateur avec cet email ou ce téléphone existe déjà' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(motDePasse, salt);

    const nouvelUtilisateur = new Utilisateur({
      email,
      telephone,
      motDePasse: hashedPassword,
      nom,
      prenom,
      dateNaissance: dateNaissance ? new Date(dateNaissance) : undefined,
      sexe,
      adresse,
      preferences,
      contactsUrgence
    });

    await nouvelUtilisateur.save();

    const utilisateurSansMotDePasse = nouvelUtilisateur.toObject();
    delete utilisateurSansMotDePasse.motDePasse;

    res.status(201).json({ success: true, message: 'Utilisateur créé avec succès', data: utilisateurSansMotDePasse });
  } catch (error) {
    res.status(500).json({ success: false, message: "Erreur serveur lors de la création de l'utilisateur", error: error.message });
  }
};

// =============== READ ===============
const obtenirProfilComplet = async (req, res) => {
  try {
    const utilisateur = await Utilisateur.findById(req.user.id)
      .select('-motDePasse -tokenResetMotDePasse')
      .populate('vehicules', 'marque modele couleur')
      .populate('documentIdentite.verificateurId', 'nom prenom');

    if (!utilisateur) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    res.status(200).json({ success: true, data: utilisateur });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur lors de la récupération du profil', error: error.message });
  }
};

const obtenirProfilPublic = async (req, res) => {
  try {
    const utilisateur = await Utilisateur.findById(req.params.id)
      .select('nom prenom photoProfil noteMoyenne nombreTrajets preferences.conversation preferences.languePreferee estVerifie dateInscription')
      .populate('vehicules', 'marque modele couleur');

    if (!utilisateur) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    res.status(200).json({ success: true, data: utilisateur });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur lors de la récupération du profil public', error: error.message });
  }
};

// =============== UPDATE ===============
const mettreAJourProfil = async (req, res) => {
  try {
    const { nom, prenom, telephone, adresse, preferences } = req.body;
    const updates = {};
    if (nom !== undefined) updates.nom = nom;
    if (prenom !== undefined) updates.prenom = prenom;
    if (telephone !== undefined) updates.telephone = telephone;
    if (adresse !== undefined) updates.adresse = adresse;
    if (preferences !== undefined) updates.preferences = preferences;

    const utilisateur = await Utilisateur.findByIdAndUpdate(
      req.user.id,
      { $set: updates },
      { new: true, runValidators: true }
    ).select('-motDePasse -tokenResetMotDePasse');

    if (!utilisateur) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    res.status(200).json({ success: true, message: 'Profil mis à jour avec succès', data: utilisateur });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur lors de la mise à jour du profil', error: error.message });
  }
};

const changerMotDePasse = async (req, res) => {
  try {
    const { ancienMotDePasse, nouveauMotDePasse } = req.body;

    const utilisateur = await Utilisateur.findById(req.user.id);
    if (!utilisateur) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    const isPasswordValid = await bcrypt.compare(ancienMotDePasse, utilisateur.motDePasse);
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, message: 'Ancien mot de passe incorrect' });
    }

    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(nouveauMotDePasse, salt);
    utilisateur.motDePasse = hashedPassword;
    await utilisateur.save();

    res.status(200).json({ success: true, message: 'Mot de passe modifié avec succès' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur lors du changement de mot de passe', error: error.message });
  }
};

// =============== UPLOADS ===============
const uploadPhotoProfil = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucun fichier uploadé' });
    }

    // Récupérer l'utilisateur actuel pour supprimer l'ancienne photo
    const utilisateurActuel = await Utilisateur.findById(req.user.id);
    if (!utilisateurActuel) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    // Supprimer l'ancienne photo si elle existe
    if (utilisateurActuel.photoProfil) {
      const { deleteFile } = require('../uploads/photos');
      const oldFilename = utilisateurActuel.photoProfil.split('/').pop();
      deleteFile(oldFilename);
    }

    // Générer l'URL publique de la nouvelle photo
    const { getPublicUrl } = require('../uploads/photos');
    const photoUrl = getPublicUrl(req.file.filename);

    // Mettre à jour l'utilisateur avec la nouvelle URL
    const utilisateur = await Utilisateur.findByIdAndUpdate(
      req.user.id,
      { photoProfil: photoUrl },
      { new: true }
    ).select('-motDePasse -tokenResetMotDePasse');

    res.status(200).json({ 
      success: true, 
      message: 'Photo de profil uploadée avec succès', 
      data: { 
        photoProfil: utilisateur.photoProfil,
        filename: req.file.filename
      } 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Erreur serveur lors de l'upload de la photo", error: error.message });
  }
};

const uploadDocumentIdentite = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'Aucun fichier uploadé' });
    }

    const { type, numero } = req.body;
    
    // Récupérer l'utilisateur actuel pour supprimer l'ancien document
    const utilisateurActuel = await Utilisateur.findById(req.user.id);
    if (!utilisateurActuel) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    // Supprimer l'ancien document si il existe
    if (utilisateurActuel.documentIdentite && utilisateurActuel.documentIdentite.photoDocument) {
      const { deleteFile } = require('../uploads/documents');
      const oldFilename = utilisateurActuel.documentIdentite.photoDocument.split('/').pop();
      deleteFile(oldFilename);
    }

    // Générer l'URL publique du nouveau document
    const { getPublicUrl } = require('../uploads/documents');
    const photoUrl = getPublicUrl(req.file.filename);

    const documentData = {
      type,
      numero,
      photoDocument: photoUrl,
      statutVerification: 'EN_ATTENTE',
      dateVerification: null,
      verificateurId: null,
      raisonRejet: null
    };

    const utilisateur = await Utilisateur.findByIdAndUpdate(
      req.user.id,
      {
        $set: {
          documentIdentite: documentData,
          estVerifie: false
        }
      },
      { new: true }
    ).select('-motDePasse -tokenResetMotDePasse');

    res.status(200).json({ 
      success: true, 
      message: "Document d'identité uploadé avec succès", 
      data: { 
        documentIdentite: utilisateur.documentIdentite,
        filename: req.file.filename
      } 
    });
  } catch (error) {
    res.status(500).json({ success: false, message: "Erreur serveur lors de l'upload du document", error: error.message });
  }
};

// =============== STATS ===============
const obtenirStatistiques = async (req, res) => {
  try {
    const utilisateur = await Utilisateur.findById(req.user.id)
      .select('noteMoyenne nombreTrajets nombreVoyages nombreReservations dateInscription');

    if (!utilisateur) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    res.status(200).json({ success: true, data: utilisateur });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur lors de la récupération des statistiques', error: error.message });
  }
};

const mettreAJourCoordonnees = async (req, res) => {
  try {
    const { longitude, latitude } = req.body;

    const utilisateur = await Utilisateur.findByIdAndUpdate(
      req.user.id,
      {
        $set: {
          coordonnees: { longitude, latitude },
          derniereMiseAJourCoordonnees: new Date()
        }
      },
      { new: true }
    ).select('-motDePasse -tokenResetMotDePasse');

    res.status(200).json({ success: true, message: 'Coordonnées mises à jour avec succès', data: { coordonnees: utilisateur.coordonnees } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur lors de la mise à jour des coordonnées', error: error.message });
  }
};

// =============== SEARCH ===============
const rechercherUtilisateurs = async (req, res) => {
  try {
    const { page = 1, limit = 10, scoreMin, longitude, latitude, rayon = 10, search } = req.query;

    const query = {};
    if (scoreMin) {
      query.noteMoyenne = { $gte: parseFloat(scoreMin) };
    }
    if (longitude && latitude) {
      query.coordonnees = {
        $near: {
          $geometry: {
            type: 'Point',
            coordinates: [parseFloat(longitude), parseFloat(latitude)]
          },
          $maxDistance: parseInt(rayon) * 1000
        }
      };
    }
    if (search) {
      query.$or = [
        { nom: new RegExp(search, 'i') },
        { prenom: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') }
      ];
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      select: 'nom prenom photoProfil noteMoyenne nombreTrajets preferences estVerifie coordonnees',
      sort: { noteMoyenne: -1 }
    };

    const result = await Utilisateur.paginate(query, options);
    res.status(200).json({ success: true, data: result.docs, pagination: { page: result.page, limit: result.limit, total: result.totalDocs, pages: result.totalPages } });
  } catch (error) {
    res.status(500).json({ success: false, message: "Erreur serveur lors de la recherche d'utilisateurs", error: error.message });
  }
};

// =============== DELETE ===============
const supprimerCompte = async (req, res) => {
  try {
    const { motDePasse } = req.body;
    const utilisateur = await Utilisateur.findById(req.user.id);
    if (!utilisateur) {
      return res.status(404).json({ success: false, message: 'Utilisateur non trouvé' });
    }

    const isPasswordValid = await bcrypt.compare(motDePasse, utilisateur.motDePasse);
    if (!isPasswordValid) {
      return res.status(400).json({ success: false, message: 'Mot de passe incorrect' });
    }

    await Utilisateur.findByIdAndDelete(req.user.id);
    res.status(200).json({ success: true, message: 'Compte supprimé avec succès' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur lors de la suppression du compte', error: error.message });
  }
};

// =============== ADMIN ===============
const obtenirTousLesUtilisateurs = async (req, res) => {
  try {
    const { page = 1, limit = 20, statut, verification, search } = req.query;

    const query = {};
    if (statut) query.statutCompte = statut;
    if (verification === 'verifie') query.estVerifie = true;
    if (verification === 'non_verifie') query.estVerifie = false;
    if (search) {
      query.$or = [
        { nom: new RegExp(search, 'i') },
        { prenom: new RegExp(search, 'i') },
        { email: new RegExp(search, 'i') },
        { telephone: new RegExp(search, 'i') }
      ];
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      select: '-motDePasse -tokenResetMotDePasse',
      sort: { dateInscription: -1 },
      populate: { path: 'documentIdentite.verificateurId', select: 'nom prenom' }
    };

    const result = await Utilisateur.paginate(query, options);
    res.status(200).json({ success: true, data: result.docs, pagination: { page: result.page, limit: result.limit, total: result.totalDocs, pages: result.totalPages } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur lors de la récupération des utilisateurs', error: error.message });
  }
};

const obtenirStatistiquesGlobales = async (req, res) => {
  try {
    const statistiques = await Utilisateur.statistiquesGlobales();

    const statsParStatut = await Utilisateur.aggregate([
      { $group: { _id: '$statutCompte', count: { $sum: 1 } } }
    ]);

    const statsParMois = await Utilisateur.aggregate([
      { $group: { _id: { year: { $year: '$dateInscription' }, month: { $month: '$dateInscription' } }, count: { $sum: 1 } } },
      { $sort: { '_id.year': -1, '_id.month': -1 } },
      { $limit: 12 }
    ]);

    res.status(200).json({ success: true, data: { ...statistiques, repartitionStatuts: statsParStatut, inscriptionsParMois: statsParMois } });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Erreur serveur lors de la récupération des statistiques globales', error: error.message });
  }
};

module.exports = {
  creerUtilisateur,
  obtenirProfilComplet,
  obtenirProfilPublic,
  mettreAJourProfil,
  changerMotDePasse,
  uploadPhotoProfil,
  uploadDocumentIdentite,
  obtenirStatistiques,
  mettreAJourCoordonnees,
  rechercherUtilisateurs,
  supprimerCompte,
  obtenirTousLesUtilisateurs,
  obtenirStatistiquesGlobales
};


