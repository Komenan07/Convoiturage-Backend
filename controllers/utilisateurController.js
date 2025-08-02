const Utilisateur = require("../models/Utilisateur");
const bcrypt = require("bcrypt");

// ✅ Créer un utilisateur
const creerUtilisateur = async (req, res) => {
  try {
    const { motDePasse, ...autresInfos } = req.body;
    const hash = await bcrypt.hash(motDePasse, 10);
    const nouvelUtilisateur = new Utilisateur({ ...autresInfos, motDePasse: hash });
    await nouvelUtilisateur.save();
    res.status(201).json(nouvelUtilisateur);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// 📋 Lister tous les utilisateurs
const listerUtilisateurs = async (req, res) => {
  try {
    const utilisateurs = await Utilisateur.find();
    res.status(200).json(utilisateurs);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// 🔍 Obtenir un utilisateur spécifique
const obtenirUtilisateur = async (req, res) => {
  try {
    const utilisateur = await Utilisateur.findById(req.params.id);
    if (!utilisateur) return res.status(404).json({ message: "Utilisateur non trouvé" });
    res.status(200).json(utilisateur);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ✏️ Modifier un utilisateur
const modifierUtilisateur = async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.motDePasse) {
      updates.motDePasse = await bcrypt.hash(updates.motDePasse, 10);
    }
    const utilisateur = await Utilisateur.findByIdAndUpdate(
      req.params.id,
      updates,
      { new: true, runValidators: true }
    );
    if (!utilisateur) return res.status(404).json({ message: "Utilisateur introuvable pour mise à jour" });
    res.status(200).json(utilisateur);
  } catch (error) {
    res.status(400).json({ message: error.message });
  }
};

// 🗑️ Supprimer un utilisateur
const supprimerUtilisateur = async (req, res) => {
  try {
    const utilisateur = await Utilisateur.findByIdAndDelete(req.params.id);
    if (!utilisateur) return res.status(404).json({ message: "Utilisateur déjà supprimé ou inexistant" });
    res.status(204).send(); // No content
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

module.exports = {
  creerUtilisateur,
  listerUtilisateurs,
  obtenirUtilisateur,
  modifierUtilisateur,
  supprimerUtilisateur,
};
