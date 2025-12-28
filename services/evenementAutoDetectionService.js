// services/evenementAutoDetectionService.js
const EvenementService = require('./evenementService');

class EvenementAutoDetectionService {
  
  constructor() {
    this.ABIDJAN_COORDS = {
      latitude: 5.3599517,
      longitude: -3.9615917,
      rayon: 50
    };
  }

  /**
   * Méthode principale : Détecter et importer les événements
   */
  async detecterEtImporterEvenements() {
    console.log('🔍 Début de la détection automatique d\'événements...');
    
    const resultats = {
      total: 0,
      nouveaux: 0,
      miseAJour: 0,
      erreurs: 0,
      sources: {},
      details: []
    };

    try {
      // Génération d'événements de test (pour développement)
      if (process.env.NODE_ENV === 'development' || !process.env.NODE_ENV) {
        try {
          const testEvents = this.genererEvenementsTest();
          const importTest = await this.sauvegarderEvenements(testEvents, 'TEST');
          
          resultats.sources.TEST = importTest;
          resultats.total += importTest.total;
          resultats.nouveaux += importTest.nouveaux;
          resultats.miseAJour += importTest.miseAJour;
          resultats.erreurs += importTest.erreurs;
          
          console.log(`✅ Test: ${importTest.nouveaux} événements générés, ${importTest.miseAJour} mis à jour`);
        } catch (error) {
          console.error('❌ Erreur génération test:', error.message);
          resultats.details.push({ source: 'TEST', erreur: error.message });
        }
      }

      console.log('✅ Détection automatique terminée:', resultats);
      return resultats;

    } catch (error) {
      console.error('💥 Erreur globale détection automatique:', error);
      throw error;
    }
  }

  /**
   * Générer des événements de test (pour développement)
   */
  genererEvenementsTest() {
    const maintenant = new Date();
    const dans7jours = new Date(maintenant.getTime() + 7 * 24 * 60 * 60 * 1000);
    const dans14jours = new Date(maintenant.getTime() + 14 * 24 * 60 * 60 * 1000);
    const dans30jours = new Date(maintenant.getTime() + 30 * 24 * 60 * 60 * 1000);

    return [
      {
        nom: 'Concert de Zouglou - Magic System',
        description: 'Concert exceptionnel du groupe Magic System à Abidjan',
        typeEvenement: 'CONCERT',
        dateDebut: dans7jours,
        dateFin: new Date(dans7jours.getTime() + 4 * 60 * 60 * 1000),
        lieu: {
          nom: 'Palais de la Culture de Treichville',
          adresse: 'Boulevard de la République',
          ville: 'Abidjan',
          commune: 'TREICHVILLE',
          coordonnees: {
            type: 'Point',
            coordinates: [-4.0082, 5.3028]
          }
        },
        capaciteEstimee: 3000,
        sourceDetection: 'AUTOMATIQUE',
        source: 'TEST',
        identifiantExterne: `test_concert_${Date.now()}_1`,
        tags: ['concert', 'zouglou', 'magic-system', 'musique']
      },
      {
        nom: 'Match ASEC Mimosas vs TP Mazembe',
        description: 'Quart de finale Ligue des Champions CAF',
        typeEvenement: 'SPORT',
        dateDebut: dans14jours,
        dateFin: new Date(dans14jours.getTime() + 2 * 60 * 60 * 1000),
        lieu: {
          nom: 'Stade Félix Houphouët-Boigny',
          adresse: 'Boulevard Valéry Giscard d\'Estaing',
          ville: 'Abidjan',
          commune: 'PLATEAU',
          coordonnees: {
            type: 'Point',
            coordinates: [-4.0266, 5.3264]
          }
        },
        capaciteEstimee: 35000,
        sourceDetection: 'AUTOMATIQUE',
        source: 'TEST',
        identifiantExterne: `test_match_${Date.now()}_2`,
        tags: ['football', 'asec', 'champions-league']
      },
      {
        nom: 'Festival du Rire d\'Abidjan',
        description: 'Festival international d\'humour avec des artistes de toute l\'Afrique',
        typeEvenement: 'FESTIVAL',
        dateDebut: dans30jours,
        dateFin: new Date(dans30jours.getTime() + 3 * 24 * 60 * 60 * 1000),
        lieu: {
          nom: 'Sofitel Hôtel Ivoire',
          adresse: 'Boulevard Hassan II',
          ville: 'Abidjan',
          commune: 'COCODY',
          quartier: 'Riviera',
          coordonnees: {
            type: 'Point',
            coordinates: [-3.9898, 5.3364]
          }
        },
        capaciteEstimee: 1000,
        sourceDetection: 'AUTOMATIQUE',
        source: 'TEST',
        identifiantExterne: `test_festival_${Date.now()}_3`,
        tags: ['festival', 'humour', 'rire', 'comédie']
      }
    ];
  }

  /**
   * Sauvegarder les événements détectés
   */
  async sauvegarderEvenements(evenements, source) {
    const resultats = {
      total: evenements.length,
      nouveaux: 0,
      miseAJour: 0,
      erreurs: 0,
      details: []
    };

    for (const eventData of evenements) {
      try {
        const resultat = await EvenementService.creerOuMettreAJour(eventData);
        
        if (resultat.isNew) {
          resultats.nouveaux++;
        } else {
          resultats.miseAJour++;
        }
        
        resultats.details.push({
          nom: eventData.nom,
          action: resultat.isNew ? 'créé' : 'mis à jour',
          id: resultat.evenement._id
        });
      } catch (error) {
        resultats.erreurs++;
        resultats.details.push({
          nom: eventData.nom,
          erreur: error.message
        });
      }
    }

    return resultats;
  }
}

module.exports = new EvenementAutoDetectionService();