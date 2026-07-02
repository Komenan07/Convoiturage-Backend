# 🚀 Script d'aide pour les commandes Docker et CI/CD courantes
# Usage: .\docker-helper.ps1 [commande]

param(
    [Parameter(Position=0)]
    [string]$Command = "help"
)

# Couleurs
function Write-ColorOutput($ForegroundColor) {
    $fc = $host.UI.RawUI.ForegroundColor
    $host.UI.RawUI.ForegroundColor = $ForegroundColor
    if ($args) {
        Write-Output $args
    }
    $host.UI.RawUI.ForegroundColor = $fc
}

function Show-Help {
    Write-ColorOutput Blue "=== 🐳 Docker Helper - Covoiturage Backend ==="
    Write-Output ""
    Write-Output "Usage: .\docker-helper.ps1 [commande]"
    Write-Output ""
    Write-ColorOutput Green "LOCAL:"
    Write-Output "  start           - Démarrer l'environnement de développement"
    Write-Output "  stop            - Arrêter l'environnement"
    Write-Output "  restart         - Redémarrer l'environnement"
    Write-Output "  logs            - Voir les logs en temps réel"
    Write-Output "  shell           - Ouvrir un shell dans le conteneur app"
    Write-Output "  rebuild         - Reconstruire les images"
    Write-Output "  clean           - Nettoyer tous les conteneurs et volumes"
    Write-Output ""
    Write-ColorOutput Green "TESTS:"
    Write-Output "  test            - Exécuter les tests"
    Write-Output "  lint            - Exécuter le linter"
    Write-Output "  coverage        - Générer le rapport de couverture"
    Write-Output ""
    Write-ColorOutput Green "BASE DE DONNÉES:"
    Write-Output "  mongo           - Ouvrir le shell MongoDB"
    Write-Output "  redis           - Ouvrir le shell Redis"
    Write-Output "  backup          - Créer un backup de la base"
    Write-Output "  seed            - Remplir la base avec des données de test"
    Write-Output ""
    Write-ColorOutput Green "MONITORING:"
    Write-Output "  stats           - Voir les stats des conteneurs"
    Write-Output "  health          - Vérifier le health status"
    Write-Output "  ps              - Lister les conteneurs actifs"
    Write-Output ""
}

function Start-Dev {
    Write-ColorOutput Green "🚀 Démarrage de l'environnement de développement..."
    docker compose up -d
    Write-ColorOutput Green "✅ Environnement démarré!"
    Write-ColorOutput Blue "API: http://localhost:5500"
    Write-ColorOutput Blue "Mongo Express: http://localhost:8081"
}

function Stop-Dev {
    Write-ColorOutput Yellow "⏹️  Arrêt de l'environnement..."
    docker compose down
    Write-ColorOutput Green "✅ Environnement arrêté!"
}

function Restart-Dev {
    Write-ColorOutput Yellow "🔄 Redémarrage de l'environnement..."
    docker compose restart
    Write-ColorOutput Green "✅ Environnement redémarré!"
}

function Show-Logs {
    Write-ColorOutput Blue "📋 Logs en temps réel (Ctrl+C pour quitter)..."
    docker compose logs -f
}

function Open-Shell {
    Write-ColorOutput Blue "🐚 Ouverture du shell dans le conteneur..."
    docker compose exec app sh
}

function Rebuild {
    Write-ColorOutput Yellow "🔨 Reconstruction des images..."
    docker compose build --no-cache
    docker compose up -d
    Write-ColorOutput Green "✅ Images reconstruites et redémarrées!"
}

function Clean-All {
    Write-ColorOutput Red "⚠️  ATTENTION: Cette action va supprimer tous les conteneurs et volumes!"
    $confirmation = Read-Host "Êtes-vous sûr? (y/N)"
    if ($confirmation -eq 'y' -or $confirmation -eq 'Y') {
        docker compose down -v
        docker system prune -af
        Write-ColorOutput Green "✅ Nettoyage terminé!"
    } else {
        Write-ColorOutput Yellow "❌ Opération annulée"
    }
}

function Run-Tests {
    Write-ColorOutput Blue "🧪 Exécution des tests..."
    docker compose exec app npm test
}

function Run-Lint {
    Write-ColorOutput Blue "🔍 Exécution du linter..."
    docker compose exec app npm run lint
}

function Run-Coverage {
    Write-ColorOutput Blue "📊 Génération du rapport de couverture..."
    docker compose exec app npm run test:coverage
}

function Mongo-Shell {
    Write-ColorOutput Blue "🍃 Ouverture du shell MongoDB..."
    docker compose exec mongo mongosh -u admin -p admin123
}

function Redis-Shell {
    Write-ColorOutput Blue "🔴 Ouverture du shell Redis..."
    docker compose exec redis redis-cli -a redis123
}

function Backup-DB {
    Write-ColorOutput Blue "💾 Création d'un backup..."
    docker compose exec app node scripts/backup.js
}

function Seed-DB {
    Write-ColorOutput Blue "🌱 Remplissage de la base de données..."
    docker compose exec app npm run seed
}

function Show-Stats {
    Write-ColorOutput Blue "📊 Statistiques des conteneurs..."
    docker stats --no-stream
}

function Check-Health {
    Write-ColorOutput Blue "🏥 Vérification du health status..."
    try {
        $response = Invoke-RestMethod -Uri "http://localhost:5500/health"
        $response | ConvertTo-Json
    } catch {
        Write-ColorOutput Red "❌ Erreur lors de la vérification du health check"
    }
}

function Show-PS {
    Write-ColorOutput Blue "📋 Conteneurs actifs..."
    docker compose ps
}

# Router les commandes
switch ($Command.ToLower()) {
    "start" { Start-Dev }
    "stop" { Stop-Dev }
    "restart" { Restart-Dev }
    "logs" { Show-Logs }
    "shell" { Open-Shell }
    "rebuild" { Rebuild }
    "clean" { Clean-All }
    "test" { Run-Tests }
    "lint" { Run-Lint }
    "coverage" { Run-Coverage }
    "mongo" { Mongo-Shell }
    "redis" { Redis-Shell }
    "backup" { Backup-DB }
    "seed" { Seed-DB }
    "stats" { Show-Stats }
    "health" { Check-Health }
    "ps" { Show-PS }
    default { Show-Help }
}
