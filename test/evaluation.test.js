// tests/evaluation.test.js
const request = require('supertest');
const mongoose = require('mongoose');
const app = require('../app');
const Evaluation = require('../models/Evaluation');
const Trajet = require('../models/Trajet');
const Utilisateur = require('../models/Utilisateur');

// Augmenter le timeout des hooks si nécessaire (network calls pour le calcul de distance)
jest.setTimeout(20000);

// Configuration de la base de données de test
beforeAll(async () => {
  const MONGODB_URI = process.env.MONGODB_TEST_URI || 'mongodb://localhost:27017/covoiturage_test';
  await mongoose.connect(MONGODB_URI);
});

afterAll(async () => {
  await mongoose.connection.close();
});

beforeEach(async () => {
  await Evaluation.deleteMany({});
  await Trajet.deleteMany({});
  await Utilisateur.deleteMany({});
});

describe('Evaluation API', () => {
  let conducteur, passager, trajet, token;

  beforeEach(async () => {
    // Créer des utilisateurs de test
    conducteur = new Utilisateur({
      nom: 'Kone',
      prenom: 'Amadou',
      email: 'amadou@test.ci',
      telephone: '+22507000001',
      motDePasse: 'password123',
      statutCompte: 'ACTIF',
      estVerifie: true
    });
    await conducteur.save();

    passager = new Utilisateur({
      nom: 'Diallo',
      prenom: 'Fatoumata',
      email: 'fatoumata@test.ci',
      telephone: '+22507000002',
      motDePasse: 'password123',
      statutCompte: 'ACTIF',
      estVerifie: true
    });
    await passager.save();

    // Token d'authentification pour le passager (JWT valide)
    token = 'Bearer ' + passager.getSignedJwtToken();

    // Créer un trajet terminé (conforme au schéma actuel)
    trajet = new Trajet({
      conducteurId: conducteur._id,
      pointDepart: {
        nom: 'Plateau - Départ',
        adresse: 'Plateau, Abidjan',
        commune: 'Abidjan',
        quartier: 'Plateau',
        coordonnees: { type: 'Point', coordinates: [-4.0435, 5.3364] }
      },
      pointArrivee: {
        nom: 'Yamoussoukro - Centre',
        adresse: 'Centre, Yamoussoukro',
        commune: 'Yamoussoukro',
        quartier: 'Centre',
        coordonnees: { type: 'Point', coordinates: [-5.2767, 6.8203] }
      },
      dateDepart: new Date(),
      heureDepart: '08:00',
      nombrePlacesTotal: 4,
      nombrePlacesDisponibles: 3,
      prixParPassager: 5000,
      distance: 250,
      vehiculeUtilise: {
        marque: 'Toyota',
        modele: 'Corolla',
        couleur: 'Blanc',
        immatriculation: 'TEST-123',
        nombrePlaces: 4
      },
      statutTrajet: 'TERMINE',
      passagers: [{
        utilisateurId: passager._id,
        statut: 'CONFIRME',
        dateReservation: new Date()
      }]
    });
    await trajet.save();

    // Token d'authentification pour le passager (JWT valide)
    token = 'Bearer ' + passager.getSignedJwtToken();
  });

  describe('POST /api/evaluations', () => {
    it('devrait créer une évaluation valide', async () => {
      const evaluationData = {
        trajetId: trajet._id,
        notes: {
          ponctualite: 4,
          proprete: 5,
          qualiteConduite: 4,
          respect: 5,
          communication: 4
        },
        commentaire: 'Excellent conducteur, très sympathique!',
        aspectsPositifs: ['PONCTUEL', 'SYMPATHIQUE', 'VEHICULE_PROPRE']
      };

      const response = await request(app)
        .post('/api/evaluations')
        .set('Authorization', token)
        .send(evaluationData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.notes.noteGlobale).toBe(4.4);
      expect(response.body.data.typeEvaluateur).toBe('PASSAGER');
    });

    it('devrait rejeter une évaluation avec notes invalides', async () => {
      const evaluationData = {
        trajetId: trajet._id,
        notes: {
          ponctualite: 6, // Note invalide
          proprete: 5,
          qualiteConduite: 4,
          respect: 5,
          communication: 4
        }
      };

      await request(app)
        .post('/api/evaluations')
        .set('Authorization', token)
        .send(evaluationData)
        .expect(400);
    });

    it('devrait rejeter une évaluation pour un trajet non terminé', async () => {
      trajet.statut = 'EN_COURS';
      await trajet.save();

      const evaluationData = {
        trajetId: trajet._id,
        notes: {
          ponctualite: 4,
          proprete: 5,
          qualiteConduite: 4,
          respect: 5,
          communication: 4
        }
      };

      const response = await request(app)
        .post('/api/evaluations')
        .set('Authorization', token)
        .send(evaluationData)
        .expect(400);

      expect(response.body.message).toContain('terminé');
    });

    it('devrait créer un signalement valide', async () => {
      const evaluationData = {
        trajetId: trajet._id,
        notes: {
          ponctualite: 1,
          proprete: 2,
          qualiteConduite: 1,
          respect: 1,
          communication: 2
        },
        estSignalement: true,
        motifSignalement: 'CONDUITE_DANGEREUSE',
        gravite: 'GRAVE',
        commentaire: 'Conduite très dangereuse, excès de vitesse constant'
      };

      const response = await request(app)
        .post('/api/evaluations')
        .set('Authorization', token)
        .send(evaluationData)
        .expect(201);

      expect(response.body.data.estSignalement).toBe(true);
      expect(response.body.data.gravite).toBe('GRAVE');
    });
  });

  describe('GET /api/evaluations/user/:userId', () => {
    beforeEach(async () => {
      // Créer quelques évaluations de test
      const evaluation1 = new Evaluation({
        trajetId: trajet._id,
        evaluateurId: passager._id,
        evalueId: conducteur._id,
        typeEvaluateur: 'PASSAGER',
        notes: {
          ponctualite: 4,
          proprete: 5,
          qualiteConduite: 4,
          respect: 5,
          communication: 4,
          noteGlobale: 4.4
        }
      });

      const evaluation2 = new Evaluation({
        trajetId: trajet._id,
        evaluateurId: conducteur._id,
        evalueId: passager._id,
        typeEvaluateur: 'CONDUCTEUR',
        notes: {
          ponctualite: 5,
          proprete: 4,
          qualiteConduite: 5,
          respect: 5,
          communication: 5,
          noteGlobale: 4.8
        }
      });

      await evaluation1.save();
      await evaluation2.save();
    });

    it('devrait retourner les évaluations d\'un utilisateur', async () => {
      const response = await request(app)
        .get(`/api/evaluations/user/${conducteur._id}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.evaluations).toHaveLength(1);
      expect(response.body.data.statistiques.moyenneGlobale).toBe(4.4);
    });

    it('devrait filtrer par type d\'évaluateur', async () => {
      const response = await request(app)
        .get(`/api/evaluations/user/${conducteur._id}`)
        .query({ typeEvaluateur: 'PASSAGER' })
        .expect(200);

      expect(response.body.data.evaluations).toHaveLength(1);
      expect(response.body.data.evaluations[0].typeEvaluateur).toBe('PASSAGER');
    });

    it('devrait supporter la pagination', async () => {
      const response = await request(app)
        .get(`/api/evaluations/user/${conducteur._id}`)
        .query({ page: 1, limit: 1 })
        .expect(200);

      expect(response.body.data.pagination.page).toBe(1);
      expect(response.body.data.pagination.limit).toBe(1);
    });
  });

  describe('PUT /api/evaluations/:id/reponse', () => {
    let evaluation;

    beforeEach(async () => {
      evaluation = new Evaluation({
        trajetId: trajet._id,
        evaluateurId: passager._id,
        evalueId: conducteur._id,
        typeEvaluateur: 'PASSAGER',
        notes: {
          ponctualite: 4,
          proprete: 5,
          qualiteConduite: 4,
          respect: 5,
          communication: 4,
          noteGlobale: 4.4
        },
        commentaire: 'Très bon conducteur'
      });
      await evaluation.save();
    });

    it('devrait permettre à l\'évalué de répondre', async () => {
      const tokenConducteur = 'Bearer ' + conducteur.getSignedJwtToken();
      const reponse = 'Merci pour votre évaluation positive!';

      const response = await request(app)
        .put(`/api/evaluations/${evaluation._id}/reponse`)
        .set('Authorization', tokenConducteur)
        .send({ reponse })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.reponseEvalue).toBe(reponse);
      expect(response.body.data.dateReponse).toBeDefined();
    });

    it('devrait rejeter une réponse de l\'évaluateur', async () => {
      const reponse = 'Je ne peux pas répondre à ma propre évaluation';

      await request(app)
        .put(`/api/evaluations/${evaluation._id}/reponse`)
        .set('Authorization', token)
        .send({ reponse })
        .expect(400);
    });
  });

  describe('Calcul automatique de la note globale', () => {
    it('devrait calculer correctement la moyenne', async () => {
      const evaluation = new Evaluation({
        trajetId: trajet._id,
        evaluateurId: passager._id,
        evalueId: conducteur._id,
        typeEvaluateur: 'PASSAGER',
        notes: {
          ponctualite: 3,
          proprete: 4,
          qualiteConduite: 5,
          respect: 4,
          communication: 4
        }
      });

      await evaluation.save();

      // Note globale devrait être (3+4+5+4+4)/5 = 4.0
      expect(evaluation.notes.noteGlobale).toBe(4.0);
    });
  });

  describe('Détection d\'évaluations suspectes', () => {
    beforeEach(async () => {
      // Créer plusieurs évaluations avec notes basses
      for (let i = 0; i < 5; i++) {
        const evaluation = new Evaluation({
          trajetId: trajet._id,
          evaluateurId: new mongoose.Types.ObjectId(),
          evalueId: conducteur._id,
          typeEvaluateur: 'PASSAGER',
          notes: {
            ponctualite: 2,
            proprete: 1,
            qualiteConduite: 2,
            respect: 1,
            communication: 2,
            noteGlobale: 1.6
          },
          dateEvaluation: new Date(Date.now() - i * 24 * 60 * 60 * 1000)
        });
        await evaluation.save();
      }
    });

    it('devrait détecter un utilisateur suspect', async () => {
      const detection = await Evaluation.detecterEvaluationsSuspectes(conducteur._id);
      
      expect(detection.suspect).toBe(true);
      expect(detection.moyenneRecente).toBeLessThan(2.5);
      expect(detection.recommandations).toContain('Formation conduite');
    });
  });
});

// Tests d'intégration
describe('Integration Tests', () => {
  it('devrait mettre à jour le score de confiance après évaluation', async () => {
    // Ce test nécessiterait une configuration plus complète
    // avec tous les modèles et services
  });

  it('devrait envoyer une notification après évaluation', async () => {
    // Test d'intégration avec le service de notifications
  });
});