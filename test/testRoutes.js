// routes/testRoutes.js - Route temporaire pour tester l'email

const express = require('express');
const router = express.Router();
const { emailService } = require('../services/emailService');

// Route de test email
router.post('/test-email', async (req, res) => {
  try {
    console.log('🧪 === DÉBUT TEST EMAIL ===');
    
    // 1. Vérifier la configuration
    console.log('📋 Configuration:');
    console.log('- EMAIL_USER:', process.env.EMAIL_USER);
    console.log('- EMAIL_PASS exists:', !!process.env.EMAIL_PASS);
    console.log('- EMAIL_HOST:', process.env.EMAIL_HOST);
    console.log('- EMAIL_PORT:', process.env.EMAIL_PORT);
    
    // 2. Vérifier le service
    const stats = emailService.getStats();
    console.log('📊 Stats du service:', stats);
    
    // 3. Tester la connexion
    console.log('🔌 Test de connexion...');
    const connectionTest = await emailService.testConnection();
    console.log('🔌 Résultat connexion:', connectionTest);
    
    if (!connectionTest.success) {
      return res.status(500).json({
        success: false,
        message: 'Échec du test de connexion',
        details: connectionTest
      });
    }
    
    // 4. Envoyer un email de test
    const testEmail = req.body.email || process.env.EMAIL_USER;
    console.log('📧 Envoi email de test à:', testEmail);
    
    const result = await emailService.sendWelcomeEmail(testEmail, 'Utilisateur Test');
    console.log('📧 Résultat envoi:', result);
    
    res.json({
      success: true,
      message: 'Test email terminé',
      connectionTest,
      emailResult: result,
      stats
    });
    
  } catch (error) {
    console.error('❌ Erreur test email:', error);
    res.status(500).json({
      success: false,
      error: error.message,
      stack: error.stack
    });
  }
});

// Route pour vérifier les variables d'environnement
router.get('/check-env', (req, res) => {
  res.json({
    EMAIL_USER: process.env.EMAIL_USER,
    EMAIL_HOST: process.env.EMAIL_HOST,
    EMAIL_PORT: process.env.EMAIL_PORT,
    EMAIL_FROM: process.env.EMAIL_FROM,
    FRONTEND_URL: process.env.FRONTEND_URL,
    NODE_ENV: process.env.NODE_ENV,
    hasEmailPass: !!process.env.EMAIL_PASS,
    emailPassLength: process.env.EMAIL_PASS?.length || 0
  });
});

module.exports = router;

// Dans app.js, ajoutez temporairement :
// app.use('/api/test', require('./routes/testRoutes'));