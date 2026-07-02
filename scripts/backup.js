const { exec } = require('child_process');
const path = require('path');
const fs = require('fs');

/**
 * Script de backup MongoDB
 * Peut être exécuté manuellement ou via cron
 */

const BACKUP_DIR = path.join(__dirname, '../backups');
const MAX_BACKUPS = 7; // Garder les 7 derniers backups

// Créer le dossier backups s'il n'existe pas
if (!fs.existsSync(BACKUP_DIR)) {
  fs.mkdirSync(BACKUP_DIR, { recursive: true });
}

const timestamp = new Date().toISOString().replace(/:/g, '-').split('.')[0];
const backupFile = path.join(BACKUP_DIR, `backup-${timestamp}.gz`);

const mongoUri = process.env.MONGODB_URI;

if (!mongoUri) {
  console.error('❌ MONGODB_URI n\'est pas défini dans les variables d\'environnement');
  process.exit(1);
}

console.log('🔄 Démarrage du backup MongoDB...');
console.log(`📁 Fichier: ${backupFile}`);

exec(`mongodump --uri="${mongoUri}" --archive=${backupFile} --gzip`, (error, stdout, stderr) => {
  if (error) {
    console.error(`❌ Erreur lors du backup: ${error.message}`);
    process.exit(1);
  }

  if (stderr) {
    console.warn(`⚠️ Warning: ${stderr}`);
  }

  console.log(`✅ Backup créé avec succès: ${backupFile}`);
  
  // Nettoyer les anciens backups
  cleanOldBackups();
});

/**
 * Supprime les backups les plus anciens pour ne garder que MAX_BACKUPS
 */
function cleanOldBackups() {
  fs.readdir(BACKUP_DIR, (err, files) => {
    if (err) {
      console.error('❌ Erreur lors de la lecture du dossier backups:', err);
      return;
    }

    // Filtrer uniquement les fichiers .gz
    const backupFiles = files
      .filter(file => file.endsWith('.gz'))
      .map(file => ({
        name: file,
        path: path.join(BACKUP_DIR, file),
        time: fs.statSync(path.join(BACKUP_DIR, file)).mtime.getTime()
      }))
      .sort((a, b) => b.time - a.time); // Trier du plus récent au plus ancien

    // Supprimer les backups en excès
    if (backupFiles.length > MAX_BACKUPS) {
      const filesToDelete = backupFiles.slice(MAX_BACKUPS);
      
      filesToDelete.forEach(file => {
        fs.unlink(file.path, err => {
          if (err) {
            console.error(`❌ Erreur lors de la suppression de ${file.name}:`, err);
          } else {
            console.log(`🗑️  Ancien backup supprimé: ${file.name}`);
          }
        });
      });
    }

    console.log(`📊 Backups conservés: ${Math.min(backupFiles.length, MAX_BACKUPS)}`);
  });
}

// Gestion de l'arrêt propre
process.on('SIGINT', () => {
  console.log('\n⚠️  Backup interrompu');
  process.exit(0);
});
