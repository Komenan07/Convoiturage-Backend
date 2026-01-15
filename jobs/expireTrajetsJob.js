// jobs/expireTrajetsJob.js
const cron = require('node-cron');
const Trajet = require('../models/Trajet');

class ExpireTrajetsJob {
  static start() {
    // S'exécute toutes les 15 minutes
    cron.schedule('*/15 * * * *', async () => {
      try {
        console.log('🔄 [JOB] Vérification des trajets expirés...');
        
        // Marquer les trajets ponctuels/événementiels expirés
        const resultTrajets = await Trajet.marquerTrajetsExpires();
        
        // Marquer les récurrences expirées
        const resultRecurrences = await Trajet.marquerRecurrencesExpirees();
        
        const total = resultTrajets.modifiedCount + resultRecurrences.modifiedCount;
        
        if (total > 0) {
          console.log(`✅ [JOB] ${total} trajet(s) marqué(s) comme expiré(s)`);
          console.log(`   - Trajets: ${resultTrajets.modifiedCount}`);
          console.log(`   - Récurrences: ${resultRecurrences.modifiedCount}`);
        }
        
      } catch (error) {
        console.error('❌ [JOB] Erreur lors de l\'expiration des trajets:', error);
      }
    });
    
    console.log('✅ Job d\'expiration des trajets démarré (toutes les 15 minutes)');
  }
  
  // Méthode pour exécution manuelle
  static async executer() {
    try {
      console.log('🔄 Exécution manuelle du job d\'expiration...');
      
      const resultTrajets = await Trajet.marquerTrajetsExpires();
      const resultRecurrences = await Trajet.marquerRecurrencesExpirees();
      
      return {
        success: true,
        trajetsExpires: resultTrajets.modifiedCount,
        recurrencesExpirees: resultRecurrences.modifiedCount,
        total: resultTrajets.modifiedCount + resultRecurrences.modifiedCount
      };
    } catch (error) {
      console.error('❌ Erreur exécution manuelle:', error);
      throw error;
    }
  }
}

module.exports = ExpireTrajetsJob;