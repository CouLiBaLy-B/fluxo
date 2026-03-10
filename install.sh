#!/usr/bin/env bash
# ─────────────────────────────────────────────────────────────────────────────
#
#  ███████╗██╗     ██╗   ██╗██╗  ██╗ ██████╗
#  ██╔════╝██║     ██║   ██║╚██╗██╔╝██╔═══██╗
#  █████╗  ██║     ██║   ██║ ╚███╔╝ ██║   ██║
#  ██╔══╝  ██║     ██║   ██║ ██╔██╗ ██║   ██║
#  ██║     ███████╗╚██████╔╝██╔╝ ██╗╚██████╔╝
#  ╚═╝     ╚══════╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝
#
#  Script d'installation automatique — v1.0
#  Usage : bash install.sh
#
# ─────────────────────────────────────────────────────────────────────────────

set -euo pipefail

# ── Couleurs ──────────────────────────────────────────────────────────────────
BOLD='\033[1m'
BLUE='\033[1;34m'
CYAN='\033[1;36m'
GREEN='\033[1;32m'
YELLOW='\033[1;33m'
RED='\033[1;31m'
RESET='\033[0m'

# ── Fonctions utilitaires ─────────────────────────────────────────────────────
info()    { echo -e "${BLUE}[INFO]${RESET}  $*"; }
success() { echo -e "${GREEN}[OK]${RESET}    $*"; }
warn()    { echo -e "${YELLOW}[WARN]${RESET}  $*"; }
error()   { echo -e "${RED}[ERREUR]${RESET} $*" >&2; exit 1; }
step()    { echo -e "\n${CYAN}${BOLD}▶ $*${RESET}"; }

# Demander une valeur (masquée pour les mots de passe)
ask() {
  local prompt="$1"
  local default="${2:-}"
  local secret="${3:-false}"
  local value

  if [[ "$secret" == "true" ]]; then
    read -rsp "${BOLD}${prompt}${RESET} " value
    echo
  else
    if [[ -n "$default" ]]; then
      read -rp "${BOLD}${prompt}${RESET} [${default}] " value
      value="${value:-$default}"
    else
      read -rp "${BOLD}${prompt}${RESET} " value
    fi
  fi
  echo "$value"
}

# Générer un secret aléatoire
gen_secret() {
  local len="${1:-32}"
  if command -v openssl &>/dev/null; then
    openssl rand -base64 "$len" | tr -d '\n/'
  else
    cat /dev/urandom | tr -dc 'a-zA-Z0-9' | fold -w "$((len * 4 / 3))" | head -n 1
  fi
}

# ── Bannière ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${CYAN}${BOLD}"
echo "  ███████╗██╗     ██╗   ██╗██╗  ██╗ ██████╗ "
echo "  ██╔════╝██║     ██║   ██║╚██╗██╔╝██╔═══██╗"
echo "  █████╗  ██║     ██║   ██║ ╚███╔╝ ██║   ██║"
echo "  ██╔══╝  ██║     ██║   ██║ ██╔██╗ ██║   ██║"
echo "  ██║     ███████╗╚██████╔╝██╔╝ ██╗╚██████╔╝"
echo "  ╚═╝     ╚══════╝ ╚═════╝ ╚═╝  ╚═╝ ╚═════╝ "
echo -e "${RESET}"
echo -e "  ${BOLD}L'application globale — Script d'installation v1.0${RESET}"
echo ""

# ── Étape 1 : Vérification des prérequis ─────────────────────────────────────
step "Vérification des prérequis"

check_cmd() {
  if command -v "$1" &>/dev/null; then
    success "$1 trouvé : $(command -v "$1")"
  else
    error "$1 est requis mais n'est pas installé. Consultez INSTALL.md."
  fi
}

check_cmd docker
check_cmd git

# Vérifier Docker Compose (v2 intégré ou v1 standalone)
if docker compose version &>/dev/null 2>&1; then
  COMPOSE_CMD="docker compose"
  success "Docker Compose v2 trouvé"
elif command -v docker-compose &>/dev/null; then
  COMPOSE_CMD="docker-compose"
  success "Docker Compose v1 trouvé"
else
  error "Docker Compose est requis. Installez Docker Desktop ou docker-compose."
fi

# Vérifier que Docker tourne
if ! docker info &>/dev/null 2>&1; then
  error "Le daemon Docker n'est pas démarré. Lancez Docker Desktop ou 'sudo systemctl start docker'."
fi

# ── Étape 2 : Configuration .env ─────────────────────────────────────────────
step "Configuration de l'environnement (.env)"

if [[ -f ".env" ]]; then
  warn "Un fichier .env existe déjà."
  read -rp "$(echo -e "${BOLD}Écraser le .env existant ? [o/N]${RESET} ")" overwrite
  if [[ "${overwrite,,}" != "o" && "${overwrite,,}" != "oui" ]]; then
    info "Conservation du .env existant."
    SKIP_ENV=true
  else
    SKIP_ENV=false
  fi
else
  SKIP_ENV=false
fi

if [[ "$SKIP_ENV" == "false" ]]; then
  if [[ ! -f ".env.example" ]]; then
    error "Fichier .env.example introuvable. Êtes-vous dans le bon répertoire ?"
  fi

  cp .env.example .env
  info "Fichier .env créé depuis .env.example"

  echo ""
  echo -e "${YELLOW}${BOLD}Configuration requise${RESET} — laissez vide pour accepter la valeur par défaut"
  echo ""

  # Base de données
  echo -e "${BOLD}── Base de données ──────────────────────────────${RESET}"
  POSTGRES_PASSWORD=$(ask "Mot de passe PostgreSQL (vide = généré automatiquement) :" "" "true")
  if [[ -z "$POSTGRES_PASSWORD" ]]; then
    POSTGRES_PASSWORD=$(gen_secret 32)
    info "Mot de passe PostgreSQL généré automatiquement."
  fi

  # JWT
  echo -e "\n${BOLD}── Sécurité ──────────────────────────────────────${RESET}"
  JWT_SECRET=$(gen_secret 64)
  info "JWT_SECRET généré automatiquement."

  # Admin
  echo -e "\n${BOLD}── Compte administrateur ─────────────────────────${RESET}"
  ADMIN_EMAIL=$(ask    "Email admin    :" "admin@example.com")
  ADMIN_USERNAME=$(ask "Nom admin      :" "Admin")
  ADMIN_PASSWORD=$(ask "Mot de passe admin (min. 8 caractères) :" "" "true")
  while [[ ${#ADMIN_PASSWORD} -lt 8 ]]; do
    warn "Le mot de passe doit faire au moins 8 caractères."
    ADMIN_PASSWORD=$(ask "Mot de passe admin :" "" "true")
  done

  # LLM Provider
  echo -e "\n${BOLD}── Fournisseur LLM ───────────────────────────────${RESET}"
  echo "  1) mock      — Simulation locale (aucune clé requise)"
  echo "  2) ollama    — LLM local via Ollama (inclus dans Docker)"
  echo "  3) openai    — OpenAI GPT"
  echo "  4) anthropic — Anthropic Claude"
  LLM_CHOICE=$(ask "Fournisseur LLM [1/2/3/4]" "1")

  case "$LLM_CHOICE" in
    2)
      LLM_PROVIDER="ollama"
      OPENAI_API_KEY=""
      ANTHROPIC_API_KEY=""
      ;;
    3)
      LLM_PROVIDER="openai"
      OPENAI_API_KEY=$(ask "OPENAI_API_KEY (sk-...) :")
      ANTHROPIC_API_KEY=""
      ;;
    4)
      LLM_PROVIDER="anthropic"
      ANTHROPIC_API_KEY=$(ask "ANTHROPIC_API_KEY (sk-ant-...) :")
      OPENAI_API_KEY=""
      ;;
    *)
      LLM_PROVIDER="mock"
      OPENAI_API_KEY=""
      ANTHROPIC_API_KEY=""
      ;;
  esac

  # Écrire les valeurs dans .env (compatible macOS sed et GNU sed)
  sed_inplace() {
    if sed --version 2>/dev/null | grep -q GNU; then
      sed -i "s|$1|$2|g" .env
    else
      sed -i '' "s|$1|$2|g" .env
    fi
  }

  # Remplacer les placeholders dans .env
  # PostgreSQL
  sed_inplace "^POSTGRES_PASSWORD=.*"  "POSTGRES_PASSWORD=${POSTGRES_PASSWORD}"
  # JWT
  sed_inplace "^JWT_SECRET=.*"         "JWT_SECRET=${JWT_SECRET}"
  # Admin
  sed_inplace "^ADMIN_EMAIL=.*"        "ADMIN_EMAIL=${ADMIN_EMAIL}"
  sed_inplace "^ADMIN_USERNAME=.*"     "ADMIN_USERNAME=${ADMIN_USERNAME}"
  sed_inplace "^ADMIN_PASSWORD=.*"     "ADMIN_PASSWORD=${ADMIN_PASSWORD}"
  # LLM
  sed_inplace "^LLM_PROVIDER=.*"       "LLM_PROVIDER=${LLM_PROVIDER}"
  if [[ -n "$OPENAI_API_KEY" ]]; then
    sed_inplace "^OPENAI_API_KEY=.*"   "OPENAI_API_KEY=${OPENAI_API_KEY}"
  fi
  if [[ -n "$ANTHROPIC_API_KEY" ]]; then
    sed_inplace "^ANTHROPIC_API_KEY=.*" "ANTHROPIC_API_KEY=${ANTHROPIC_API_KEY}"
  fi

  success "Fichier .env configuré."
fi

# ── Étape 3 : Démarrage Docker ────────────────────────────────────────────────
step "Démarrage des services Docker"

info "Construction et démarrage de tous les services..."
info "Cela peut prendre plusieurs minutes lors du premier lancement."
echo ""

$COMPOSE_CMD up --build -d

# ── Étape 4 : Attente que l'application soit prête ────────────────────────────
step "Attente du démarrage de l'application"

FRONTEND_PORT="${FRONTEND_PORT:-80}"
MAX_WAIT=120
ELAPSED=0
INTERVAL=5

echo -n "  Attente de http://localhost:${FRONTEND_PORT}/health "

while true; do
  if curl -sf "http://localhost:${FRONTEND_PORT}/health" &>/dev/null; then
    echo ""
    success "Application prête !"
    break
  fi

  if [[ $ELAPSED -ge $MAX_WAIT ]]; then
    echo ""
    warn "L'application prend plus longtemps que prévu."
    info "Vérifiez les logs avec : $COMPOSE_CMD logs -f"
    break
  fi

  echo -n "."
  sleep $INTERVAL
  ELAPSED=$((ELAPSED + INTERVAL))
done

# ── Étape 5 : Résumé ──────────────────────────────────────────────────────────
step "Installation terminée"

echo ""
echo -e "  ${GREEN}${BOLD}Fluxo est démarré !${RESET}"
echo ""
echo -e "  ${BOLD}Accès à l'application${RESET}"
echo -e "  ┌─────────────────────────────────────────────────┐"
echo -e "  │  Application : ${CYAN}http://localhost:${FRONTEND_PORT}${RESET}         │"
echo -e "  │  API REST    : ${CYAN}http://localhost:${FRONTEND_PORT}/api${RESET}     │"
echo -e "  │  Health      : ${CYAN}http://localhost:${FRONTEND_PORT}/health${RESET}  │"
echo -e "  └─────────────────────────────────────────────────┘"
echo ""

if [[ "$SKIP_ENV" == "false" ]]; then
  echo -e "  ${BOLD}Identifiants administrateur${RESET}"
  echo -e "  ┌─────────────────────────────────────────────────┐"
  echo -e "  │  Email    : ${YELLOW}${ADMIN_EMAIL}${RESET}"
  echo -e "  │  Password : ${YELLOW}(celui que vous avez défini)${RESET}           │"
  echo -e "  └─────────────────────────────────────────────────┘"
  echo ""
fi

echo -e "  ${BOLD}Commandes utiles${RESET}"
echo -e "  ${CYAN}$COMPOSE_CMD logs -f${RESET}          — Suivre les logs"
echo -e "  ${CYAN}$COMPOSE_CMD ps${RESET}               — État des services"
echo -e "  ${CYAN}$COMPOSE_CMD down${RESET}             — Arrêter les services"
echo ""
echo -e "  Documentation complète : ${CYAN}INSTALL.md${RESET}"
echo ""
