#!/bin/bash

# 🚀 Script d'aide pour les commandes Docker et CI/CD courantes
# Usage: ./docker-helper.sh [commande]

set -e

# Couleurs pour les messages
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Fonction d'aide
show_help() {
    echo -e "${BLUE}=== 🐳 Docker Helper - Covoiturage Backend ===${NC}"
    echo ""
    echo "Usage: ./docker-helper.sh [commande]"
    echo ""
    echo "Commandes disponibles:"
    echo ""
    echo -e "${GREEN}LOCAL:${NC}"
    echo "  start           - Démarrer l'environnement de développement"
    echo "  stop            - Arrêter l'environnement"
    echo "  restart         - Redémarrer l'environnement"
    echo "  logs            - Voir les logs en temps réel"
    echo "  shell           - Ouvrir un shell dans le conteneur app"
    echo "  rebuild         - Reconstruire les images"
    echo "  clean           - Nettoyer tous les conteneurs et volumes"
    echo ""
    echo -e "${GREEN}TESTS:${NC}"
    echo "  test            - Exécuter les tests"
    echo "  lint            - Exécuter le linter"
    echo "  coverage        - Générer le rapport de couverture"
    echo ""
    echo -e "${GREEN}BASE DE DONNÉES:${NC}"
    echo "  mongo           - Ouvrir le shell MongoDB"
    echo "  redis           - Ouvrir le shell Redis"
    echo "  backup          - Créer un backup de la base"
    echo "  seed            - Remplir la base avec des données de test"
    echo ""
    echo -e "${GREEN}MONITORING:${NC}"
    echo "  stats           - Voir les stats des conteneurs"
    echo "  health          - Vérifier le health status"
    echo "  ps              - Lister les conteneurs actifs"
    echo ""
    echo -e "${GREEN}PRODUCTION:${NC}"
    echo "  deploy-staging  - Déployer sur staging (depuis VPS)"
    echo "  deploy-prod     - Déployer sur production (depuis VPS)"
    echo "  logs-staging    - Voir les logs staging (depuis VPS)"
    echo "  logs-prod       - Voir les logs production (depuis VPS)"
    echo ""
}

# Commandes locales
start_dev() {
    echo -e "${GREEN}🚀 Démarrage de l'environnement de développement...${NC}"
    docker compose up -d
    echo -e "${GREEN}✅ Environnement démarré!${NC}"
    echo -e "${BLUE}API: http://localhost:5500${NC}"
    echo -e "${BLUE}Mongo Express: http://localhost:8081${NC}"
}

stop_dev() {
    echo -e "${YELLOW}⏹️  Arrêt de l'environnement...${NC}"
    docker compose down
    echo -e "${GREEN}✅ Environnement arrêté!${NC}"
}

restart_dev() {
    echo -e "${YELLOW}🔄 Redémarrage de l'environnement...${NC}"
    docker compose restart
    echo -e "${GREEN}✅ Environnement redémarré!${NC}"
}

show_logs() {
    echo -e "${BLUE}📋 Logs en temps réel (Ctrl+C pour quitter)...${NC}"
    docker compose logs -f
}

open_shell() {
    echo -e "${BLUE}🐚 Ouverture du shell dans le conteneur...${NC}"
    docker compose exec app sh
}

rebuild() {
    echo -e "${YELLOW}🔨 Reconstruction des images...${NC}"
    docker compose build --no-cache
    docker compose up -d
    echo -e "${GREEN}✅ Images reconstruites et redémarrées!${NC}"
}

clean_all() {
    echo -e "${RED}⚠️  ATTENTION: Cette action va supprimer tous les conteneurs et volumes!${NC}"
    read -p "Êtes-vous sûr? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        docker compose down -v
        docker system prune -af
        echo -e "${GREEN}✅ Nettoyage terminé!${NC}"
    else
        echo -e "${YELLOW}❌ Opération annulée${NC}"
    fi
}

# Tests
run_tests() {
    echo -e "${BLUE}🧪 Exécution des tests...${NC}"
    docker compose exec app npm test
}

run_lint() {
    echo -e "${BLUE}🔍 Exécution du linter...${NC}"
    docker compose exec app npm run lint
}

run_coverage() {
    echo -e "${BLUE}📊 Génération du rapport de couverture...${NC}"
    docker compose exec app npm run test:coverage
}

# Base de données
mongo_shell() {
    echo -e "${BLUE}🍃 Ouverture du shell MongoDB...${NC}"
    docker compose exec mongo mongosh -u admin -p admin123
}

redis_shell() {
    echo -e "${BLUE}🔴 Ouverture du shell Redis...${NC}"
    docker compose exec redis redis-cli -a redis123
}

backup_db() {
    echo -e "${BLUE}💾 Création d'un backup...${NC}"
    docker compose exec app node scripts/backup.js
}

seed_db() {
    echo -e "${BLUE}🌱 Remplissage de la base de données...${NC}"
    docker compose exec app npm run seed
}

# Monitoring
show_stats() {
    echo -e "${BLUE}📊 Statistiques des conteneurs...${NC}"
    docker stats --no-stream
}

check_health() {
    echo -e "${BLUE}🏥 Vérification du health status...${NC}"
    curl -s http://localhost:5500/health | jq '.' || curl http://localhost:5500/health
}

show_ps() {
    echo -e "${BLUE}📋 Conteneurs actifs...${NC}"
    docker compose ps
}

# Production (à exécuter depuis le VPS)
deploy_staging() {
    echo -e "${BLUE}🚀 Déploiement staging...${NC}"
    cd /var/www/covoiturage-backend-staging
    docker compose -f docker-compose.staging.yml pull
    docker compose -f docker-compose.staging.yml up -d --force-recreate
    echo -e "${GREEN}✅ Staging déployé!${NC}"
}

deploy_prod() {
    echo -e "${RED}⚠️  Déploiement en PRODUCTION${NC}"
    read -p "Êtes-vous sûr de vouloir déployer en production? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        cd /var/www/covoiturage-backend-production
        docker compose -f docker-compose.prod.yml pull
        docker compose -f docker-compose.prod.yml up -d --force-recreate
        echo -e "${GREEN}✅ Production déployée!${NC}"
    else
        echo -e "${YELLOW}❌ Déploiement annulé${NC}"
    fi
}

logs_staging() {
    cd /var/www/covoiturage-backend-staging
    docker compose -f docker-compose.staging.yml logs -f
}

logs_prod() {
    cd /var/www/covoiturage-backend-production
    docker compose -f docker-compose.prod.yml logs -f
}

# Router les commandes
case "$1" in
    start)
        start_dev
        ;;
    stop)
        stop_dev
        ;;
    restart)
        restart_dev
        ;;
    logs)
        show_logs
        ;;
    shell)
        open_shell
        ;;
    rebuild)
        rebuild
        ;;
    clean)
        clean_all
        ;;
    test)
        run_tests
        ;;
    lint)
        run_lint
        ;;
    coverage)
        run_coverage
        ;;
    mongo)
        mongo_shell
        ;;
    redis)
        redis_shell
        ;;
    backup)
        backup_db
        ;;
    seed)
        seed_db
        ;;
    stats)
        show_stats
        ;;
    health)
        check_health
        ;;
    ps)
        show_ps
        ;;
    deploy-staging)
        deploy_staging
        ;;
    deploy-prod)
        deploy_prod
        ;;
    logs-staging)
        logs_staging
        ;;
    logs-prod)
        logs_prod
        ;;
    *)
        show_help
        ;;
esac
