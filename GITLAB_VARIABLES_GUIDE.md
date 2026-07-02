# 🔧 Variables CI/CD GitLab - Guide de Configuration

## 📍 Où configurer les variables

**GitLab** → Votre Projet → **Settings** → **CI/CD** → **Variables**

## 🔐 Variables requises

### 1. Registry GitLab

| Variable | Valeur | Type | Protected | Masked | Environnements |
|----------|--------|------|-----------|--------|----------------|
| `REGISTRY_USER` | Votre username GitLab | Variable | ✅ | ❌ | Tous |
| `REGISTRY_PASSWORD` | Token d'accès GitLab | Variable | ✅ | ✅ | Tous |

**Comment obtenir le token:**
1. GitLab → Settings → Access Tokens
2. Nom: `ci-cd-registry`
3. Scopes: `read_registry`, `write_registry`
4. Expiration: 1 an
5. Copier le token généré

### 2. Accès VPS

| Variable | Valeur | Type | Protected | Masked | Environnements |
|----------|--------|------|-----------|--------|----------------|
| `VPS_HOST` | `123.45.67.89` ou `vps.example.com` | Variable | ✅ | ❌ | Tous |
| `VPS_USER` | `ubuntu` ou `root` | Variable | ✅ | ❌ | Tous |
| `SSH_PRIVATE_KEY` | Clé privée SSH | File | ✅ | ✅ | Tous |

**Générer la clé SSH:**

```bash
# Sur votre machine locale
ssh-keygen -t ed25519 -C "gitlab-ci@covoiturage" -f gitlab-ci-key

# Afficher la clé privée (à copier dans GITLAB)
cat gitlab-ci-key

# Afficher la clé publique (à copier sur le VPS)
cat gitlab-ci-key.pub
```

**Ajouter la clé publique au VPS:**

```bash
# Se connecter au VPS
ssh root@votre-vps-ip

# Ajouter la clé publique
mkdir -p ~/.ssh
nano ~/.ssh/authorized_keys
# Coller le contenu de gitlab-ci-key.pub
chmod 600 ~/.ssh/authorized_keys
chmod 700 ~/.ssh
```

### 3. Variables optionnelles (recommandées)

| Variable | Valeur | Description |
|----------|--------|-------------|
| `SENTRY_DSN` | URL Sentry | Pour le monitoring d'erreurs |
| `SLACK_WEBHOOK` | URL Webhook Slack | Notifications de déploiement |
| `DOCKER_BUILDKIT` | `1` | Active BuildKit pour builds plus rapides |

## 📋 Exemple de configuration complète

```yaml
# Dans GitLab → Settings → CI/CD → Variables

# 1. Registry
REGISTRY_USER: "votre-username"
REGISTRY_PASSWORD: "glpat-xxxxxxxxxxxxxxxxxxxx"

# 2. VPS Access
VPS_HOST: "123.45.67.89"
VPS_USER: "ubuntu"
SSH_PRIVATE_KEY: |
  -----BEGIN OPENSSH PRIVATE KEY-----
  b3BlbnNzaC1rZXktdjEAAAAABG5vbmUAAAAEbm9uZQAAAAAAAAABAAAAMwAAAAtz
  ...
  -----END OPENSSH PRIVATE KEY-----

# 3. Optionnel
SENTRY_DSN: "https://xxxxx@sentry.io/xxxxx"
DOCKER_BUILDKIT: "1"
```

## 🔍 Vérification des variables

### Test de connexion Registry

```bash
# Localement
docker login -u "$REGISTRY_USER" -p "$REGISTRY_PASSWORD" registry.gitlab.com
```

### Test de connexion SSH

```bash
# Localement avec la clé générée
ssh -i gitlab-ci-key $VPS_USER@$VPS_HOST "echo 'SSH fonctionne!'"
```

## 🌍 Variables par environnement

GitLab CI/CD permet de définir des variables spécifiques par environnement.

### Staging

```yaml
# Dans .gitlab-ci.yml
deploy_staging:
  environment:
    name: staging
    url: https://api-staging.covoiturage-ci.com
  variables:
    DEPLOY_ENV: "staging"
```

Variables dans GitLab pour l'environnement `staging`:
- Aller dans Settings → CI/CD → Variables
- Cliquer sur "Add variable"
- Sélectionner "Environment scope" → `staging`

| Variable | Valeur | Scope |
|----------|--------|-------|
| `VPS_HOST` | `staging-vps.example.com` | staging |
| `DEPLOY_PATH` | `/var/www/covoiturage-backend-staging` | staging |

### Production

Variables pour l'environnement `production`:

| Variable | Valeur | Scope |
|----------|--------|-------|
| `VPS_HOST` | `prod-vps.example.com` | production |
| `DEPLOY_PATH` | `/var/www/covoiturage-backend-production` | production |

## 🔄 Variables dynamiques dans le pipeline

Le pipeline GitLab fournit aussi des variables prédéfinies:

```yaml
# Variables automatiques disponibles
- $CI_COMMIT_SHA          # Hash du commit
- $CI_COMMIT_SHORT_SHA    # Hash court
- $CI_COMMIT_BRANCH       # Nom de la branche
- $CI_PROJECT_PATH        # chemin/projet
- $CI_REGISTRY_IMAGE      # Image registry complète
- $CI_PIPELINE_ID         # ID du pipeline
```

Exemple d'utilisation:

```yaml
build_staging:
  script:
    - echo "Building for commit $CI_COMMIT_SHORT_SHA"
    - docker build -t registry.gitlab.com/$CI_PROJECT_PATH:staging-$CI_COMMIT_SHORT_SHA .
```

## 🛡️ Bonnes pratiques

### 1. Protected Variables

✅ **À protéger (Protected = true):**
- Toutes les variables de production
- Credentials (passwords, tokens, keys)
- Variables sensibles

❌ **À ne pas protéger:**
- Variables de configuration générale
- URLs publiques

### 2. Masked Variables

✅ **À masquer (Masked = true):**
- Mots de passe
- Tokens
- Clés API
- Secrets

❌ **À ne pas masquer:**
- URLs
- Usernames
- Chemins de fichiers

### 3. Sécurité

```yaml
# ✅ BON: Variable masquée
GITLAB_TOKEN: "glpat-xxxxxxxxxxxx"  # Masked

# ❌ MAUVAIS: Clé en clair dans le code
API_KEY: "hardcoded-key-in-gitlab-ci-yml"
```

## 📝 Checklist de configuration

Avant le premier déploiement, vérifiez:

- [ ] `REGISTRY_USER` configuré et testé
- [ ] `REGISTRY_PASSWORD` configuré (token avec read/write registry)
- [ ] Clé SSH générée (`gitlab-ci-key`)
- [ ] Clé publique ajoutée au VPS (`~/.ssh/authorized_keys`)
- [ ] Clé privée ajoutée dans GitLab (`SSH_PRIVATE_KEY`)
- [ ] `VPS_HOST` configuré (IP ou domaine)
- [ ] `VPS_USER` configuré (ubuntu/root)
- [ ] Test de connexion SSH réussi
- [ ] Test de connexion Registry réussi
- [ ] Variables staging configurées (si applicable)
- [ ] Variables production configurées (si applicable)

## 🐛 Troubleshooting

### Erreur: "Permission denied (publickey)"

```bash
# Sur le VPS, vérifier les permissions
chmod 700 ~/.ssh
chmod 600 ~/.ssh/authorized_keys

# Vérifier que la clé est présente
cat ~/.ssh/authorized_keys
```

### Erreur: "unauthorized: incorrect username or password"

```bash
# Vérifier le token dans GitLab
# Régénérer si nécessaire: Settings → Access Tokens

# Tester localement
docker login -u "$REGISTRY_USER" -p "$REGISTRY_PASSWORD" registry.gitlab.com
```

### Erreur: "Load key: invalid format"

La clé SSH doit être au format OpenSSH, pas PEM.

```bash
# Convertir si nécessaire
ssh-keygen -p -f gitlab-ci-key -m pem -P "" -N ""
```

## 📚 Références

- [GitLab CI/CD Variables](https://docs.gitlab.com/ee/ci/variables/)
- [GitLab Container Registry](https://docs.gitlab.com/ee/user/packages/container_registry/)
- [SSH Keys for CI/CD](https://docs.gitlab.com/ee/ci/ssh_keys/)

---

**✅ Configuration terminée !**

Une fois toutes les variables configurées, vous pouvez pousser votre code et le pipeline se déclenchera automatiquement.
