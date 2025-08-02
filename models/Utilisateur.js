const mongoose = require("mongoose");
const bcrypt = require("bcrypt");

const utilisateurSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true },
  telephone: { type: String, required: true, unique: true },
  motDePasse: { type: String, required: true },
  nom: { type: String },
  prenom: { type: String },
  dateNaissance: { type: Date },
  sexe: { type: String, enum: ["M", "F"] },
  photoProfil: { type: String }
});

// Hachage du mot de passe avant sauvegarde
utilisateurSchema.pre("save", async function (next) {
  if (!this.isModified("motDePasse")) return next();
  this.motDePasse = await bcrypt.hash(this.motDePasse, 10);
  next();
});

module.exports = mongoose.model("Utilisateur", utilisateurSchema);
