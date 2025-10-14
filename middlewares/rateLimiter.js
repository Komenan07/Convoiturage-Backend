const rateLimit = require('express-rate-limit');

/**
 * Configuration complète des rate limiters pour application de covoiturage
 * Version corrigée compatible avec express-rate-limit v7+ et gestion IPv6
 */

// Configuration de base pour tous les limiters
const baseConfig = {
  standardHeaders: true,
  legacyHeaders: false,
  
  // ✅ Handler corrigé (remplace onLimitReached déprécié)
  handler: (req, res) => {
    console.warn('[RATE_LIMIT] Limite dépassée:', {
      ip: req.ip,
      user: req.user?.id,
      path: req.path,
      method: req.method,
      userAgent: req.get('User-Agent')
    });
    
    res.status(429).json({
      succes: false,
      erreur: 'Trop de requêtes',
      details: 'Limite de taux dépassée, veuillez patienter',
      code: 'RATE_LIMIT_EXCEEDED',
      retryAfter: req.rateLimit?.resetTime ? Math.ceil((req.rateLimit.resetTime - Date.now()) / 1000) : null
    });
  },
  
  // ✅ SUPPRESSION du keyGenerator par défaut - laisse express-rate-limit gérer IPv6
  skip: (req) => {
    // Skip pour les routes de santé et certaines routes système
    const skipPaths = ['/api/health', '/health', '/api/status'];
    return skipPaths.includes(req.path);
  }
};

/**
 * Rate limiters spécialisés pour l'application de covoiturage
 */
const rateLimiters = {
  
  // ===== AUTHENTIFICATION - Sécurité renforcée =====
  auth: {
    login: rateLimit({
      ...baseConfig,
      windowMs: 15 * 60 * 1000, // 15 minutes
      max: 5, // 5 tentatives par IP/utilisateur
      message: 'Trop de tentatives de connexion. Réessayez dans 15 minutes.',
      skipSuccessfulRequests: true,
      // ✅ Utilisation du keyGenerator par défaut d'express-rate-limit pour la sécurité
      handler: (req, res) => {
        console.error('[SECURITY] Tentatives de connexion excessives:', {
          ip: req.ip,
          email: req.body?.email,
          timestamp: new Date().toISOString()
        });
        
        res.status(429).json({
          succes: false,
          erreur: 'Trop de tentatives de connexion',
          details: 'Réessayez dans 15 minutes',
          code: 'AUTH_RATE_LIMIT_EXCEEDED'
        });
      }
    }),
    
    register: rateLimit({
      ...baseConfig,
      windowMs: 60 * 60 * 1000, // 1 heure
      max: 3, // 3 inscriptions par IP par heure
      message: 'Trop d\'inscriptions depuis cette adresse. Réessayez dans 1 heure.'
    }),
    
    resetPassword: rateLimit({
      ...baseConfig,
      windowMs: 60 * 60 * 1000, // 1 heure
      max: 3, // 3 demandes de reset par IP par heure
      message: 'Trop de demandes de réinitialisation. Réessayez dans 1 heure.'
    }),

    confirmEmail: rateLimit({
      ...baseConfig,
      windowMs: 60 * 60 * 1000, // 1 heure
      max: 5, // 5 demandes de confirmation d'email par heure
      message: 'Trop de demandes de confirmation d\'email. Réessayez dans 1 heure.'
    }),

    logout: rateLimit({
      ...baseConfig,
      windowMs: 60 * 1000, // 1 minute
      max: 10, // 10 déconnexions par minute (généreux)
      message: 'Trop de déconnexions. Attendez 1 minute.'
    })
  },

  // ===== TRAJETS - Gestion des annonces =====
  trajet: {
    create: rateLimit({
      ...baseConfig,
      windowMs: 60 * 60 * 1000, // 1 heure
      max: (req) => {
        // Limite selon le rôle et le type de compte
        const user = req.user;
        if (!user) return 5;
        
        if (user.role === 'admin') return 100;
        if (user.compteCovoiturage?.estRecharge) return 20; // Comptes rechargés plus généreux
        if (user.role === 'conducteur' || user.role === 'les_deux') return 10;
        return 3; // Passagers uniquement
      },
      message: 'Limite de création de trajets atteinte. Attendez 1 heure.',
      keyGenerator: (req) => req.user?.id // ✅ Utilise seulement l'ID utilisateur si disponible
    }),
    
    search: rateLimit({
      ...baseConfig,
      windowMs: 60 * 1000, // 1 minute
      max: 50, // 50 recherches par minute par utilisateur
      message: 'Trop de recherches. Attendez 1 minute.'
    }),
    
    update: rateLimit({
      ...baseConfig,
      windowMs: 30 * 60 * 1000, // 30 minutes
      max: 20, // 20 modifications par 30 minutes
      message: 'Trop de modifications. Attendez 30 minutes.',
      keyGenerator: (req) => req.user?.id
    }),

    delete: rateLimit({
      ...baseConfig,
      windowMs: 60 * 60 * 1000, // 1 heure
      max: 10, // 10 suppressions par heure
      message: 'Trop de suppressions de trajets. Attendez 1 heure.',
      keyGenerator: (req) => req.user?.id
    }),

    list: rateLimit({
      ...baseConfig,
      windowMs: 60 * 1000, // 1 minute
      max: 100, // 100 listes par minute
      message: 'Trop de demandes de liste. Attendez 1 minute.'
    })
  },

  // ===== RÉSERVATIONS - Actions importantes =====
  reservation: {
    create: rateLimit({
      ...baseConfig,
      windowMs: 5 * 60 * 1000, // 5 minutes
      max: (req) => {
        const user = req.user;
        if (!user) return 2;
        if (user.scoreConfiance >= 80) return 10; // Utilisateurs de confiance
        if (user.scoreConfiance >= 60) return 7;
        return 5; // Utilisateurs standards
      },
      message: 'Trop de réservations. Attendez 5 minutes.',
      keyGenerator: (req) => req.user?.id
    }),
    
    cancel: rateLimit({
      ...baseConfig,
      windowMs: 60 * 60 * 1000, // 1 heure
      max: (req) => {
        const user = req.user;
        if (!user) return 5;
        // Pénaliser les utilisateurs avec beaucoup d'annulations
        const tauxAnnulation = user.tauxAnnulation || 0;
        if (tauxAnnulation > 30) return 3; // Max 3 pour les "annuleurs"
        if (tauxAnnulation > 15) return 5;
        return 10; // Utilisateurs fiables
      },
      message: 'Trop d\'annulations. Attendez 1 heure.',
      keyGenerator: (req) => req.user?.id
    }),

    accept: rateLimit({
      ...baseConfig,
      windowMs: 60 * 1000, // 1 minute
      max: 20, // 20 acceptations par minute
      message: 'Trop d\'acceptations de réservations. Attendez 1 minute.',
      keyGenerator: (req) => req.user?.id
    }),

    refuse: rateLimit({
      ...baseConfig,
      windowMs: 60 * 1000, // 1 minute
      max: 30, // 30 refus par minute
      message: 'Trop de refus de réservations. Attendez 1 minute.',
      keyGenerator: (req) => req.user?.id
    })
  },

  // ===== MESSAGES - Compatible avec le système existant =====
  message: {
    send: rateLimit({
      ...baseConfig,
      windowMs: 60 * 1000, // 1 minute
      max: (req) => {
        const user = req.user;
        if (!user) return 10;
        if (user.role === 'admin') return 100;
        if (user.scoreConfiance >= 80) return 50; // Utilisateurs de confiance
        if (user.scoreConfiance >= 60) return 35;
        return 25; // Utilisateurs standards (réduit de 30 à 25)
      },
      message: 'Trop de messages envoyés. Attendez 1 minute.',
      keyGenerator: (req) => req.user?.id
    }),
    
    read: rateLimit({
      ...baseConfig,
      windowMs: 60 * 1000, // 1 minute
      max: 200, // 200 lectures par minute (généreux)
      message: 'Trop de requêtes de lecture. Attendez 1 minute.'
    }),
    
    search: rateLimit({
      ...baseConfig,
      windowMs: 60 * 1000, // 1 minute
      max: 20, // 20 recherches par minute
      message: 'Trop de recherches dans les messages. Attendez 1 minute.',
      keyGenerator: (req) => req.user?.id
    }),

    conversation: rateLimit({
      ...baseConfig,
      windowMs: 60 * 1000, // 1 minute
      max: 50, // 50 accès aux conversations par minute
      message: 'Trop d\'accès aux conversations. Attendez 1 minute.',
      keyGenerator: (req) => req.user?.id
    }),

    position: rateLimit({
      ...baseConfig,
      windowMs: 60 * 1000, // 1 minute
      max: 30, // 30 messages de position par minute
      message: 'Trop de messages de position. Attendez 1 minute.',
      keyGenerator: (req) => req.user?.id
    }),

    modele: rateLimit({
      ...baseConfig,
      windowMs: 60 * 1000, // 1 minute
      max: 15, // 15 messages modèles par minute
      message: 'Trop de messages modèles. Attendez 1 minute.',
      keyGenerator: (req) => req.user?.id
    })
  },

  // ===== COMPTE COVOITURAGE - Nouveau système financier =====
  compte: {
    recharge: rateLimit({
      ...baseConfig,
      windowMs: 60 * 60 * 1000, // 1 heure
      max: (req) => {
        const user = req.user;
        if (!user) return 2;
        if (user.role === 'admin') return 50;
        if (user.compteCovoiturage?.estRecharge) return 10; // Comptes déjà rechargés
        return 5; // Nouvelles recharges
      },
      message: 'Trop de tentatives de recharge. Attendez 1 heure.',
      keyGenerator: (req) => req.user?.id
    }),

    retrait: rateLimit({
      ...baseConfig,
      windowMs: 24 * 60 * 60 * 1000, // 24 heures
      max: 5, // 5 retraits par jour max
      message: 'Limite de retraits quotidiens atteinte. Réessayez demain.',
      keyGenerator: (req) => req.user?.id
    }),

    historique: rateLimit({
      ...baseConfig,
      windowMs: 60 * 1000, // 1 minute
      max: 30, // 30 consultations d'historique par minute
      message: 'Trop de consultations d\'historique. Attendez 1 minute.',
      keyGenerator: (req) => req.user?.id
    }),

    solde: rateLimit({
      ...baseConfig,
      windowMs: 60 * 1000, // 1 minute
      max: 60, // 60 consultations de solde par minute
      message: 'Trop de consultations de solde. Attendez 1 minute.',
      keyGenerator: (req) => req.user?.id
    }),

    configAutoRecharge: rateLimit({
      ...baseConfig,
      windowMs: 60 * 60 * 1000, // 1 heure
      max: 10, // 10 configurations par heure
      message: 'Trop de configurations de recharge automatique. Attendez 1 heure.',
      keyGenerator: (req) => req.user?.id
    })
  },

  // ===== PAIEMENTS - Sécurité maximale =====
  paiement: {
    initiate: rateLimit({
      ...baseConfig,
      windowMs: 60 * 60 * 1000, // 1 heure
      max: (req) => {
        const user = req.user;
        if (!user) return 5;
        if (user.scoreConfiance >= 90) return 30; // Utilisateurs très fiables
        if (user.scoreConfiance >= 70) return 20;
        return 15; // Utilisateurs standards
      },
      message: 'Limite de transactions atteinte. Attendez 1 heure.',
      keyGenerator: (req) => req.user?.id
    }),
    
    webhook: rateLimit({
      ...baseConfig,
      windowMs: 60 * 1000, // 1 minute
      max: 200, // 200 webhooks par minute (pour les pics de trafic)
      message: 'Trop de webhooks de paiement.',
      // ✅ Pour les webhooks, on utilise un keyGenerator spécial
      keyGenerator: (req) => {
        // Pour les webhooks, on peut identifier par User-Agent ou header spécial
        const userAgent = req.get('User-Agent')?.toLowerCase() || 'unknown';
        return `webhook-${userAgent}`;
      },
      skip: (req) => {
        // Skip si c'est un webhook authentifié des partenaires de paiement
        const trustedWebhooks = ['wave', 'orange', 'mtn', 'moov'];
        const userAgent = req.get('User-Agent')?.toLowerCase() || '';
        return trustedWebhooks.some(provider => userAgent.includes(provider));
      }
    }),

    verify: rateLimit({
      ...baseConfig,
      windowMs: 60 * 1000, // 1 minute
      max: 50, // 50 vérifications par minute
      message: 'Trop de vérifications de paiement. Attendez 1 minute.',
      keyGenerator: (req) => req.user?.id
    }),

    cancel: rateLimit({
      ...baseConfig,
      windowMs: 60 * 60 * 1000, // 1 heure
      max: 10, // 10 annulations par heure
      message: 'Trop d\'annulations de paiement. Attendez 1 heure.',
      keyGenerator: (req) => req.user?.id
    })
  },

  // ===== PROFIL UTILISATEUR =====
  profil: {
    update: rateLimit({
      ...baseConfig,
      windowMs: 60 * 60 * 1000, // 1 heure
      max: 10, // 10 modifications de profil par heure
      message: 'Trop de modifications de profil. Attendez 1 heure.',
      keyGenerator: (req) => req.user?.id
    }),
    
    uploadPhoto: rateLimit({
      ...baseConfig,
      windowMs: 60 * 60 * 1000, // 1 heure
      max: 5, // 5 uploads de photo par heure
      message: 'Trop d\'uploads de photo. Attendez 1 heure.',
      keyGenerator: (req) => req.user?.id
    }),

    view: rateLimit({
      ...baseConfig,
      windowMs: 60 * 1000, // 1 minute
      max: 100, // 100 consultations de profils par minute
      message: 'Trop de consultations de profils. Attendez 1 minute.'
    }),

    updatePreferences: rateLimit({
      ...baseConfig,
      windowMs: 30 * 60 * 1000, // 30 minutes
      max: 20, // 20 modifications de préférences par 30 minutes
      message: 'Trop de modifications de préférences. Attendez 30 minutes.',
      keyGenerator: (req) => req.user?.id
    }),

    addContact: rateLimit({
      ...baseConfig,
      windowMs: 60 * 60 * 1000, // 1 heure
      max: 5, // 5 ajouts de contacts d'urgence par heure
      message: 'Trop d\'ajouts de contacts d\'urgence. Attendez 1 heure.',
      keyGenerator: (req) => req.user?.id
    })
  },

  // ===== VÉHICULES (pour conducteurs) =====
  vehicule: {
    add: rateLimit({
      ...baseConfig,
      windowMs: 24 * 60 * 60 * 1000, // 24 heures
      max: 3, // 3 ajouts de véhicules par jour
      message: 'Limite d\'ajouts de véhicules atteinte. Réessayez demain.',
      keyGenerator: (req) => req.user?.id
    }),

    update: rateLimit({
      ...baseConfig,
      windowMs: 60 * 60 * 1000, // 1 heure
      max: 10, // 10 modifications par heure
      message: 'Trop de modifications de véhicule. Attendez 1 heure.',
      keyGenerator: (req) => req.user?.id
    }),

    uploadDocument: rateLimit({
      ...baseConfig,
      windowMs: 24 * 60 * 60 * 1000, // 24 heures
      max: 10, // 10 uploads de documents par jour
      message: 'Limite d\'uploads de documents atteinte. Réessayez demain.',
      keyGenerator: (req) => req.user?.id
    })
  },

  // ===== ÉVALUATIONS ET AVIS =====
  evaluation: {
    create: rateLimit({
      ...baseConfig,
      windowMs: 60 * 60 * 1000, // 1 heure
      max: 15, // 15 évaluations par heure (augmenté car important)
      message: 'Trop d\'évaluations. Attendez 1 heure.',
      keyGenerator: (req) => req.user?.id
    }),

    update: rateLimit({
      ...baseConfig,
      windowMs: 24 * 60 * 60 * 1000, // 24 heures
      max: 5, // 5 modifications d'évaluations par jour
      message: 'Trop de modifications d\'évaluations. Réessayez demain.',
      keyGenerator: (req) => req.user?.id
    }),

    view: rateLimit({
      ...baseConfig,
      windowMs: 60 * 1000, // 1 minute
      max: 100, // 100 consultations par minute
      message: 'Trop de consultations d\'évaluations. Attendez 1 minute.'
    })
  },

  // ===== SIGNALEMENTS - Actions sensibles =====
  signalement: {
    create: rateLimit({
      ...baseConfig,
      windowMs: 60 * 60 * 1000, // 1 heure
      max: (req) => {
        const user = req.user;
        if (!user) return 2;
        if (user.scoreConfiance >= 80) return 8; // Utilisateurs de confiance
        if (user.scoreConfiance >= 60) return 5;
        return 3; // Utilisateurs avec score faible
      },
      message: 'Trop de signalements. Attendez 1 heure.',
      keyGenerator: (req) => req.user?.id
    }),

    view: rateLimit({
      ...baseConfig,
      windowMs: 60 * 1000, // 1 minute
      max: 30, // 30 consultations par minute
      message: 'Trop de consultations de signalements. Attendez 1 minute.',
      keyGenerator: (req) => req.user?.id
    })
  },

  // ===== VÉRIFICATION D'IDENTITÉ =====
  verification: {
    uploadDocument: rateLimit({
      ...baseConfig,
      windowMs: 24 * 60 * 60 * 1000, // 24 heures
      max: 5, // 5 uploads par jour
      message: 'Limite d\'uploads de documents d\'identité atteinte. Réessayez demain.',
      keyGenerator: (req) => req.user?.id
    }),

    request: rateLimit({
      ...baseConfig,
      windowMs: 24 * 60 * 60 * 1000, // 24 heures
      max: 3, // 3 demandes de vérification par jour
      message: 'Trop de demandes de vérification. Réessayez demain.',
      keyGenerator: (req) => req.user?.id
    })
  },

  // ===== ADMINISTRATION =====
  admin: {
    actions: rateLimit({
      ...baseConfig,
      windowMs: 60 * 1000, // 1 minute
      max: (req) => {
        const user = req.user;
        if (user?.role === 'admin') return 200; // Généreux pour les admins
        return 0; // Aucune action admin pour les non-admins
      },
      message: 'Actions administrateur limitées.',
      keyGenerator: (req) => req.user?.id,
      skip: (req) => req.user?.role !== 'admin' // Skip complètement si pas admin
    }),

    reports: rateLimit({
      ...baseConfig,
      windowMs: 60 * 1000, // 1 minute
      max: 30, // 30 générations de rapports par minute
      message: 'Trop de générations de rapports. Attendez 1 minute.',
      keyGenerator: (req) => req.user?.id
    })
  },

  // ===== NOTIFICATIONS =====
  notification: {
    send: rateLimit({
      ...baseConfig,
      windowMs: 60 * 1000, // 1 minute
      max: 100, // 100 notifications par minute
      message: 'Trop d\'envois de notifications. Attendez 1 minute.',
      keyGenerator: (req) => req.user?.id
    }),

    markRead: rateLimit({
      ...baseConfig,
      windowMs: 60 * 1000, // 1 minute
      max: 200, // 200 marquages par minute
      message: 'Trop de marquages de notifications. Attendez 1 minute.',
      keyGenerator: (req) => req.user?.id
    })
  }
};

/**
 * Rate limiter général pour toute l'API
 */
const globalRateLimit = rateLimit({
  ...baseConfig,
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: (req) => {
    const user = req.user;
    const env = process.env.NODE_ENV;
    
    // En développement, plus permissif
    if (env !== 'production') {
      return 10000;
    }
    
    // En production, selon le rôle/statut
    if (user?.role === 'admin') return 5000;
    if (user?.compteCovoiturage?.estRecharge) return 2000; // Comptes rechargés
    if (user?.scoreConfiance >= 80) return 1500; // Utilisateurs de confiance
    if (user) return 1000; // Utilisateurs connectés
    return 500; // Utilisateurs anonymes
  },
  message: 'Trop de requêtes depuis cette adresse. Réessayez dans 15 minutes.',
  keyGenerator: (req) => req.user?.id // ✅ Utilise seulement l'ID utilisateur si disponible
});

/**
 * Rate limiter intelligent selon l'endpoint
 */
const smartRateLimit = (req, res, next) => {
  const path = req.path.toLowerCase();
  const method = req.method.toLowerCase();
  
  // Détection automatique du limiteur approprié
  let limiter = null;
  
  // ===== AUTHENTIFICATION =====
  if (path.includes('/auth/login')) {
    limiter = rateLimiters.auth.login;
  } else if (path.includes('/auth/register') || path.includes('/auth/signup')) {
    limiter = rateLimiters.auth.register;
  } else if (path.includes('/auth/reset-password') || path.includes('/auth/forgot-password')) {
    limiter = rateLimiters.auth.resetPassword;
  } else if (path.includes('/auth/confirm-email') || path.includes('/auth/verify-email')) {
    limiter = rateLimiters.auth.confirmEmail;
  } else if (path.includes('/auth/logout')) {
    limiter = rateLimiters.auth.logout;
  }
  
  // ===== TRAJETS =====
  else if (path.includes('/trajets') && method === 'post') {
    limiter = rateLimiters.trajet.create;
  } else if (path.includes('/trajets/search') || path.includes('/trajets/recherche')) {
    limiter = rateLimiters.trajet.search;
  } else if (path.includes('/trajets') && (method === 'put' || method === 'patch')) {
    limiter = rateLimiters.trajet.update;
  } else if (path.includes('/trajets') && method === 'delete') {
    limiter = rateLimiters.trajet.delete;
  } else if (path.includes('/trajets') && method === 'get') {
    limiter = rateLimiters.trajet.list;
  }
  
  // ===== RÉSERVATIONS =====
  else if (path.includes('/reservations') && method === 'post') {
    limiter = rateLimiters.reservation.create;
  } else if (path.includes('/reservations') && method === 'delete') {
    limiter = rateLimiters.reservation.cancel;
  } else if (path.includes('/reservations/accept') || path.includes('/reservations/accepter')) {
    limiter = rateLimiters.reservation.accept;
  } else if (path.includes('/reservations/refuse') || path.includes('/reservations/refuser')) {
    limiter = rateLimiters.reservation.refuse;
  }
  
  // ===== MESSAGES =====
  else if (path.includes('/messages/texte') || path.includes('/messages/send')) {
    limiter = rateLimiters.message.send;
  } else if (path.includes('/messages/position') || path.includes('/messages/location')) {
    limiter = rateLimiters.message.position;
  } else if (path.includes('/messages/modele') || path.includes('/messages/template')) {
    limiter = rateLimiters.message.modele;
  } else if (path.includes('/messages/conversation')) {
    limiter = rateLimiters.message.conversation;
  } else if (path.includes('/messages/recherche') || path.includes('/messages/search')) {
    limiter = rateLimiters.message.search;
  } else if (path.includes('/messages') && method === 'get') {
    limiter = rateLimiters.message.read;
  }
  
  // ===== COMPTE COVOITURAGE =====
  else if (path.includes('/compte/recharge') || path.includes('/wallet/recharge')) {
    limiter = rateLimiters.compte.recharge;
  } else if (path.includes('/compte/retrait') || path.includes('/wallet/withdraw')) {
    limiter = rateLimiters.compte.retrait;
  } else if (path.includes('/compte/historique') || path.includes('/wallet/history')) {
    limiter = rateLimiters.compte.historique;
  } else if (path.includes('/compte/solde') || path.includes('/wallet/balance')) {
    limiter = rateLimiters.compte.solde;
  } else if (path.includes('/compte/auto-recharge') || path.includes('/wallet/auto-recharge')) {
    limiter = rateLimiters.compte.configAutoRecharge;
  }
  
  // ===== PAIEMENTS =====
  else if (path.includes('/paiements') && method === 'post') {
    limiter = rateLimiters.paiement.initiate;
  } else if (path.includes('/paiements/webhook') || path.includes('/payments/webhook')) {
    limiter = rateLimiters.paiement.webhook;
  } else if (path.includes('/paiements/verify') || path.includes('/payments/verify')) {
    limiter = rateLimiters.paiement.verify;
  } else if (path.includes('/paiements/cancel') || path.includes('/payments/cancel')) {
    limiter = rateLimiters.paiement.cancel;
  }
  
  // ===== PROFIL =====
  else if (path.includes('/profil') && (method === 'put' || method === 'patch')) {
    limiter = rateLimiters.profil.update;
  } else if (path.includes('/profil/photo') || path.includes('/profile/photo')) {
    limiter = rateLimiters.profil.uploadPhoto;
  } else if (path.includes('/profil/preferences') || path.includes('/profile/preferences')) {
    limiter = rateLimiters.profil.updatePreferences;
  } else if (path.includes('/profil/contact') || path.includes('/profile/emergency-contact')) {
    limiter = rateLimiters.profil.addContact;
  } else if (path.includes('/profil') && method === 'get') {
    limiter = rateLimiters.profil.view;
  }
  
  // ===== VÉHICULES =====
  else if (path.includes('/vehicule') && method === 'post') {
    limiter = rateLimiters.vehicule.add;
  } else if (path.includes('/vehicule') && (method === 'put' || method === 'patch')) {
    limiter = rateLimiters.vehicule.update;
  } else if (path.includes('/vehicule/document') || path.includes('/vehicle/document')) {
    limiter = rateLimiters.vehicule.uploadDocument;
  }
  
  // ===== ÉVALUATIONS =====
  else if (path.includes('/evaluations') && method === 'post') {
    limiter = rateLimiters.evaluation.create;
  } else if (path.includes('/evaluations') && (method === 'put' || method === 'patch')) {
    limiter = rateLimiters.evaluation.update;
  } else if (path.includes('/evaluations') && method === 'get') {
    limiter = rateLimiters.evaluation.view;
  }
  
  // ===== SIGNALEMENTS =====
  else if (path.includes('/signalements') || path.endsWith('/signaler') || path.includes('/report')) {
    if (method === 'post') {
      limiter = rateLimiters.signalement.create;
    } else if (method === 'get') {
      limiter = rateLimiters.signalement.view;
    }
  }
  
  // ===== VÉRIFICATION =====
  else if (path.includes('/verification/document') || path.includes('/verify/document')) {
    limiter = rateLimiters.verification.uploadDocument;
  } else if (path.includes('/verification/request') || path.includes('/verify/request')) {
    limiter = rateLimiters.verification.request;
  }
  
  // ===== ADMINISTRATION =====
  else if (path.includes('/admin')) {
    if (path.includes('/reports')) {
      limiter = rateLimiters.admin.reports;
    } else {
      limiter = rateLimiters.admin.actions;
    }
  }
  
  // ===== NOTIFICATIONS =====
  else if (path.includes('/notifications/send')) {
    limiter = rateLimiters.notification.send;
  } else if (path.includes('/notifications/read') || path.includes('/notifications/mark-read')) {
    limiter = rateLimiters.notification.markRead;
  }
  
  // Appliquer le limiteur spécifique ou passer au suivant
  if (limiter) {
    return limiter(req, res, next);
  }
  
  next();
};

/**
 * Utilitaires pour créer des limiteurs personnalisés
 */
const createCustomLimiter = (windowMs, max, message, options = {}) => {
  return rateLimit({
    ...baseConfig,
    ...options,
    windowMs,
    max,
    message
  });
};

/**
 * Limiteurs par rôle utilisateur basés sur le modèle Utilisateur
 */
const createRoleLimiter = (windowMs, limits) => {
  return rateLimit({
    ...baseConfig,
    windowMs,
    max: (req) => {
      const user = req.user;
      if (!user) return limits.ANONYME || 10;
      
      const userRole = user.role?.toUpperCase() || 'PASSAGER';
      
      // Ajustements selon le score de confiance
      let baseLimit = limits[userRole] || limits.UTILISATEUR || 100;
      
      if (user.scoreConfiance >= 90) {
        baseLimit = Math.floor(baseLimit * 1.5); // +50% pour les très fiables
      } else if (user.scoreConfiance >= 80) {
        baseLimit = Math.floor(baseLimit * 1.3); // +30% pour les fiables
      } else if (user.scoreConfiance >= 60) {
        baseLimit = Math.floor(baseLimit * 1.1); // +10% pour les moyens
      } else if (user.scoreConfiance < 40) {
        baseLimit = Math.floor(baseLimit * 0.7); // -30% pour les peu fiables
      }
      
      // Bonus pour les comptes rechargés
      if (user.compteCovoiturage?.estRecharge) {
        baseLimit = Math.floor(baseLimit * 1.2); // +20% pour les comptes rechargés
      }
      
      return baseLimit;
    },
    keyGenerator: (req) => req.user?.id // ✅ Utilise seulement l'ID utilisateur
  });
};

// Limiteurs par rôle pré-configurés
const apiLimiterByRole = createRoleLimiter(60 * 60 * 1000, { // 1 heure
  PASSAGER: 500,
  CONDUCTEUR: 800,
  LES_DEUX: 1000, // Les utilisateurs pouvant être conducteur et passager
  ADMIN: 5000,
  UTILISATEUR: 500, // Fallback
  ANONYME: 100
});

const messagingLimiterByRole = createRoleLimiter(60 * 1000, { // 1 minute
  PASSAGER: 20,
  CONDUCTEUR: 30,
  LES_DEUX: 35,
  ADMIN: 100,
  UTILISATEUR: 25,
  ANONYME: 5
});

/**
 * Limiteur adaptatif basé sur le comportement utilisateur
 */
const adaptiveRateLimit = (baseWindowMs, baseLimits) => {
  return rateLimit({
    ...baseConfig,
    windowMs: baseWindowMs,
    max: (req) => {
      const user = req.user;
      if (!user) return baseLimits.ANONYME || 10;
      
      let limit = baseLimits[user.role?.toUpperCase()] || baseLimits.UTILISATEUR || 100;
      
      // Facteurs d'ajustement
      const factors = {
        scoreConfiance: 1,
        anciennete: 1,
        activite: 1,
        fiabilite: 1
      };
      
      // Ajustement selon le score de confiance
      if (user.scoreConfiance >= 90) factors.scoreConfiance = 1.5;
      else if (user.scoreConfiance >= 80) factors.scoreConfiance = 1.3;
      else if (user.scoreConfiance >= 60) factors.scoreConfiance = 1.1;
      else if (user.scoreConfiance < 40) factors.scoreConfiance = 0.7;
      
      // Ajustement selon l'ancienneté (en jours)
      const anciennete = Math.floor((Date.now() - new Date(user.dateInscription).getTime()) / (1000 * 60 * 60 * 24));
      if (anciennete > 365) factors.anciennete = 1.3; // +1 an
      else if (anciennete > 180) factors.anciennete = 1.2; // +6 mois
      else if (anciennete > 90) factors.anciennete = 1.1; // +3 mois
      else if (anciennete < 7) factors.anciennete = 0.8; // -1 semaine
      
      // Ajustement selon l'activité (nombre de trajets)
      if (user.nombreTrajetsEffectues > 100) factors.activite = 1.3;
      else if (user.nombreTrajetsEffectues > 50) factors.activite = 1.2;
      else if (user.nombreTrajetsEffectues > 20) factors.activite = 1.1;
      else if (user.nombreTrajetsEffectues === 0) factors.activite = 0.8;
      
      // Ajustement selon la fiabilité (taux d'annulation)
      const tauxAnnulation = user.tauxAnnulation || 0;
      if (tauxAnnulation < 5) factors.fiabilite = 1.2; // Très fiable
      else if (tauxAnnulation < 15) factors.fiabilite = 1.1; // Fiable
      else if (tauxAnnulation > 30) factors.fiabilite = 0.7; // Peu fiable
      else if (tauxAnnulation > 50) factors.fiabilite = 0.5; // Très peu fiable
      
      // Bonus compte rechargé
      if (user.compteCovoiturage?.estRecharge) {
        factors.activite *= 1.2;
      }
      
      // Calcul final
      const finalLimit = Math.floor(limit * 
        factors.scoreConfiance * 
        factors.anciennete * 
        factors.activite * 
        factors.fiabilite
      );
      
      return Math.max(finalLimit, baseLimits.MINIMUM || 5);
    },
    keyGenerator: (req) => req.user?.id // ✅ Utilise seulement l'ID utilisateur
  });
};

/**
 * Limiteur intelligent pour les actions critiques
 */
const criticalActionLimiter = rateLimit({
  ...baseConfig,
  windowMs: 60 * 60 * 1000, // 1 heure
  max: (req) => {
    const user = req.user;
    if (!user) return 2;
    
    // Actions critiques : paiements, signalements, modifications importantes
    let baseLimit = 10;
    
    // Très restrictif pour les nouveaux comptes
    const anciennete = Math.floor((Date.now() - new Date(user.dateInscription).getTime()) / (1000 * 60 * 60 * 24));
    if (anciennete < 7) baseLimit = 3; // Nouveau compte
    else if (anciennete < 30) baseLimit = 5; // Compte récent
    
    // Très restrictif pour les comptes peu fiables
    if (user.scoreConfiance < 40) baseLimit = Math.floor(baseLimit * 0.5);
    else if (user.scoreConfiance >= 90) baseLimit = Math.floor(baseLimit * 1.5);
    
    // Restrictif selon le taux d'annulation
    const tauxAnnulation = user.tauxAnnulation || 0;
    if (tauxAnnulation > 30) baseLimit = Math.floor(baseLimit * 0.6);
    
    return Math.max(baseLimit, 1);
  },
  message: 'Trop d\'actions critiques. Attendez 1 heure.',
  keyGenerator: (req) => req.user?.id // ✅ Utilise seulement l'ID utilisateur
});

/**
 * Configuration par environnement
 */
const getEnvironmentConfig = () => {
  const env = process.env.NODE_ENV || 'development';
  
  const configs = {
    development: {
      multiplier: 10, // 10x plus permissif
      enableLogging: true,
      skipAuthenticated: true
    },
    test: {
      multiplier: 100, // 100x plus permissif pour les tests
      enableLogging: false,
      skipAuthenticated: true
    },
    staging: {
      multiplier: 2, // 2x plus permissif
      enableLogging: true,
      skipAuthenticated: false
    },
    production: {
      multiplier: 1, // Limites normales
      enableLogging: true,
      skipAuthenticated: false
    }
  };
  
  return configs[env] || configs.production;
};

/**
 * Wrapper pour appliquer la configuration d'environnement
 */
const withEnvironmentConfig = (limiter) => {
  const config = getEnvironmentConfig();
  
  return (req, res, next) => {
    // Skip en développement/test pour les utilisateurs authentifiés
    if (config.skipAuthenticated && req.user && process.env.NODE_ENV !== 'production') {
      return next();
    }
    
    // Appliquer le multiplicateur d'environnement
    const originalMax = limiter.max;
    if (typeof originalMax === 'function') {
      limiter.max = (req) => Math.floor(originalMax(req) * config.multiplier);
    } else {
      limiter.max = Math.floor(originalMax * config.multiplier);
    }
    
    return limiter(req, res, next);
  };
};

/**
 * Limiteurs exportés avec configuration d'environnement
 */
const environmentalLimiters = Object.keys(rateLimiters).reduce((acc, category) => {
  acc[category] = {};
  Object.keys(rateLimiters[category]).forEach(subcategory => {
    acc[category][subcategory] = withEnvironmentConfig(rateLimiters[category][subcategory]);
  });
  return acc;
}, {});

/**
 * Statistiques et monitoring des rate limits
 */
const rateLimitStats = {
  hits: new Map(),
  blocks: new Map(),
  
  recordHit: (key, endpoint) => {
    const statsKey = `${key}-${endpoint}`;
    const current = rateLimitStats.hits.get(statsKey) || 0;
    rateLimitStats.hits.set(statsKey, current + 1);
  },
  
  recordBlock: (key, endpoint) => {
    const statsKey = `${key}-${endpoint}`;
    const current = rateLimitStats.blocks.get(statsKey) || 0;
    rateLimitStats.blocks.set(statsKey, current + 1);
  },
  
  getStats: () => ({
    totalHits: Array.from(rateLimitStats.hits.values()).reduce((sum, val) => sum + val, 0),
    totalBlocks: Array.from(rateLimitStats.blocks.values()).reduce((sum, val) => sum + val, 0),
    topEndpoints: Array.from(rateLimitStats.hits.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
  }),
  
  reset: () => {
    rateLimitStats.hits.clear();
    rateLimitStats.blocks.clear();
  }
};

module.exports = {
  // Limiteurs principaux
  globalRateLimit: withEnvironmentConfig(globalRateLimit),
  smartRateLimit,
  rateLimiters: environmentalLimiters,
  
  // Limiteurs spécialisés
  adaptiveRateLimit,
  criticalActionLimiter: withEnvironmentConfig(criticalActionLimiter),
  
  // Limiteurs par rôle
  createRoleLimiter,
  apiLimiterByRole: withEnvironmentConfig(apiLimiterByRole),
  messagingLimiterByRole: withEnvironmentConfig(messagingLimiterByRole),
  
  // Utilitaires
  createCustomLimiter,
  withEnvironmentConfig,
  
  // Configuration et monitoring
  getEnvironmentConfig,
  rateLimitStats,
  
  // Export de baseConfig pour extensions
  baseConfig,
  
  // Limiteurs originaux (sans configuration d'environnement) pour cas spéciaux
  originalRateLimiters: rateLimiters
};