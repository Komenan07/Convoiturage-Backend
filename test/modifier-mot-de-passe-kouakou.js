const axios = require('axios');
const BASE_URL = 'http://localhost:3000';

async function modifierMotDePasseKouakou() {
  console.log('🔐 TEST DE MODIFICATION DE MOT DE PASSE');
  console.log('=====================================\n');

  const email = 'kouakou01marc@gmail.com';
  const ancienMotDePasse = 'Test123!';
  const nouveauMotDePasse = 'NouveauMotDePasse123!';

  try {
    // 1. Connexion avec l'ancien mot de passe
    console.log('📝 ÉTAPE 1: Connexion avec l\'ancien mot de passe...');
    const connexionResponse = await axios.post(`${BASE_URL}/api/auth/connexion`, {
      email: email,
      motDePasse: ancienMotDePasse
    });

    if (connexionResponse.data.success) {
      console.log('✅ Connexion réussie !');
      const token = connexionResponse.data.token;
      console.log('   - Token reçu:', token.substring(0, 20) + '...');
      
      // 2. Modification du mot de passe
      console.log('\n📝 ÉTAPE 2: Modification du mot de passe...');
      const modificationResponse = await axios.put(
        `${BASE_URL}/api/utilisateurs/mot-de-passe`,
        {
          ancienMotDePasse: ancienMotDePasse,
          nouveauMotDePasse: nouveauMotDePasse
        },
        {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json'
          }
        }
      );

      if (modificationResponse.data.success) {
        console.log('✅ Mot de passe modifié avec succès !');
        
        // 3. Test de connexion avec le nouveau mot de passe
        console.log('\n📝 ÉTAPE 3: Test de connexion avec le nouveau mot de passe...');
        const nouvelleConnexionResponse = await axios.post(`${BASE_URL}/api/auth/connexion`, {
          email: email,
          motDePasse: nouveauMotDePasse
        });

        if (nouvelleConnexionResponse.data.success) {
          console.log('✅ Connexion réussie avec le nouveau mot de passe !');
          const nouveauToken = nouvelleConnexionResponse.data.token;
          console.log('   - Nouveau token reçu:', nouveauToken.substring(0, 20) + '...');
          
          // 4. Test de la route /me avec le nouveau token
          console.log('\n📝 ÉTAPE 4: Test de la route /me avec le nouveau token...');
          const meResponse = await axios.get(`${BASE_URL}/api/auth/me`, {
            headers: {
              'Authorization': `Bearer ${nouveauToken}`,
              'Content-Type': 'application/json'
            }
          });

          if (meResponse.data.success) {
            console.log('✅ Route /me accessible avec le nouveau token !');
            console.log('   - Utilisateur:', meResponse.data.data.email);
            console.log('   - Statut compte:', meResponse.data.data.statutCompte);
            
            console.log('\n🎉 SUCCÈS TOTAL !');
            console.log('Le mot de passe a été modifié et fonctionne parfaitement !');
            console.log('\n💡 Nouveaux identifiants de connexion:');
            console.log(`   Email: ${email}`);
            console.log(`   Mot de passe: ${nouveauMotDePasse}`);
            
          } else {
            console.log('❌ Échec de la route /me avec le nouveau token');
            console.log('   - Erreur:', meResponse.data);
          }
          
        } else {
          console.log('❌ Échec de la connexion avec le nouveau mot de passe');
          console.log('   - Erreur:', nouvelleConnexionResponse.data);
        }
        
      } else {
        console.log('❌ Échec de la modification du mot de passe');
        console.log('   - Erreur:', modificationResponse.data);
      }
      
    } else {
      console.log('❌ Échec de la connexion avec l\'ancien mot de passe');
      console.log('   - Erreur:', connexionResponse.data);
    }

  } catch (error) {
    console.error('❌ Erreur lors du test:', error.message);
    
    if (error.response) {
      console.log('   - Statut:', error.response.status);
      console.log('   - Données:', error.response.data);
    }
  }
}

// Lancer le test
modifierMotDePasseKouakou();
