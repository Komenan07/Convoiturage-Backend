const connectDB = async () => {
  const uri = process.env.MONGO_URI;
  if (!uri) {
    console.error("❌ MONGO_URI n'est pas défini !");
    process.exit(1);
  }

  try {
    await mongoose.connect(uri);
    console.log("✅ MongoDB connecté");
  } catch (error) {
    console.error("Erreur de connexion MongoDB:", error);
    process.exit(1);
  }
};
