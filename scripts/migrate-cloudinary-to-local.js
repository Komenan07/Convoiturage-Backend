// scripts/migrate-cloudinary-to-local.js
// Small migration script to copy legacy Cloudinary public IDs into the new local fields
// Usage: NODE_ENV=development node scripts/migrate-cloudinary-to-local.js

const mongoose = require('mongoose');
const path = require('path');
require('dotenv').config({ path: path.resolve(process.cwd(), '.env') });

const Utilisateur = require('../models/Utilisateur');

async function migrate() {
  const mongoUri = process.env.MONGO_URI || process.env.MONGO_URL;
  if (!mongoUri) {
    console.error('MONGO_URI not set in .env');
    process.exit(1);
  }

  await mongoose.connect(mongoUri, { useNewUrlParser: true, useUnifiedTopology: true });
  console.log('Connected to DB for migration...');

  // Migrate cloudinaryPublicIdDocument -> documentPath
  const usersWithDocId = await Utilisateur.find({ 'documentIdentite.cloudinaryPublicIdDocument': { $exists: true, $ne: null }, 'documentIdentite.documentPath': { $in: [null, ''] } }).select('_id documentIdentite');
  console.log(`Found ${usersWithDocId.length} users with legacy document ID to migrate`);

  for (const u of usersWithDocId) {
    const legacy = u.documentIdentite.cloudinaryPublicIdDocument;
    if (legacy) {
      u.documentIdentite.documentPath = legacy;
      await u.save();
      console.log(`User ${u._id} documentPath set from legacy id`);
    }
  }

  // Migrate cloudinaryPublicIdSelfie -> selfiePath
  const usersWithSelfie = await Utilisateur.find({ 'documentIdentite.cloudinaryPublicIdSelfie': { $exists: true, $ne: null }, 'documentIdentite.selfiePath': { $in: [null, ''] } }).select('_id documentIdentite');
  console.log(`Found ${usersWithSelfie.length} users with legacy selfie ID to migrate`);

  for (const u of usersWithSelfie) {
    const legacy = u.documentIdentite.cloudinaryPublicIdSelfie;
    if (legacy) {
      u.documentIdentite.selfiePath = legacy;
      await u.save();
      console.log(`User ${u._id} selfiePath set from legacy id`);
    }
  }

  console.log('Migration completed.');
  await mongoose.disconnect();
}

migrate().catch(err => {
  console.error('Migration failed', err);
  process.exit(1);
});
