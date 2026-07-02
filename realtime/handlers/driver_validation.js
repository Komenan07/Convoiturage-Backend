/**
 * Handler pour les événements de validation de conducteur
 * Gère les notifications en temps réel via WebSocket
 */

const { logger } = require('../../utils/logger');

/**
 * Émettre une notification de validation/refus conducteur
 * @param {Object} io - Instance Socket.IO
 * @param {string} userId - ID de l'utilisateur
 * @param {Object} data - Données de validation
 */
function notifyDriverValidation(io, userId, data) {
  try {
    const { approved, reason, validatedBy, rejectedBy, timestamp, vehiculesCount, commentaire } = data;
    
    const eventName = approved ? 'driver_validation_approved' : 'driver_validation_rejected';
    const userRoom = `user_${userId}`;
    
    // Payload de la notification
    const notificationPayload = {
      userId,
      approved,
      reason: reason || commentaire,
      validatedBy: approved ? validatedBy : undefined,
      rejectedBy: !approved ? rejectedBy : undefined,
      timestamp: timestamp || new Date().toISOString(),
      type: 'DRIVER_VALIDATION',
      priority: 'HIGH',
      vehiculesCount: approved ? vehiculesCount : undefined,
      action: approved ? 'open_profile' : 'complete_profile'
    };
    
    // Émettre l'événement spécifique
    io.to(userRoom).emit(eventName, notificationPayload);
    
    // Émettre aussi l'événement générique 'notification' pour compatibilité
    io.to(userRoom).emit('notification', {
      ...notificationPayload,
      title: approved ? '🎉 Validation Conducteur' : '❌ Demande Refusée',
      body: approved 
        ? 'Félicitations ! Vous êtes maintenant conducteur.' 
        : 'Votre demande n\'a pas été approuvée.',
      eventType: eventName
    });
    
    logger.info(`✅ Notification ${eventName} envoyée`, { 
      userId, 
      room: userRoom,
      approved,
      timestamp: notificationPayload.timestamp
    });
    
    return { success: true, eventName, userId };
    
  } catch (error) {
    logger.error('❌ Erreur notifyDriverValidation', { 
      error: error.message, 
      userId,
      stack: error.stack 
    });
    return { success: false, error: error.message };
  }
}

/**
 * Émettre une notification de mise à jour du statut de validation
 * (pour les administrateurs qui gèrent les validations)
 * @param {Object} io - Instance Socket.IO
 * @param {string} adminId - ID de l'administrateur
 * @param {Object} data - Données de mise à jour
 */
function notifyAdminValidationUpdate(io, adminId, data) {
  try {
    const { userId, userName, approved, timestamp } = data;
    
    const adminRoom = `admin:${adminId}`;
    
    io.to(adminRoom).emit('driver_validation_processed', {
      adminId,
      userId,
      userName,
      approved,
      timestamp: timestamp || new Date().toISOString(),
      type: 'ADMIN_NOTIFICATION'
    });
    
    logger.info('✅ Notification admin envoyée', { adminId, userId, approved });
    
    return { success: true };
    
  } catch (error) {
    logger.error('❌ Erreur notifyAdminValidationUpdate', { 
      error: error.message, 
      adminId 
    });
    return { success: false, error: error.message };
  }
}

/**
 * Enregistrer les handlers de validation dans Socket.IO
 * @param {Object} io - Instance Socket.IO
 */
function registerDriverValidationHandlers(io) {
  io.on('connection', (socket) => {
    
    // Admin rejoint sa room pour recevoir les notifications
    socket.on('admin:join', async ({ adminId }, ack = () => {}) => {
      try {
        if (!socket.user || socket.user.type !== 'admin') {
          throw new Error('ADMIN_AUTHENTICATION_REQUIRED');
        }
        
        const adminRoom = `admin:${adminId}`;
        await socket.join(adminRoom);
        
        logger.info('✅ Admin rejoint la room', { adminId, socketId: socket.id });
        ack({ success: true, room: adminRoom });
        
      } catch (error) {
        logger.error('❌ Erreur admin:join', { error: error.message });
        ack({ success: false, error: error.message });
      }
    });
    
    // Confirmer réception de notification (pour analytics)
    socket.on('driver_validation:ack', ({ notificationId, received }, ack = () => {}) => {
      try {
        logger.info('📊 Notification accusée de réception', { 
          notificationId, 
          received,
          userId: socket.user?.id 
        });
        
        ack({ success: true });
        
      } catch (error) {
        logger.error('❌ Erreur driver_validation:ack', { error: error.message });
        ack({ success: false, error: error.message });
      }
    });
    
  });
  
  logger.info('✅ Handlers de validation conducteur enregistrés');
}

module.exports = {
  notifyDriverValidation,
  notifyAdminValidationUpdate,
  registerDriverValidationHandlers
};
