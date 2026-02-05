// ===== 12. SUPPRIMER TRAJET RÉCURRENT =====
// DELETE http://localhost:5000/api/trajets/TRAJET_ID
// Headers: Authorization: Bearer YOUR_JWT_TOKEN

// ===== 13. OBTENIR STATISTIQUES CONDUCTEUR =====
// GET http://localhost:5000/api/trajets/stats/conducteur/CONDUCTEUR_ID

// ===== 14. OBTENIR COMMUNES POPULAIRES =====
// GET http://localhost:5000/api/trajets/proximite/communes

// ===== 15. HISTORIQUE UTILISATEUR =====
// GET http://localhost:5000/api/trajets/mes-trajets/historique?type=tous&page=1&limit=10
// Headers: Authorization: Bearer YOUR_JWT_TOKEN

// ==================== SCRIPT DE TEST AUTOMATISÉ ====================

// tests/trajet.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../server');
const Utilisateur = require('../models/Utilisateur');

describe('API Trajets', () => {
  let authToken;
  let trajetId;
  let userId;

  beforeAll(async () => {
    // Connexion à une base de test
    await mongoose.connect('mongodb://localhost:27017/covoiturage_test');
    
    // Créer un utilisateur de test directement dans la DB puis se connecter pour obtenir le token
    await Utilisateur.deleteMany({});
    const newUser = new Utilisateur({
      nom: 'Test',
      prenom: 'User',
      email: 'test@example.com',
      telephone: '+2250123456789',
      motDePasse: 'password123',
      statutCompte: 'ACTIF',
      estVerifie: true
    });
    await newUser.save();

    // Générer un token directement (compte marqué ACTIF)
    authToken = newUser.getSignedJwtToken();
    userId = newUser._id;
  });

  afterAll(async () => {
    // Nettoyer la base de test
    await mongoose.connection.db.dropDatabase();
    await mongoose.connection.close();
  });

  describe('POST /api/trajets/ponctuel', () => {
    it('devrait créer un trajet ponctuel', async () => {
      const trajetData = {
        pointDepart: {
          nom: "Test Départ",
          adresse: "123 Rue Test",
          commune: "Test Commune",
          quartier: "Test Quartier",
          coordonnees: {
            type: "Point",
            coordinates: [-4.0319, 5.2893]
          }
        },
        pointArrivee: {
          nom: "Test Arrivée", 
          adresse: "456 Avenue Test",
          commune: "Test Commune 2",
          quartier: "Test Quartier 2",
          coordonnees: {
            type: "Point",
            coordinates: [-3.9719, 5.3472]
          }
        },
        dateDepart: new Date(Date.now() + 24 * 60 * 60 * 1000), // Demain
        heureDepart: "08:00",
        prixParPassager: 2000,
        nombrePlacesTotal: 4,
        nombrePlacesDisponibles: 4,
        vehiculeUtilise: {
          marque: "Toyota",
          modele: "Corolla", 
          couleur: "Blanc",
          immatriculation: "TEST-123",
          nombrePlaces: 4
        }
      };

      const response = await request(app)
        .post('/api/trajets/ponctuel')
        .set('Authorization', `Bearer ${authToken}`)
        .send(trajetData);

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('_id');
      
      trajetId = response.body.data._id;
    });
  });

  describe('GET /api/trajets/rechercher', () => {
    it('devrait rechercher des trajets disponibles', async () => {
      const response = await request(app)
        .get('/api/trajets/rechercher')
        .query({
          longitude: -4.0319,
          latitude: 5.2893,
          rayonKm: 10
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(Array.isArray(response.body.data)).toBe(true);
    });
  });

  describe('PATCH /api/trajets/:id/places', () => {
    it('devrait modifier le nombre de places', async () => {
      const response = await request(app)
        .patch(`/api/trajets/${trajetId}/places`)
        .set('Authorization', `Bearer ${authToken}`)
        .send({ nombrePlacesDisponibles: 2 });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.nombrePlacesDisponibles).toBe(2);
    });
  });
});

// ==================== COMMANDES POUR TESTER ====================

// 1. Installer les dépendances
// npm install

// 2. Démarrer MongoDB (si local)
// mongod

// 3. Démarrer le serveur en mode développement
// npm run dev

// 4. Tester avec curl (exemple)
// curl -X GET "http://localhost:5000/api/trajets/rechercher?longitude=-4.0319&latitude=5.2893&rayonKm=10"

// 5. Lancer les tests automatisés
// npm test