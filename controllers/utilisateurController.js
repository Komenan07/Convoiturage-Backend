const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const User = require('../models/Utilisateur');

// Fonction d'inscription
const register = async (req, res) => {
    try {
        const { nom, prenom, email, motDePasse, telephone, dateNaissance, sexe, adresse } = req.body;
        
        // Créer nouvel utilisateur
        const newUser = new User({
            nom,
            prenom,
            email,
            motDePasse, // Le hashing se fait automatiquement via le middleware pre('save')
            telephone,
            dateNaissance,
            sexe,
            adresse
        });
        
        await newUser.save();
        
        res.status(201).json({
            success: true,
            message: 'Utilisateur créé avec succès',
            user: newUser.toSafeObject()
        });
    } catch (error) {
        console.error('Erreur register:', error);
        
        // Gestion des erreurs de validation MongoDB
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: 'Erreur de validation',
                errors: messages
            });
        }
        
        // Gestion des erreurs de duplication (email/téléphone unique)
        if (error.code === 11000) {
            const field = Object.keys(error.keyPattern)[0];
            return res.status(409).json({
                success: false,
                message: `Un compte avec ce ${field} existe déjà`
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la création de l\'utilisateur'
        });
    }
};

// Fonction de connexion
const login = async (req, res) => {
    try {
        const { email, motDePasse } = req.body;
        
        // Chercher l'utilisateur avec le mot de passe (select: false par défaut)
        const user = await User.findOne({ email }).select('+motDePasse');
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Email ou mot de passe incorrect'
            });
        }
        
        // Vérifier si le compte est actif
        if (user.statutCompte !== 'ACTIF') {
            return res.status(401).json({
                success: false,
                message: 'Compte suspendu ou bloqué'
            });
        }
        
        // Vérifier le mot de passe
        const validPassword = await user.comparePassword(motDePasse);
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                message: 'Email ou mot de passe incorrect'
            });
        }
        
        // Mettre à jour la dernière connexion
        user.derniereConnexion = new Date();
        await user.save();
        
        // Créer le token JWT
        const token = jwt.sign(
            { userId: user._id },
            process.env.JWT_SECRET,
            { expiresIn: '24h' }
        );
        
        res.json({
            success: true,
            message: 'Connexion réussie',
            token,
            user: user.toSafeObject()
        });
    } catch (error) {
        console.error('Erreur login:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la connexion'
        });
    }
};

// Fonction pour obtenir le profil
const getProfile = async (req, res) => {
    try {
        const user = await User.findById(req.userId);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Utilisateur non trouvé'
            });
        }
        
        res.json({
            success: true,
            user: user.toSafeObject()
        });
    } catch (error) {
        console.error('Erreur getProfile:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération du profil'
        });
    }
};

// Fonction pour obtenir les utilisateurs à proximité
const getNearbyUsers = async (req, res) => {
    try {
        // Récupère les paramètres depuis query ou body
        const longitude = req.query.longitude || req.body.longitude;
        const latitude = req.query.latitude || req.body.latitude;
        const maxDistance = req.query.maxDistance || req.body.maxDistance || 10000;
        
        console.log('Paramètres reçus:', { longitude, latitude, maxDistance });
        
        if (!longitude || !latitude) {
            return res.status(400).json({
                success: false,
                message: 'Coordonnées GPS requises (longitude, latitude)',
                received: { longitude, latitude } // Pour debug
            });
        }
        
        // Validation des coordonnées
        const lon = parseFloat(longitude);
        const lat = parseFloat(latitude);
        const dist = parseInt(maxDistance);
        
        if (isNaN(lon) || isNaN(lat) || lon < -180 || lon > 180 || lat < -90 || lat > 90) {
            return res.status(400).json({
                success: false,
                message: 'Coordonnées GPS invalides'
            });
        }
        
        const users = await User.findNearby(lon, lat, dist);
        const safeUsers = users.map(user => user.toSafeObject());
        
        res.json({
            success: true,
            count: safeUsers.length,
            users: safeUsers
        });
    } catch (error) {
        console.error('Erreur getNearbyUsers:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des utilisateurs'
        });
    }
};

// Fonction pour obtenir les statistiques d'un utilisateur
const getUserStats = async (req, res) => {
    try {
        const { id } = req.params;
        // Logique pour obtenir les statistiques
        res.json({
            success: true,
            message: 'Fonction à implémenter',
            stats: {}
        });
    } catch (error) {
        console.error('Erreur getUserStats:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la récupération des statistiques'
        });
    }
};

// Fonction pour mettre à jour le profil
const updateProfile = async (req, res) => {
    try {
        const updates = req.body;
        delete updates.motDePasse; // Empêcher la modification directe du mot de passe
        
        const user = await User.findByIdAndUpdate(
            req.userId,
            updates,
            { new: true, runValidators: true }
        ).select('-motDePasse');
        
        res.json({
            success: true,
            message: 'Profil mis à jour avec succès',
            user
        });
    } catch (error) {
        console.error('Erreur updateProfile:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la mise à jour du profil'
        });
    }
};

// Fonction pour changer le mot de passe
const changePassword = async (req, res) => {
    try {
        const { ancienMotDePasse, nouveauMotDePasse } = req.body;
        
        if (!ancienMotDePasse || !nouveauMotDePasse) {
            return res.status(400).json({
                success: false,
                message: 'Ancien et nouveau mot de passe requis'
            });
        }
        
        const user = await User.findById(req.userId).select('+motDePasse');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Utilisateur non trouvé'
            });
        }
        
        // Vérifier l'ancien mot de passe
        const validPassword = await user.comparePassword(ancienMotDePasse);
        if (!validPassword) {
            return res.status(401).json({
                success: false,
                message: 'Ancien mot de passe incorrect'
            });
        }
        
        // Le nouveau mot de passe sera automatiquement hashé par le middleware pre('save')
        user.motDePasse = nouveauMotDePasse;
        await user.save();
        
        res.json({
            success: true,
            message: 'Mot de passe changé avec succès'
        });
    } catch (error) {
        console.error('Erreur changePassword:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors du changement de mot de passe'
        });
    }
};

// Fonction pour ajouter un véhicule
const addVehicle = async (req, res) => {
    try {
        const { id } = req.params;
        const vehicleData = req.body;
        
        // Vérifier que l'utilisateur modifie son propre profil ou est admin
        if (req.userId !== id && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Non autorisé'
            });
        }
        
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Utilisateur non trouvé'
            });
        }
        
        user.vehicules.push(vehicleData);
        await user.save();
        
        res.json({
            success: true,
            message: 'Véhicule ajouté avec succès',
            vehicule: user.vehicules[user.vehicules.length - 1]
        });
    } catch (error) {
        console.error('Erreur addVehicle:', error);
        
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: 'Erreur de validation',
                errors: messages
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Erreur lors de l\'ajout du véhicule'
        });
    }
};

// Fonction pour ajouter un contact d'urgence
const addEmergencyContact = async (req, res) => {
    try {
        const { id } = req.params;
        const contactData = req.body;
        
        // Vérifier que l'utilisateur modifie son propre profil
        if (req.userId !== id) {
            return res.status(403).json({
                success: false,
                message: 'Non autorisé'
            });
        }
        
        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'Utilisateur non trouvé'
            });
        }
        
        user.contactsUrgence.push(contactData);
        await user.save();
        
        res.json({
            success: true,
            message: 'Contact d\'urgence ajouté avec succès',
            contact: user.contactsUrgence[user.contactsUrgence.length - 1]
        });
    } catch (error) {
        console.error('Erreur addEmergencyContact:', error);
        
        if (error.name === 'ValidationError') {
            const messages = Object.values(error.errors).map(err => err.message);
            return res.status(400).json({
                success: false,
                message: 'Erreur de validation',
                errors: messages
            });
        }
        
        res.status(500).json({
            success: false,
            message: 'Erreur lors de l\'ajout du contact d\'urgence'
        });
    }
};

// Fonction pour supprimer un véhicule
const removeVehicle = async (req, res) => {
    try {
        // Logique pour supprimer un véhicule
        res.json({
            success: true,
            message: 'Fonction à implémenter'
        });
    } catch (error) {
        console.error('Erreur removeVehicle:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la suppression du véhicule'
        });
    }
};

// Fonction pour supprimer le compte
const deleteAccount = async (req, res) => {
    try {
        await User.findByIdAndDelete(req.userId);
        res.json({
            success: true,
            message: 'Compte supprimé avec succès'
        });
    } catch (error) {
        console.error('Erreur deleteAccount:', error);
        res.status(500).json({
            success: false,
            message: 'Erreur lors de la suppression du compte'
        });
    }
};

// Export de toutes les fonctions
module.exports = {
    register,
    login,
    getProfile,
    getNearbyUsers,
    getUserStats,
    updateProfile,
    changePassword,
    addVehicle,
    addEmergencyContact,
    removeVehicle,
    deleteAccount
};