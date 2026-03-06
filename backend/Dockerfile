# ── Stage 1 : Compilation TypeScript ──────────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copier les manifestes de dépendances (cache Docker)
COPY package.json ./

RUN npm install --prefer-offline

# Copier les sources TypeScript
COPY tsconfig.json ./
COPY src ./src

# Compiler TypeScript → JavaScript dans /app/dist
RUN npm run build

# ── Stage 2 : Image de production ─────────────────────────────────────────────
FROM node:20-alpine AS runtime

# Installer dumb-init pour la gestion correcte des signaux (SIGTERM → Node.js)
# Sans dumb-init, PID 1 = Node.js qui ne relaie pas SIGTERM aux processus enfants
RUN apk add --no-cache dumb-init wget

# Sécurité : exécuter en tant qu'utilisateur non-root
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

WORKDIR /app

# Installer uniquement les dépendances de production
COPY package.json ./
RUN npm install --omit=dev --prefer-offline && npm cache clean --force

# Copier le code compilé depuis le stage de build
COPY --from=builder /app/dist ./dist

# Donner les droits à l'utilisateur applicatif
RUN chown -R appuser:appgroup /app
USER appuser

EXPOSE 4000

# dumb-init comme PID 1 : gère correctement les signaux Unix (graceful shutdown)
ENTRYPOINT ["/usr/bin/dumb-init", "--"]
CMD ["node", "dist/server.js"]
