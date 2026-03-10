<!---
  FLUXO — Guide d'installation
-->

```
███████╗██╗     ██╗   ██╗██╗  ██╗ ██████╗
██╔════╝██║     ██║   ██║╚██╗██╔╝██╔═══██╗
█████╗  ██║     ██║   ██║ ╚███╔╝ ██║   ██║
██╔══╝  ██║     ██║   ██║ ██╔██╗ ██║   ██║
██║     ███████╗╚██████╔╝██╔╝ ██╗╚██████╔╝
╚═╝     ╚══════╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝
          L'application globale · v1.0
```

<div align="center">
  <img src="src/logo/logo_global.png" alt="Fluxo" width="420" />
  <br/><br/>
  <strong>Plateforme de gestion de projet agile et de documentation collaborative</strong>
</div>

---

## Table des matières

- [Prérequis](#prérequis)
- [Script d'installation automatique](#script-dinstallation-automatique)
- [Installation manuelle avec Docker](#installation-manuelle-avec-docker)
- [Configuration `.env`](#configuration-env)
- [Fournisseur LLM](#fournisseur-llm)
- [Vérification des services](#vérification-des-services)
- [Développement local](#développement-local-sans-docker)
- [Commandes utiles](#commandes-utiles)
- [Mise à jour](#mise-à-jour)

---

## Prérequis

| Outil            | Version minimale | Remarque                              |
| ---------------- | ---------------- | ------------------------------------- |
| Docker           | 24+              | Docker Desktop sur Windows/macOS      |
| Docker Compose   | 2.20+            | Inclus dans Docker Desktop            |
| Git              | 2.x              |                                       |
| RAM disponible   | 4 Go             | 8 Go recommandés si Ollama activé     |
| Espace disque    | 5 Go             | + 4–8 Go pour les modèles Ollama      |

---

## Script d'installation automatique

La méthode la plus simple — le script guide pas à pas toute la configuration.

```bash
git clone <url-du-depot> fluxo
cd fluxo
bash install.sh
```

Le script `install.sh` réalise automatiquement :

1. Vérification des prérequis (Docker, Docker Compose)
2. Création et configuration interactive du fichier `.env`
   - Génération automatique des secrets (POSTGRES_PASSWORD, JWT_SECRET)
   - Saisie des identifiants admin
   - Choix du fournisseur LLM (Mock / Ollama / OpenAI / Anthropic)
3. Démarrage de tous les services via `docker compose up --build -d`
4. Attente de la disponibilité de l'application (health check)
5. Affichage du résumé (URL, identifiants, commandes utiles)

> **Windows** — Utilisez Git Bash ou WSL2 pour exécuter le script.

---

## Installation manuelle avec Docker

### 1. Cloner le dépôt

```bash
git clone <url-du-depot> fluxo
cd fluxo
```

### 2. Configurer l'environnement

```bash
cp .env.example .env
```

Éditez `.env` et renseignez **au minimum** ces valeurs obligatoires :

```env
# Base de données
POSTGRES_PASSWORD=<mot_de_passe_fort>   # ex: openssl rand -base64 32

# Sécurité
JWT_SECRET=<secret_jwt_fort>            # ex: openssl rand -base64 64

# Compte administrateur initial
ADMIN_EMAIL=admin@votre-domaine.com
ADMIN_USERNAME=Admin
ADMIN_PASSWORD=<mot_de_passe_admin>
```

> **Sécurité** — Ne commitez jamais le fichier `.env`. Il est dans `.gitignore`.

### 3. Démarrer tous les services

```bash
docker compose up --build -d
```

Le premier démarrage prend quelques minutes (build des images + téléchargement du modèle LLM si Ollama activé).

### 4. Accéder à l'application

| Service     | URL                       |
| ----------- | ------------------------- |
| Application | <http://localhost>        |
| API REST    | <http://localhost/api>    |
| Health      | <http://localhost/health> |

Connectez-vous avec les identifiants définis dans `ADMIN_EMAIL` / `ADMIN_PASSWORD`.

---

## Configuration `.env`

### Base de données PostgreSQL

```env
POSTGRES_DB=atlassian
POSTGRES_USER=atlassian
POSTGRES_PASSWORD=<mot_de_passe_fort>
```

### Authentification JWT

```env
JWT_SECRET=<secret_base64_64_chars>
JWT_EXPIRES_IN=24h          # Durée de validité des tokens
BCRYPT_ROUNDS=12            # Coût du hachage (10–14 recommandé)
```

### Compte administrateur

L'admin est créé automatiquement au **premier démarrage** si la base est vide.
Pour réinitialiser : supprimer le volume postgres puis redémarrer.

```env
ADMIN_EMAIL=admin@example.com
ADMIN_USERNAME=Admin
ADMIN_PASSWORD=<mot_de_passe_fort>
```

> **Note** — Seul l'admin peut créer d'autres comptes utilisateurs (via l'interface ou `POST /api/auth/register`).

### Réseau et CORS

```env
FRONTEND_PORT=80                                    # Port exposé de l'interface
CORS_ORIGINS=http://localhost,http://localhost:80   # Origines autorisées
```

### Orchestrateur d'agents AI

```env
AGENT_TASK_TIMEOUT_MS=600000      # Timeout par tâche (ms)
AGENT_MAX_RETRIES=3               # Tentatives avant échec
AGENT_QUEUE_POLL_INTERVAL_MS=5000 # Intervalle de polling (ms)
AI_AUTO_CREATE_CONFLUENCE=true    # Création auto de pages doc
```

### Sandbox développeur (GitHub)

```env
GITHUB_TOKEN=ghp_...      # Token GitHub pour push automatique (optionnel)
GITHUB_ORG=votre-org      # Organisation GitHub cible (optionnel)
GIT_AUTHOR_NAME=AI Agent
GIT_AUTHOR_EMAIL=ai@fluxo.local
```

---

## Fournisseur LLM

Fluxo supporte quatre fournisseurs LLM. Définissez `LLM_PROVIDER` dans `.env`.

### Mode Mock (défaut — aucune clé requise)

```env
LLM_PROVIDER=mock
```

Réponses simulées, idéal pour tester l'interface sans API externe.

### OpenAI

```env
LLM_PROVIDER=openai
OPENAI_API_KEY=sk-...
OPENAI_MODEL=gpt-4o-mini    # ou gpt-4o, gpt-4-turbo
```

### Anthropic (Claude)

```env
LLM_PROVIDER=anthropic
ANTHROPIC_API_KEY=sk-ant-...
ANTHROPIC_MODEL=claude-3-5-haiku-20241022
```

### Ollama (LLM local — inclus dans Docker)

```env
LLM_PROVIDER=ollama
OLLAMA_BASE_URL=http://ollama:11434   # Service Docker interne
OLLAMA_MODEL=qwen3.5:0.8b-q8_0
CLAUDE_CODE_MODEL=qwen3.5:0.8b-q8_0  # Modèle utilisé dans le sandbox
OLLAMA_MEMORY_LIMIT=8G               # RAM allouée à Ollama
```

Le modèle est téléchargé automatiquement au premier démarrage (~500 Mo à 8 Go selon le modèle).

#### Ollama avec GPU NVIDIA (optionnel)

Prérequis : [nvidia-container-toolkit](https://docs.nvidia.com/datacenter/cloud-native/container-toolkit/install-guide.html) installé sur l'hôte.

Dans `docker-compose.yml`, décommentez la section `deploy.resources.reservations` du service `ollama` :

```yaml
deploy:
  resources:
    reservations:
      devices:
        - driver: nvidia
          count: all
          capabilities: [gpu]
```

#### Utiliser un Ollama externe (hôte)

Commentez le service `ollama` dans `docker-compose.yml` et définissez :

```env
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

---

## Vérification des services

```bash
# État de tous les conteneurs
docker compose ps

# Logs en temps réel
docker compose logs -f

# Logs d'un service spécifique
docker compose logs -f backend
docker compose logs -f ollama

# Health check de l'API
curl http://localhost/health
```

Réponse attendue de `/health` :

```json
{
  "status": "ok",
  "timestamp": "2026-01-01T00:00:00.000Z",
  "env": "production",
  "uptime": 42
}
```

Vérifier la création du compte admin dans les logs backend :

```
"Admin bootstrapped depuis les variables d'environnement"
```

---

## Développement local (sans Docker)

### Frontend (React + Vite)

```bash
# Installer les dépendances
npm install

# Démarrer en mode développement (port 5173)
npm run dev
```

### Backend (Node.js + TypeScript)

```bash
cd backend

# Installer les dépendances
npm install

# Démarrer en mode développement avec hot-reload (port 4000)
npm run dev
```

> PostgreSQL doit tourner séparément. Configurez `DATABASE_URL` dans `.env` pour pointer vers votre instance locale.

---

## Commandes utiles

```bash
# Démarrage complet avec rebuild
docker compose up --build -d

# Arrêt sans suppression des données
docker compose down

# Arrêt + suppression de TOUS les volumes (reset complet)
docker compose down -v

# Reset uniquement la base de données (conserve les modèles Ollama)
docker compose down
docker volume rm fluxo_postgres_data
docker compose up -d

# Recréer uniquement le backend (après modification du code)
docker compose up --build -d backend

# Accéder à la base de données
docker exec -it atlassian_db psql -U atlassian -d atlassian

# Accéder au sandbox développeur
docker exec -it atlassian_sandbox bash
```

---

## Mise à jour

```bash
# Récupérer les dernières modifications
git pull

# Rebuild et redémarrage des services mis à jour
docker compose up --build -d

# Si le schéma de base de données a changé, appliquer les migrations manuellement
docker exec -i atlassian_db psql -U atlassian -d atlassian \
  < backend/src/db/migrations/00X_nom_migration.sql
```

---

<div align="center">
  <sub>Fluxo — L'application globale · Construit avec ❤️</sub>
</div>
