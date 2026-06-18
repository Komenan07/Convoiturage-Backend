jest.mock('../utils/logger', () => ({
  logger: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn()
  }
}));

jest.mock('../services/twilioService', () => ({
  envoyerCodeVerification: jest.fn()
}));

jest.mock('../models/Utilisateur', () => ({
  findById: jest.fn()
}));

const crypto = require('crypto');
const User = require('../models/Utilisateur');
const twilioService = require('../services/twilioService');
const { chooseChannel } = require('../controllers/authController');

describe('authController.chooseChannel', () => {
  let req;
  let res;
  let next;
  let mockSave;

  beforeEach(() => {
    jest.clearAllMocks();

    mockSave = jest.fn().mockResolvedValue(undefined);

    req = {
      body: {
        utilisateurId: 'user-1',
        canal: 'WHATSAPP'
      }
    };

    res = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn()
    };

    next = jest.fn();
  });

  it('doit générer un OTP unique et le sauvegarder pour WhatsApp et SMS', async () => {
    const utilisateur = {
      _id: 'user-1',
      prenom: 'Jean',
      nom: 'Dupont',
      telephone: '+22507070707',
      statutCompte: 'EN_ATTENTE_CHOIX_CANAL',
      save: mockSave
    };

    User.findById.mockReturnValue({
      select: jest.fn().mockReturnThis(),
      maxTimeMS: jest.fn().mockResolvedValue(utilisateur)
    });

    twilioService.envoyerCodeVerification.mockResolvedValue({
      success: true,
      provider: 'twilio',
      channel: 'whatsapp'
    });

    await chooseChannel(req, res, next);

    expect(User.findById).toHaveBeenCalledWith('user-1');
    expect(utilisateur.save).toHaveBeenCalledWith({ validateBeforeSave: false });

    expect(utilisateur.codeSMS).toBeDefined();
    expect(utilisateur.codeVerificationWhatsApp).toBeDefined();
    expect(utilisateur.codeSMS).toEqual(utilisateur.codeVerificationWhatsApp);
    expect(utilisateur.expirationCodeSMS).toEqual(utilisateur.codeVerificationWhatsAppExpire);
    expect(utilisateur.otpCode).toEqual(crypto.createHash('sha256').update(utilisateur.codeSMS).digest('hex'));

    expect(twilioService.envoyerCodeVerification).toHaveBeenCalledWith(
      utilisateur.telephone,
      utilisateur.codeSMS,
      `${utilisateur.prenom} ${utilisateur.nom}`,
      { prefer: 'whatsapp' }
    );

    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      canal: 'WHATSAPP'
    }));
  });
});
