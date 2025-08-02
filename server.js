const express = require("express");
const mongoose = require("mongoose");
const cors = require("cors");
require("dotenv").config();

// 📦 Importation des routes
const utilisateurRouter = require("./routers/utilisateurRouter");

const app = express();

// 🌐 Middlewares
app.use(cors());
app.use(express.json()); // Remplace body-parser

// 🔗 Enregistrement des routes
app.use("/api/Utilisateurs", utilisateurRouter);

// ✅ Route de test
app.get("/", (req, res) => {
  res.send("🚀 Serveur Node.js opérationnel !");
});

// 🌍 Connexion MongoDB
mongoose
  .connect(process.env.MONGO_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log("✅ Connecté à MongoDB");
    // 🎧 Démarrage du serveur
    const PORT = process.env.PORT || 5000;
    app.listen(PORT, () => {
      console.log(`🚀 Serveur démarré sur le port ${PORT}`);
    });
  })
  .catch((err) => {
    console.error("❌ Erreur MongoDB :", err.message);
  });
