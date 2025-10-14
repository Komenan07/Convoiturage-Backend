// network-test.js
const path = require('path');
const dns = require('dns');
const { promisify } = require('util');

require('dotenv').config({ path: path.join(__dirname, '..', '.env') });
const mongoose = require('mongoose');

const dnsLookup = promisify(dns.lookup);
const dnsResolve = promisify(dns.resolveTxt);

async function testNetwork() {
    const hostname = 'covoiturage-app.hsp25l7.mongodb.net';
    
    console.log('🌐 Test de connectivité réseau...\n');
    
    // Test 1: Résolution DNS basique
    console.log('1️⃣ Test de résolution DNS...');
    try {
        const result = await dnsLookup(hostname);
        console.log('✅ DNS résolu:', result.address);
    } catch (error) {
        console.log('❌ Échec DNS:', error.message);
        return;
    }
    
    // Test 2: Résolution TXT (ce qui cause le ETIMEOUT)
    console.log('\n2️⃣ Test de résolution TXT...');
    try {
        const txtRecords = await dnsResolve(hostname);
        console.log('✅ Enregistrements TXT trouvés:', txtRecords.length);
    } catch (error) {
        console.log('❌ Échec TXT:', error.message);
        console.log('⚠️  C\'est probablement ici que ça coince !');
    }
    
    // Test 3: Connexion MongoDB avec timeout réduit
    console.log('\n3️⃣ Test de connexion MongoDB (timeout court)...');
    try {
        await mongoose.connect(process.env.MONGODB_URI, {
            serverSelectionTimeoutMS: 5000, // 5 secondes seulement
        });
        console.log('✅ Connexion MongoDB réussie !');
        await mongoose.connection.close();
    } catch (error) {
        console.log('❌ Échec MongoDB:', error.message);
        
        // Suggestions basées sur l'erreur
        if (error.message.includes('ETIMEOUT')) {
            console.log('\n💡 Suggestions:');
            console.log('   • Vérifiez votre pare-feu/antivirus');
            console.log('   • Testez avec un autre réseau (hotspot mobile)');
            console.log('   • Changez de DNS (8.8.8.8, 1.1.1.1)');
            console.log('   • Vérifiez MongoDB Atlas Network Access');
        }
    }
}

testNetwork().catch(console.error);