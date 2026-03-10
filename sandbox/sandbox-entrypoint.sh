#!/usr/bin/env bash
# ═══════════════════════════════════════════════════════════════════════════════
# sandbox/sandbox-entrypoint.sh — Script d'initialisation du conteneur sandbox
#
# Exécuté au démarrage du conteneur (via ENTRYPOINT).
# Vérifie la connectivité Ollama, configure Git et GitHub CLI,
# puis délègue l'exécution à la commande passée en argument (CMD).
# ═══════════════════════════════════════════════════════════════════════════════

# Mode strict : arrêt immédiat sur erreur, variable non définie, ou erreur dans un pipe
set -euo pipefail

# ── Séparateur visuel ─────────────────────────────────────────────────────────
echo "══════════════════════════════════════════════════════════════════"
echo "  🤖  Sandbox AI Developer — Initialisation"
echo "══════════════════════════════════════════════════════════════════"
echo ""

# ── Étape 1 : Vérification de la connectivité Ollama ─────────────────────────
# Le sandbox doit pouvoir atteindre Ollama avant de lancer Claude Code.
# ANTHROPIC_BASE_URL est défini dans les variables d'environnement du conteneur.

echo "⏳ Attente du service Ollama sur ${ANTHROPIC_BASE_URL:-http://ollama:11434}..."

MAX_RETRIES=30
RETRY_INTERVAL=3
attempt=0

until curl -sf "${ANTHROPIC_BASE_URL:-http://ollama:11434}/api/tags" > /dev/null 2>&1; do
    attempt=$((attempt + 1))

    if [ "$attempt" -ge "$MAX_RETRIES" ]; then
        echo "❌ Ollama inaccessible après ${MAX_RETRIES} tentatives (${ANTHROPIC_BASE_URL:-http://ollama:11434})"
        echo "   Vérifiez que le service ollama est démarré et en bonne santé."
        exit 1
    fi

    echo "⚠️  Tentative ${attempt}/${MAX_RETRIES} — Ollama pas encore prêt, nouvel essai dans ${RETRY_INTERVAL}s..."
    sleep "$RETRY_INTERVAL"
done

echo "✅ Ollama est opérationnel sur ${ANTHROPIC_BASE_URL:-http://ollama:11434}"
echo ""

# ── Étape 2 : Configuration Git globale ──────────────────────────────────────
# Nécessaire pour que les commits dans les workspaces soient signés avec
# l'identité de l'agent AI.

echo "🔧 Configuration de Git..."

git config --global user.name  "${GIT_AUTHOR_NAME:-AI Agent}"
git config --global user.email "${GIT_AUTHOR_EMAIL:-ai-agent@atlassian-clone.local}"

# Branche par défaut = main (convention moderne)
git config --global init.defaultBranch main

# Désactiver le conseil de reclassification des lignes (évite le bruit dans les logs)
git config --global core.autocrlf false

echo "✅ Git configuré : ${GIT_AUTHOR_NAME:-AI Agent} <${GIT_AUTHOR_EMAIL:-ai-agent@atlassian-clone.local}>"
echo ""

# ── Étape 3 : Authentification GitHub CLI ────────────────────────────────────
# Uniquement si GITHUB_TOKEN est défini et non vide.
# Sans token, les opérations GitHub (gh repo create, git push) seront ignorées
# par l'agent Developer.

if [ -n "${GITHUB_TOKEN:-}" ]; then
    echo "🔑 Authentification GitHub CLI avec le token fourni..."
    echo "${GITHUB_TOKEN}" | gh auth login --with-token 2>&1

    if gh auth status > /dev/null 2>&1; then
        echo "✅ GitHub CLI authentifié avec succès"
        # Afficher l'identité connectée (sans révéler le token)
        gh auth status 2>&1 | grep -E "Logged in|Token scopes" || true
    else
        echo "⚠️  Authentification GitHub CLI échouée — les push GitHub seront ignorés"
    fi
else
    echo "⚠️  GITHUB_TOKEN non défini — opérations GitHub désactivées"
    echo "   Pour activer : définir GITHUB_TOKEN dans le docker-compose.yml"
fi
echo ""

# ── Étape 4 : Vérification de Claude Code ────────────────────────────────────
# S'assure que Claude Code CLI est bien installé et accessible.

echo "🔍 Vérification de Claude Code CLI..."

if claude --version > /dev/null 2>&1; then
    CLAUDE_VERSION=$(claude --version 2>&1 | head -1)
    echo "✅ Claude Code disponible : ${CLAUDE_VERSION}"
else
    echo "❌ Claude Code CLI introuvable — vérifiez l'installation dans le Dockerfile"
    exit 1
fi
echo ""

# ── Message de prêt ───────────────────────────────────────────────────────────
echo "══════════════════════════════════════════════════════════════════"
echo "  ✅  Sandbox prêt — En attente de tâches..."
echo "  📁  Workspace : ${WORKSPACE_DIR:-/workspace}"
echo "  🤖  Modèle    : ${CLAUDE_MODEL:-qwen3-coder}"
echo "  🌐  Ollama    : ${ANTHROPIC_BASE_URL:-http://ollama:11434}"
echo "══════════════════════════════════════════════════════════════════"
echo ""

# ── Délégation à la commande passée en argument ───────────────────────────────
# exec remplace le processus courant — garantit que les signaux (SIGTERM, etc.)
# sont correctement propagés à la commande enfant.
# Par défaut (CMD) : "sleep infinity" — maintient le conteneur actif pour docker exec.
exec "$@"
