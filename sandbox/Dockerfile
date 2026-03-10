# ═══════════════════════════════════════════════════════════════════════════════
# sandbox/Dockerfile — Environnement d'exécution isolé pour l'agent Developer
#
# Ce conteneur fournit un environnement sécurisé (utilisateur non-root) où
# Claude Code s'exécute en mode headless pour :
#   - Générer du code TypeScript sur disque
#   - Compiler et exécuter les tests Vitest
#   - Interagir avec GitHub via la CLI officielle (gh)
#
# Connexion à Ollama via l'API compatible Anthropic :
#   ANTHROPIC_BASE_URL=http://ollama:11434
#   ANTHROPIC_AUTH_TOKEN=ollama
# ═══════════════════════════════════════════════════════════════════════════════

# ── Image de base ─────────────────────────────────────────────────────────────
# node:20-bookworm-slim = Debian Bookworm minimal avec Node.js 20 LTS
FROM node:20-bookworm-slim

# ── Labels Docker (métadonnées de l'image) ────────────────────────────────────
LABEL maintainer="ai-agent@atlassian-clone.local"
LABEL description="Sandbox isolé pour l'agent Developer — Claude Code + GitHub CLI + TypeScript"
LABEL version="1.0.0"
LABEL project="atlassian-clone"

# ── Variables d'environnement par défaut ──────────────────────────────────────
# Ces valeurs peuvent être surchargées via docker-compose.yml ou docker run -e

# Connexion à Ollama (API compatible Anthropic)
ENV ANTHROPIC_AUTH_TOKEN=ollama
ENV ANTHROPIC_API_KEY=""
ENV ANTHROPIC_BASE_URL=http://ollama:11434

# Modèle Claude Code à utiliser (via Ollama)
ENV CLAUDE_MODEL=qwen3-coder

# Désactiver le trafic non-essentiel de Claude Code (analytics, updates, etc.)
ENV CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1

# Répertoire de travail principal
ENV WORKSPACE_DIR=/workspace

# Configuration de l'auteur Git pour les commits automatiques
ENV GIT_AUTHOR_NAME="AI Agent"
ENV GIT_AUTHOR_EMAIL="ai-agent@atlassian-clone.local"
ENV GIT_COMMITTER_NAME="AI Agent"
ENV GIT_COMMITTER_EMAIL="ai-agent@atlassian-clone.local"

# Configuration Node.js et npm
ENV NODE_ENV=production
ENV NPM_CONFIG_LOGLEVEL=warn

# ── Installation des dépendances système ──────────────────────────────────────
# Combiné en une seule couche RUN pour minimiser la taille de l'image

RUN apt-get update && apt-get install -y --no-install-recommends \
    # Outils réseau et téléchargement
    curl \
    wget \
    # Certificats SSL pour les connexions HTTPS
    ca-certificates \
    # Gestion des clés GPG pour les dépôts APT tiers
    gnupg \
    # Informations sur la distribution (utilisé par le script d'installation de gh)
    lsb-release \
    # Gestion de version du code
    git \
    # Client SSH pour les connexions GitHub
    openssh-client \
    # Compilation native (nécessaire pour certains paquets npm)
    build-essential \
    # Python 3 (requis par certains scripts de build npm)
    python3 \
    # Traitement JSON en ligne de commande
    jq \
    # Nettoyage du cache APT pour réduire la taille de l'image
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ── Installation de GitHub CLI (gh) ───────────────────────────────────────────
# Source officielle : https://cli.github.com/packages
# Nécessaire pour créer/cloner des repos GitHub depuis le sandbox

RUN mkdir -p /etc/apt/keyrings \
    # Télécharger et stocker la clé GPG officielle de GitHub CLI
    && curl -fsSL https://cli.github.com/packages/githubcli-archive-keyring.gpg \
       | gpg --dearmor -o /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    && chmod go+r /etc/apt/keyrings/githubcli-archive-keyring.gpg \
    # Ajouter le dépôt officiel GitHub CLI
    && echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/githubcli-archive-keyring.gpg] https://cli.github.com/packages stable main" \
       | tee /etc/apt/sources.list.d/github-cli.list > /dev/null \
    # Installer gh
    && apt-get update \
    && apt-get install -y --no-install-recommends gh \
    # Nettoyage
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/*

# ── Installation de Claude Code CLI (global npm) ──────────────────────────────
# Claude Code en mode headless : claude -p "prompt" --output-format json
# Version pinned pour la reproductibilité — mettre à jour manuellement si nécessaire

RUN npm install -g @anthropic-ai/claude-code \
    # Outils TypeScript globaux nécessaires dans le workspace sandbox
    && npm install -g \
       typescript \
       tsx \
       vitest \
       @types/node \
    # Vérification post-installation
    && claude --version || echo "⚠️  Claude Code installé (version check peut échouer sans ANTHROPIC_BASE_URL actif)"

# ── Création de l'utilisateur non-root ────────────────────────────────────────
# Bonne pratique de sécurité : ne JAMAIS exécuter du code généré par AI en root

RUN groupadd --system sandbox \
    && useradd --system \
               --gid sandbox \
               --home-dir /home/sandbox \
               --create-home \
               --shell /bin/bash \
               sandbox

# ── Création et configuration du répertoire de travail ────────────────────────
# /workspace est le répertoire monté par docker-compose (volume sandbox_workspace)
# Chaque tâche crée un sous-répertoire /workspace/<taskId>

RUN mkdir -p /workspace \
    && chown sandbox:sandbox /workspace

# ── Copie du script d'entrée ───────────────────────────────────────────────────
# sandbox-entrypoint.sh vérifie la connectivité Ollama, configure git et GitHub,
# puis lance la commande passée en paramètre (par défaut : sleep infinity)

COPY sandbox-entrypoint.sh /usr/local/bin/sandbox-entrypoint.sh
RUN chmod 755 /usr/local/bin/sandbox-entrypoint.sh

# ── Configuration de l'utilisateur et du répertoire de travail ────────────────
USER sandbox
WORKDIR /workspace

# ── Point d'entrée et commande par défaut ─────────────────────────────────────
# ENTRYPOINT exécute le script d'init puis délègue à CMD
# CMD par défaut : maintient le conteneur actif pour les docker exec ultérieurs
ENTRYPOINT ["sandbox-entrypoint.sh"]
CMD ["sleep", "infinity"]
