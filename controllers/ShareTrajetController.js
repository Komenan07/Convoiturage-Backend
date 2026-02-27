const shareTrajetService = require('../services/shareTrajetService');
const TrajetPartage      = require('../models/TrajetPartage');
const AppError           = require('../utils/AppError');

/**
 * =========================================================
 *  🎮 ShareTrajetController
 *  Gère les routes de partage de trajet à un proche
 * =========================================================
 */
class ShareTrajetController {

  constructor() {
    Object.getOwnPropertyNames(ShareTrajetController.prototype)
      .filter(m => m !== 'constructor')
      .forEach(m => { this[m] = this[m].bind(this); });
  }

  // ─────────────────────────────────────────────
  // POST /api/trajets/:id/partager
  // Body: { proche: { nom, telephone, email }, canaux: ['SMS','EMAIL','WHATSAPP'] }
  // Auth: requis (passager ou conducteur du trajet)
  // ─────────────────────────────────────────────
  async partagerTrajet(req, res, next) {
    try {
      const { id: trajetId } = req.params;
      const { proche, canaux } = req.body;

      // ── Validation contact ─────────────────────────────────
      if (!proche || (!proche.telephone && !proche.email)) {
        return res.status(400).json({
          success: false,
          message: 'Veuillez fournir au moins un numéro de téléphone ou une adresse email'
        });
      }

      // ── Validation canaux ──────────────────────────────────
      if (!canaux || !Array.isArray(canaux) || canaux.length === 0) {
        return res.status(400).json({
          success: false,
          message: 'Veuillez sélectionner au moins un canal de partage (SMS, EMAIL, WHATSAPP)'
        });
      }

      const canauxValides = ['SMS', 'EMAIL', 'WHATSAPP'];
      const canauxInvalides = canaux.filter(c => !canauxValides.includes(c));
      if (canauxInvalides.length > 0) {
        return res.status(400).json({
          success: false,
          message: `Canaux invalides : ${canauxInvalides.join(', ')}`,
          canauxAcceptes: canauxValides
        });
      }

      console.log(`📤 Partage trajet ${trajetId} par user ${req.user.id}`);

      const result = await shareTrajetService.partagerTrajet(
        trajetId,
        req.user.id,
        proche,
        canaux
      );

      res.status(201).json({
        success: true,
        message: 'Trajet partagé avec succès',
        data: {
          lienSuivi:   result.lienSuivi,
          lienWhatsApp: result.lienWhatsApp,
          expiresAt:   result.expiresAt,
          statutEnvoi: result.partage.statutEnvoi,
          partageId:   result.partage._id
        }
      });

    } catch (error) {
      console.error('❌ Erreur partagerTrajet:', error.message);
      if (
        error.message.includes('introuvable') ||
        error.message.includes('expiré')      ||
        error.message.includes('Impossible')
      ) {
        return res.status(400).json({ success: false, message: error.message });
      }
      return next(AppError.serverError('Erreur lors du partage du trajet', {
        originalError: error.message
      }));
    }
  }

  // ─────────────────────────────────────────────
  // GET /api/suivi/:token   (ROUTE PUBLIQUE — sans auth)
  // Utilisée par le proche pour voir les infos du trajet
  // ✅ CORRIGÉ : next retiré (jamais utilisé → warning ESLint)
  // ─────────────────────────────────────────────
  async suivreTrajet(req, res) {
    try {
      const { token } = req.params;

      if (!token || token.length < 10) {
        return res.status(400).json({
          success: false,
          message: 'Token de suivi invalide'
        });
      }

      const infos = await shareTrajetService.obtenirInfosPubliques(token);

      res.json({
        success: true,
        data: infos
      });

    } catch (error) {
      console.error('❌ Erreur suivreTrajet:', error.message);
      const isUserError =
        error.message.includes('invalide') ||
        error.message.includes('expiré');

      return res.status(isUserError ? 404 : 500).json({
        success: false,
        message: error.message
      });
    }
  }

  // ─────────────────────────────────────────────
  // GET /api/trajets/:id/partages
  // Liste tous les partages actifs pour un trajet
  // Auth: conducteur uniquement
  // ─────────────────────────────────────────────
  async listerPartages(req, res, next) {
    try {
      const { id: trajetId } = req.params;

      const partages = await TrajetPartage.find({
        trajetId,
        partagePar: req.user.id
      })
        .select('-token') // ne jamais exposer le token brut dans la liste
        .sort({ createdAt: -1 })
        .lean();

      res.json({
        success: true,
        count: partages.length,
        data: partages
      });

    } catch (error) {
      return next(AppError.serverError('Erreur lors de la récupération des partages', {
        originalError: error.message
      }));
    }
  }

  // ─────────────────────────────────────────────
  // DELETE /api/trajets/partages/:partageId
  // Révoquer un lien de suivi
  // Auth: utilisateur qui a créé le partage
  // ─────────────────────────────────────────────
  async revoquerPartage(req, res, next) {
    try {
      const { partageId } = req.params;

      const partage = await TrajetPartage.findById(partageId);

      if (!partage) {
        return res.status(404).json({
          success: false,
          message: 'Partage non trouvé'
        });
      }

      if (partage.partagePar.toString() !== req.user.id.toString()) {
        return res.status(403).json({
          success: false,
          message: 'Vous n\'êtes pas autorisé à révoquer ce partage'
        });
      }

      partage.actif = false;
      await partage.save();

      res.json({
        success: true,
        message: 'Lien de suivi révoqué avec succès'
      });

    } catch (error) {
      return next(AppError.serverError('Erreur lors de la révocation du partage', {
        originalError: error.message
      }));
    }
  }
}

module.exports = new ShareTrajetController();