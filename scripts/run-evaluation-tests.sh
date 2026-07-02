#!/bin/bash
# scripts/run-evaluation-tests.sh
# Script d'exécution des tests du module Évaluation
# Usage: bash scripts/run-evaluation-tests.sh [option]

set -e

# Couleurs pour l'output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Afficher les options disponibles
show_help() {
  cat << EOF
${BLUE}╔════════════════════════════════════════════════════╗
║   Tests du Module Évaluation - Script d'Exécution    ║
╚════════════════════════════════════════════════════╝${NC}

Usage: bash scripts/run-evaluation-tests.sh [option]

Options disponibles:
  ${GREEN}all${NC}              Exécute tous les tests
  ${GREEN}service${NC}           Tests unitaires du Service (230+ cas)
  ${GREEN}controller${NC}        Tests unitaires du Contrôleur (180+ cas)
  ${GREEN}model${NC}             Tests unitaires du Modèle (150+ cas)
  ${GREEN}integration${NC}       Tests d'intégration (200+ cas)
  
  ${GREEN}coverage${NC}          Génère un rapport de couverture
  ${GREEN}watch${NC}             Mode watch (relance auto)
  ${GREEN}debug${NC}             Mode debug avec breakpoints
  
  ${GREEN}quick${NC}             Tests rapides (pas d'intégration)
  ${GREEN}verbose${NC}           Résultat détaillé de tous les tests
  ${GREEN}json${NC}              Export résultats en JSON
  
  ${GREEN}clean${NC}             Nettoie les fichiers temporaires
  ${GREEN}help${NC}              Affiche cette aide

Exemples:
  bash scripts/run-evaluation-tests.sh all
  bash scripts/run-evaluation-tests.sh service --verbose
  bash scripts/run-evaluation-tests.sh coverage
  bash scripts/run-evaluation-tests.sh watch

EOF
}

# Vérifier les prérequis
check_requirements() {
  echo -e "${BLUE}🔍 Vérification des prérequis...${NC}"
  
  # Vérifier Node.js
  if ! command -v node &> /dev/null; then
    echo -e "${RED}❌ Node.js n'est pas installé${NC}"
    exit 1
  fi
  echo -e "${GREEN}✅ Node.js ${NC}$(node --version)"
  
  # Vérifier npm
  if ! command -v npm &> /dev/null; then
    echo -e "${RED}❌ npm n'est pas installé${NC}"
    exit 1
  fi
  echo -e "${GREEN}✅ npm ${NC}$(npm --version)"
  
  # Vérifier les dépendances
  if [ ! -d "node_modules" ]; then
    echo -e "${YELLOW}⚠️  node_modules n'existe pas, installation...${NC}"
    npm install --silent
  fi
  echo -e "${GREEN}✅ Dépendances OK${NC}"
}

# Nettoyer temporaires
cleanup() {
  echo -e "${BLUE}🧹 Nettoyage...${NC}"
  rm -rf coverage
  rm -rf .nyc_output
  rm -f test-results.json
  echo -e "${GREEN}✅ Nettoyage complété${NC}"
}

# Afficher le résumé
show_summary() {
  local test_count=$1
  local pass_count=$2
  local fail_count=$3
  local duration=$4
  
  echo ""
  echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║              RÉSUMÉ DES TESTS                     ║${NC}"
  echo -e "${BLUE}╠════════════════════════════════════════════════════╣${NC}"
  
  if [ "$fail_count" -eq 0 ]; then
    echo -e "${BLUE}║${NC} ${GREEN}✅ TOUS LES TESTS PASSÉS${NC}"
    echo -e "${BLUE}║${NC}"
    echo -e "${BLUE}║${NC} Nombre de tests:  $test_count"
    echo -e "${BLUE}║${NC} Succès:          ${GREEN}$pass_count${NC}"
    echo -e "${BLUE}║${NC} Échecs:          ${GREEN}0${NC}"
    echo -e "${BLUE}║${NC} Durée:           ${duration}s"
  else
    echo -e "${BLUE}║${NC} ${RED}❌ CERTAINS TESTS ONT ÉCHOUÉ${NC}"
    echo -e "${BLUE}║${NC}"
    echo -e "${BLUE}║${NC} Nombre de tests:  $test_count"
    echo -e "${BLUE}║${NC} Succès:          ${GREEN}$pass_count${NC}"
    echo -e "${BLUE}║${NC} Échecs:          ${RED}$fail_count${NC}"
    echo -e "${BLUE}║${NC} Durée:           ${duration}s"
  fi
  
  echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}"
  echo ""
}

# Exécuter tous les tests
run_all() {
  echo -e "${BLUE}🧪 Exécution de TOUS les tests...${NC}\n"
  npm test -- --verbose --colors 2>&1
}

# Tests Service
run_service() {
  echo -e "${BLUE}🧪 Tests Unitaires du SERVICE (230+ cas)${NC}\n"
  npm test -- evaluation.service.unit.test.js --verbose --colors 2>&1
}

# Tests Contrôleur
run_controller() {
  echo -e "${BLUE}🧪 Tests Unitaires du CONTRÔLEUR (180+ cas)${NC}\n"
  npm test -- evaluation.controller.unit.test.js --verbose --colors 2>&1
}

# Tests Modèle
run_model() {
  echo -e "${BLUE}🧪 Tests Unitaires du MODÈLE (150+ cas)${NC}\n"
  npm test -- evaluation.model.unit.test.js --verbose --colors 2>&1
}

# Tests Intégration
run_integration() {
  echo -e "${BLUE}🧪 Tests d'INTÉGRATION (200+ cas)${NC}\n"
  npm test -- evaluation.integration.test.js --verbose --colors 2>&1
}

# Tests rapides (sans intégration)
run_quick() {
  echo -e "${BLUE}⚡ Tests RAPIDES (sans intégration)${NC}\n"
  npm test -- \
    evaluation.service.unit.test.js \
    evaluation.controller.unit.test.js \
    evaluation.model.unit.test.js \
    --colors 2>&1
}

# Couverture
run_coverage() {
  echo -e "${BLUE}📊 Génération du rapport de COUVERTURE...${NC}\n"
  npm run test:coverage -- --colors 2>&1
  
  if [ -f "coverage/lcov-report/index.html" ]; then
    echo -e "\n${GREEN}✅ Rapport HTML généré: coverage/lcov-report/index.html${NC}"
    if command -v open &> /dev/null; then
      open coverage/lcov-report/index.html
    fi
  fi
}

# Watch mode
run_watch() {
  echo -e "${BLUE}👀 Mode WATCH (relance automatique)${NC}\n"
  npm run test:watch -- --colors 2>&1
}

# Debug mode
run_debug() {
  echo -e "${BLUE}🐛 Mode DEBUG${NC}\n"
  echo "Ouvrir chrome://inspect dans votre navigateur"
  echo ""
  node --inspect-brk node_modules/.bin/jest --runInBand 2>&1
}

# Export JSON
run_json() {
  echo -e "${BLUE}📝 Exécution et export JSON...${NC}\n"
  npm test -- --json --outputFile=test-results.json 2>&1 || true
  
  if [ -f "test-results.json" ]; then
    echo -e "${GREEN}✅ Résultats exportés: test-results.json${NC}"
    echo ""
    echo "Contenu du fichier:"
    cat test-results.json | jq '.' 2>/dev/null || cat test-results.json
  fi
}

# Afficher statistiques
show_stats() {
  echo -e "\n${BLUE}📈 STATISTIQUES${NC}\n"
  
  files_count=$(find test -name "*evaluation*.test.js" | wc -l)
  test_count=$(grep -r "it('\\|it.only(" test/evaluation*.test.js 2>/dev/null | wc -l)
  
  echo -e "Fichiers de test:     ${GREEN}$files_count${NC}"
  echo -e "Cas de test:          ${GREEN}$test_count${NC}"
  echo -e "Couverture cible:     ${GREEN}85%${NC}"
  echo -e "Temps exécution:      ~30 secondes"
}

# Main script
main() {
  local option="${1:-help}"
  
  # Afficher l'en-tête
  echo -e "${BLUE}╔════════════════════════════════════════════════════╗${NC}"
  echo -e "${BLUE}║   🧪 Tests du Module Évaluation                   ║${NC}"
  echo -e "${BLUE}╚════════════════════════════════════════════════════╝${NC}\n"
  
  case "$option" in
    all)
      check_requirements
      run_all
      ;;
    service)
      check_requirements
      run_service
      ;;
    controller)
      check_requirements
      run_controller
      ;;
    model)
      check_requirements
      run_model
      ;;
    integration)
      check_requirements
      run_integration
      ;;
    quick)
      check_requirements
      run_quick
      ;;
    coverage)
      check_requirements
      cleanup
      run_coverage
      ;;
    watch)
      check_requirements
      run_watch
      ;;
    debug)
      check_requirements
      run_debug
      ;;
    json)
      check_requirements
      run_json
      ;;
    verbose)
      check_requirements
      npm test -- --verbose --colors --detectOpenHandles 2>&1
      ;;
    clean)
      cleanup
      ;;
    help)
      show_help
      show_stats
      ;;
    *)
      echo -e "${RED}❌ Option non reconnue: $option${NC}"
      show_help
      exit 1
      ;;
  esac
}

# Exécuter le script
main "$@"
