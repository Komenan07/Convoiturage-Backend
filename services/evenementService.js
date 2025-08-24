const Evenement = require('../models/Evenement');

class EvenementService {
  
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

  async obtenirEvenementParId(id) {
    return await Evenement.findById(id)
      .populate('organisateur', 'nom prenom avatar')
      .populate('trajetsAssocies');
  }

  async creerEvenement(donneesEvenement) {
    const evenement = new Evenement(donneesEvenement);
    return await evenement.save();
  }

  async mettreAJourEvenement(id, donneesMAJ) {
    return await Evenement.findByIdAndUpdate(
      id, 
      donneesMAJ, 
      { new: true, runValidators: true }
    );
  }

  async supprimerEvenement(id, _userId) { // Préfixé avec _ pour indiquer paramètre non utilisé
    const evenement = await this.obtenirEvenementParId(id);
    
    if (!evenement) {
      throw new Error('Événement non trouvé');
    }

    // Vérifier les permissions (optionnel)
    // if (evenement.organisateur.toString() !== _userId) {
    //   throw new Error('Non autorisé');
    // }

    await Evenement.findByIdAndDelete(id);
    return { message: 'Événement supprimé', id };
  }

  async changerStatut(id, nouveauStatut, userId, motif = null) {
    const evenement = await this.obtenirEvenementParId(id);
    
    if (!evenement) {
      throw new Error('Événement non trouvé');
    }

    // Vérification optionnelle des permissions
    // if (evenement.organisateur.toString() !== userId) {
    //   throw new Error('Non autorisé à modifier cet événement');
    // }

    evenement.statutEvenement = nouveauStatut;
    if (motif) {
      evenement.motifChangementStatut = motif;
    }
    
    return await evenement.save();
  }

  async rechercherParProximite(latitude, longitude, rayonKm, limit = 20) {
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
      default:
        dateDebut.setDate(dateDebut.getDate() - 30);
    }

    const filtres = { createdAt: { $gte: dateDebut } };
    if (ville) {
      filtres['lieu.ville'] = new RegExp(ville, 'i');
    }

    const totalEvenements = await Evenement.countDocuments(filtres);
    const parStatut = await Evenement.aggregate([
      { $match: filtres },
      { $group: { _id: '$statutEvenement', count: { $sum: 1 } } }
    ]);

    const parType = await Evenement.aggregate([
      { $match: filtres },
      { $group: { _id: '$typeEvenement', count: { $sum: 1 } } }
    ]);

    return {
      totalEvenements,
      parStatut,
      parType,
      periode,
      ville: ville || 'toutes'
    };
  }

  async exporterEvenements(filtres = {}) {
    return await Evenement.find(filtres)
      .populate('organisateur', 'nom prenom')
      .sort({ dateDebut: 1 });
  }

  async convertirEnCSV(evenements) {
    const headers = ['nom', 'description', 'typeEvenement', 'dateDebut', 'lieu.ville', 'statutEvenement'];
    const csv = [headers.join(',')];
    
    evenements.forEach(event => {
      const row = [
        `"${event.nom}"`,
        `"${event.description}"`,
        event.typeEvenement,
        event.dateDebut.toISOString(),
        `"${event.lieu.ville}"`,
        event.statutEvenement
      ];
      csv.push(row.join(','));
    });
    
    return csv.join('\n');
  }

  async construireCriteresRecherche(params) {
    const criteres = {};
    
    if (params.motsCles) {
      criteres.$or = [
        { nom: new RegExp(params.motsCles, 'i') },
        { description: new RegExp(params.motsCles, 'i') },
        { tags: new RegExp(params.motsCles, 'i') }
      ];
    }
    
    if (params.typeEvenement) {
      criteres.typeEvenement = params.typeEvenement;
    }
    
    if (params.ville) {
      criteres['lieu.ville'] = new RegExp(params.ville, 'i');
    }
    
    if (params.dateDebutMin || params.dateDebutMax) {
      criteres.dateDebut = {};
      if (params.dateDebutMin) criteres.dateDebut.$gte = new Date(params.dateDebutMin);
      if (params.dateDebutMax) criteres.dateDebut.$lte = new Date(params.dateDebutMax);
    }
    
    if (params.capaciteMin || params.capaciteMax) {
      criteres.capaciteEstimee = {};
      if (params.capaciteMin) criteres.capaciteEstimee.$gte = params.capaciteMin;
      if (params.capaciteMax) criteres.capaciteEstimee.$lte = params.capaciteMax;
    }
    
    if (params.tags && Array.isArray(params.tags)) {
      criteres.tags = { $in: params.tags };
    }
    
    return criteres;
  }

  async rechercheAvancee(criteres, options) {
    return await this.obtenirEvenements(criteres, options);
  }

  async obtenirGroupesCovoiturage(evenementId) {
    const evenement = await Evenement.findById(evenementId);
    if (!evenement) {
      throw new Error('Événement non trouvé');
    }
    return evenement.groupesCovoiturage || [];
  }

  async ajouterGroupeCovoiturage(evenementId, donneesGroupe) {
    const evenement = await Evenement.findById(evenementId);
    if (!evenement) {
      throw new Error('Événement non trouvé');
    }
    
    evenement.groupesCovoiturage.push(donneesGroupe);
    await evenement.save();
    
    return evenement.groupesCovoiturage[evenement.groupesCovoiturage.length - 1];
  }

  async supprimerGroupeCovoiturage(evenementId, groupeId, _userId) { // Préfixé avec _ pour indiquer paramètre non utilisé
    const evenement = await Evenement.findById(evenementId);
    if (!evenement) {
      throw new Error('Événement non trouvé');
    }
    
    // Vérification optionnelle des permissions
    // const groupe = evenement.groupesCovoiturage.id(groupeId);
    // if (groupe && groupe.conducteur && groupe.conducteur.toString() !== _userId) {
    //   throw new Error('Non autorisé à supprimer ce groupe');
    // }
    
    evenement.groupesCovoiturage = evenement.groupesCovoiturage.filter(
      groupe => !groupe._id.equals(groupeId)
    );
    
    await evenement.save();
    return { message: 'Groupe supprimé', groupeId };
  }

  async rejoindrGroupe(evenementId, groupeId, userId) {
    const evenement = await Evenement.findById(evenementId);
    if (!evenement) {
      throw new Error('Événement non trouvé');
    }
    
    const groupe = evenement.groupesCovoiturage.id(groupeId);
    if (!groupe) {
      throw new Error('Groupe non trouvé');
    }
    
    if (!groupe.membres.includes(userId)) {
      groupe.membres.push(userId);
      await evenement.save();
    }
    
    return groupe;
  }

  async quitterGroupe(evenementId, groupeId, userId) {
    const evenement = await Evenement.findById(evenementId);
    if (!evenement) {
      throw new Error('Événement non trouvé');
    }
    
    const groupe = evenement.groupesCovoiturage.id(groupeId);
    if (!groupe) {
      throw new Error('Groupe non trouvé');
    }
    
    groupe.membres = groupe.membres.filter(membre => !membre.equals(userId));
    await evenement.save();
    
    return groupe;
  }
}

module.exports = EvenementService;