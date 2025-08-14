// test/simple-nodemailer-test.js
console.log('🧪 Test simple de Nodemailer...\n');

// Vérifier l'installation de nodemailer
try {
  const nodemailer = require('nodemailer');
  console.log('✅ Nodemailer importé avec succès');
  console.log('📦 Version:', nodemailer.VERSION || 'Version inconnue');
  
  // Vérifier les méthodes disponibles
  console.log('🔧 Méthodes disponibles:');
  console.log('- createTransport:', typeof nodemailer.createTransport);
  console.log('- createTransporter:', typeof nodemailer.createTransporter);
  
  // Configuration email
  const emailConfig = {
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    auth: {
      user: 'komenanjean07@gmail.com',
      pass: 'pdwy pava zbyi cwnv'
    }
  };
  
  console.log('\n🔧 Création du transporteur...');
  
  // Utiliser la bonne méthode
  const transporter = nodemailer.createTransport(emailConfig);
  console.log('✅ Transporteur créé avec succès');
  
  // Test de connexion
  console.log('🔗 Test de connexion SMTP...');
  
  transporter.verify()
    .then(() => {
      console.log('✅ Connexion SMTP réussie !');
      
      // Test d'envoi d'email
      console.log('📤 Envoi d\'un email de test...');
      
      const mailOptions = {
        from: '"CovoiCI Test" <komenanjean07@gmail.com>',
        to: 'komenanjean07@gmail.com',
        subject: '🧪 Test Nodemailer CovoiCI',
        text: `Test simple d'envoi d'email depuis CovoiCI.

✅ Nodemailer fonctionne correctement !
📅 Envoyé le : ${new Date().toLocaleString('fr-FR')}

L'équipe CovoiCI`,
        html: `
          <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; border: 1px solid #ddd;">
            <div style="background: linear-gradient(135deg, #007bff, #0056b3); color: white; padding: 20px; text-align: center;">
              <h1>🚗 CovoiCI</h1>
              <p>Test Nodemailer</p>
            </div>
            <div style="padding: 20px;">
              <p>Test simple d'envoi d'email depuis CovoiCI.</p>
              <p style="color: green; font-weight: bold;">✅ Nodemailer fonctionne correctement !</p>
              <p><strong>📅 Envoyé le :</strong> ${new Date().toLocaleString('fr-FR')}</p>
              <hr style="margin: 20px 0;">
              <p style="font-style: italic;">L'équipe CovoiCI</p>
            </div>
          </div>
        `
      };
      
      return transporter.sendMail(mailOptions);
    })
    .then((info) => {
      console.log('✅ Email envoyé avec succès !');
      console.log('📧 Message ID:', info.messageId);
      console.log('📬 Réponse serveur:', info.response);
      console.log('\n🎉 Test terminé avec succès !');
      console.log('📧 Vérifiez votre boîte email : komenanjean07@gmail.com');
      process.exit(0);
    })
    .catch((error) => {
      console.error('❌ Erreur:', error.message);
      
      // Diagnostics spécifiques
      if (error.code === 'EAUTH') {
        console.log('\n🔍 PROBLÈME D\'AUTHENTIFICATION:');
        console.log('1. Vérifiez que l\'authentification à 2 facteurs est activée sur votre compte Gmail');
        console.log('2. Vérifiez que "pdwy pava zbyi cwnv" est bien un App Password Gmail valide');
        console.log('3. Pour créer un App Password:');
        console.log('   - Allez dans les paramètres Google Account');
        console.log('   - Sécurité > Authentification en 2 étapes > Mots de passe des applications');
        console.log('   - Générez un nouveau mot de passe pour "Mail"');
      } else if (error.code === 'ENOTFOUND') {
        console.log('\n🔍 PROBLÈME DE CONNEXION:');
        console.log('1. Vérifiez votre connexion internet');
        console.log('2. Vérifiez que smtp.gmail.com est accessible');
      } else if (error.code === 'ETIMEDOUT') {
        console.log('\n🔍 PROBLÈME DE TIMEOUT:');
        console.log('1. Vérifiez votre firewall/antivirus');
        console.log('2. Essayez avec le port 465 (secure: true)');
      }
      
      process.exit(1);
    });
    
} catch (error) {
  console.error('❌ Erreur lors de l\'import de Nodemailer:', error.message);
  
  if (error.code === 'MODULE_NOT_FOUND') {
    console.log('\n📦 SOLUTION:');
    console.log('Installez Nodemailer avec la commande:');
    console.log('npm install nodemailer');
  }
  
  process.exit(1);
}