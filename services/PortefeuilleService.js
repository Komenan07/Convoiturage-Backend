const Utilisateur = require('../models/Utilisateur');
const CinetPayService = require('./CinetPayService');
const logger = require('../utils/logger');

class PortefeuilleService {

    /**
     * Créditer le portefeuille
     */
    async crediterPortefeuille(userId, montant, description, reference) {
        try {
            const utilisateur = await Utilisateur.findById(userId);
            if (!utilisateur) {
                throw new Error('Utilisateur non trouvé');
            }

            await utilisateur.crediterPortefeuille(montant, description, reference);

            // TODO: Envoyer notification push
            logger.info(`Portefeuille crédité: ${userId}, montant: ${montant}`);

            return utilisateur.portefeuille.solde;

        } catch (error) {
            logger.error('Erreur crédit portefeuille', error);
            throw error;
        }
    }

    /**
     * Effectuer un retrait
     */
    async effectuerRetrait(userId, montant, numeroMobile) {
        try {
            const utilisateur = await Utilisateur.findById(userId);
            if (!utilisateur) {
                throw new Error('Utilisateur non trouvé');
            }

            // Vérifications
            if (utilisateur.portefeuille.solde < montant) {
                throw new Error('Solde insuffisant');
            }

            if (montant < 500) {
                throw new Error('Montant minimum de retrait: 500 FCFA');
            }

            if (montant > 500000) {
                throw new Error('Montant maximum de retrait: 500,000 FCFA');
            }

            // Bloquer le montant temporairement
            utilisateur.portefeuille.solde -= montant;
            utilisateur.portefeuille.soldeBloquer += montant;
            
            utilisateur.portefeuille.historique.push({
                type: 'DEBIT',
                montant,
                description: 'Demande de retrait',
                statut: 'PENDING'
            });

            await utilisateur.save();

            try {
                // Effectuer le transfert via CinetPay
                const transferData = {
                    montant,
                    numeroMobile,
                    description: 'Retrait portefeuille covoiturage'
                };

                const transferResponse = await CinetPayService.effectuerTransfert(transferData);

                if (transferResponse.success) {
                    // Libérer l'argent bloqué
                    utilisateur.portefeuille.soldeBloquer -= montant;
                    
                    // Mettre à jour l'historique
                    const transaction = utilisateur.portefeuille.historique
                        .find(t => t.type === 'DEBIT' && t.statut === 'PENDING');
                    if (transaction) {
                        transaction.statut = 'COMPLETE';
                        transaction.reference = transferResponse.data.transaction_id;
                    }

                    await utilisateur.save();

                    return {
                        success: true,
                        transactionId: transferResponse.data.transaction_id
                    };
                } else {
                    throw new Error(transferResponse.message || 'Erreur transfert');
                }

            } catch (transferError) {
                // Rembourser en cas d'erreur
                await this.rembourserMontantBloque(userId, montant);
                throw transferError;
            }

        } catch (error) {
            logger.error('Erreur retrait', error);
            throw error;
        }
    }

    /**
     * Rembourser un montant bloqué
     */
    async rembourserMontantBloque(userId, montant) {
        try {
            const utilisateur = await Utilisateur.findById(userId);
            
            utilisateur.portefeuille.solde += montant;
            utilisateur.portefeuille.soldeBloquer -= montant;
            
            // Mettre à jour l'historique
            const transaction = utilisateur.portefeuille.historique
                .find(t => t.type === 'DEBIT' && t.statut === 'PENDING');
            if (transaction) {
                transaction.statut = 'FAILED';
            }

            await utilisateur.save();

        } catch (error) {
            logger.error('Erreur remboursement', error);
        }
    }

    /**
     * Obtenir le solde
     */
    async obtenirSolde(userId) {
        try {
            const utilisateur = await Utilisateur.findById(userId).select('portefeuille');
            return {
                solde: utilisateur.portefeuille.solde,
                soldeBloquer: utilisateur.portefeuille.soldeBloquer,
                disponible: utilisateur.portefeuille.solde - utilisateur.portefeuille.soldeBloquer
            };
        } catch (error) {
            logger.error('Erreur obtention solde', error);
            throw error;
        }
    }

    /**
     * Obtenir l'historique des transactions
     */
    async obtenirHistorique(userId, limit = 50) {
        try {
            const utilisateur = await Utilisateur.findById(userId).select('portefeuille.historique');
            
            return utilisateur.portefeuille.historique
                .sort((a, b) => b.date - a.date)
                .slice(0, limit);

        } catch (error) {
            logger.error('Erreur obtention historique', error);
            throw error;
        }
    }
}

module.exports = new PortefeuilleService();