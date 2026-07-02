# Multi-stage build pour optimiser la taille de l'image

# ==================== STAGE 1: Dependencies ====================
FROM node:20-alpine AS dependencies

WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer les dépendances de production uniquement
RUN npm ci --only=production && \
    npm cache clean --force

# ==================== STAGE 2: Build ====================
FROM node:20-alpine AS build

WORKDIR /app

# Copier les fichiers de dépendances
COPY package*.json ./

# Installer toutes les dépendances (dev + prod)
RUN npm ci

# Copier le code source
COPY . .

# ==================== STAGE 3: Production ====================
FROM node:20-alpine AS production

# Installer dumb-init pour gérer les signaux proprement
RUN apk add --no-cache dumb-init

# Créer un utilisateur non-root pour la sécurité
RUN addgroup -g 1001 -S nodejs && \
    adduser -S nodejs -u 1001

WORKDIR /app

# Copier les dépendances de production depuis le stage dependencies
COPY --from=dependencies --chown=nodejs:nodejs /app/node_modules ./node_modules

# Copier le code source depuis le stage build
COPY --chown=nodejs:nodejs . .

# Créer les dossiers nécessaires avec les bonnes permissions
RUN mkdir -p logs uploads/photos uploads/documents backups && \
    chown -R nodejs:nodejs logs uploads backups

# Passer à l'utilisateur non-root
USER nodejs

# Exposer le port de l'application
EXPOSE 5500

# Variables d'environnement par défaut
ENV NODE_ENV=production \
    PORT=5500 \
    HOST=0.0.0.0

# Healthcheck pour vérifier que l'application fonctionne
HEALTHCHECK --interval=30s --timeout=10s --start-period=40s --retries=3 \
  CMD node -e "require('http').get('http://localhost:5500/health', (r) => {process.exit(r.statusCode === 200 ? 0 : 1)})"

# Utiliser dumb-init pour gérer les signaux
ENTRYPOINT ["dumb-init", "--"]

# Démarrer l'application
CMD ["node", "server.js"]
