const connectDB = async () => {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error("❌ MONGODB_URI n'est pas défini !");
    process.exit(1);
  }

  const options = {
    serverSelectionTimeoutMS: 60000, // 60 secondes
    socketTimeoutMS: 60000,
    connectTimeoutMS: 60000,
    bufferMaxEntries: 0,
    maxPoolSize: 5,
    minPoolSize: 1,
    family: 4, // Force IPv4
    // Retry logic
    retryWrites: true,
    retryReads: true
  };

  let retries = 3;
  while (retries > 0) {
    try {
      console.log(`🔄 Tentative de connexion MongoDB Atlas (${4-retries}/3)...`);
      await mongoose.connect(uri, options);
      console.log("✅ MongoDB Atlas connecté avec succès");
      return;
    } catch (error) {
      retries--;
      console.error(`❌ Tentative échouée: ${error.message}`);
      if (retries === 0) {
        console.error("❌ Toutes les tentatives ont échoué");
        process.exit(1);
      }
      // Attendre 5 secondes avant de retry
      await new Promise(resolve => setTimeout(resolve, 5000));
    }
  }
};