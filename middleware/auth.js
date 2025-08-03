const jwt = require('jsonwebtoken');
const User = require('../models/Utilisateur');

// Middleware d'authentification JWT
const authenticateToken = async (req, res, next) => {
    try {
        const authHeader = req.headers['authorization'];
        const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN
        
        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Token d\'accès requis'
            });
        }
        
        // Vérifier le token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        
        // Vérifier que l'utilisateur existe toujours
        const user = await User.findById(decoded.userId);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Utilisateur non trouvé'
            });
        }
        
        if (user.statutCompte !== 'ACTIF') {
            return res.status(401).json({
                success: false,
                message: 'Compte suspendu ou bloqué'
            });
        }
        
        // Ajouter l'ID utilisateur à la requête
        req.userId = decoded.userId;
        req.user = user;
        next();
        
    } catch (error) {
        console.error('Erreur authentification:', error);
        
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Token invalide'
            });
        }
        
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expiré'
            });
        }
        
        return res.status(500).json({
            success: false,
            message: 'Erreur serveur lors de l\'authentification'
        });
    }
};

// Middleware de validation des données utilisateur
const validateUserData = (req, res, next) => {
    const { nom, prenom, email, motDePasse, telephone, dateNaissance, sexe, adresse } = req.body;
    
    // Vérifications de base
    if (!nom || !prenom || !email || !motDePasse || !telephone || !dateNaissance || !sexe || !adresse) {
        return res.status(400).json({
            success: false,
            message: 'Tous les champs obligatoires doivent être remplis',
            required: ['nom', 'prenom', 'email', 'motDePasse', 'telephone', 'dateNaissance', 'sexe', 'adresse']
        });
    }
    
    // Validation nom et prénom
    if (nom.length < 2 || nom.length > 50 || prenom.length < 2 || prenom.length > 50) {
        return res.status(400).json({
            success: false,
            message: 'Le nom et prénom doivent contenir entre 2 et 50 caractères'
        });
    }
    
    // Validation email
    const emailRegex = /^\w+([.-]?\w+)*@\w+([.-]?\w+)*(\.\w{2,3})+$/;
    if (!emailRegex.test(email)) {
        return res.status(400).json({
            success: false,
            message: 'Format d\'email invalide'
        });
    }
    
    // Validation mot de passe
    if (motDePasse.length < 6) {
        return res.status(400).json({
            success: false,
            message: 'Le mot de passe doit contenir au moins 6 caractères'
        });
    }
    
    // Validation téléphone ivoirien
    const phoneRegex = /^(\+225|0)[0-9]{8,10}$/;
    if (!phoneRegex.test(telephone)) {
        return res.status(400).json({
            success: false,
            message: 'Format de téléphone ivoirien invalide'
        });
    }
    
    // Validation sexe
    if (!['M', 'F'].includes(sexe)) {
        return res.status(400).json({
            success: false,
            message: 'Sexe doit être M ou F'
        });
    }
    
    // Validation adresse
    if (!adresse.commune || !adresse.quartier || !adresse.coordonnees) {
        return res.status(400).json({
            success: false,
            message: 'Adresse complète requise (commune, quartier, coordonnées GPS)'
        });
    }
    
    next();
};

// Middleware pour vérifier si l'email existe déjà
const checkEmailExists = async (req, res, next) => {
    try {
        const { email } = req.body;
        
        const existingUser = await User.findOne({ email: email.toLowerCase() });
        if (existingUser) {
            return res.status(409).json({
                success: false,
                message: 'Un compte avec cet email existe déjà'
            });
        }
        
        next();
    } catch (error) {
        console.error('Erreur vérification email:', error);
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la vérification de l\'email'
        });
    }
};

// Middleware pour vérifier les permissions admin
const requireAdmin = async (req, res, next) => {
    try {
        if (req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Accès refusé. Permissions administrateur requises.'
            });
        }
        next();
    } catch (error) {
        console.error('Erreur vérification admin:', error);
        return res.status(500).json({
            success: false,
            message: 'Erreur lors de la vérification des permissions'
        });
    }
};

// Middleware pour valider les données de trajet
const validateTripData = (req, res, next) => {
    const { 
        lieuDepart, 
        lieuArrivee, 
        dateDepart, 
        heureDepart, 
        nombrePlaces, 
        prix 
    } = req.body;
    
    if (!lieuDepart || !lieuArrivee || !dateDepart || !heureDepart || !nombrePlaces || prix === undefined) {
        return res.status(400).json({
            success: false,
            message: 'Tous les champs obligatoires doivent être remplis',
            required: ['lieuDepart', 'lieuArrivee', 'dateDepart', 'heureDepart', 'nombrePlaces', 'prix']
        });
    }
    
    // Validation nombre de places
    if (nombrePlaces < 1 || nombrePlaces > 8) {
        return res.status(400).json({
            success: false,
            message: 'Le nombre de places doit être entre 1 et 8'
        });
    }
    
    // Validation prix
    if (prix < 0) {
        return res.status(400).json({
            success: false,
            message: 'Le prix ne peut pas être négatif'
        });
    }
    
    // Validation date (ne peut pas être dans le passé)
    const tripDate = new Date(`${dateDepart}T${heureDepart}`);
    if (tripDate <= new Date()) {
        return res.status(400).json({
            success: false,
            message: 'La date et l\'heure de départ doivent être dans le futur'
        });
    }
    
    next();
};

// Middleware de rate limiting personnalisé
const createRateLimit = (windowMs, max, message) => {
    const requests = new Map();
    
    return (req, res, next) => {
        const key = req.ip;
        const now = Date.now();
        const windowStart = now - windowMs;
        
        // Nettoyer les anciennes entrées
        if (requests.has(key)) {
            const userRequests = requests.get(key).filter(time => time > windowStart);
            requests.set(key, userRequests);
        } else {
            requests.set(key, []);
        }
        
        const userRequests = requests.get(key);
        
        if (userRequests.length >= max) {
            return res.status(429).json({
                success: false,
                message: message || 'Trop de requêtes, veuillez réessayer plus tard'
            });
        }
        
        userRequests.push(now);
        next();
    };
};

module.exports = {
    authenticateToken,
    validateUserData,
    checkEmailExists,
    requireAdmin,
    validateTripData,
    createRateLimit
};