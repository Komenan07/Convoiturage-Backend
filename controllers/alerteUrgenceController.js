// controllers/alerteUrgenceController.js
const alerteUrgenceService = require('../services/alerteUrgenceService');
const { AppError, asyncHandler, sendResponse } = require('../utils/helpers');

/**
 * Déclencher une nouvelle alerte d'urgence
 * POST /api/alertes-urgence
 */
const declencherAlerte = asyncHandler(async (req, res) => {
  const utilisateurId = req.user.id;
  
  // Validation renforcée
  if (req.body.declencheurId && req.body.declencheurId !== utilisateurId) {
    throw new AppError('Action non autorisée : vous ne pouvez déclencher une alerte que pour votre compte', 403);
  }

  // Ajout de la position automatique si manquante
  const payload = {
    ...req.body,
    position: req.body.position || req.user.position
  };

  const alerte = await alerteUrgenceService.declencherAlerte(payload, utilisateurId);
  
  // Log structuré
  console.log({
    event: 'ALERTE_DECLENCHEE',
    userId: utilisateurId,
    alerteId: alerte._id,
    niveau: alerte.niveauGravite,
    type: alerte.typeAlerte,
    position: alerte.position
  });
  
  sendResponse(res, 201, {
    success: true,
    message: 'Alerte d\'urgence déclenchée avec succès',
    data: alerte,
    urgence: {
      numero: alerte.numeroUrgence,
      priorite: alerte.priorite,
      contactsNotifies: alerte.contactsAlertes.length
    }
  });
});

/**
 * Obtenir toutes les alertes avec filtres
 * GET /api/alertes-urgence
 */
const obtenirAlertes = asyncHandler(async (req, res) => {
  // Validation des paramètres
  const { page, limite } = validerPagination(req.query.page, req.query.limite);
  
  const filtres = construireFiltres(req.query);
  const options = {
    page,
    limite,
    tri: construireTri(req.query.tri || 'priorite_desc')
  };

  const resultat = await alerteUrgenceService.rechercherAlertes(filtres, options);
  
  sendResponse(res, 200, {
    success: true,
    message: 'Alertes récupérées avec succès',
    data: resultat.alertes,
    pagination: resultat.pagination
  });
});

/**
 * Obtenir une alerte par ID
 * GET /api/alertes-urgence/:id
 */
const obtenirAlerte = asyncHandler(async (req, res) => {
  const alerte = await alerteUrgenceService.obtenirAlerte(req.params.id);
  
  // Audit d'accès
  console.log({
    event: 'CONSULTATION_ALERTE',
    alerteId: alerte._id,
    userId: req.user?.id,
    niveau: alerte.niveauGravite
  });
  
  sendResponse(res, 200, {
    success: true,
    message: 'Alerte récupérée avec succès',
    data: alerte
  });
});

/**
 * Mettre à jour le statut d'une alerte
 * [Correction ajoutée] - Validation étendue
 */
const mettreAJourStatut = asyncHandler(async (req, res) => {
  const { statutAlerte } = req.body;
  const utilisateurId = req.user.id;
  
  if (!statutAlerte) {
    throw new AppError('Le statut est requis', 400);
  }

  // Vérification des permissions
  const alerte = await alerteUrgenceService.obtenirAlerte(req.params.id);
  if (!req.user.estAdmin && alerte.declencheurId.toString() !== utilisateurId) {
    throw new AppError('Vous n\'avez pas les droits pour modifier cette alerte', 403);
  }

  const updated = await alerteUrgenceService.mettreAJourStatut(
    req.params.id,
    statutAlerte,
    utilisateurId,
    req.body
  );
  
  sendResponse(res, 200, {
    success: true,
    message: `Statut mis à jour : ${statutAlerte}`,
    data: updated
  });
});

/**
 * Export des alertes - Correction majeure
 */
const exporterAlertes = asyncHandler(async (req, res) => {
  const { format = 'json', ...queryParams } = req.query;
  const filtres = construireFiltres(queryParams);

  // Limitation des exports
  const maxLimit = format === 'csv' ? 5000 : 10000;
  const options = { limite: maxLimit, peupler: false };

  const resultat = await alerteUrgenceService.rechercherAlertes(filtres, options);
  
  if (format === 'csv') {
    // Implémentation CSV basique
    let csv = 'ID,Numero,Type,Statut,CreatedAt\n';
    resultat.alertes.forEach(a => {
      csv += `${a._id},${a.numeroUrgence},${a.typeAlerte},${a.statutAlerte},${a.createdAt}\n`;
    });
    
    res.header('Content-Type', 'text/csv');
    res.attachment('alertes-urgence.csv');
    return res.send(csv);
  } 
  
  // Format JSON
  res.header('Content-Type', 'application/json');
  res.attachment('alertes-urgence.json');
  res.send(JSON.stringify({
    exportedAt: new Date(),
    count: resultat.alertes.length,
    data: resultat.alertes
  }));
});

// === FONCTIONS UTILITAIRES AMÉLIORÉES ===

/**
 * Construction des filtres optimisée
 */
const construireFiltres = (query) => {
  const filtres = {};
  const arrayFields = ['statutAlerte', 'typeAlerte', 'niveauGravite'];
  
  arrayFields.forEach(field => {
    if (query[field]) filtres[field] = query[field].split(',');
  });

  // Filtres simples
  const simpleFields = ['ville', 'declencheurId', 'estCritique'];
  simpleFields.forEach(field => {
    if (query[field]) filtres[field] = query[field];
  });

  // Dates
  if (query.dateDebut || query.dateFin) {
    filtres.createdAt = {
      ...(query.dateDebut && { $gte: new Date(query.dateDebut) }),
      ...(query.dateFin && { $lte: new Date(query.dateFin) })
    };
  }

  return filtres;
};

/**
 * Validation pagination robuste
 */
const validerPagination = (page, limite) => {
  const pageNum = parseInt(page) || 1;
  const limiteNum = Math.min(parseInt(limite) || 20, 100);

  if (pageNum < 1) throw new AppError('Numéro de page invalide', 400);
  if (limiteNum < 1) throw new AppError('Limite invalide', 400);

  return { page: pageNum, limite: limiteNum };
};

/**
 * Construit un objet de tri pour MongoDB
 * @param {string} triString - Chaîne de tri (ex: "priorite_desc")
 * @returns {Object} Objet de tri MongoDB
 */
const construireTri = (triString) => {
  const [champ, ordre] = triString.split('_');
  return { [champ]: ordre === 'desc' ? -1 : 1 };
};

// EXPORT UNIQUEMENT DES FONCTIONS IMPLÉMENTÉES
module.exports = {
  declencherAlerte,
  obtenirAlertes,
  obtenirAlerte,
  mettreAJourStatut,
  exporterAlertes
};