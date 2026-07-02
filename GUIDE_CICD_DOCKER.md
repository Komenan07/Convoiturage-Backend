# 🚀 Guide CI/CD et Docker - Covoiturage Backend

## 📋 Table des matières

1. [Prérequis](#prérequis)
2. [Configuration locale avec Docker](#configuration-locale-avec-docker)
3. [Configuration GitLab CI/CD](#configuration-gitlab-cicd)
4. [Configuration du serveur VPS](#configuration-du-serveur-vps)
5. [Workflows de déploiement](#workflows-de-déploiement)
6. [Monitoring et maintenance](#monitoring-et-maintenance)
7. [Troubleshooting](#troubleshooting)

---

## 🔧 Prérequis

### Local
- Docker Desktop (Windows/Mac) ou Docker Engine (Linux)
- Docker Compose v2+
- Node.js 20+ (pour développement local sans Docker)
- Git

### Serveur VPS
- Ubuntu 20.04+ ou Debian 11+
- Docker & Docker Compose installés
- Accès SSH root ou sudo
- Minimum 2GB RAM, 2 CPU cores, 20GB stockage
- Nom de domaine configuré (optionnel mais recommandé)

### GitLab
- Projet GitLab avec Registry activé
- Variables CI/CD configurées

---

## 🐳 Configuration locale avec Docker

### 1. Créer le fichier .env local

```bash
cp .env.example .env
```

Éditez `.env` avec vos configurations locales.

### 2. Lancer l'environnement de développement

```bash
# Construire et démarrer tous les services
docker compose up -d

# Voir les logs
docker compose logs -f app

# Arrêter les services
docker compose down

# Reconstruire après modifications du Dockerfile
docker compose up -d --build
```

### 3. Accès aux services

- **API Backend**: http://localhost:5500
- **MongoDB**: localhost:27017
- **Mongo Express**: http://localhost:8081 (admin/admin)
- **Redis**: localhost:6379

### 4. Commandes utiles

```bash
# Exécuter des commandes dans le conteneur
docker compose exec app npm run seed
docker compose exec app npm test

# Voir les logs d'un service spécifique
docker compose logs -f mongo
docker compose logs -f redis

# Redémarrer un service
docker compose restart app

# Nettoyer tout (⚠️ supprime les volumes)
docker compose down -v
```

---

## 🔄 Configuration GitLab CI/CD

### 1. Configuration du GitLab Container Registry

1. Allez dans **Settings > Repository > Deploy Tokens**
2. Créez un token avec les permissions:
   - `read_registry`
   - `write_registry`
3. Notez le username et le token

### 2. Variables CI/CD GitLab

Allez dans **Settings > CI/CD > Variables** et ajoutez:

| Variable | Valeur | Protected | Masked | Description |
|----------|--------|-----------|---------|-------------|
| `REGISTRY_USER` | Votre username GitLab | ✅ | ❌ | Username registry |
| `REGISTRY_PASSWORD` | Votre token d'accès | ✅ | ✅ | Token registry |
| `VPS_HOST` | IP ou domaine du VPS | ✅ | ❌ | Adresse du serveur |
| `VPS_USER` | ubuntu ou root | ✅ | ❌ | Utilisateur SSH |
| `SSH_PRIVATE_KEY` | Clé SSH privée | ✅ | ✅ | Clé pour connexion SSH |

### 3. Générer la clé SSH

Sur votre machine locale:

```bash
# Générer une paire de clés
ssh-keygen -t ed25519 -C "gitlab-ci@covoiturage" -f gitlab-ci-key

# Afficher la clé privée (à copier dans GitLab)
cat gitlab-ci-key

# Afficher la clé publique (à ajouter au VPS)
cat gitlab-ci-key.pub
```

---

## 🖥️ Configuration du serveur VPS

### 1. Installation initiale

```bash
# Connexion au VPS
ssh root@votre-vps-ip

# Mise à jour du système
apt update && apt upgrade -y

# Installation de Docker
curl -fsSL https://get.docker.com -o get-docker.sh
sh get-docker.sh

# Installation de Docker Compose
apt install docker-compose-plugin -y

# Vérification
docker --version
docker compose version
```

### 2. Configuration de l'utilisateur

```bash
# Créer un utilisateur (si vous utilisez root, ignorez cette étape)
adduser ubuntu
usermod -aG docker ubuntu
usermod -aG sudo ubuntu

# Passer à l'utilisateur
su - ubuntu
```

### 3. Configuration SSH

```bash
# Créer le dossier .ssh
mkdir -p ~/.ssh
chmod 700 ~/.ssh

# Ajouter la clé publique GitLab
nano ~/.ssh/authorized_keys
# Coller le contenu de gitlab-ci-key.pub
chmod 600 ~/.ssh/authorized_keys
```

### 4. Structure des dossiers

```bash
# Créer les dossiers pour staging
sudo mkdir -p /var/www/covoiturage-backend-staging
sudo chown -R ubuntu:ubuntu /var/www/covoiturage-backend-staging
cd /var/www/covoiturage-backend-staging

# Créer le fichier .env.staging
nano .env.staging
# Coller le contenu de .env.staging.example et configurer

# Télécharger docker-compose.staging.yml
wget https://raw.githubusercontent.com/votre-repo/main/docker-compose.staging.yml

# Même chose pour production
sudo mkdir -p /var/www/covoiturage-backend-production
sudo chown -R ubuntu:ubuntu /var/www/covoiturage-backend-production
cd /var/www/covoiturage-backend-production
nano .env.production
wget https://raw.githubusercontent.com/votre-repo/main/docker-compose.prod.yml
```

### 5. Fichier serviceAccountKey.json

```bash
# Copier le fichier Firebase sur le serveur
# Sur votre machine locale:
scp config/serviceAccountKey.json ubuntu@votre-vps:/var/www/covoiturage-backend-staging/config/
scp config/serviceAccountKey.json ubuntu@votre-vps:/var/www/covoiturage-backend-production/config/
```

### 6. Configuration Nginx (optionnel mais recommandé)

```bash
# Créer le dossier nginx
mkdir -p nginx/ssl

# Configuration Nginx pour staging
nano nginx/staging.conf
```

**Contenu de staging.conf:**

```nginx
events {
    worker_connections 1024;
}

http {
    upstream backend {
        server app:5500;
    }

    server {
        listen 80;
        server_name api-staging.covoiturage-ci.com;

        location / {
            proxy_pass http://backend;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection 'upgrade';
            proxy_set_header Host $host;
            proxy_cache_bypass $http_upgrade;
            proxy_set_header X-Real-IP $remote_addr;
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
            proxy_set_header X-Forwarded-Proto $scheme;
        }
    }
}
```

### 7. Configuration SSL avec Let's Encrypt

```bash
# Installer Certbot
sudo apt install certbot python3-certbot-nginx -y

# Obtenir un certificat SSL
sudo certbot --nginx -d api-staging.covoiturage-ci.com
sudo certbot --nginx -d api.covoiturage-ci.com

# Auto-renouvellement (ajouté automatiquement)
sudo certbot renew --dry-run
```

---

## 📊 Workflows de déploiement

### Workflow Feature Branch

```bash
# Créer une branche feature
git checkout -b feature/nouvelle-fonctionnalite

# Développer et commiter
git add .
git commit -m "feat: ajout de nouvelle fonctionnalité"

# Pousser
git push origin feature/nouvelle-fonctionnalite
```

**Pipeline GitLab:**
1. ✅ Tests automatiques
2. ✅ Lint du code
3. ❌ Pas de build ni déploiement

### Workflow Staging (develop)

```bash
# Merger dans develop
git checkout develop
git merge feature/nouvelle-fonctionnalite
git push origin develop
```

**Pipeline GitLab:**
1. ✅ Tests
2. ✅ Lint
3. ✅ Build image Docker (tag: staging)
4. ✅ Déploiement automatique sur VPS staging
5. ✅ Health check

### Workflow Production (main)

```bash
# Merger dans main
git checkout main
git merge develop
git push origin main
```

**Pipeline GitLab:**
1. ✅ Tests
2. ✅ Audit de sécurité
3. ✅ Build image Docker (tags: prod, latest)
4. ⏸️ Déploiement MANUEL (bouton à cliquer)
5. ✅ Health check
6. ✅ Rollback disponible

---

## 🔍 Monitoring et maintenance

### Health Check de l'application

Ajoutez dans `app.js`:

```javascript
// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV
  });
});
```

### Monitoring des logs

```bash
# Logs en temps réel
docker compose logs -f app

# Dernières 100 lignes
docker compose logs --tail=100 app

# Logs d'erreur uniquement
docker compose logs app | grep ERROR

# Exporter les logs
docker compose logs app > logs-$(date +%Y%m%d).txt
```

### Surveillance des ressources

```bash
# Stats des conteneurs
docker stats

# Espace disque
df -h

# Nettoyage Docker
docker system prune -a
docker volume prune
```

### Backup de la base de données

Créez `scripts/backup.js`:

```javascript
const { exec } = require('child_process');
const path = require('path');

const timestamp = new Date().toISOString().replace(/:/g, '-');
const backupDir = path.join(__dirname, '../backups');
const backupFile = path.join(backupDir, `backup-${timestamp}.gz`);

const mongoUri = process.env.MONGODB_URI;

exec(`mongodump --uri="${mongoUri}" --archive=${backupFile} --gzip`, (error, stdout, stderr) => {
  if (error) {
    console.error(`❌ Backup failed: ${error}`);
    return;
  }
  console.log(`✅ Backup created: ${backupFile}`);
});
```

### Automatiser les backups

```bash
# Ajouter un cron job sur le VPS
crontab -e

# Backup quotidien à 2h du matin
0 2 * * * cd /var/www/covoiturage-backend-production && docker compose exec -T app node scripts/backup.js
```

---

## 🐛 Troubleshooting

### Problème: Le conteneur ne démarre pas

```bash
# Voir les logs détaillés
docker compose logs app

# Vérifier la configuration
docker compose config

# Redémarrer complètement
docker compose down
docker compose up -d --force-recreate
```

### Problème: Erreur de connexion MongoDB

```bash
# Vérifier que MongoDB est accessible
docker compose exec app ping mongo

# Tester la connexion
docker compose exec app node -e "
  const mongoose = require('mongoose');
  mongoose.connect(process.env.MONGODB_URI)
    .then(() => console.log('✅ Connected'))
    .catch(err => console.error('❌', err));
"
```

### Problème: Le pipeline GitLab échoue

1. **Erreur SSH:**
   - Vérifier que la clé SSH est correcte dans les variables
   - Vérifier que la clé publique est dans `~/.ssh/authorized_keys` du VPS

2. **Erreur Docker login:**
   - Vérifier `REGISTRY_USER` et `REGISTRY_PASSWORD`
   - Régénérer le token si nécessaire

3. **Tests échouent:**
   - Vérifier que les tests passent en local
   - Regarder les logs dans GitLab CI/CD > Pipelines

### Problème: Application inaccessible après déploiement

```bash
# Vérifier que le conteneur tourne
docker ps

# Vérifier les ports
netstat -tulpn | grep 5500

# Tester en local sur le VPS
curl http://localhost:5500/health

# Vérifier les logs Nginx
docker compose logs nginx
```

### Rollback rapide

```bash
# Voir les images disponibles
docker images | grep covoiturage

# Modifier docker-compose pour pointer vers une ancienne version
# Par exemple: image: registry.gitlab.com/user/project:staging-abc123

# Redéployer
docker compose up -d --force-recreate
```

---

## 📝 Checklist de déploiement

### Avant le premier déploiement

- [ ] Docker et Docker Compose installés sur le VPS
- [ ] Clés SSH configurées (GitLab ↔ VPS)
- [ ] Variables CI/CD configurées dans GitLab
- [ ] Fichiers `.env.staging` et `.env.production` créés sur le VPS
- [ ] `serviceAccountKey.json` copié sur le VPS
- [ ] Domaines DNS configurés (optionnel)
- [ ] Certificats SSL générés (optionnel)
- [ ] Backup automatique configuré

### À chaque déploiement

- [ ] Tests passent en local
- [ ] Code review effectué
- [ ] CHANGELOG.md mis à jour
- [ ] Variables d'environnement vérifiées
- [ ] Backup de la base de données effectué
- [ ] Pipeline GitLab réussie
- [ ] Health check vérifié après déploiement
- [ ] Tests manuels en staging
- [ ] Monitoring des logs pendant 10 minutes

---

## 🎯 Commandes rapides

```bash
# LOCAL
docker compose up -d              # Démarrer
docker compose logs -f app        # Logs
docker compose exec app sh        # Shell dans le conteneur
docker compose down               # Arrêter

# VPS - Staging
cd /var/www/covoiturage-backend-staging
docker compose -f docker-compose.staging.yml up -d
docker compose -f docker-compose.staging.yml logs -f

# VPS - Production
cd /var/www/covoiturage-backend-production
docker compose -f docker-compose.prod.yml up -d
docker compose -f docker-compose.prod.yml logs -f

# Monitoring
docker stats
docker ps
docker logs <container_id>

# Nettoyage
docker system prune -a
docker volume prune
```

---

## 📚 Ressources

- [Documentation Docker](https://docs.docker.com/)
- [Documentation GitLab CI/CD](https://docs.gitlab.com/ee/ci/)
- [Docker Compose Reference](https://docs.docker.com/compose/compose-file/)
- [Node.js Best Practices](https://github.com/goldbergyoni/nodebestpractices)

---

**✅ Votre CI/CD est maintenant prêt !**

Pour toute question ou problème, consultez d'abord la section Troubleshooting ou ouvrez une issue sur GitLab.
