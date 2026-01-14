// services/evenementService.js
const Evenement = require('../models/Evenement');

class EvenementService {
  
  /**
   * Obtenir les événements avec pagination et filtres
   */
  async obtenirEvenements(filtres = {}, options = {}) {
    const {
      page = 1,
      limit = 10,
      sort = { createdAt: -1 },
      populate = []
    } = options;

    const skip = (page - 1) * limit;

    const evenements = await Evenement.find(filtres)
      .sort(sort)
      .skip(skip)
      .limit(limit)
      .populate(populate);

    const total = await Evenement.countDocuments(filtres);

    return {
      evenements,
      page: parseInt(page),
      pages: Math.ceil(total / limit),
      total,
      limit: parseInt(limit)
    };
  }

  /**
   * Obtenir un événement par ID
   */
  async obtenirEvenementParId(id) {
    return await Evenement.findById(id)
      .populate('organisateur', 'nom prenom photoProfil')
      .populate('trajetsAssocies')
      .populate('groupesCovoiturage.membres', 'nom prenom photoProfil');
  }

  /**
   * Créer un événement
   */
  async creerEvenement(donneesEvenement) {
    const evenement = new Evenement(donneesEvenement);
    return await evenement.save();
  }

  /**
   * Créer ou mettre à jour un événement (pour l'import automatique)
   * Retourne { evenement, isNew: boolean }
   */
  async creerOuMettreAJour(donneesEvenement) {
    try {
      let evenement = null;
      
      // 1. Rechercher par identifiant externe (si existe)
      if (donneesEvenement.identifiantExterne) {
        evenement = await Evenement.findOne({
          identifiantExterne: donneesEvenement.identifiantExterne,
          source: donneesEvenement.source
        });
      }
      
      // 2. Si pas trouvé, chercher par nom + date + lieu (anti-doublon intelligent)
      if (!evenement) {
        const dateDebut = new Date(donneesEvenement.dateDebut);
        const margeTemporelle = 3600000; // 1 heure en millisecondes
        
        evenement = await Evenement.findOne({
          nom: { $regex: new RegExp(donneesEvenement.nom, 'i') },
          'lieu.ville': donneesEvenement.lieu.ville,
          dateDebut: {
            $gte: new Date(dateDebut.getTime() - margeTemporelle),
            $lte: new Date(dateDebut.getTime() + margeTemporelle)
          }
        });
      }

      if (evenement) {
        // Mettre à jour l'événement existant
        const champsAMettreAJour = {
          description: donneesEvenement.description,
          lieu: donneesEvenement.lieu,
          dateDebut: donneesEvenement.dateDebut,
          dateFin: donneesEvenement.dateFin,
          capaciteEstimee: donneesEvenement.capaciteEstimee,
          tags: donneesEvenement.tags,
          urlSource: donneesEvenement.urlSource
        };
        
        Object.assign(evenement, champsAMettreAJour);
        await evenement.save();
        
        return { evenement, isNew: false };
      } else {
        // Créer un nouvel événement
        evenement = new Evenement(donneesEvenement);
        await evenement.save();
        
        return { evenement, isNew: true };
      }
    } catch (error) {
      console.error('Erreur creerOuMettreAJour:', error);
      throw error;
    }
  }

  /**
   * Créer plusieurs événements en batch (pour l'import)
   */
  async creerEvenementsBatch(evenements) {
    const resultats = {
      nouveaux: [],
      miseAJour: [],
      erreurs: []
    };

    for (const eventData of evenements) {
      try {
        const resultat = await this.creerOuMettreAJour(eventData);
        
        if (resultat.isNew) {
          resultats.nouveaux.push(resultat.evenement);
        } else {
          resultats.miseAJour.push(resultat.evenement);
        }
      } catch (error) {
        resultats.erreurs.push({
          evenement: eventData.nom || 'Nom inconnu',
          erreur: error.message
        });
      }
    }

    return {
      total: evenements.length,
      nouveaux: resultats.nouveaux.length,
      miseAJour: resultats.miseAJour.length,
      erreurs: resultats.erreurs.length,
      details: resultats
    };
  }

  /**
   * Vérifier si un événement existe déjà (anti-doublon)
   */
  async verifierDoublon(donneesEvenement) {
    const criteres = [];

    // Critère 1 : Identifiant externe
    if (donneesEvenement.identifiantExterne) {
      criteres.push({
        identifiantExterne: donneesEvenement.identifiantExterne,
        source: donneesEvenement.source
      });
    }

    // Critère 2 : Même nom + ville + date (avec marge d'1h)
    const dateDebut = new Date(donneesEvenement.dateDebut);
    const margeTemporelle = 3600000; // 1 heure
    
    criteres.push({
      nom: { $regex: new RegExp(donneesEvenement.nom, 'i') },
      'lieu.ville': donneesEvenement.lieu.ville,
      dateDebut: {
        $gte: new Date(dateDebut.getTime() - margeTemporelle),
        $lte: new Date(dateDebut.getTime() + margeTemporelle)
      }
    });

    return await Evenement.findOne({ $or: criteres });
  }

  /**
   * Mettre à jour un événement
   */
  async mettreAJourEvenement(id, donneesMAJ) {
    return await Evenement.findByIdAndUpdate(
      id, 
      donneesMAJ, 
      { new: true, runValidators: true }
    );
  }

  /**
   * Supprimer un événement
   */
  async supprimerEvenement(id, userId = null) {
    const evenement = await this.obtenirEvenementParId(id);
    
    if (!evenement) {
      throw new Error('Événement non trouvé');
    }

    // Vérification optionnelle des permissions
    if (userId && evenement.organisateur && evenement.organisateur.toString() !== userId) {
      throw new Error('Non autorisé à supprimer cet événement');
    }

    await Evenement.findByIdAndDelete(id);
    return { message: 'Événement supprimé avec succès', id };
  }

  /**
   * Changer le statut d'un événement
   */
  async changerStatut(id, nouveauStatut, userId = null, motif = null) {
    const evenement = await this.obtenirEvenementParId(id);
    
    if (!evenement) {
      throw new Error('Événement non trouvé');
    }

    // Vérification optionnelle des permissions
    if (userId && evenement.organisateur && evenement.organisateur.toString() !== userId) {
      throw new Error('Non autorisé à modifier cet événement');
    }

    evenement.statutEvenement = nouveauStatut;
    if (motif) {
      evenement.motifChangementStatut = motif;
    }
    
    // Si annulation, ajouter la date
    if (nouveauStatut === 'ANNULE' && !evenement.dateAnnulation) {
      evenement.dateAnnulation = new Date();
      if (motif) {
        evenement.motifAnnulation = motif;
      }
    }
    
    return await evenement.save();
  }

  /**
   * Rechercher des événements par proximité géographique
   */
  async rechercherParProximite(latitude, longitude, rayonKm = 10, limit = 20) {
    return await Evenement.find({
      "lieu.coordonnees": {
        $near: {
          $geometry: { type: "Point", coordinates: [longitude, latitude] },
          $maxDistance: rayonKm * 1000
        }
      },
      statutEvenement: { $in: ['PROGRAMME', 'EN_COURS'] }
    }).limit(limit);
  }

  /**
   * Obtenir les statistiques des événements
   */
  async obtenirStatistiques(periode = '30d', ville = null) {
    const dateDebut = new Date();
    
    switch (periode) {
      case '7d':
        dateDebut.setDate(dateDebut.getDate() - 7);
        break;
      case '30d':
        dateDebut.setDate(dateDebut.getDate() - 30);
        break;
      case '90d':
        dateDebut.setDate(dateDebut.getDate() - 90);
        break;
      case '365d':
        dateDebut.setDate(dateDebut.getDate() - 365);
        break;
      default:
        dateDebut.setDate(dateDebut.getDate() - 30);
    }

    const filtres = { createdAt: { $gte: dateDebut } };
    if (ville) {
      filtres['lieu.ville'] = new RegExp(ville, 'i');
    }

    // Statistiques de base
    const totalEvenements = await Evenement.countDocuments(filtres);
    
    const parStatut = await Evenement.aggregate([
      { $match: filtres },
      { $group: { _id: '$statutEvenement', count: { $sum: 1 } } }
    ]);

    const parType = await Evenement.aggregate([
      { $match: filtres },
      { $group: { _id: '$typeEvenement', count: { $sum: 1 } } }
    ]);

    // Statistiques par source de détection
    const parSource = await Evenement.aggregate([
      { $match: filtres },
      { 
        $group: { 
          _id: {
            sourceDetection: '$sourceDetection',
            source: '$source'
          }, 
          count: { $sum: 1 } 
        } 
      }
    ]);

    // Statistiques par ville
    const parVille = await Evenement.aggregate([
      { $match: filtres },
      { $group: { _id: '$lieu.ville', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
      { $limit: 10 }
    ]);

    // Événements à venir
    const aVenir = await Evenement.countDocuments({
      ...filtres,
      dateDebut: { $gt: new Date() },
      statutEvenement: 'PROGRAMME'
    });

    // Événements en cours
    const maintenant = new Date();
    const enCours = await Evenement.countDocuments({
      ...filtres,
      dateDebut: { $lte: maintenant },
      dateFin: { $gte: maintenant },
      statutEvenement: 'EN_COURS'
    });

    return {
      periode,
      ville: ville || 'toutes',
      totalEvenements,
      aVenir,
      enCours,
      repartition: {
        parStatut,
        parType,
        parSource,
        parVille
      }
    };
  }

  /**
   * Exporter les événements avec filtres
   */
  async exporterEvenements(filtres = {}) {
    return await Evenement.find(filtres)
      .populate('organisateur', 'nom prenom')
      .populate('groupesCovoiturage.membres', 'nom prenom')
      .sort({ dateDebut: 1 });
  }

  /**
   * Convertir des événements en format CSV
   */
  async convertirEnCSV(evenements) {
    const headers = [
      'ID',
      'Nom',
      'Description',
      'Type',
      'Date Début',
      'Date Fin',
      'Ville',
      'Adresse',
      'Statut',
      'Source Détection',
      'Source',
      'Capacité',
      'URL Source',
      'Créé le'
    ];
    
    const csv = [headers.join(',')];
    
    evenements.forEach(event => {
      const row = [
        event._id,
        `"${(event.nom || '').replace(/"/g, '""')}"`,
        `"${(event.description || '').replace(/"/g, '""').substring(0, 100)}"`,
        event.typeEvenement,
        event.dateDebut.toISOString(),
        event.dateFin.toISOString(),
        `"${event.lieu?.ville || ''}"`,
        `"${(event.lieu?.adresse || '').replace(/"/g, '""')}"`,
        event.statutEvenement,
        event.sourceDetection || 'MANUEL',
        event.source || '',
        event.capaciteEstimee || '',
        `"${event.urlSource || ''}"`,
        event.createdAt.toISOString()
      ];
      csv.push(row.join(','));
    });
    
    return csv.join('\n');
  }

  /**
   * Convertir des événements en format JSON pour export
   */
  async convertirEnJSON(evenements) {
    return JSON.stringify(evenements, null, 2);
  }

  /**
   * Construire des critères de recherche depuis des paramètres
   */
  async construireCriteresRecherche(params) {
    const criteres = {};
    
    // Recherche textuelle
    if (params.motsCles) {
      criteres.$or = [
        { nom: new RegExp(params.motsCles, 'i') },
        { description: new RegExp(params.motsCles, 'i') },
        { tags: new RegExp(params.motsCles, 'i') }
      ];
    }
    
    // Filtres de base
    if (params.typeEvenement) {
      criteres.typeEvenement = params.typeEvenement;
    }
    
    if (params.ville) {
      criteres['lieu.ville'] = new RegExp(params.ville, 'i');
    }
    
    if (params.statutEvenement) {
      criteres.statutEvenement = params.statutEvenement;
    }
    
    // Filtres de dates
    if (params.dateDebutMin || params.dateDebutMax) {
      criteres.dateDebut = {};
      if (params.dateDebutMin) {
        criteres.dateDebut.$gte = new Date(params.dateDebutMin);
      }
      if (params.dateDebutMax) {
        criteres.dateDebut.$lte = new Date(params.dateDebutMax);
      }
    }
    
    // Filtres de capacité
    if (params.capaciteMin || params.capaciteMax) {
      criteres.capaciteEstimee = {};
      if (params.capaciteMin) {
        criteres.capaciteEstimee.$gte = parseInt(params.capaciteMin);
      }
      if (params.capaciteMax) {
        criteres.capaciteEstimee.$lte = parseInt(params.capaciteMax);
      }
    }
    
    // Filtres par tags
    if (params.tags && Array.isArray(params.tags)) {
      criteres.tags = { $in: params.tags };
    }

    // Filtres par source de détection
    if (params.sourceDetection) {
      criteres.sourceDetection = params.sourceDetection;
    }

    if (params.source) {
      criteres.source = params.source;
    }

    // Filtres booléens
    if (params.estPublic !== undefined) {
      criteres.estPublic = params.estPublic === 'true' || params.estPublic === true;
    }
    
    return criteres;
  }

  /**
   * Recherche avancée avec tous les critères
   */
  async rechercheAvancee(criteres, options) {
    return await this.obtenirEvenements(criteres, options);
  }

  /**
   * Obtenir les événements à venir
   */
  async obtenirEvenementsAVenir(limit = 20, ville = null) {
    const criteres = {
      dateDebut: { $gt: new Date() },
      statutEvenement: 'PROGRAMME'
    };

    if (ville) {
      criteres['lieu.ville'] = new RegExp(ville, 'i');
    }

    return await Evenement.find(criteres)
      .sort({ dateDebut: 1 })
      .limit(limit)
      .populate('trajetsAssocies')
      .populate('groupesCovoiturage.membres', 'nom prenom');
  }

  /**
   * Obtenir les événements populaires (avec le plus de groupes de covoiturage)
   */
  async obtenirEvenementsPopulaires(limit = 10, ville = null) {
    const criteres = {
      dateDebut: { $gt: new Date() },
      statutEvenement: 'PROGRAMME'
    };

    if (ville) {
      criteres['lieu.ville'] = new RegExp(ville, 'i');
    }

    const evenements = await Evenement.aggregate([
      { $match: criteres },
      {
        $addFields: {
          nombreGroupes: { $size: { $ifNull: ['$groupesCovoiturage', []] } }
        }
      },
      { $sort: { nombreGroupes: -1, dateDebut: 1 } },
      { $limit: limit }
    ]);

    return evenements;
  }

  // ==================== GESTION DES GROUPES DE COVOITURAGE ====================

  /**
   * Obtenir les groupes de covoiturage d'un événement
   */
  async obtenirGroupesCovoiturage(evenementId) {
    const evenement = await Evenement.findById(evenementId)
      .populate('groupesCovoiturage.membres', 'nom prenom photoProfil telephone');
      
    if (!evenement) {
      throw new Error('Événement non trouvé');
    }
    
    return evenement.groupesCovoiturage || [];
  }

  /**
   * Ajouter un groupe de covoiturage
   */
  async ajouterGroupeCovoiturage(evenementId, donneesGroupe) {
    const evenement = await Evenement.findById(evenementId);
    
    if (!evenement) {
      throw new Error('Événement non trouvé');
    }
    
    evenement.groupesCovoiturage.push(donneesGroupe);
    await evenement.save();
    
    return evenement.groupesCovoiturage[evenement.groupesCovoiturage.length - 1];
  }

  /**
   * Modifier un groupe de covoiturage
   */
  async modifierGroupeCovoiturage(evenementId, groupeId, donneesMAJ) {
    const evenement = await Evenement.findById(evenementId);
    
    if (!evenement) {
      throw new Error('Événement non trouvé');
    }
    
    const groupe = evenement.groupesCovoiturage.id(groupeId);
    
    if (!groupe) {
      throw new Error('Groupe de covoiturage non trouvé');
    }
    
    // Mettre à jour les champs autorisés
    if (donneesMAJ.nom) groupe.nom = donneesMAJ.nom;
    if (donneesMAJ.description) groupe.description = donneesMAJ.description;
    if (donneesMAJ.tarifPrefere !== undefined) groupe.tarifPrefere = donneesMAJ.tarifPrefere;
    if (donneesMAJ.heureDepart) groupe.heureDepart = donneesMAJ.heureDepart;
    if (donneesMAJ.maxMembres) groupe.maxMembres = donneesMAJ.maxMembres;
    
    await evenement.save();
    
    return groupe;
  }

  /**
   * Supprimer un groupe de covoiturage
   */
  async supprimerGroupeCovoiturage(evenementId, groupeId, userId = null) {
    const evenement = await Evenement.findById(evenementId);
    
    if (!evenement) {
      throw new Error('Événement non trouvé');
    }
    
    const groupe = evenement.groupesCovoiturage.id(groupeId);
    
    if (!groupe) {
      throw new Error('Groupe de covoiturage non trouvé');
    }
    
    // Vérification optionnelle des permissions
    if (userId && groupe.createur && groupe.createur.toString() !== userId) {
      throw new Error('Non autorisé à supprimer ce groupe');
    }
    
    evenement.groupesCovoiturage = evenement.groupesCovoiturage.filter(
      g => !g._id.equals(groupeId)
    );
    
    await evenement.save();
    
    return { message: 'Groupe de covoiturage supprimé avec succès', groupeId };
  }

  /**
   * Rejoindre un groupe de covoiturage
   */
  async rejoindreGroupe(evenementId, groupeId, userId) {
    const evenement = await Evenement.findById(evenementId);
    
    if (!evenement) {
      throw new Error('Événement non trouvé');
    }
    
    const groupe = evenement.groupesCovoiturage.id(groupeId);
    
    if (!groupe) {
      throw new Error('Groupe de covoiturage non trouvé');
    }
    
    // Vérifier si déjà membre
    if (groupe.membres.includes(userId)) {
      throw new Error('Vous êtes déjà membre de ce groupe');
    }
    
    // Vérifier la capacité
    if (groupe.membres.length >= (groupe.maxMembres || 4)) {
      throw new Error('Le groupe est complet');
    }
    
    groupe.membres.push(userId);
    await evenement.save();
    
    return groupe;
  }

  /**
   * Quitter un groupe de covoiturage
   */
  async quitterGroupe(evenementId, groupeId, userId) {
    const evenement = await Evenement.findById(evenementId);
    
    if (!evenement) {
      throw new Error('Événement non trouvé');
    }
    
    const groupe = evenement.groupesCovoiturage.id(groupeId);
    
    if (!groupe) {
      throw new Error('Groupe de covoiturage non trouvé');
    }
    
    // Vérifier si membre
    if (!groupe.membres.includes(userId)) {
      throw new Error('Vous n\'êtes pas membre de ce groupe');
    }
    
    groupe.membres = groupe.membres.filter(membre => !membre.equals(userId));
    await evenement.save();
    
    return groupe;
  }

  // ==================== MAINTENANCE AUTOMATIQUE ====================

  /**
   * Nettoyer les événements passés
   */
  async nettoyerEvenementsPasses(joursAvantSuppression = 30) {
    const dateLimit = new Date();
    dateLimit.setDate(dateLimit.getDate() - joursAvantSuppression);

    const resultat = await Evenement.deleteMany({
      dateFin: { $lt: dateLimit },
      statutEvenement: 'TERMINE'
    });

    console.log(`✅ ${resultat.deletedCount} événements passés supprimés (plus de ${joursAvantSuppression} jours)`);

    return {
      message: `${resultat.deletedCount} événements passés supprimés`,
      deletedCount: resultat.deletedCount,
      dateLimit
    };
  }

  /**
   * Mettre à jour automatiquement les statuts des événements
   */
  async mettreAJourStatutsAutomatiques() {
    const maintenant = new Date();
    
    // 1. Passer EN_COURS les événements qui ont commencé
    const enCours = await Evenement.updateMany(
      {
        dateDebut: { $lte: maintenant },
        dateFin: { $gte: maintenant },
        statutEvenement: 'PROGRAMME'
      },
      { 
        $set: { 
          statutEvenement: 'EN_COURS',
          motifChangementStatut: 'Mise à jour automatique - événement en cours'
        }
      }
    );

    // 2. Passer TERMINE les événements qui sont finis
    const termines = await Evenement.updateMany(
      {
        dateFin: { $lt: maintenant },
        statutEvenement: { $in: ['PROGRAMME', 'EN_COURS'] }
      },
      { 
        $set: { 
          statutEvenement: 'TERMINE',
          motifChangementStatut: 'Événement terminé automatiquement'
        }
      }
    );

    console.log(`✅ Statuts mis à jour: ${enCours.modifiedCount} en cours, ${termines.modifiedCount} terminés`);

    return {
      enCours: enCours.modifiedCount,
      termines: termines.modifiedCount,
      total: enCours.modifiedCount + termines.modifiedCount
    };
  }

  /**
   * Supprimer les groupes de covoiturage vides
   */
  async nettoyerGroupesVides() {
    const evenements = await Evenement.find({
      'groupesCovoiturage.0': { $exists: true }
    });

    let totalGroupesSupprimés = 0;

    for (const evenement of evenements) {
      const groupesAvant = evenement.groupesCovoiturage.length;
      
      evenement.groupesCovoiturage = evenement.groupesCovoiturage.filter(
        groupe => groupe.membres && groupe.membres.length > 0
      );
      
      const groupesApres = evenement.groupesCovoiturage.length;
      
      if (groupesAvant !== groupesApres) {
        await evenement.save();
        totalGroupesSupprimés += (groupesAvant - groupesApres);
      }
    }

    console.log(`✅ ${totalGroupesSupprimés} groupes de covoiturage vides supprimés`);

    return {
      message: `${totalGroupesSupprimés} groupes vides supprimés`,
      groupesSupprimés: totalGroupesSupprimés
    };
  }

  /**
   * Obtenir les événements nécessitant une action
   */
  async obtenirEvenementsNecessitantAction() {
    const maintenant = new Date();
    const dans24h = new Date(maintenant.getTime() + 24 * 60 * 60 * 1000);

    // Événements commençant dans moins de 24h
    const prochainement = await Evenement.find({
      dateDebut: { $gte: maintenant, $lte: dans24h },
      statutEvenement: 'PROGRAMME'
    });

    // Événements sans groupes de covoiturage
    const sansGroupes = await Evenement.find({
      dateDebut: { $gt: maintenant },
      statutEvenement: 'PROGRAMME',
      $or: [
        { groupesCovoiturage: { $size: 0 } },
        { groupesCovoiturage: { $exists: false } }
      ]
    }).limit(10);

    // Événements avec statut incohérent
    const statutIncohérent = await Evenement.find({
      $or: [
        { dateFin: { $lt: maintenant }, statutEvenement: { $in: ['PROGRAMME', 'EN_COURS'] } },
        { dateDebut: { $lte: maintenant }, dateFin: { $gte: maintenant }, statutEvenement: 'PROGRAMME' }
      ]
    });

    return {
      prochainement: {
        count: prochainement.length,
        evenements: prochainement
      },
      sansGroupes: {
        count: sansGroupes.length,
        evenements: sansGroupes
      },
      statutIncohérent: {
        count: statutIncohérent.length,
        evenements: statutIncohérent
      }
    };
  }

  /**
   * Valider la cohérence d'un événement
   */
  async validerCoherence(evenementId) {
    const evenement = await this.obtenirEvenementParId(evenementId);
    
    if (!evenement) {
      throw new Error('Événement non trouvé');
    }

    const erreurs = [];
    const avertissements = [];

    // Vérifier les dates
    if (evenement.dateFin <= evenement.dateDebut) {
      erreurs.push('La date de fin doit être postérieure à la date de début');
    }

    // Vérifier le statut
    const maintenant = new Date();
    if (evenement.dateFin < maintenant && evenement.statutEvenement !== 'TERMINE') {
      avertissements.push('L\'événement est passé mais le statut n\'est pas TERMINE');
    }

    if (evenement.dateDebut <= maintenant && evenement.dateFin >= maintenant && evenement.statutEvenement === 'PROGRAMME') {
      avertissements.push('L\'événement est en cours mais le statut est PROGRAMME');
    }

    // Vérifier les coordonnées
    if (evenement.lieu && evenement.lieu.coordonnees) {
      const [lng, lat] = evenement.lieu.coordonnees.coordinates;
      if (lng < -180 || lng > 180 || lat < -90 || lat > 90) {
        erreurs.push('Coordonnées GPS invalides');
      }
    }

    // Vérifier les groupes de covoiturage
    if (evenement.groupesCovoiturage) {
      evenement.groupesCovoiturage.forEach((groupe, index) => {
        if (groupe.membres.length > (groupe.maxMembres || 4)) {
          avertissements.push(`Groupe ${index + 1} : nombre de membres supérieur à la capacité`);
        }
      });
    }

    return {
      valide: erreurs.length === 0,
      erreurs,
      avertissements,
      evenement: {
        id: evenement._id,
        nom: evenement.nom
      }
    };
  }

  // ==================== 🆕 FAVORIS ====================

  /**
   * Ajouter un événement aux favoris d'un utilisateur
   */
  async ajouterAuxFavoris(evenementId, userId) {
    try {
      const Utilisateur = require('../models/Utilisateur');
      
      const evenement = await this.obtenirEvenementParId(evenementId);
      if (!evenement) {
        throw new Error('Événement non trouvé');
      }
      
      const utilisateur = await Utilisateur.findById(userId);
      if (!utilisateur) {
        throw new Error('Utilisateur non trouvé');
      }
      
      // Vérifier si déjà en favoris
      if (utilisateur.evenementsFavoris && utilisateur.evenementsFavoris.includes(evenementId)) {
        throw new Error('Événement déjà dans les favoris');
      }
      
      // Ajouter aux favoris
      if (!utilisateur.evenementsFavoris) {
        utilisateur.evenementsFavoris = [];
      }
      utilisateur.evenementsFavoris.push(evenementId);
      await utilisateur.save();
      
      return {
        utilisateur: userId,
        evenement: evenementId,
        ajouteLe: new Date()
      };
    } catch (error) {
      console.error('Erreur ajouterAuxFavoris:', error);
      throw error;
    }
  }

  /**
   * Retirer un événement des favoris
   */
  async retirerDesFavoris(evenementId, userId) {
    try {
      const Utilisateur = require('../models/Utilisateur');
      
      const utilisateur = await Utilisateur.findById(userId);
      if (!utilisateur) {
        throw new Error('Utilisateur non trouvé');
      }
      
      if (!utilisateur.evenementsFavoris || !utilisateur.evenementsFavoris.includes(evenementId)) {
        throw new Error('Événement n\'est pas dans les favoris');
      }
      
      utilisateur.evenementsFavoris = utilisateur.evenementsFavoris.filter(
        id => id.toString() !== evenementId.toString()
      );
      await utilisateur.save();
      
      return {
        utilisateur: userId,
        evenement: evenementId,
        retireLe: new Date()
      };
    } catch (error) {
      console.error('Erreur retirerDesFavoris:', error);
      throw error;
    }
  }

  /**
   * Obtenir les favoris d'un utilisateur
   */
  async obtenirFavoris(userId) {
    try {
      const Utilisateur = require('../models/Utilisateur');
      
      const utilisateur = await Utilisateur.findById(userId)
        .populate({
          path: 'evenementsFavoris',
          match: { statutEvenement: { $ne: 'ANNULE' } },
          options: { sort: { dateDebut: 1 } }
        });
      
      if (!utilisateur) {
        throw new Error('Utilisateur non trouvé');
      }
      
      return utilisateur.evenementsFavoris || [];
    } catch (error) {
      console.error('Erreur obtenirFavoris:', error);
      throw error;
    }
  }

  // ==================== 🆕 QUARTIERS ABIDJAN ====================

  /**
   * Obtenir les événements par quartier d'Abidjan
   */
  async obtenirEvenementsParQuartier(commune, quartier = null) {
    try {
      const communesValides = [
        'COCODY', 'YOPOUGON', 'ABOBO', 'PLATEAU', 
        'KOUMASSI', 'MARCORY', 'TREICHVILLE', 
        'PORT_BOUET', 'ATTÉCOUBÉ', 'ADJAMÉ'
      ];
      
      if (!communesValides.includes(commune)) {
        throw new Error(`Commune invalide. Communes valides: ${communesValides.join(', ')}`);
      }
      
      const query = {
        'lieu.commune': commune,
        statutEvenement: { $in: ['PROGRAMME', 'EN_COURS'] },
        dateDebut: { $gte: new Date() }
      };
      
      if (quartier) {
        query['lieu.quartier'] = new RegExp(quartier, 'i');
      }
      
      const evenements = await Evenement.find(query)
        .sort({ dateDebut: 1 })
        .populate('trajetsAssocies');
      
      return evenements;
    } catch (error) {
      console.error('Erreur obtenirEvenementsParQuartier:', error);
      throw error;
    }
  }

  // ==================== 🆕 RECOMMANDATIONS ====================

  /**
   * Recommander des événements à un utilisateur
   */
  async recommanderEvenements(userId, limit = 10) {
    try {
      const Utilisateur = require('../models/Utilisateur');
      
      const utilisateur = await Utilisateur.findById(userId)
        .populate('evenementsFavoris');
      
      if (!utilisateur) {
        throw new Error('Utilisateur non trouvé');
      }
      
      // Analyser les préférences basées sur les favoris
      const typesPreferences = [];
      const villesPreferences = [];
      
      if (utilisateur.evenementsFavoris && utilisateur.evenementsFavoris.length > 0) {
        utilisateur.evenementsFavoris.forEach(evt => {
          if (evt.typeEvenement) typesPreferences.push(evt.typeEvenement);
          if (evt.lieu && evt.lieu.ville) villesPreferences.push(evt.lieu.ville);
        });
      }
      
      // Construire la requête de recommandation
      const query = {
        statutEvenement: 'PROGRAMME',
        dateDebut: { $gte: new Date() }
      };
      
      // Exclure les événements déjà en favoris
      if (utilisateur.evenementsFavoris && utilisateur.evenementsFavoris.length > 0) {
        query._id = { $nin: utilisateur.evenementsFavoris.map(e => e._id) };
      }
      
      // Filtrer par préférences si disponibles
      if (typesPreferences.length > 0) {
        query.typeEvenement = { $in: typesPreferences };
      }
      
      const recommandations = await Evenement.find(query)
        .sort({ dateDebut: 1, 'notations.moyenneNote': -1 })
        .limit(limit)
        .populate('trajetsAssocies');
      
      return recommandations;
    } catch (error) {
      console.error('Erreur recommanderEvenements:', error);
      throw error;
    }
  }

  // ==================== 🆕 CONFLITS HORAIRE ====================

  /**
   * Vérifier les conflits d'horaire pour un utilisateur
   */
  async verifierConflitsHoraire(userId, evenementId) {
    try {
      const evenement = await this.obtenirEvenementParId(evenementId);
      if (!evenement) {
        throw new Error('Événement non trouvé');
      }
      
      // Trouver tous les événements où l'utilisateur est dans un groupe
      const evenementsUtilisateur = await Evenement.find({
        'groupesCovoiturage.membres': userId,
        statutEvenement: { $in: ['PROGRAMME', 'EN_COURS'] },
        _id: { $ne: evenementId }
      });
      
      const conflits = [];
      
      evenementsUtilisateur.forEach(evt => {
        // Vérifier chevauchement de dates
        if (
          (evenement.dateDebut <= evt.dateFin && evenement.dateFin >= evt.dateDebut) ||
          (evt.dateDebut <= evenement.dateFin && evt.dateFin >= evenement.dateDebut)
        ) {
          conflits.push({
            evenementId: evt._id,
            nom: evt.nom,
            dateDebut: evt.dateDebut,
            dateFin: evt.dateFin
          });
        }
      });
      
      return {
        aDesConflits: conflits.length > 0,
        conflits: conflits
      };
    } catch (error) {
      console.error('Erreur verifierConflitsHoraire:', error);
      throw error;
    }
  }

  // ==================== 🆕 PARTAGE SOCIAL ====================

  /**
   * Générer les liens de partage pour un événement
   */
  async genererLienPartage(evenementId) {
    try {
      const evenement = await this.obtenirEvenementParId(evenementId);
      if (!evenement) {
        throw new Error('Événement non trouvé');
      }
      
      const baseUrl = process.env.FRONTEND_URL || 'https://wayzeco.com';
      const lienEvenement = `${baseUrl}/evenements/${evenementId}`;
      
      const textePartage = encodeURIComponent(
        `Rejoignez-moi à ${evenement.nom} le ${evenement.dateDebut.toLocaleDateString('fr-FR')} à ${evenement.lieu.ville}!`
      );
      
      return {
        lien: lienEvenement,
        whatsapp: `https://wa.me/?text=${textePartage}%20${encodeURIComponent(lienEvenement)}`,
        facebook: `https://www.facebook.com/sharer/sharer.php?u=${encodeURIComponent(lienEvenement)}`,
        twitter: `https://twitter.com/intent/tweet?text=${textePartage}&url=${encodeURIComponent(lienEvenement)}`,
        sms: `sms:?body=${textePartage}%20${encodeURIComponent(lienEvenement)}`,
        email: `mailto:?subject=${encodeURIComponent(evenement.nom)}&body=${textePartage}%20${encodeURIComponent(lienEvenement)}`
      };
    } catch (error) {
      console.error('Erreur genererLienPartage:', error);
      throw error;
    }
  }

  // ==================== 🆕 NOTIFICATIONS ====================

  /**
   * Envoyer des rappels pour un événement
   */
  async envoyerRappelsEvenement(evenementId) {
    try {
      const evenement = await this.obtenirEvenementParId(evenementId);
      if (!evenement) {
        throw new Error('Événement non trouvé');
      }
      
      // Collecter tous les membres des groupes de covoiturage
      const membreIds = new Set();
      evenement.groupesCovoiturage.forEach(groupe => {
        groupe.membres.forEach(membreId => {
          membreIds.add(membreId.toString());
        });
      });
      
      const Utilisateur = require('../models/Utilisateur');
      const membres = await Utilisateur.find({
        _id: { $in: Array.from(membreIds) }
      });
      
      // Préparer les notifications
      const notifications = [];
      
      for (const membre of membres) {
        // Email (si configuré)
        if (membre.email) {
          notifications.push({
            type: 'email',
            destinataire: membre.email,
            sujet: `Rappel: ${evenement.nom}`,
            message: `Bonjour ${membre.prenom}, n'oubliez pas votre événement ${evenement.nom} le ${evenement.dateDebut.toLocaleDateString('fr-FR')} à ${evenement.lieu.nom}.`
          });
        }
        
        // WhatsApp (si numéro disponible)
        if (membre.numeroTelephone) {
          notifications.push({
            type: 'whatsapp',
            destinataire: membre.numeroTelephone,
            message: `🎉 Rappel: ${evenement.nom} le ${evenement.dateDebut.toLocaleDateString('fr-FR')} à ${evenement.lieu.nom}. À bientôt!`
          });
        }
      }
      
      return {
        evenementId,
        totalNotifications: notifications.length,
        notifications: notifications,
        statut: 'planifié'
      };
    } catch (error) {
      console.error('Erreur envoyerRappelsEvenement:', error);
      throw error;
    }
  }

  // ==================== 🆕 TRAJETS AUTOMATIQUES ====================

  /**
   * Créer un trajet depuis un groupe de covoiturage
   */
  async creerTrajetDepuisGroupe(evenementId, groupeId, donneesTrajet) {
    try {
      const evenement = await this.obtenirEvenementParId(evenementId);
      if (!evenement) {
        throw new Error('Événement non trouvé');
      }
      
      const groupe = evenement.groupesCovoiturage.id(groupeId);
      if (!groupe) {
        throw new Error('Groupe de covoiturage non trouvé');
      }
      
      const Trajet = require('../models/Trajet');
      
      // Créer le trajet avec les données du groupe
      const trajet = new Trajet({
        ...donneesTrajet,
        destination: {
          adresse: evenement.lieu.adresse,
          ville: evenement.lieu.ville,
          coordonnees: evenement.lieu.coordonnees
        },
        dateDepart: evenement.dateDebut,
        prixParPlace: groupe.tarifPrefere || donneesTrajet.prixParPlace,
        placesDisponibles: groupe.maxMembres || 4,
        evenementAssocie: evenementId
      });
      
      await trajet.save();
      
      // Ajouter le trajet à l'événement
      evenement.trajetsAssocies.push(trajet._id);
      await evenement.save();
      
      return trajet;
    } catch (error) {
      console.error('Erreur creerTrajetDepuisGroupe:', error);
      throw error;
    }
  }

  /**
 * Créer un trajet directement pour un événement
 */
async creerTrajetPourEvenement(donneesTrajet) {
  try {
    console.log('🚗 Création trajet pour événement:', donneesTrajet.evenementAssocie);
    
    const Trajet = require('../models/Trajet');
    const Utilisateur = require('../models/Utilisateur');
    const Vehicule = require('../models/Vehicule');
    
    // Vérifier que le conducteur existe
    const conducteur = await Utilisateur.findById(donneesTrajet.conducteur);
    
    if (!conducteur) {
      throw new Error('Conducteur non trouvé');
    }
    
    if (conducteur.role !== 'conducteur') {
      throw new Error('L\'utilisateur doit avoir le rôle conducteur');
    }

    const vehiculesConducteur = await Vehicule.find({ proprietaireId: conducteur._id, $or: [{estActif: true}, {statut: "ACTIF"}] });

    if (vehiculesConducteur.length === 0) {
      throw new Error('vous devez avoir au moins un véhicule actif');
    }
    
    // ✅ RÉCUPÉRER LES DÉTAILS DU VÉHICULE
    const vehicule = vehiculesConducteur.find(v => v.estPrincipal) || vehiculesConducteur[0];
    
    if (!vehicule) {
      throw new Error('Véhicule non trouvé');
    }
    
    // ✅ FORMATER LES DONNÉES DU VÉHICULE SELON LE SCHÉMA
    const vehiculeUtilise = {
      marque: vehicule.marque,
      modele: vehicule.modele,
      couleur: vehicule.couleur,
      immatriculation: vehicule.immatriculation,
      nombrePlaces: vehicule.nombrePlaces
    };

  
    
    console.log('✅ Véhicule récupéré:', vehiculeUtilise);
    
    // ✅ CALCULER LA DATE ET L'HEURE
    const dateDepart = new Date(donneesTrajet.heureDepart);
    const heureDepart = `${dateDepart.getHours().toString().padStart(2, '0')}:${dateDepart.getMinutes().toString().padStart(2, '0')}`;
    
    // ✅ FORMATER LE POINT DE DÉPART
    const pointDepart = {
      nom: donneesTrajet.origine.nom || donneesTrajet.origine.quartier || donneesTrajet.origine.commune || 'Point de départ',
      adresse: donneesTrajet.origine.adresse,
      ville: donneesTrajet.origine.ville,
      commune: donneesTrajet.origine.commune,
      quartier: donneesTrajet.origine.quartier,
      coordonnees: donneesTrajet.origine.coordonnees
    };
    
    // ✅ FORMATER LE POINT D'ARRIVÉE
    const pointArrivee = {
      nom: donneesTrajet.destination.nom || donneesTrajet.destination.quartier || donneesTrajet.destination.commune || 'Point d\'arrivée',
      adresse: donneesTrajet.destination.adresse,
      ville: donneesTrajet.destination.ville,
      commune: donneesTrajet.destination.commune,
      quartier: donneesTrajet.destination.quartier,
      coordonnees: donneesTrajet.destination.coordonnees
    };
    
    // ✅ CRÉER LE TRAJET AVEC LES BONNES DONNÉES
    const donneesTrajetFormatees = {
      conducteurId: donneesTrajet.conducteur,
      vehiculeUtilise: vehiculeUtilise,
      pointDepart: pointDepart,
      pointArrivee: pointArrivee,
      dateDepart: dateDepart,
      heureDepart: heureDepart,
      nombrePlacesTotal: donneesTrajet.placesDisponibles,
      nombrePlacesDisponibles: donneesTrajet.placesDisponibles,
      prixParPassager: donneesTrajet.prixParPlace,
      distance: donneesTrajet.distance || 0.1, // Sera calculé automatiquement
      
      // Statut
      statutTrajet: 'PROGRAMME',
      typeTrajet: 'EVENEMENTIEL',
      
      // Optionnels
      evenementAssocie: donneesTrajet.evenementAssocie,
      preferences: donneesTrajet.preferences || {},
      commentaireConducteur: donneesTrajet.notesConducteur,
      validationAutomatique: false
    };
    
    console.log('📦 Données formatées pour le modèle:', JSON.stringify(donneesTrajetFormatees, null, 2));
    
    // Créer le trajet
    const trajet = await Trajet.create(donneesTrajetFormatees);
    
    console.log('✅ Trajet créé avec ID:', trajet._id);
    
    // Mettre à jour l'événement pour ajouter le trajet associé
    if (donneesTrajet.evenementAssocie) {
      await Evenement.findByIdAndUpdate(
        donneesTrajet.evenementAssocie,
        {
          $addToSet: { trajetsAssocies: trajet._id }
        }
      );
      
      console.log('✅ Trajet ajouté à l\'événement');
    }
    
    // Retourner le trajet avec les données populées
    const trajetPopule = await Trajet.findById(trajet._id)
      .populate('conducteurId', 'nom prenom photo numeroTelephone noteGlobale')
      .populate('evenementAssocie', 'nom dateDebut lieu');
    
    console.log('✅ Trajet créé avec succès:', trajet._id);
    
    return trajetPopule;
  } catch (error) {
    console.error('❌ Erreur creerTrajetPourEvenement service:', error);
    throw error;
  }
}

  /**
   * Proposer des trajets automatiques pour un événement
   */
  async proposerTrajetsAutomatiques(evenementId, origineUtilisateur = null) {
    try {
      const evenement = await this.obtenirEvenementParId(evenementId);
      if (!evenement) {
        throw new Error('Événement non trouvé');
      }
      
      const Trajet = require('../models/Trajet');
      
      // Rechercher les trajets existants allant vers cet événement
      let query = {
        evenementAssocie: evenementId,
        dateDepart: {
          $gte: new Date(),
          $lte: evenement.dateDebut
        },
        placesDisponibles: { $gt: 0 }
      };
      
      // Si l'utilisateur fournit son origine, chercher les trajets proches
      if (origineUtilisateur && origineUtilisateur.latitude && origineUtilisateur.longitude) {
        query['origine.coordonnees'] = {
          $near: {
            $geometry: {
              type: 'Point',
              coordinates: [origineUtilisateur.longitude, origineUtilisateur.latitude]
            },
            $maxDistance: 10000 // 10 km
          }
        };
      }
      
      const trajets = await Trajet.find(query)
        .populate('conducteur', 'prenom nom noteGlobale')
        .sort({ dateDepart: 1 })
        .limit(10);
      
      return trajets;
    } catch (error) {
      console.error('Erreur proposerTrajetsAutomatiques:', error);
      throw error;
    }
  }
}

module.exports = new EvenementService();