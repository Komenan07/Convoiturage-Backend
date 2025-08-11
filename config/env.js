// config/env.js
require('dotenv').config();

module.exports = {
  nodeEnv: process.env.NODE_ENV || 'development',
  port: parseInt(process.env.PORT, 10) || 3000,
  
  // MongoDB - CORRECTION: utiliser MONGODB_URI au lieu de MONGO_URI
  mongoUri: process.env.MONGODB_URI || 'mongodb://localhost:27017/covoiturage-ci',
  mongoTestUri: process.env.MONGODB_TEST_URI,
  
  // JWT - CORRECTION: utiliser JWT_EXPIRES_IN au lieu de JWT_EXPIRE
  jwtSecret: process.env.JWT_SECRET || 'votre-secret-jwt-tres-securise',
  jwtExpire: process.env.JWT_EXPIRES_IN || '7d',
  
  // CORS
  ALLOWED_ORIGINS: process.env.ALLOWED_ORIGINS ? 
    process.env.ALLOWED_ORIGINS.split(',') : 
    ['http://localhost:3000', 'http://localhost:3001'],
  
  // Upload
  maxFileSize: parseInt(process.env.MAX_FILE_SIZE, 10) || 5242880,
  uploadPath: process.env.UPLOAD_PATH || 'uploads/',
  
  // Email
  emailHost: process.env.EMAIL_HOST,
  emailPort: parseInt(process.env.EMAIL_PORT, 10) || 587,
  emailUser: process.env.EMAIL_USER,
  emailPass: process.env.EMAIL_PASS,
  emailFrom: process.env.EMAIL_FROM || 'noreply@covoiturage-ci.com',
  
  // Sécurité
  bcryptSaltRounds: parseInt(process.env.BCRYPT_SALT_ROUNDS, 10) || 12,
  
  // APIs externes
  googleMapsApiKey: process.env.GOOGLE_MAPS_API_KEY,
  mapboxAccessToken: process.env.MAPBOX_ACCESS_TOKEN,
  
  // Paiements mobiles
  wave: {
    apiKey: process.env.WAVE_API_KEY,
    secretKey: process.env.WAVE_SECRET_KEY,
    baseUrl: process.env.WAVE_BASE_URL
  },
  orangeMoney: {
    apiKey: process.env.ORANGE_MONEY_API_KEY,
    secret: process.env.ORANGE_MONEY_SECRET,
    baseUrl: process.env.ORANGE_MONEY_BASE_URL
  },
  mtnMoney: {
    apiKey: process.env.MTN_MONEY_API_KEY,
    secret: process.env.MTN_MONEY_SECRET,
    baseUrl: process.env.MTN_MONEY_BASE_URL
  },
  moovMoney: {
    apiKey: process.env.MOOV_MONEY_API_KEY,
    secret: process.env.MOOV_MONEY_SECRET,
    baseUrl: process.env.MOOV_MONEY_BASE_URL
  },
  
  // SMS
  sms: {
    apiKey: process.env.SMS_API_KEY,
    senderId: process.env.SMS_SENDER_ID || 'COVOIT-CI',
    baseUrl: process.env.SMS_BASE_URL
  },
  
  // Firebase/FCM
  fcm: {
    serverKey: process.env.FCM_SERVER_KEY,
    projectId: process.env.FCM_PROJECT_ID
  },
  
  // Redis
  redisUrl: process.env.REDIS_URL || 'redis://localhost:6379',
  redisSessionSecret: process.env.REDIS_SESSION_SECRET,
  
  // Rate limiting
  rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 900000,
  rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
  
  // URLs
  baseUrl: process.env.BASE_URL || 'http://localhost:3000',
  frontendUrl: process.env.FRONTEND_URL || 'http://localhost:3001',
  
  // Logs
  logLevel: process.env.LOG_LEVEL || 'info',
  logFilePath: process.env.LOG_FILE_PATH || 'logs/',
  
  // Monitoring
  sentryDsn: process.env.SENTRY_DSN,
  
  // Autres APIs
  opencageApiKey: process.env.OPENCAGE_API_KEY,
  weatherApiKey: process.env.WEATHER_API_KEY,
  
  // Événements externes
  eventbrite: {
    apiKey: process.env.EVENTBRITE_API_KEY
  },
  facebook: {
    appId: process.env.FACEBOOK_APP_ID,
    appSecret: process.env.FACEBOOK_APP_SECRET
  },
  
  // Vérification
  verificationWebhookSecret: process.env.VERIFICATION_WEBHOOK_SECRET
};