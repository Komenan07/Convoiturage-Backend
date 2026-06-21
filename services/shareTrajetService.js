const crypto            = require('crypto');
const TrajetPartage     = require('../models/TrajetPartage');
const Trajet            = require('../models/Trajet');
const notificationService = require('./notificationService');
const Reservation = require('../models/Reservation');


/**
 * =========================================================
 *  🔗 shareTrajetService
 *  Gère le partage d'un trajet à un proche via SMS / Email / WhatsApp
 * =========================================================
 */

const shareTrajetService = {

  // ─────────────────────────────────────────────────────────────
  // 1. TOKEN UNIQUE
  // ─────────────────────────────────────────────────────────────

  /**
   * Génère un token sécurisé de 40 caractères hexadécimaux (160 bits)
   * @returns {string}
   */
  _genererToken() {
    return crypto.randomBytes(20).toString('hex');
  },

  // ─────────────────────────────────────────────────────────────
  // 2. LIEN DE SUIVI PUBLIC
  // ─────────────────────────────────────────────────────────────

  /**
   * Construit le lien de suivi à partir du token
   * @param {string} token
   * @returns {string}
   */
  _construireLien(token) {
    const baseUrl = process.env.APP_PUBLIC_URL || 'https://monapp.com';
    return `${baseUrl}/suivi/${token}`;
  },

  // ─────────────────────────────────────────────────────────────
  // 3. DATE D'EXPIRATION
  // ─────────────────────────────────────────────────────────────

  /**
   * Calcule la date d'expiration du lien : 24h après le départ du trajet
   * Cohérent avec setUTCHours utilisé partout dans TrajetController
   * @param {Object} trajet
   * @returns {Date}
   */
  _calculerExpiration(trajet) {
    const dateDepart = new Date(trajet.dateDepart);
    const [h, m] = (trajet.heureDepart || '00:00').split(':').map(Number);
    dateDepart.setUTCHours(h, m, 0, 0); // UTC — cohérent avec le reste du projet
    return new Date(dateDepart.getTime() + 24 * 60 * 60 * 1000); // +24h
  },

  // ─────────────────────────────────────────────────────────────
  // 4. DÉTERMINER LE RÔLE DU PARTAGEUR
  // ─────────────────────────────────────────────────────────────

  /**
   * Détermine si l'utilisateur est conducteur ou passager du trajet
   * @param {Object} trajet
   * @param {string} userId
   * @returns {'CONDUCTEUR'|'PASSAGER'}
   */
  // ✅ Version robuste
  async _determinerRole(trajet, userId) {
    // Fonctionne que conducteurId soit populé ou non
    const conducteurId = trajet.conducteurId?._id || trajet.conducteurId;

    const estConducteur = conducteurId.toString() === userId.toString();

    if (estConducteur) return 'CONDUCTEUR';

    const reservation = await Reservation.findOne({
      trajetId:          trajet._id,
      passagerId:        userId,
      statutReservation: 'CONFIRMEE'
    });

    if (!reservation) {
      throw new Error(
        'Impossible de partager : vous devez être conducteur ou passager confirmé de ce trajet'
      );
    }

    return 'PASSAGER';
  },
  // ─────────────────────────────────────────────────────────────
  // 5. CRÉER UN PARTAGE  ← point d'entrée principal
  // ─────────────────────────────────────────────────────────────

  /**
   * Crée un partage de trajet et envoie les notifications aux proches
   *
   * @param {string}   trajetId  - ID du trajet à partager
   * @param {string}   userId    - ID de l'utilisateur qui partage
   * @param {Object}   proche    - { nom?, telephone?, email? }
   * @param {string[]} canaux    - ['SMS', 'EMAIL', 'WHATSAPP']
   * @returns {Promise<{ partage, lienSuivi, lienWhatsApp, expiresAt }>}
   */
  async partagerTrajet(trajetId, userId, proche, canaux = ['EMAIL']) {

    // ── Charger le trajet ──────────────────────────────────────
    const trajet = await Trajet.findById(trajetId)
      .populate('conducteurId', 'nom prenom photoProfil');

    if (!trajet) {
      throw new Error('Trajet introuvable');
    }

    if (['TERMINE', 'ANNULE', 'EXPIRE'].includes(trajet.statutTrajet)) {
      throw new Error(`Impossible de partager un trajet ${trajet.statutTrajet.toLowerCase()}`);
    }

    // ── Validations canaux / contacts ─────────────────────────
    if (canaux.includes('SMS') && !proche.telephone) {
      throw new Error('Un numéro de téléphone est requis pour le canal SMS');
    }
    if (canaux.includes('EMAIL') && !proche.email) {
      throw new Error('Une adresse email est requise pour le canal EMAIL');
    }

    // ── Générer token + lien + expiration ─────────────────────
    const token     = this._genererToken();
    const lienSuivi = this._construireLien(token);
    const expiresAt = this._calculerExpiration(trajet);

    // ✅ rolePartageur est maintenant required dans le modèle
    const rolePartageur = await this._determinerRole(trajet, userId);

    // ── Créer le document ─────────────────────────────────────
    const partage = new TrajetPartage({
      trajetId,
      partagePar:   userId,
      rolePartageur,           // ✅ champ required ajouté
      proche,
      token,
      lienSuivi,
      canaux,
      expiresAt
      // statutEnvoi : valeurs par défaut 'NON_DEMANDE' gérées par le schéma
    });

    // ── Envoi SMS ──────────────────────────────────────────────
    if (canaux.includes('SMS') && proche.telephone) {
      try {
        await this._envoyerSMS(proche.telephone, trajet, lienSuivi, proche.nom);
        partage.statutEnvoi.sms = 'ENVOYE';
        console.log(`✅ SMS envoyé à ${proche.telephone.slice(0, -3)}***`);
      } catch (err) {
        partage.statutEnvoi.sms = 'ECHEC';
        console.error(`❌ Échec SMS:`, err.message);
      }
    }

    // ── Envoi Email ────────────────────────────────────────────
    if (canaux.includes('EMAIL') && proche.email) {
      try {
        await this._envoyerEmail(proche.email, trajet, lienSuivi, proche.nom, rolePartageur);
        partage.statutEnvoi.email = 'ENVOYE';
        console.log(`✅ Email envoyé à ${proche.email}`);
      } catch (err) {
        partage.statutEnvoi.email = 'ECHEC';
        console.error(`❌ Échec Email:`, err.message);
      }
    }

    // ── WhatsApp : deeplink uniquement (pas d'envoi serveur) ───
    if (canaux.includes('WHATSAPP')) {
      partage.statutEnvoi.whatsapp = 'ENVOYE'; // lien disponible côté client
      console.log(`✅ Lien WhatsApp généré`);
    }

    console.log('📦 partage à sauvegarder:', JSON.stringify({
      trajetId:      partage.trajetId,
      partagePar:    partage.partagePar,
      rolePartageur: partage.rolePartageur,
      proche:        partage.proche,
      canaux:        partage.canaux,
      expiresAt:     partage.expiresAt,
      token:         partage.token?.slice(0, 6) + '...'
    }, null, 2));

    await partage.save();
    const wsUrl = process.env.WS_URL || `wss://${process.env.DOMAIN || 'localhost'}`;

    return {
      partage,
      lienSuivi,
      lienWhatsApp: partage.lienWhatsApp,
      expiresAt,
      websocket: {
        enabled: true,
        url: wsUrl,
        instructions: "Utilisez joinPublicTracking avec le token pour recevoir les positions en temps réel"
      }
      };
      },

  // ─────────────────────────────────────────────────────────────
  // 6. INFOS PUBLIQUES (route sans auth — accessible par le proche)
  // ─────────────────────────────────────────────────────────────

  /**
   * Retourne les informations du trajet accessibles via le lien public
   * @param {string} token
   * @returns {Promise<Object>}
   */
  async obtenirInfosPubliques(token) {
    const partage = await TrajetPartage.findOne({ token, actif: true })
      .populate({
        path: 'trajetId',
        populate: { path: 'conducteurId', select: 'nom prenom photoProfil noteGenerale' }
      });

    if (!partage) {
      throw new Error('Lien de suivi invalide ou expiré');
    }

    // Double vérification de l'expiration (sécurité applicative)
    if (!partage.estValide()) {   // ✅ utilise la méthode d'instance du modèle
      partage.actif = false;
      await partage.save();
      throw new Error('Ce lien de suivi a expiré');
    }

    // ✅ BUG 4 CORRIGÉ : enregistrer la vue à chaque consultation
    await partage.enregistrerVue(); // incrémente nombreVues + derniereVueAt

    const trajet = partage.trajetId;
    // Récupérer la dernière position depuis Redis
    let positionActuelle = null;
    try {
      const { redisUtils } = require('../config/redis');
      if (trajet.conducteurId?._id) {
        positionActuelle = await redisUtils.getUserPosition(trajet.conducteurId._id);
      }
    } catch (e) {
      console.log('Redis non disponible pour la position');
    }

    return {
      statut:             trajet.statutTrajet,
      pointDepart:        trajet.pointDepart,
      pointArrivee:       trajet.pointArrivee,
      dateDepart:         trajet.dateDepart,
      heureDepart:        trajet.heureDepart,
      heureArriveePrevue: trajet.heureArriveePrevue,
      distance:           trajet.distance,
      conducteur: {
        nom:         trajet.conducteurId?.nom,
        prenom:      trajet.conducteurId?.prenom,
        photoProfil: trajet.conducteurId?.photoProfil,
        note:        trajet.conducteurId?.noteGenerale
      },
      expiresAt: partage.expiresAt,
      positionActuelle,
      websocket: {
      enabled: true,
      roomToken: token
    }
    };
  },

  // ─────────────────────────────────────────────────────────────
  // 7. NOTIFICATION → DÉPART
  // ─────────────────────────────────────────────────────────────

  /**
   * Notifie tous les proches que le trajet vient de démarrer
   * Appelé depuis TrajetController.demarrerTrajet()
   * @param {string} trajetId
   */
  async notifierProchesDepart(trajetId) {
    // ✅ BUG 2 CORRIGÉ : findActifsByTrajet (plus findAcitfsByTrajet)
    const partages = await TrajetPartage.findActifsByTrajet(trajetId);
    if (!partages.length) return;

    const trajet = await Trajet.findById(trajetId)
      .populate('conducteurId', 'nom prenom');

    for (const partage of partages) {
      if (partage.notificationsEnvoyees.depart) continue;

      const message = `🚗 ${trajet.conducteurId?.prenom || 'Le conducteur'} vient de démarrer le trajet vers ${trajet.pointArrivee?.adresse}. Suivez en direct : ${partage.lienSuivi}`;

      await this._diffuserNotification(partage, message, 'Trajet démarré 🚗');

      partage.notificationsEnvoyees.depart = true;
      await partage.save();
    }

    console.log(`✅ Proches notifiés du départ pour le trajet ${trajetId}`);
  },

  // ─────────────────────────────────────────────────────────────
  // 8. NOTIFICATION → ARRIVÉE
  // ─────────────────────────────────────────────────────────────

  /**
   * Notifie tous les proches que le trajet est terminé
   * Appelé depuis TrajetController.terminerTrajet()
   * @param {string} trajetId
   */
  async notifierProchesArrivee(trajetId) {
    const partages = await TrajetPartage.findActifsByTrajet(trajetId); // ✅ BUG 2 CORRIGÉ
    if (!partages.length) return;

    const trajet = await Trajet.findById(trajetId);

    for (const partage of partages) {
      if (partage.notificationsEnvoyees.arrivee) continue;

      const message = `🎉 Le trajet vers ${trajet.pointArrivee?.adresse} est terminé. Votre proche est bien arrivé(e) !`;

      await this._diffuserNotification(partage, message, 'Trajet terminé ✅');

      partage.notificationsEnvoyees.arrivee = true;
      partage.actif = false; // désactiver le lien une fois arrivé
      await partage.save();
    }

    console.log(`✅ Proches notifiés de l'arrivée pour le trajet ${trajetId}`);
  },

  // ─────────────────────────────────────────────────────────────
  // 9. NOTIFICATION → ANNULATION
  // ─────────────────────────────────────────────────────────────

  /**
   * Notifie tous les proches que le trajet a été annulé
   * Appelé depuis TrajetController.annulerTrajet()
   * @param {string} trajetId
   * @param {string} motif
   */
  async notifierProchesAnnulation(trajetId, motif = '') {
    const partages = await TrajetPartage.findActifsByTrajet(trajetId); // ✅ BUG 2 CORRIGÉ
    if (!partages.length) return;

    const trajet = await Trajet.findById(trajetId);

    for (const partage of partages) {
      if (partage.notificationsEnvoyees.annulation) continue;

      const message = `⚠️ Le trajet vers ${trajet.pointArrivee?.adresse} a été annulé.${motif ? ` Motif : ${motif}` : ''}`;

      await this._diffuserNotification(partage, message, 'Trajet annulé ⚠️');

      partage.notificationsEnvoyees.annulation = true;
      partage.actif = false;
      await partage.save();
    }

    console.log(`✅ Proches notifiés de l'annulation pour le trajet ${trajetId}`);
  },

  // ─────────────────────────────────────────────────────────────
  // 10. HELPERS PRIVÉS
  // ─────────────────────────────────────────────────────────────

  /**
   * Diffuse une notification via les canaux du partage (SMS + Email)
   * WhatsApp n'a pas d'envoi serveur → deeplink uniquement à la création
   * @param {Object} partage  - document TrajetPartage
   * @param {string} message  - corps du message
   * @param {string} sujet    - sujet email
   */
  async _diffuserNotification(partage, message, sujet) {
    if (partage.canaux.includes('SMS') && partage.proche.telephone) {
      try {
        await this._envoyerSMS(partage.proche.telephone, null, partage.lienSuivi, partage.proche.nom, message);
      } catch (err) {
        console.error('⚠️ Échec notification SMS:', err.message);
      }
    }

    if (partage.canaux.includes('EMAIL') && partage.proche.email) {
      try {
        await notificationService.sendEmail(partage.proche.email, sujet, message);
      } catch (err) {
        console.error('⚠️ Échec notification Email:', err.message);
      }
    }
  },

  /**
   * Envoie un SMS via ton provider (Twilio, Orange CI, Vonage…)
   * @param {string}      telephone
   * @param {Object|null} trajet
   * @param {string}      lienSuivi
   * @param {string}      nomProche
   * @param {string|null} messageCustom - si fourni, remplace le message par défaut
   */
  async _envoyerSMS(telephone, trajet, lienSuivi, nomProche, messageCustom = null) {

    // ── Décommenter et adapter selon ton provider ──────────────
    /*
    const twilio = require('twilio');
    const client = twilio(process.env.TWILIO_SID, process.env.TWILIO_AUTH_TOKEN);

    await client.messages.create({
      from: process.env.TWILIO_PHONE,
      to:   telephone,
      body: messageCustom || this._formatSMS(trajet, lienSuivi, nomProche)
    });
    */

    // ── Mode simulation (à remplacer en production) ────────────
    const corps = messageCustom || this._formatSMS(trajet, lienSuivi, nomProche);
    console.log(`📱 [SMS SIMULÉ] → ${telephone.slice(0, -3)}***\n${corps}`);
  },

  /**
   * Envoie un email de partage via notificationService existant
   */
  async _envoyerEmail(email, trajet, lienSuivi, nomProche, rolePartageur = 'CONDUCTEUR') {
  const conducteur = trajet.conducteurId;

  const sujet = rolePartageur === 'PASSAGER'
    ? `🚗 Votre proche est en route — suivi en direct`
    : `🚗 ${conducteur?.prenom || 'Votre proche'} partage son trajet avec vous`;

  const intro = rolePartageur === 'PASSAGER'
    ? `Votre proche est passager de ce trajet et vous partage le suivi en direct :`
    : `${conducteur?.prenom || 'Votre proche'} vous partage son trajet :`;

  const corps = [
    `Bonjour ${nomProche || ''},`,
    '',
    intro,
    '',
    `📍 Départ      : ${trajet.pointDepart?.adresse  || 'N/A'}`,
    `🏁 Arrivée     : ${trajet.pointArrivee?.adresse || 'N/A'}`,
    `📅 Date        : ${new Date(trajet.dateDepart).toLocaleDateString('fr-FR')}`,
    `🕐 Heure       : ${trajet.heureDepart || 'N/A'}`,
    `👤 Conducteur  : ${conducteur?.prenom || ''} ${conducteur?.nom || ''}`,
    '',
    `🔗 Suivez le trajet en direct :`,
    lienSuivi,
    '',
    `Ce lien est valide 24h après le départ.`,
    '',
    `— Envoyé via MonApp Covoiturage`
  ].join('\n');

  await notificationService.sendEmail(email, sujet, corps);
},

  /**
   * Formate un SMS court (<160 caractères)
   */
 _formatSMS(trajet, lienSuivi, nomProche) {
  const dest  = trajet?.pointArrivee?.adresse ?? 'destination';
  const heure = trajet?.heureDepart 
    ? new Date(trajet.heureDepart).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' })
    : '';

  return `🚗 ${nomProche || 'Bonjour'}, trajet vers ${dest} à ${heure}. Suivi : ${lienSuivi}`;
}

};



module.exports = shareTrajetService;