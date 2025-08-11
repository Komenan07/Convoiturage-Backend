const mongoose = require('mongoose');
const Trajet = require('../models/Trajet');

/**
 * Service de gestion des trajets récurrents
 */
class RecurrenceService {
  
  /**
   * Génère automatiquement les instances de trajets récurrents
   * jusqu'à la date de fin de récurrence
   * @param {ObjectId} trajetRecurrentId - ID du trajet récurrent parent
   * @param {Date} dateDebut - Date de début pour la génération
   * @param {Date} dateFin - Date de fin pour la génération (optionnel, utilise dateFinRecurrence si non fournie)
   * @returns {Promise<Array>} - Liste des trajets générés
   */
  static async genererInstancesRecurrentes(trajetRecurrentId, dateDebut = null, dateFin = null) {
    try {
      console.log(`🔄 Génération des instances récurrentes pour le trajet ${trajetRecurrentId}`);
      
      // Récupérer le trajet récurrent parent
      const trajetRecurrent = await Trajet.findById(trajetRecurrentId);
      if (!trajetRecurrent) {
        throw new Error('Trajet récurrent non trouvé');
      }
      
      if (trajetRecurrent.typeTrajet !== 'RECURRENT') {
        throw new Error('Le trajet spécifié n\'est pas un trajet récurrent');
      }
      
      if (!trajetRecurrent.recurrence || !trajetRecurrent.recurrence.jours || trajetRecurrent.recurrence.jours.length === 0) {
        throw new Error('Configuration de récurrence invalide');
      }
      
      // Définir les dates de début et fin
      const debut = dateDebut || new Date();
      const fin = dateFin || trajetRecurrent.recurrence.dateFinRecurrence;
      
      if (!fin) {
        throw new Error('Date de fin de récurrence non définie');
      }
      
      if (debut >= fin) {
        throw new Error('La date de début doit être antérieure à la date de fin');
      }
      
      console.log(`📅 Période de génération: ${debut.toISOString()} → ${fin.toISOString()}`);
      
      // Générer les dates des instances
      const datesInstances = this.genererDatesRecurrence(
        trajetRecurrent.recurrence.jours,
        debut,
        fin,
        trajetRecurrent.heureDepart
      );
      
      console.log(`📋 ${datesInstances.length} instances à générer`);
      
      // Vérifier les instances existantes pour éviter les doublons
      const instancesExistantes = await this.verifierInstancesExistantes(trajetRecurrentId, datesInstances);
      const datesNouvelles = datesInstances.filter(date => !instancesExistantes.includes(date));
      
      console.log(`✅ ${datesNouvelles.length} nouvelles instances à créer`);
      
      // Créer les nouvelles instances
      const instancesCreees = await this.creerInstances(trajetRecurrent, datesNouvelles);
      
      console.log(`🎯 ${instancesCreees.length} instances créées avec succès`);
      
      return {
        success: true,
        trajetParent: trajetRecurrentId,
        instancesCreees: instancesCreees.length,
        instancesExistantes: instancesExistantes.length,
        total: datesInstances.length,
        periode: { debut, fin },
        details: instancesCreees
      };
      
    } catch (error) {
      console.error('❌ Erreur lors de la génération des instances récurrentes:', error.message);
      throw error;
    }
  }
  
  /**
   * Génère les dates des instances récurrentes
   * @param {Array} jours - Jours de la semaine (LUNDI, MARDI, etc.)
   * @param {Date} dateDebut - Date de début
   * @param {Date} dateFin - Date de fin
   * @param {String} heureDepart - Heure de départ (HH:MM)
   * @returns {Array<Date>} - Dates des instances
   */
  static genererDatesRecurrence(jours, dateDebut, dateFin, heureDepart) {
    const dates = [];
    const joursSemaine = ['DIMANCHE', 'LUNDI', 'MARDI', 'MERCREDI', 'JEUDI', 'VENDREDI', 'SAMEDI'];
    
    // Convertir les jours en indices (0-6)
    const indicesJours = jours.map(jour => joursSemaine.indexOf(jour));
    
    // Date courante pour l'itération
    let dateCourante = new Date(dateDebut);
    
    // Ajuster à l'heure de départ
    const [heures, minutes] = heureDepart.split(':').map(Number);
    dateCourante.setHours(heures, minutes, 0, 0);
    
    // Générer les dates jusqu'à la fin
    while (dateCourante <= dateFin) {
      const jourSemaine = dateCourante.getDay(); // 0 = Dimanche, 1 = Lundi, etc.
      
      // Vérifier si c'est un jour de récurrence
      if (indicesJours.includes(jourSemaine)) {
        dates.push(new Date(dateCourante));
      }
      
      // Passer au jour suivant
      dateCourante.setDate(dateCourante.getDate() + 1);
    }
    
    return dates;
  }
  
  /**
   * Vérifie les instances existantes pour éviter les doublons
   * @param {ObjectId} trajetRecurrentId - ID du trajet récurrent parent
   * @param {Array<Date>} dates - Dates à vérifier
   * @returns {Promise<Array<Date>>} - Dates des instances existantes
   */
  static async verifierInstancesExistantes(trajetRecurrentId, dates) {
    try {
      const datesExistantes = [];
      
      for (const date of dates) {
        const instanceExistante = await Trajet.findOne({
          trajetRecurrentId: trajetRecurrentId,
          dateDepart: {
            $gte: new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0),
            $lt: new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1, 0, 0, 0)
          }
        });
        
        if (instanceExistante) {
          datesExistantes.push(date);
        }
      }
      
      return datesExistantes;
    } catch (error) {
      console.error('Erreur lors de la vérification des instances existantes:', error.message);
      return [];
    }
  }
  
  /**
   * Crée les instances de trajets récurrents
   * @param {Object} trajetRecurrent - Trajet récurrent parent
   * @param {Array<Date>} dates - Dates des instances à créer
   * @returns {Promise<Array>} - Instances créées
   */
  static async creerInstances(trajetRecurrent, dates) {
    const instances = [];
    
    for (const date of dates) {
      try {
        // Créer une nouvelle instance
        const instance = new Trajet({
          // Copier les propriétés du trajet parent
          conducteurId: trajetRecurrent.conducteurId,
          pointDepart: trajetRecurrent.pointDepart,
          pointArrivee: trajetRecurrent.pointArrivee,
          arretsIntermediaires: trajetRecurrent.arretsIntermediaires,
          dateDepart: date,
          heureDepart: trajetRecurrent.heureDepart,
          heureArriveePrevue: trajetRecurrent.heureArriveePrevue,
          dureeEstimee: trajetRecurrent.dureeEstimee,
          distance: trajetRecurrent.distance,
          prixParPassager: trajetRecurrent.prixParPassager,
          nombrePlacesDisponibles: trajetRecurrent.nombrePlacesDisponibles,
          nombrePlacesTotal: trajetRecurrent.nombrePlacesTotal,
          typeTrajet: 'PONCTUEL', // Les instances sont ponctuelles
          vehiculeUtilise: trajetRecurrent.vehiculeUtilise,
          preferences: trajetRecurrent.preferences,
          statutTrajet: 'PROGRAMME',
          validationAutomatique: trajetRecurrent.validationAutomatique,
          commentaireConducteur: trajetRecurrent.commentaireConducteur,
          evenementAssocie: trajetRecurrent.evenementAssocie,
          
          // Référence au trajet récurrent parent
          trajetRecurrentId: trajetRecurrent._id,
          estInstanceRecurrente: true
        });
        
        // Sauvegarder l'instance
        await instance.save();
        instances.push(instance);
        
        console.log(`✅ Instance créée pour le ${date.toLocaleDateString('fr-FR')} à ${trajetRecurrent.heureDepart}`);
        
      } catch (error) {
        console.error(`❌ Erreur lors de la création de l'instance pour ${date}:`, error.message);
      }
    }
    
    return instances;
  }
  
  /**
   * Met à jour la récurrence d'un trajet existant
   * @param {ObjectId} trajetId - ID du trajet
   * @param {Object} nouvelleRecurrence - Nouvelle configuration de récurrence
   * @returns {Promise<Object>} - Résultat de la mise à jour
   */
  static async mettreAJourRecurrence(trajetId, nouvelleRecurrence) {
    try {
      const trajet = await Trajet.findById(trajetId);
      if (!trajet) {
        throw new Error('Trajet non trouvé');
      }
      
      if (trajet.typeTrajet !== 'RECURRENT') {
        throw new Error('Le trajet n\'est pas récurrent');
      }
      
      // Mettre à jour la récurrence
      trajet.recurrence = nouvelleRecurrence;
      await trajet.save();
      
      // Régénérer les instances si nécessaire
      if (nouvelleRecurrence.dateFinRecurrence) {
        const resultat = await this.genererInstancesRecurrentes(
          trajetId,
          new Date(),
          nouvelleRecurrence.dateFinRecurrence
        );
        
        return {
          success: true,
          trajet: trajet,
          instances: resultat
        };
      }
      
      return {
        success: true,
        trajet: trajet
      };
      
    } catch (error) {
      console.error('Erreur lors de la mise à jour de la récurrence:', error.message);
      throw error;
    }
  }
  
  /**
   * Supprime la récurrence d'un trajet et ses instances futures
   * @param {ObjectId} trajetId - ID du trajet
   * @param {Date} dateSuppression - Date à partir de laquelle supprimer les instances
   * @returns {Promise<Object>} - Résultat de la suppression
   */
  static async supprimerRecurrence(trajetId, dateSuppression = new Date()) {
    try {
      const trajet = await Trajet.findById(trajetId);
      if (!trajet) {
        throw new Error('Trajet non trouvé');
      }
      
      // Supprimer les instances futures
      const instancesSupprimees = await Trajet.deleteMany({
        trajetRecurrentId: trajetId,
        dateDepart: { $gte: dateSuppression },
        estInstanceRecurrente: true
      });
      
      // Marquer le trajet comme ponctuel
      trajet.typeTrajet = 'PONCTUEL';
      trajet.recurrence = undefined;
      await trajet.save();
      
      return {
        success: true,
        instancesSupprimees: instancesSupprimees.deletedCount,
        trajet: trajet
      };
      
    } catch (error) {
      console.error('Erreur lors de la suppression de la récurrence:', error.message);
      throw error;
    }
  }
  
  /**
   * Nettoie les anciennes instances de trajets récurrents
   * @param {Date} dateLimite - Date limite pour la suppression
   * @returns {Promise<Object>} - Résultat du nettoyage
   */
  static async nettoyerInstancesAnciennes(dateLimite = new Date()) {
    try {
      console.log(`🧹 Nettoyage des instances antérieures à ${dateLimite.toISOString()}`);
      
      const resultat = await Trajet.deleteMany({
        estInstanceRecurrente: true,
        dateDepart: { $lt: dateLimite },
        statutTrajet: { $in: ['TERMINE', 'ANNULE'] }
      });
      
      console.log(`✅ ${resultat.deletedCount} instances anciennes supprimées`);
      
      return {
        success: true,
        instancesSupprimees: resultat.deletedCount,
        dateLimite: dateLimite
      };
      
    } catch (error) {
      console.error('Erreur lors du nettoyage des instances:', error.message);
      throw error;
    }
  }
  
  /**
   * Obtient les statistiques des trajets récurrents
   * @param {ObjectId} conducteurId - ID du conducteur (optionnel)
   * @returns {Promise<Object>} - Statistiques des récurrences
   */
  static async obtenirStatistiquesRecurrence(conducteurId = null) {
    try {
      const match = { typeTrajet: 'RECURRENT' };
      if (conducteurId) {
        match.conducteurId = conducteurId;
      }
      
      const stats = await Trajet.aggregate([
        { $match: match },
        {
          $group: {
            _id: null,
            totalTrajetsRecurrents: { $sum: 1 },
            totalInstances: { $sum: 1 },
            joursPopulaires: { $push: '$recurrence.jours' },
            moyennePrix: { $avg: '$prixParPassager' }
          }
        }
      ]);
      
      // Compter les instances
      const instancesCount = await Trajet.countDocuments({
        estInstanceRecurrente: true,
        ...(conducteurId && { conducteurId })
      });
      
      return {
        success: true,
        trajetsRecurrents: stats[0]?.totalTrajetsRecurrents || 0,
        totalInstances: instancesCount,
        stats: stats[0] || {}
      };
      
    } catch (error) {
      console.error('Erreur lors de l\'obtention des statistiques:', error.message);
      throw error;
    }
  }
}

module.exports = RecurrenceService;
