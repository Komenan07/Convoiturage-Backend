// socketHandler.js
const jwt = require('jsonwebtoken');
const Utilisateur = require('../models/Utilisateur');

class SocketHandler {
  constructor(io) {
    this.io = io;
    this.connectedUsers = new Map(); // userId -> socketId
    this.userSockets = new Map(); // socketId -> userData
    this.conducteursSessions = new Map(); // conducteurId -> session data
    this.trajetsActifs = new Map(); // trajetId -> trajet data
    
    this.setupSocketEvents();
    this.setupRoomManagement();
    
    console.log('🔌 Socket Handler initialisé');
  }

  // =========================
  // CONFIGURATION PRINCIPALE
  // =========================
  setupSocketEvents() {
    this.io.on('connection', async (socket) => {
      console.log(`🔗 Nouvelle connexion socket: ${socket.id}`);
      
      try {
        // Authentification du socket
        const user = await this.authenticateSocket(socket);
        if (!user) {
          socket.emit('auth_error', {
            error: 'AUTHENTICATION_REQUIRED',
            message: 'Authentification requise'
          });
          socket.disconnect();
          return;
        }

        // Enregistrer l'utilisateur connecté
        await this.registerConnectedUser(socket, user);
        
        // Configuration des événements pour cet utilisateur
        this.setupUserEvents(socket, user);
        
        console.log(`✅ Utilisateur connecté: ${user.nomComplet} (${user.role})`);
        
      } catch (error) {
        console.error('❌ Erreur connexion socket:', error);
        socket.emit('connection_error', {
          error: 'CONNECTION_FAILED',
          message: 'Erreur de connexion'
        });
        socket.disconnect();
      }
    });
  }

  // =========================
  // AUTHENTIFICATION SOCKET
  // =========================
  async authenticateSocket(socket) {
    try {
      const token = socket.handshake.auth.token || 
                   socket.handshake.headers.authorization?.split(' ')[1];
      
      if (!token) {
        console.warn('🚫 Connexion socket sans token');
        return null;
      }

      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'votre-cle-secrete-super-longue-et-complexe');
      const user = await Utilisateur.findById(decoded.userId).select('-motDePasse');
      
      if (!user || user.statutCompte !== 'ACTIF') {
        console.warn('🚫 Utilisateur invalide ou inactif');
        return null;
      }

      return user;
    } catch (error) {
      console.error('❌ Erreur authentification socket:', error);
      return null;
    }
  }

  // =========================
  // GESTION UTILISATEURS CONNECTÉS
  // =========================
  async registerConnectedUser(socket, user) {
    const userData = {
      userId: user._id.toString(),
      socketId: socket.id,
      nom: user.nomComplet,
      role: user.role,
      coordonnees: user.adresse?.coordonnees?.coordinates || null,
      estRecharge: user.compteCovoiturage?.estRecharge || false,
      statut: 'en_ligne',
      derniereActivite: new Date()
    };

    // Déconnecter les anciennes sessions
    const oldSocketId = this.connectedUsers.get(userData.userId);
    if (oldSocketId && this.io.sockets.sockets.has(oldSocketId)) {
      this.io.sockets.sockets.get(oldSocketId).disconnect();
    }

    // Enregistrer la nouvelle session
    this.connectedUsers.set(userData.userId, socket.id);
    this.userSockets.set(socket.id, userData);

    // Rejoindre les salles appropriées
    await this.joinUserRooms(socket, user);

    // Notifier la connexion
    socket.emit('connected', {
      success: true,
      user: {
        id: user._id,
        nom: user.nomComplet,
        role: user.role,
        statut: 'en_ligne'
      }
    });

    // Mettre à jour le statut en ligne
    await this.updateUserOnlineStatus(user._id, true);
  }

  // =========================
  // GESTION DES SALLES
  // =========================
  async joinUserRooms(socket, user) {
    const userId = user._id.toString();
    
    // Salle globale des utilisateurs
    socket.join('users_online');
    
    // Salle selon le rôle
    if (user.role === 'conducteur' || user.role === 'les_deux') {
      socket.join('conducteurs');
    }
    if (user.role === 'passager' || user.role === 'les_deux') {
      socket.join('passagers');
    }
    
    // Salle personnelle
    socket.join(`user_${userId}`);
    
    // Salle géographique (par ville)
    if (user.adresse?.ville) {
      socket.join(`ville_${user.adresse.ville.toLowerCase()}`);
    }
    
    // Salle selon statut compte
    if (user.compteCovoiturage?.estRecharge) {
      socket.join('comptes_recharges');
    }
  }

  // =========================
  // ÉVÉNEMENTS UTILISATEUR
  // =========================
  setupUserEvents(socket, user) {
    const userId = user._id.toString();

    // ===== LOCALISATION =====
    socket.on('update_location', async (data) => {
      await this.handleLocationUpdate(socket, userId, data);
    });

    // ===== TRAJETS =====
    socket.on('nouveau_trajet', async (trajetData) => {
      await this.handleNouveauTrajet(socket, userId, trajetData);
    });

    socket.on('rechercher_trajets', async (criteres) => {
      await this.handleRechercherTrajets(socket, userId, criteres);
    });

    socket.on('rejoindre_trajet', async (trajetId) => {
      await this.handleRejoindreTrajet(socket, userId, trajetId);
    });

    socket.on('quitter_trajet', async (trajetId) => {
      await this.handleQuitterTrajet(socket, userId, trajetId);
    });

    // ===== RÉSERVATIONS =====
    socket.on('nouvelle_reservation', async (reservationData) => {
      await this.handleNouvelleReservation(socket, userId, reservationData);
    });

    socket.on('accepter_reservation', async (reservationId) => {
      await this.handleAccepterReservation(socket, userId, reservationId);
    });

    socket.on('refuser_reservation', async (data) => {
      await this.handleRefuserReservation(socket, userId, data);
    });

    // ===== TRAJETS EN COURS =====
    socket.on('demarrer_trajet', async (trajetId) => {
      await this.handleDemarrerTrajet(socket, userId, trajetId);
    });

    socket.on('trajet_position_update', async (data) => {
      await this.handleTrajetPositionUpdate(socket, userId, data);
    });

    socket.on('arrivee_point_prise', async (data) => {
      await this.handleArriveePointPrise(socket, userId, data);
    });

    socket.on('terminer_trajet', async (trajetId) => {
      await this.handleTerminerTrajet(socket, userId, trajetId);
    });

    // ===== PAIEMENTS =====
    socket.on('paiement_effectue', async (paiementData) => {
      await this.handlePaiementEffectue(socket, userId, paiementData);
    });

    socket.on('recharge_compte', async (rechargeData) => {
      await this.handleRechargeCompte(socket, userId, rechargeData);
    });

    // ===== CHAT / MESSAGES =====
    socket.on('envoyer_message', async (messageData) => {
      await this.handleEnvoyerMessage(socket, userId, messageData);
    });

    socket.on('message_lu', async (messageId) => {
      await this.handleMessageLu(socket, userId, messageId);
    });

    // ===== NOTIFICATIONS =====
    socket.on('marquer_notification_lue', async (notificationId) => {
      await this.handleNotificationLue(socket, userId, notificationId);
    });

    // ===== STATUT UTILISATEUR =====
    socket.on('changer_statut', async (nouveauStatut) => {
      await this.handleChangerStatut(socket, userId, nouveauStatut);
    });

    socket.on('set_disponible', async (disponible) => {
      await this.handleSetDisponible(socket, userId, disponible);
    });

    // ===== DÉCONNEXION =====
    socket.on('disconnect', async (reason) => {
      await this.handleDisconnection(socket, userId, reason);
    });

    // ===== HEARTBEAT =====
    socket.on('ping', () => {
      socket.emit('pong');
      this.updateUserActivity(userId);
    });
  }

  // =========================
  // GESTION LOCALISATION
  // =========================
  async handleLocationUpdate(socket, userId, data) {
    try {
      const { latitude, longitude, precision } = data;
      
      if (!latitude || !longitude) {
        socket.emit('location_error', { message: 'Coordonnées invalides' });
        return;
      }

      // Mettre à jour les données utilisateur
      const userData = this.userSockets.get(socket.id);
      if (userData) {
        userData.coordonnees = [longitude, latitude];
        userData.derniereActivite = new Date();
        userData.precisionGPS = precision;
      }

      // Notifier les conducteurs proches si c'est un passager
      if (userData?.role === 'passager' || userData?.role === 'les_deux') {
        await this.notifierConducteursProches(userId, latitude, longitude);
      }

      socket.emit('location_updated', {
        success: true,
        coordinates: [longitude, latitude],
        timestamp: new Date()
      });

    } catch (error) {
      console.error('❌ Erreur mise à jour localisation:', error);
      socket.emit('location_error', { message: 'Erreur de localisation' });
    }
  }

  // =========================
  // GESTION TRAJETS
  // =========================
  async handleNouveauTrajet(socket, userId, trajetData) {
    try {
      // Valider les données du trajet
      if (!this.validerDonneesTrajet(trajetData)) {
        socket.emit('trajet_error', { 
          error: 'INVALID_DATA',
          message: 'Données de trajet invalides' 
        });
        return;
      }

      // Ajouter le trajet aux trajets actifs
      const trajetId = trajetData.id;
      this.trajetsActifs.set(trajetId, {
        ...trajetData,
        conducteurId: userId,
        passagers: [],
        statut: 'en_attente',
        dateCreation: new Date()
      });

      // Rejoindre la salle du trajet
      socket.join(`trajet_${trajetId}`);

      // Notifier les passagers potentiels dans la zone
      await this.notifierPassagersZone(trajetData);

      socket.emit('trajet_cree', {
        success: true,
        trajetId,
        message: 'Trajet créé avec succès'
      });

      console.log(`🚗 Nouveau trajet créé: ${trajetId} par ${userId}`);

    } catch (error) {
      console.error('❌ Erreur création trajet:', error);
      socket.emit('trajet_error', { 
        error: 'CREATION_FAILED',
        message: 'Erreur lors de la création du trajet' 
      });
    }
  }

  async handleRechercherTrajets(socket, userId, criteres) {
    try {
      // Rechercher trajets compatibles
      const trajetsDisponibles = [];
      
      for (const [trajetId, trajet] of this.trajetsActifs) {
        if (this.trajetCompatible(trajet, criteres) && trajet.conducteurId !== userId) {
          trajetsDisponibles.push({
            id: trajetId,
            ...trajet,
            conducteur: this.getUtilisateurInfo(trajet.conducteurId)
          });
        }
      }

      socket.emit('trajets_trouves', {
        success: true,
        trajets: trajetsDisponibles,
        count: trajetsDisponibles.length
      });

    } catch (error) {
      console.error('❌ Erreur recherche trajets:', error);
      socket.emit('recherche_error', { message: 'Erreur de recherche' });
    }
  }

  // =========================
  // GESTION RÉSERVATIONS
  // =========================
  async handleNouvelleReservation(socket, userId, reservationData) {
    try {
      const { trajetId, nombrePlaces, pointPrise, messagePersonnalise } = reservationData;
      
      const trajet = this.trajetsActifs.get(trajetId);
      if (!trajet) {
        socket.emit('reservation_error', { 
          error: 'TRAJET_NOT_FOUND',
          message: 'Trajet introuvable' 
        });
        return;
      }

      // Vérifier disponibilité
      if (trajet.placesDisponibles < nombrePlaces) {
        socket.emit('reservation_error', { 
          error: 'PLACES_INSUFFICIENT',
          message: 'Places insuffisantes' 
        });
        return;
      }

      const reservationId = `res_${Date.now()}_${userId}`;
      const reservation = {
        id: reservationId,
        trajetId,
        passagerId: userId,
        nombrePlaces,
        pointPrise,
        messagePersonnalise,
        statut: 'en_attente',
        dateReservation: new Date()
      };

      // Ajouter à la liste des réservations du trajet
      if (!trajet.reservations) trajet.reservations = [];
      trajet.reservations.push(reservation);

      // Notifier le conducteur
      const conducteurSocketId = this.connectedUsers.get(trajet.conducteurId);
      if (conducteurSocketId) {
        this.io.to(conducteurSocketId).emit('nouvelle_demande_reservation', {
          reservation,
          passager: this.getUtilisateurInfo(userId),
          trajet: { id: trajetId, depart: trajet.depart, arrivee: trajet.arrivee }
        });
      }

      socket.emit('reservation_envoyee', {
        success: true,
        reservationId,
        message: 'Demande de réservation envoyée'
      });

      console.log(`📝 Nouvelle réservation: ${reservationId} pour trajet ${trajetId}`);

    } catch (error) {
      console.error('❌ Erreur nouvelle réservation:', error);
      socket.emit('reservation_error', { message: 'Erreur de réservation' });
    }
  }

  async handleAccepterReservation(socket, userId, reservationId) {
    try {
      // Trouver la réservation
      let trajetConcerne = null;
      let reservationTrouvee = null;

      for (const [trajetId, trajet] of this.trajetsActifs) {
        if (trajet.conducteurId === userId && trajet.reservations) {
          const reservation = trajet.reservations.find(r => r.id === reservationId);
          if (reservation) {
            trajetConcerne = trajet;
            reservationTrouvee = reservation;
            console.log(`Réservation trouvée dans le trajet ${trajetId}`);
            break;
          }
        }
      }

      if (!reservationTrouvee) {
        socket.emit('reservation_error', { message: 'Réservation introuvable' });
        return;
      }

      // Accepter la réservation
      reservationTrouvee.statut = 'acceptee';
      reservationTrouvee.dateAcceptation = new Date();

      // Mettre à jour les places disponibles
      trajetConcerne.placesDisponibles -= reservationTrouvee.nombrePlaces;

      // Ajouter le passager au trajet
      if (!trajetConcerne.passagers) trajetConcerne.passagers = [];
      trajetConcerne.passagers.push({
        userId: reservationTrouvee.passagerId,
        nombrePlaces: reservationTrouvee.nombrePlaces,
        pointPrise: reservationTrouvee.pointPrise,
        statut: 'confirme'
      });

      // Notifier le passager
      const passagerSocketId = this.connectedUsers.get(reservationTrouvee.passagerId);
      if (passagerSocketId) {
        this.io.to(passagerSocketId).emit('reservation_acceptee', {
          reservationId,
          trajet: trajetConcerne,
          conducteur: this.getUtilisateurInfo(userId),
          message: 'Votre réservation a été acceptée !'
        });

        // Le passager rejoint la salle du trajet
        const passagerSocket = this.io.sockets.sockets.get(passagerSocketId);
        if (passagerSocket) {
          passagerSocket.join(`trajet_${trajetConcerne.id}`);
        }
      }

      socket.emit('reservation_traitee', {
        success: true,
        action: 'acceptee',
        reservationId
      });

      console.log(`✅ Réservation acceptée: ${reservationId}`);

    } catch (error) {
      console.error('❌ Erreur acceptation réservation:', error);
      socket.emit('reservation_error', { message: 'Erreur acceptation réservation' });
    }
  }

  // =========================
  // GESTION TRAJETS EN COURS
  // =========================
  async handleDemarrerTrajet(socket, userId, trajetId) {
    try {
      const trajet = this.trajetsActifs.get(trajetId);
      
      if (!trajet || trajet.conducteurId !== userId) {
        socket.emit('trajet_error', { message: 'Trajet introuvable ou non autorisé' });
        return;
      }

      // Mettre à jour le statut
      trajet.statut = 'en_cours';
      trajet.heureDepart = new Date();

      // Notifier tous les participants
      this.io.to(`trajet_${trajetId}`).emit('trajet_demarre', {
        trajetId,
        heureDepart: trajet.heureDepart,
        conducteur: this.getUtilisateurInfo(userId),
        passagers: trajet.passagers || []
      });

      console.log(`🚀 Trajet démarré: ${trajetId}`);

    } catch (error) {
      console.error('❌ Erreur démarrage trajet:', error);
      socket.emit('trajet_error', { message: 'Erreur démarrage trajet' });
    }
  }

  async handleTrajetPositionUpdate(socket, userId, data) {
    try {
      const { trajetId, latitude, longitude, vitesse, cap } = data;
      
      const trajet = this.trajetsActifs.get(trajetId);
      if (!trajet || trajet.conducteurId !== userId) {
        return;
      }

      // Mettre à jour la position du trajet
      trajet.positionActuelle = {
        coordinates: [longitude, latitude],
        vitesse,
        cap,
        timestamp: new Date()
      };

      // Diffuser aux participants du trajet
      socket.to(`trajet_${trajetId}`).emit('position_trajet_update', {
        trajetId,
        position: trajet.positionActuelle,
        eta: this.calculerETA(trajet)
      });

    } catch (error) {
      console.error('❌ Erreur mise à jour position trajet:', error);
    }
  }

  // =========================
  // GESTION PAIEMENTS
  // =========================
  async handlePaiementEffectue(socket, userId, paiementData) {
    try {
      const { trajetId, montant, methodePaiement, referenceTransaction } = paiementData;

      // Notifier le conducteur du paiement
      const trajet = this.trajetsActifs.get(trajetId);
      if (trajet) {
        const conducteurSocketId = this.connectedUsers.get(trajet.conducteurId);
        if (conducteurSocketId) {
          this.io.to(conducteurSocketId).emit('paiement_recu', {
            trajetId,
            passagerId: userId,
            montant,
            methodePaiement,
            referenceTransaction,
            timestamp: new Date()
          });
        }
      }

      socket.emit('paiement_confirme', {
        success: true,
        referenceTransaction,
        message: 'Paiement confirmé'
      });

      console.log(`💳 Paiement effectué: ${referenceTransaction} - ${montant} FCFA`);

    } catch (error) {
      console.error('❌ Erreur gestion paiement:', error);
      socket.emit('paiement_error', { message: 'Erreur de paiement' });
    }
  }

  async handleRechargeCompte(socket, userId, rechargeData) {
    try {
      const { montant, methodePaiement, referenceTransaction } = rechargeData;

      // Envoyer notification de confirmation
      socket.emit('recharge_initie', {
        success: true,
        montant,
        methodePaiement,
        referenceTransaction,
        message: 'Recharge initiée avec succès'
      });

      // Notifier les admins pour suivi
      this.io.to('admin').emit('nouvelle_recharge', {
        userId,
        montant,
        methodePaiement,
        referenceTransaction,
        timestamp: new Date()
      });

      console.log(`🔋 Recharge initiée: ${userId} - ${montant} FCFA`);

    } catch (error) {
      console.error('❌ Erreur recharge compte:', error);
      socket.emit('recharge_error', { message: 'Erreur de recharge' });
    }
  }

  // =========================
  // GESTION MESSAGES
  // =========================
  async handleEnvoyerMessage(socket, userId, messageData) {
    try {
      const { trajetId, destinataireId, message, type } = messageData;

      const messageObj = {
        id: `msg_${Date.now()}_${userId}`,
        expediteurId: userId,
        destinataireId,
        trajetId,
        message,
        type: type || 'text',
        timestamp: new Date(),
        statut: 'envoye'
      };

      // Envoyer au destinataire spécifique
      if (destinataireId) {
        const destinataireSocketId = this.connectedUsers.get(destinataireId);
        if (destinataireSocketId) {
          this.io.to(destinataireSocketId).emit('nouveau_message', {
            ...messageObj,
            expediteur: this.getUtilisateurInfo(userId)
          });
        }
      }

      // Ou diffuser dans la salle du trajet
      if (trajetId) {
        socket.to(`trajet_${trajetId}`).emit('message_trajet', {
          ...messageObj,
          expediteur: this.getUtilisateurInfo(userId)
        });
      }

      socket.emit('message_envoye', {
        success: true,
        messageId: messageObj.id
      });

    } catch (error) {
      console.error('❌ Erreur envoi message:', error);
      socket.emit('message_error', { message: 'Erreur envoi message' });
    }
  }

  // =========================
  // GESTION DÉCONNEXION
  // =========================
  async handleDisconnection(socket, userId, reason) {
    console.log(`👋 Déconnexion: ${userId} (${reason})`);

    try {
      // Nettoyer les maps
      this.connectedUsers.delete(userId);
      this.userSockets.delete(socket.id);

      // Mettre à jour le statut hors ligne
      await this.updateUserOnlineStatus(userId, false);

      // Notifier les trajets en cours
      for (const [trajetId, trajet] of this.trajetsActifs) {
        if (trajet.conducteurId === userId || 
            (trajet.passagers && trajet.passagers.some(p => p.userId === userId))) {
          
          socket.to(`trajet_${trajetId}`).emit('participant_deconnecte', {
            trajetId,
            userId,
            role: trajet.conducteurId === userId ? 'conducteur' : 'passager',
            timestamp: new Date()
          });
        }
      }

    } catch (error) {
      console.error('❌ Erreur lors de la déconnexion:', error);
    }
  }

  // =========================
  // MÉTHODES UTILITAIRES
  // =========================
  validerDonneesTrajet(trajetData) {
    return trajetData &&
           trajetData.depart &&
           trajetData.arrivee &&
           trajetData.heureDepart &&
           trajetData.placesDisponibles > 0 &&
           trajetData.prix >= 0;
  }

  trajetCompatible(trajet, _criteres) {
    // Logique de compatibilité des trajets
    if (trajet.statut !== 'en_attente') return false;
    if (trajet.placesDisponibles <= 0) return false;
    
    // Vérifier zone géographique, horaires, etc.
    // Implémentation simplifiée - critères utilisés ici selon la logique métier
    return true;
  }

  getUtilisateurInfo(userId) {
    const userData = Array.from(this.userSockets.values())
      .find(user => user.userId === userId);
    
    return userData ? {
      id: userId,
      nom: userData.nom,
      role: userData.role,
      statut: userData.statut
    } : null;
  }

  updateUserActivity(userId) {
    for (const [socketId, userData] of this.userSockets) {
      if (userData.userId === userId) {
        userData.derniereActivite = new Date();
        console.log(`Activité mise à jour pour le socket ${socketId}`);
        break;
      }
    }
  }

  async updateUserOnlineStatus(userId, _isOnline) {
    try {
      await Utilisateur.findByIdAndUpdate(userId, {
        derniereConnexion: new Date(),
        // Vous pouvez ajouter un champ statutEnLigne si nécessaire
        // statutEnLigne: isOnline
      });
    } catch (error) {
      console.error('❌ Erreur mise à jour statut:', error);
    }
  }

  calculerETA(_trajet) {
    // Calcul simplifié de l'ETA
    // Implémentation plus sophistiquée avec APIs de routing
    // Le paramètre trajet pourrait être utilisé pour des calculs plus précis
    return new Date(Date.now() + 30 * 60 * 1000); // +30min par défaut
  }

  async notifierConducteursProches(passagerId, latitude, longitude) {
    // Notifier les conducteurs dans un rayon de 10km
    const rayonKm = 10;
    
    for (const [socketId, userData] of this.userSockets) {
      if ((userData.role === 'conducteur' || userData.role === 'les_deux') &&
          userData.coordonnees &&
          userData.userId !== passagerId) {
        
        const distance = this.calculerDistance(
          latitude, longitude,
          userData.coordonnees[1], userData.coordonnees[0]
        );
        
        if (distance <= rayonKm) {
          this.io.to(socketId).emit('passager_proche', {
            passagerId,
            position: [longitude, latitude],
            distance: Math.round(distance * 100) / 100
          });
        }
      }
    }
  }

  async notifierPassagersZone(trajetData) {
    // Notifier les passagers dans la zone du trajet
    this.io.to(`ville_${trajetData.depart.ville?.toLowerCase()}`).emit('nouveau_trajet_disponible', {
      trajetId: trajetData.id,
      depart: trajetData.depart,
      arrivee: trajetData.arrivee,
      heureDepart: trajetData.heureDepart,
      placesDisponibles: trajetData.placesDisponibles,
      prix: trajetData.prix
    });
  }

  calculerDistance(lat1, lon1, lat2, lon2) {
    const R = 6371; // Rayon de la Terre en km
    const dLat = this.degreesToRadians(lat2 - lat1);
    const dLon = this.degreesToRadians(lon2 - lon1);
    const a = 
      Math.sin(dLat/2) * Math.sin(dLat/2) +
      Math.cos(this.degreesToRadians(lat1)) * Math.cos(this.degreesToRadians(lat2)) * 
      Math.sin(dLon/2) * Math.sin(dLon/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
  }

  degreesToRadians(degrees) {
    return degrees * (Math.PI/180);
  }

  // =========================
  // MÉTHODES PUBLIQUES
  // =========================
  
  // Envoyer notification à un utilisateur
  envoyerNotification(userId, notification) {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      this.io.to(socketId).emit('notification', notification);
      return true;
    }
    return false;
  }

  // Diffuser à tous les utilisateurs d'une ville
  diffuserParVille(ville, evenement, data) {
    this.io.to(`ville_${ville.toLowerCase()}`).emit(evenement, data);
  }

  // Diffuser aux conducteurs
  diffuserAuxConducteurs(evenement, data) {
    this.io.to('conducteurs').emit(evenement, data);
  }

  // Diffuser aux passagers
  diffuserAuxPassagers(evenement, data) {
    this.io.to('passagers').emit(evenement, data);
  }

  // Obtenir statistiques des connexions
  getStatistiquesConnexions() {
    const stats = {
      totalConnectes: this.connectedUsers.size,
      conducteurs: 0,
      passagers: 0,
      trajetsActifs: this.trajetsActifs.size,
      comptesRecharges: 0
    };

    for (const userData of this.userSockets.values()) {
      if (userData.role === 'conducteur') stats.conducteurs++;
      else if (userData.role === 'passager') stats.passagers++;
      else if (userData.role === 'les_deux') {
        stats.conducteurs++;
        stats.passagers++;
      }
      
      if (userData.estRecharge) stats.comptesRecharges++;
    }

    return stats;
  }

  // Obtenir utilisateurs connectés par rôle
  getUtilisateursConnectes(role = null) {
    const utilisateurs = [];
    
    for (const userData of this.userSockets.values()) {
      if (!role || userData.role === role || userData.role === 'les_deux') {
        utilisateurs.push({
          userId: userData.userId,
          nom: userData.nom,
          role: userData.role,
          statut: userData.statut,
          derniereActivite: userData.derniereActivite,
          coordonnees: userData.coordonnees
        });
      }
    }
    
    return utilisateurs;
  }

  // Forcer la déconnexion d'un utilisateur
  forcerDeconnexion(userId, raison = 'Déconnexion administrative') {
    const socketId = this.connectedUsers.get(userId);
    if (socketId) {
      const socket = this.io.sockets.sockets.get(socketId);
      if (socket) {
        socket.emit('force_disconnect', {
          raison,
          timestamp: new Date()
        });
        socket.disconnect(true);
        console.log(`🔌 Utilisateur ${userId} déconnecté via socket ${socketId}`);
        // Nettoyer les références
        this.connectedUsers.delete(userId);
        this.userSockets.delete(socketId);
        return true;
      }
    }
    return false;
  }

  // Envoyer message système à tous
  diffuserMessageSysteme(message, type = 'info') {
    this.io.to('users_online').emit('message_systeme', {
      type,
      message,
      timestamp: new Date()
    });
  }

  // Gérer les urgences
  gererUrgence(trajetId, typeUrgence, data) {
    const trajet = this.trajetsActifs.get(trajetId);
    if (!trajet) return false;

    // Marquer le trajet comme urgence
    trajet.urgence = {
      type: typeUrgence,
      data,
      timestamp: new Date()
    };

    // Notifier tous les participants
    this.io.to(`trajet_${trajetId}`).emit('urgence_trajet', {
      trajetId,
      type: typeUrgence,
      data,
      timestamp: new Date(),
      instructions: this.getInstructionsUrgence(typeUrgence)
    });

    // Notifier les administrateurs
    this.io.to('admin').emit('urgence_signale', {
      trajetId,
      type: typeUrgence,
      conducteur: this.getUtilisateurInfo(trajet.conducteurId),
      passagers: trajet.passagers || [],
      data,
      timestamp: new Date()
    });

    console.log(`🚨 URGENCE signalée sur trajet ${trajetId}: ${typeUrgence}`);
    return true;
  }

  getInstructionsUrgence(typeUrgence) {
    const instructions = {
      'accident': 'Appelez immédiatement les secours (Police: 111, Sapeurs-Pompiers: 180)',
      'panne': 'Restez dans le véhicule et contactez l\'assistance routière',
      'agression': 'Appelez la police (111) et signalez votre position',
      'maladie': 'Appelez le SAMU (185) si nécessaire',
      'autre': 'Contactez les autorités compétentes si nécessaire'
    };
    
    return instructions[typeUrgence] || instructions['autre'];
  }

  // =========================
  // GESTION ROOM MANAGEMENT
  // =========================
  setupRoomManagement() {
    // Nettoyer les salles inactives toutes les heures
    setInterval(() => {
      this.nettoyerSallesInactives();
    }, 60 * 60 * 1000);

    // Nettoyer les trajets terminés toutes les 30 minutes
    setInterval(() => {
      this.nettoyerTrajetsTermines();
    }, 30 * 60 * 1000);

    // Vérifier les connexions inactives toutes les 5 minutes
    setInterval(() => {
      this.verifierConnexionsInactives();
    }, 5 * 60 * 1000);
  }

  nettoyerSallesInactives() {
    const maintenant = new Date();
    const seuilInactivite = 2 * 60 * 60 * 1000; // 2 heures

    for (const [trajetId, trajet] of this.trajetsActifs) {
      const tempsInactif = maintenant - trajet.dateCreation;
      
      if (tempsInactif > seuilInactivite && 
          (trajet.statut === 'annule' || trajet.statut === 'termine')) {
        
        // Supprimer de la map des trajets actifs
        this.trajetsActifs.delete(trajetId);
        
        // Vider la salle
        this.io.in(`trajet_${trajetId}`).socketsLeave(`trajet_${trajetId}`);
        
        console.log(`🧹 Salle trajet ${trajetId} nettoyée`);
      }
    }
  }

  nettoyerTrajetsTermines() {
    const maintenant = new Date();
    const seuilNettoyage = 24 * 60 * 60 * 1000; // 24 heures

    for (const [trajetId, trajet] of this.trajetsActifs) {
      if (trajet.statut === 'termine' && trajet.heureArrivee) {
        const tempsDepuisFin = maintenant - trajet.heureArrivee;
        
        if (tempsDepuisFin > seuilNettoyage) {
          this.trajetsActifs.delete(trajetId);
          this.io.in(`trajet_${trajetId}`).socketsLeave(`trajet_${trajetId}`);
          console.log(`🧹 Trajet terminé ${trajetId} nettoyé`);
        }
      }
    }
  }

  verifierConnexionsInactives() {
    const maintenant = new Date();
    const seuilInactivite = 30 * 60 * 1000; // 30 minutes

    for (const [socketId, userData] of this.userSockets) {
      const tempsInactif = maintenant - userData.derniereActivite;
      
      if (tempsInactif > seuilInactivite) {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.emit('inactivite_detectee', {
            message: 'Connexion inactive détectée',
            tempsInactif: Math.round(tempsInactif / 1000 / 60) // en minutes
          });
          
          // Déconnecter après 45 minutes d'inactivité
          if (tempsInactif > 45 * 60 * 1000) {
            socket.disconnect(true);
            console.log(`⏰ Déconnexion pour inactivité: ${userData.nom}`);
          }
        }
      }
    }
  }

  // =========================
  // MÉTHODES ADMINISTRATEUR
  // =========================
  
  // Monitoring en temps réel pour les admins
  envoyerStatsAdmin() {
    const stats = {
      connexions: this.getStatistiquesConnexions(),
      trajetsActifs: Array.from(this.trajetsActifs.values()).map(trajet => ({
        id: trajet.id,
        statut: trajet.statut,
        conducteur: this.getUtilisateurInfo(trajet.conducteurId),
        nombrePassagers: trajet.passagers ? trajet.passagers.length : 0,
        dateCreation: trajet.dateCreation
      })),
      utilisateursConnectes: this.getUtilisateursConnectes(),
      timestamp: new Date()
    };

    this.io.to('admin').emit('stats_temps_reel', stats);
  }

  // Démarrer le monitoring admin (à appeler depuis l'initialisation)
  demarrerMonitoringAdmin() {
    // Envoyer les stats toutes les 30 secondes aux admins
    setInterval(() => {
      this.envoyerStatsAdmin();
    }, 30 * 1000);
  }

  // =========================
  // HANDLERS SPÉCIALISÉS SUPPLÉMENTAIRES
  // =========================

  async handleArriveePointPrise(socket, userId, data) {
    try {
      const { trajetId, passagerId } = data;
      
      const trajet = this.trajetsActifs.get(trajetId);
      if (!trajet || trajet.conducteurId !== userId) {
        socket.emit('trajet_error', { message: 'Trajet introuvable ou non autorisé' });
        return;
      }

      // Notifier le passager de l'arrivée du conducteur
      const passagerSocketId = this.connectedUsers.get(passagerId);
      if (passagerSocketId) {
        this.io.to(passagerSocketId).emit('conducteur_arrive', {
          trajetId,
          conducteur: this.getUtilisateurInfo(userId),
          message: 'Votre conducteur est arrivé au point de prise en charge',
          timestamp: new Date()
        });
      }

      // Mettre à jour le statut du passager dans le trajet
      if (trajet.passagers) {
        const passager = trajet.passagers.find(p => p.userId === passagerId);
        if (passager) {
          passager.statut = 'en_attente_montee';
          passager.heureArriveeConduteur = new Date();
        }
      }

      socket.emit('arrivee_confirmee', {
        success: true,
        passagerId,
        trajetId
      });

    } catch (error) {
      console.error('❌ Erreur arrivée point prise:', error);
      socket.emit('trajet_error', { message: 'Erreur confirmation arrivée' });
    }
  }

  async handleTerminerTrajet(socket, userId, trajetId) {
    try {
      const trajet = this.trajetsActifs.get(trajetId);
      
      if (!trajet || trajet.conducteurId !== userId) {
        socket.emit('trajet_error', { message: 'Trajet introuvable ou non autorisé' });
        return;
      }

      // Mettre à jour le statut du trajet
      trajet.statut = 'termine';
      trajet.heureArrivee = new Date();

      // Calculer les statistiques du trajet
      const dureeTrajet = trajet.heureArrivee - trajet.heureDepart;
      const nombrePassagers = trajet.passagers ? trajet.passagers.length : 0;

      // Notifier tous les participants
      this.io.to(`trajet_${trajetId}`).emit('trajet_termine', {
        trajetId,
        heureArrivee: trajet.heureArrivee,
        dureeTrajet,
        nombrePassagers,
        conducteur: this.getUtilisateurInfo(userId),
        message: 'Trajet terminé avec succès !'
      });

      // Demander l'évaluation à tous les participants
      this.io.to(`trajet_${trajetId}`).emit('demande_evaluation', {
        trajetId,
        participants: [
          { id: userId, role: 'conducteur' },
          ...(trajet.passagers || []).map(p => ({ id: p.userId, role: 'passager' }))
        ]
      });

      console.log(`🏁 Trajet terminé: ${trajetId} - Durée: ${Math.round(dureeTrajet/1000/60)}min`);

    } catch (error) {
      console.error('❌ Erreur fin trajet:', error);
      socket.emit('trajet_error', { message: 'Erreur fin de trajet' });
    }
  }

  async handleNotificationLue(socket, userId, notificationId) {
    try {
      // Marquer la notification comme lue
      socket.emit('notification_marquee_lue', {
        success: true,
        notificationId,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('❌ Erreur notification lue:', error);
    }
  }

  async handleChangerStatut(socket, userId, nouveauStatut) {
    try {
      const statutsAutorises = ['disponible', 'occupe', 'absent', 'en_course'];
      
      if (!statutsAutorises.includes(nouveauStatut)) {
        socket.emit('statut_error', { message: 'Statut invalide' });
        return;
      }

      // Mettre à jour le statut utilisateur
      const userData = this.userSockets.get(socket.id);
      if (userData) {
        userData.statut = nouveauStatut;
        userData.derniereActivite = new Date();
      }

      // Notifier les autres utilisateurs pertinents
      if (userData && (userData.role === 'conducteur' || userData.role === 'les_deux')) {
        socket.to('passagers').emit('conducteur_statut_change', {
          conducteurId: userId,
          nouveauStatut,
          nom: userData.nom,
          coordonnees: userData.coordonnees
        });
      }

      socket.emit('statut_mis_a_jour', {
        success: true,
        nouveauStatut,
        timestamp: new Date()
      });

      console.log(`📱 Statut changé: ${userId} -> ${nouveauStatut}`);

    } catch (error) {
      console.error('❌ Erreur changement statut:', error);
      socket.emit('statut_error', { message: 'Erreur changement statut' });
    }
  }

  async handleSetDisponible(socket, userId, disponible) {
    try {
      const userData = this.userSockets.get(socket.id);
      if (userData) {
        userData.disponible = disponible;
        userData.derniereActivite = new Date();
        
        if (disponible) {
          userData.statut = 'disponible';
        } else {
          userData.statut = 'indisponible';
        }
      }

      socket.emit('disponibilite_mise_a_jour', {
        success: true,
        disponible,
        timestamp: new Date()
      });

    } catch (error) {
      console.error('❌ Erreur disponibilité:', error);
    }
  }

  async handleMessageLu(socket, userId, messageId) {
    try {
      // Confirmer la lecture du message
      socket.emit('message_lu_confirme', {
        success: true,
        messageId,
        timestamp: new Date()
      });

      // Notifier l'expéditeur si possible
      // (Implémentation dépendante de votre système de messages)

    } catch (error) {
      console.error('❌ Erreur message lu:', error);
    }
  }

  async handleRefuserReservation(socket, userId, data) {
    try {
      const { reservationId, raison } = data;

      // Trouver la réservation
      let trajetConcerne = null;
      let reservationTrouvee = null;

      for (const [trajetId, trajet] of this.trajetsActifs) {
        if (trajet.conducteurId === userId && trajet.reservations) {
          const reservation = trajet.reservations.find(r => r.id === reservationId);
          if (reservation) {
            trajetConcerne = trajet;
            reservationTrouvee = reservation;
            console.log(`Réservation trouvée dans le trajet ${trajetId}`);
            break;
          }
        }
      }

      if (!reservationTrouvee) {
        socket.emit('reservation_error', { message: 'Réservation introuvable' });
        return;
      }

      // Refuser la réservation
      reservationTrouvee.statut = 'refusee';
      reservationTrouvee.raison = raison;
      reservationTrouvee.dateRefus = new Date();

      // Notifier le passager
      const passagerSocketId = this.connectedUsers.get(reservationTrouvee.passagerId);
      if (passagerSocketId) {
        this.io.to(passagerSocketId).emit('reservation_refusee', {
          reservationId,
          trajet: trajetConcerne,
          raison,
          conducteur: this.getUtilisateurInfo(userId),
          message: 'Votre demande de réservation a été refusée'
        });
      }

      socket.emit('reservation_traitee', {
        success: true,
        action: 'refusee',
        reservationId
      });

      console.log(`❌ Réservation refusée: ${reservationId} - Raison: ${raison}`);

    } catch (error) {
      console.error('❌ Erreur refus réservation:', error);
      socket.emit('reservation_error', { message: 'Erreur refus réservation' });
    }
  }

  async handleRejoindreTrajet(socket, userId, trajetId) {
    try {
      const trajet = this.trajetsActifs.get(trajetId);
      if (!trajet) {
        socket.emit('trajet_error', { message: 'Trajet introuvable' });
        return;
      }

      // Vérifier si l'utilisateur fait partie du trajet
      const estConducteur = trajet.conducteurId === userId;
      const estPassager = trajet.passagers && 
        trajet.passagers.some(p => p.userId === userId);

      if (!estConducteur && !estPassager) {
        socket.emit('trajet_error', { message: 'Non autorisé à rejoindre ce trajet' });
        return;
      }

      // Rejoindre la salle du trajet
      socket.join(`trajet_${trajetId}`);

      // Envoyer les informations du trajet
      socket.emit('trajet_rejoint', {
        success: true,
        trajet: {
          id: trajetId,
          ...trajet,
          conducteur: this.getUtilisateurInfo(trajet.conducteurId),
          participants: (trajet.passagers || []).map(p => this.getUtilisateurInfo(p.userId))
        }
      });

      // Notifier les autres participants
      socket.to(`trajet_${trajetId}`).emit('participant_rejoint', {
        trajetId,
        participant: this.getUtilisateurInfo(userId),
        role: estConducteur ? 'conducteur' : 'passager'
      });

    } catch (error) {
      console.error('❌ Erreur rejoindre trajet:', error);
      socket.emit('trajet_error', { message: 'Erreur rejoindre trajet' });
    }
  }

  async handleQuitterTrajet(socket, userId, trajetId) {
    try {
      // Quitter la salle du trajet
      socket.leave(`trajet_${trajetId}`);

      // Notifier les autres participants
      socket.to(`trajet_${trajetId}`).emit('participant_quitte', {
        trajetId,
        participantId: userId,
        participant: this.getUtilisateurInfo(userId),
        timestamp: new Date()
      });

      socket.emit('trajet_quitte', {
        success: true,
        trajetId
      });

      console.log(`👋 Utilisateur ${userId} a quitté le trajet ${trajetId}`);

    } catch (error) {
      console.error('❌ Erreur quitter trajet:', error);
      socket.emit('trajet_error', { message: 'Erreur quitter trajet' });
    }
  }
}

module.exports = SocketHandler;