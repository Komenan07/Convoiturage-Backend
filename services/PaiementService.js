const Paiement = require('../models/Paiement');
const Reservation = require('../models/Reservation');
const Utilisateur = require('../models/Utilisateur');
const CinetPayService = require('./CinetPayService');
const PortefeuilleService = require('./PortefeuilleService');
const logger = require('../utils/logger');

class PaiementService {
    
    /**
     * Initier un paiement pour une réservation
     */
    async initierPaiementReservation(data) {
        try {
            const { reservationId, userId, montant, telephone, methodePaiement } = data;
            
            // Vérifier la réservation
            const reservation = await Reservation.findById(reservationId)
                .populate('trajetId')
                .populate('passagerId');
            
            if (!reservation) {
                throw new Error('Réservation non trouvée');
            }

            // Vérifier si paiement déjà existant
            const paiementExistant = await Paiement.findOne({ reservationId });
            if (paiementExistant && paiementExistant.estComplete) {
                throw new Error('Cette réservation est déjà payée');
            }

            // Créer le paiement en base
            const paiement = new Paiement({
                reservationId,
                payeurId: userId,
                beneficiaireId: reservation.trajetId.conducteurId,
                montantTotal: montant,
                methodePaiement: methodePaiement || 'ORANGE_MONEY',
                cinetpay: {
                    currency: 'XOF',
                    customerPhone: telephone,
                    status: 'PENDING'
                }
            });

            // Calcul automatique des commissions
            paiement.calculerCommission();
            await paiement.save();

            // Préparer les données pour CinetPay
            const utilisateur = await Utilisateur.findById(userId);
            const cinetpayData = {
                transactionId: paiement._id.toString(),
                montant,
                description: `Covoiturage - Réservation ${reservationId}`,
                nom: utilisateur.nom,
                prenom: utilisateur.prenom,
                email: utilisateur.email,
                telephone
            };

            // Appeler CinetPay
            const cinetpayResponse = await CinetPayService.initierPaiement(cinetpayData);

            if (cinetpayResponse.success) {
                paiement.initialiserCinetPay({
                    transactionId: cinetpayResponse.data.transaction_id,
                    paymentToken: cinetpayResponse.data.payment_token,
                    paymentUrl: cinetpayResponse.data.payment_url,
                    siteId: cinetpayResponse.data.site_id,
                    returnUrl: cinetpayResponse.data.return_url,
                    notifyUrl: cinetpayResponse.data.notify_url,
                    customerName: `${utilisateur.nom} ${utilisateur.prenom}`,
                    customerEmail: utilisateur.email,
                    customerPhone: telephone
                });

                await paiement.save();

                return {
                    success: true,
                    paiementId: paiement._id,
                    paymentUrl: cinetpayResponse.data.payment_url,
                    transactionId: cinetpayResponse.data.transaction_id
                };
            } else {
                throw new Error('Erreur lors de l\'initialisation du paiement');
            }

        } catch (error) {
            logger.error('Erreur initiation paiement', error);
            throw error;
        }
    }

    /**
     * Traiter un webhook de paiement
     */
    async traiterWebhookPaiement(webhookData) {
        try {
            const { transaction_id } = webhookData;

            // Trouver le paiement
            const paiement = await Paiement.findById(transaction_id);
            if (!paiement) {
                throw new Error('Transaction non trouvée');
            }

            // Utiliser la méthode du modèle
            paiement.traiterWebhookCinetPay(webhookData);
            await paiement.save();

            if (paiement.estComplete) {
                await this.traiterPaiementReussi(paiement);
            } else if (paiement.statutPaiement === 'ECHEC') {
                await this.traiterPaiementEchec(paiement);
            }

            return { success: true };

        } catch (error) {
            logger.error('Erreur traitement webhook', error);
            throw error;
        }
    }

    /**
     * Traiter un paiement réussi
     */
    async traiterPaiementReussi(paiement) {
        try {
            // Confirmer la réservation
            await Reservation.findByIdAndUpdate(paiement.reservationId, {
                statutReservation: 'CONFIRMEE',
                statutPaiement: 'PAYE',
                dateConfirmation: new Date()
            });

            logger.info(`Paiement ${paiement._id} confirmé, en attente de fin de trajet`);

            // TODO: notifications push / email

        } catch (error) {
            logger.error('Erreur traitement paiement réussi', error);
            throw error;
        }
    }

    /**
     * Traiter un paiement échoué
     */
    async traiterPaiementEchec(paiement) {
        try {
            await Reservation.findByIdAndUpdate(paiement.reservationId, {
                statutReservation: 'ANNULEE',
                motifAnnulation: 'Paiement échoué'
            });

            logger.info(`Paiement ${paiement._id} échoué`);

        } catch (error) {
            logger.error('Erreur traitement paiement échoué', error);
            throw error;
        }
    }

    /**
     * Libérer les fonds après fin de trajet
     */
    async libererFondsApresTrajet(trajetId) {
        try {
            const reservations = await Reservation.find({
                trajetId,
                statutReservation: 'CONFIRMEE',
                statutPaiement: 'PAYE'
            });

            for (const reservation of reservations) {
                const paiement = await Paiement.findOne({ 
                    reservationId: reservation._id,
                    statutPaiement: 'COMPLETE'
                });

                if (paiement && !paiement.portefeuille.crediteDansPortefeuille) {
                    // Créditer le portefeuille dans le modèle
                    paiement.crediterPortefeuille();
                    await paiement.save();

                    // Créditer aussi dans le service portefeuille
                    await PortefeuilleService.crediterPortefeuille(
                        paiement.beneficiaireId,
                        paiement.montantConducteur,
                        `Paiement trajet terminé - ${trajetId}`,
                        paiement._id.toString()
                    );

                    logger.info(`Fonds libérés pour paiement ${paiement._id}`);
                }
            }

        } catch (error) {
            logger.error('Erreur libération fonds', error);
            throw error;
        }
    }
}

module.exports = new PaiementService();
