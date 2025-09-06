const axios = require('axios');
const crypto = require('crypto');
const config = require('../config/cinetpay');
const logger = require('../utils/logger');

class CinetPayService {
    constructor() {
        this.baseUrl = config.baseUrl;
        this.apiKey = config.apiKey;
        this.siteId = config.siteId;
        this.secretKey = config.secretKey;
    }

    /**
     * Initialiser un paiement
     */
    async initierPaiement(data) {
        try {
            const payload = {
                amount: data.montant,
                currency: config.currency,
                apikey: this.apiKey,
                site_id: this.siteId,
                transaction_id: data.transactionId,
                description: data.description,
                return_url: config.returnUrl,
                notify_url: config.notifyUrl,
                customer_name: `${data.prenom} ${data.nom}`,
                customer_surname: data.nom,
                customer_email: data.email,
                customer_phone_number: data.telephone,
                channels: config.channels
            };

            logger.info('Initiation paiement CinetPay', { payload });

            const response = await axios.post(`${this.baseUrl}/v2/payment`, payload, {
                headers: {
                    'Content-Type': 'application/json'
                }
            });

            if (response.data.code === '201') {
                return {
                    success: true,
                    data: response.data.data
                };
            } else {
                throw new Error(response.data.message || 'Erreur CinetPay');
            }

        } catch (error) {
            logger.error('Erreur initiation paiement CinetPay', error);
            throw new Error(`Erreur CinetPay: ${error.message}`);
        }
    }

    /**
     * Vérifier le statut d'une transaction
     */
    async verifierTransaction(transactionId) {
        try {
            const payload = {
                apikey: this.apiKey,
                site_id: this.siteId,
                transaction_id: transactionId
            };

            const response = await axios.post(`${this.baseUrl}/v2/payment/check`, payload);

            if (response.data.code === '00') {
                return {
                    success: true,
                    data: response.data.data
                };
            } else {
                return {
                    success: false,
                    message: response.data.message
                };
            }

        } catch (error) {
            logger.error('Erreur vérification transaction', error);
            throw error;
        }
    }

    /**
     * Effectuer un transfert (retrait)
     */
    async effectuerTransfert(data) {
        try {
            // D'abord, obtenir un token
            const tokenResponse = await this.obtenirTokenTransfert();
            
            if (!tokenResponse.success) {
                throw new Error('Impossible d\'obtenir le token de transfert');
            }

            const payload = {
                amount: data.montant,
                phone: data.numeroMobile,
                operator: this.detecterOperateur(data.numeroMobile),
                description: data.description || 'Retrait covoiturage'
            };

            const response = await axios.post(
                `${this.baseUrl}/v1/transfer/money/send/contact`,
                payload,
                {
                    headers: {
                        'Authorization': `Bearer ${tokenResponse.token}`,
                        'Content-Type': 'application/json'
                    }
                }
            );

            return {
                success: response.data.code === 0,
                data: response.data
            };

        } catch (error) {
            logger.error('Erreur transfert CinetPay', error);
            throw error;
        }
    }

    /**
     * Obtenir token pour les transferts
     */
    async obtenirTokenTransfert() {
        try {
            const payload = new URLSearchParams({
                username: this.apiKey,
                password: this.secretKey
            });

            const response = await axios.post(
                `${this.baseUrl}/v1/transfer/auth/login`,
                payload,
                {
                    headers: {
                        'Content-Type': 'application/x-www-form-urlencoded'
                    }
                }
            );

            if (response.data.code === 0) {
                return {
                    success: true,
                    token: response.data.data.token
                };
            } else {
                return {
                    success: false,
                    message: response.data.message
                };
            }

        } catch (error) {
            logger.error('Erreur obtention token', error);
            throw error;
        }
    }

    /**
     * Détecter l'opérateur depuis le numéro
     */
    detecterOperateur(numeroMobile) {
        const numero = numeroMobile.replace(/\s+/g, '');
        
        if (numero.startsWith('07') || numero.startsWith('+22507')) {
            return 'ORANGE_CI';
        } else if (numero.startsWith('05') || numero.startsWith('+22505')) {
            return 'MTN_CI';
        } else if (numero.startsWith('01') || numero.startsWith('+22501')) {
            return 'MOOV_CI';
        } else {
            return 'ORANGE_CI'; // Par défaut
        }
    }

    /**
     * Vérifier la signature webhook
     */
    verifierSignatureWebhook(payload, signature) {
        const computedSignature = crypto
            .createHmac('sha256', this.secretKey)
            .update(JSON.stringify(payload))
            .digest('hex');
        
        return computedSignature === signature;
    }
}

module.exports = new CinetPayService();