const nodemailer = require('nodemailer');
const logger = require('./logger'); // Assurez-vous que le chemin est correct

// Configuration du transporteur d'email
const transporter = nodemailer.createTransport({
  service: 'gmail', // Vous pouvez utiliser un autre service comme SendGrid, Mailgun, etc.
  auth: {
    user: process.env.EMAIL_USER, // Votre adresse email
    pass: process.env.EMAIL_PASS, // Votre mot de passe ou mot de passe d'application
  },
});

// Fonction pour envoyer un email
const sendEmail = async (options) => {
  const mailOptions = {
    from: `"Votre Nom" <${process.env.EMAIL_USER}>`,
    to: options.to,
    subject: options.subject,
    html: options.html,
  };

  try {
    await transporter.sendMail(mailOptions);
    logger.info('Email envoyé avec succès', { to: options.to });
  } catch (error) {
    logger.error('Erreur lors de l\'envoi de l\'email:', error);
    throw new Error('Erreur lors de l\'envoi de l\'email');
  }
};

module.exports = sendEmail;
