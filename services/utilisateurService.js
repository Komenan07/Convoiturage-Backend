const bcrypt = require("bcrypt");
const jwt = require("jsonwebtoken");
const Utilisateur = require("../models/Utilisateur");

const ajouter = async (data) => {
  const hash = await bcrypt.hash(data.motDePasse, 10);
  const user = new Utilisateur({ ...data, motDePasse: hash });
  await user.save();
  return user;
};

module.exports = { ajouter };
