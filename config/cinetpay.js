const config = {
    apiKey: process.env.CINETPAY_API_KEY,
    siteId: process.env.CINETPAY_SITE_ID,
    secretKey: process.env.CINETPAY_SECRET_KEY,
    baseUrl: process.env.CINETPAY_BASE_URL || 'https://api-checkout.cinetpay.com',
    sandbox: process.env.CINETPAY_SANDBOX === 'true',
    
    // URLs de callback
    notifyUrl: `${process.env.BACKEND_URL}/api/webhooks/cinetpay`,
    returnUrl: `${process.env.FRONTEND_URL}/payment/success`,
    
    // Configuration des paiements
    currency: 'XOF',
    channels: 'ORANGE_MONEY,MTN_MONEY,MOOV_MONEY,WAVE',
    
    // Limites
    montantMin: 100,
    montantMax: 500000,
    commissionTaux: 0.05, // 5%
    fraisCinetPayTaux: 0.025 // 2.5%
};

module.exports = config;