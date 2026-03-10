# ── Stage 1 : Build du frontend React ──────────────────────────────────────────
FROM node:20-alpine AS frontend-builder

WORKDIR /frontend

# Copier les manifestes de dépendances en premier pour profiter du cache Docker
COPY package.json package-lock.json ./

RUN npm install --prefer-offline

# Copier le reste des sources
COPY . .

# Compiler l'application React (output dans /frontend/dist)
RUN npm run build


# ── Stage 2 : Compilation du backend TypeScript ─────────────────────────────────
FROM node:20-alpine AS backend-builder

WORKDIR /app

COPY backend/package.json ./
RUN npm install --prefer-offline

COPY backend/tsconfig.json ./
COPY backend/src ./src

# Compiler TypeScript → JavaScript dans /app/dist
RUN npm run build


# ── Stage 3 : Image de production (Nginx + Node.js via supervisord) ─────────────
FROM node:20-alpine AS runtime

# nginx   : serveur web + reverse proxy
# dumb-init : PID 1 qui relaie correctement les signaux SIGTERM
# supervisor : gestionnaire de processus pour lancer Nginx + Node.js en parallèle
RUN apk add --no-cache nginx dumb-init supervisor

# Dossiers requis par Nginx
RUN mkdir -p /run/nginx /usr/share/nginx/html

# Sécurité : utilisateur non-root pour le backend
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# ── Backend : dépendances de production ─────────────────────────────────────────
WORKDIR /app/backend
COPY backend/package.json ./
RUN npm install --omit=dev --prefer-offline && npm cache clean --force

# Copier le code compilé depuis le stage backend-builder
COPY --from=backend-builder /app/dist ./dist

# Donner les droits à l'utilisateur applicatif
RUN chown -R appuser:appgroup /app/backend

# ── Frontend : assets compilés → répertoire servi par Nginx ─────────────────────
COPY --from=frontend-builder /frontend/dist /usr/share/nginx/html

# ── Nginx : remplacer la config par défaut par la nôtre ─────────────────────────
# Alpine nginx charge /etc/nginx/http.d/ **à l'intérieur** du bloc http
# Les directives server doivent donc y être placées
RUN rm -f /etc/nginx/http.d/default.conf
COPY nginx-upstream.conf /etc/nginx/http.d/upstream.conf
COPY nginx.conf /etc/nginx/http.d/app.conf

# ── Supervisord : configuration du gestionnaire de processus ────────────────────
COPY supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Cloud Run exige que le conteneur écoute sur le port 8080
# nginx.conf est déjà configuré sur 8080 → aucun changement nécessaire
EXPOSE 8080

# dumb-init comme PID 1 : gère correctement les signaux Unix (graceful shutdown)
# supervisord lance et surveille Nginx + Node.js
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["/usr/bin/supervisord", "-c", "/etc/supervisor/conf.d/supervisord.conf"]
