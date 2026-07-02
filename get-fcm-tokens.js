require('dotenv').config();
const mongoose = require('mongoose');

mongoose.connect(process.env.MONGODB_URI).then(async () => {
  const db = mongoose.connection.db;
  
  const users = await db.collection('utilisateurs').find(
    { fcmTokens: { $exists: true, $ne: [] } },
    { projection: { nom: 1, prenom: 1, fcmTokens: 1 } }
  ).limit(5).toArray();

  console.log('\n========================================');
  console.log('📱 UTILISATEURS AVEC TOKENS FCM');
  console.log('========================================\n');

  if (users.length === 0) {
    console.log('❌ Aucun utilisateur avec un token FCM trouvé');
    console.log('👉 Le passager doit ouvrir l\'app pour enregistrer son token');
  } else {
    users.forEach((u, i) => {
      console.log(`👤 Utilisateur ${i + 1}: ${u.nom} ${u.prenom}`);
      console.log('Structure fcmTokens:');
      console.log(JSON.stringify(u.fcmTokens, null, 2));
      console.log('---\n');
    });
  }

  console.log('\n========================================\n');
  await mongoose.disconnect();
}).catch(err => {
  console.error('❌ Erreur MongoDB:', err.message);
  console.log('👉 Vérifie MONGODB_URI dans ton .env');
});
