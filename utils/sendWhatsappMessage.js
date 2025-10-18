const axios = require('axios');

const idInstance = process.env.GREEN_API_ID_INSTANCE;
const apiToken = process.env.GREEN_API_TOKEN_INSTANCE;

async function sendWhatsappMessage(phone, message) {
  try {
    // Format international obligatoire : ex. +2250700000000
    const chatId = `${phone.replace('+', '')}@c.us`;

    const response = await axios.post(
      `https://api.green-api.com/waInstance${idInstance}/sendMessage/${apiToken}`,
      {
        chatId,
        message,
      }
    );

    console.log('✅ Message WhatsApp envoyé à', phone, response.data);
    return response.data;
  } catch (error) {
    console.error('❌ Erreur envoi WhatsApp:', error.response?.data || error.message);
    throw new Error('Échec de l’envoi du message WhatsApp');
  }
}

module.exports = sendWhatsappMessage;
