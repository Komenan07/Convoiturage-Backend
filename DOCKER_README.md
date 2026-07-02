# 🐳 Docker Quick Start

## Démarrage rapide

```bash
# Développement local
docker compose up -d

# Voir les logs
docker compose logs -f

# Accéder au conteneur
docker compose exec app sh

# Arrêter
docker compose down
```

## Services disponibles

- **API**: http://localhost:5500
- **MongoDB**: localhost:27017
- **Mongo Express**: http://localhost:8081
- **Redis**: localhost:6379

## Documentation complète

Voir [GUIDE_CICD_DOCKER.md](./GUIDE_CICD_DOCKER.md) pour la documentation complète du CI/CD et du déploiement.
