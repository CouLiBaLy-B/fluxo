# ── Stage 1 : Build de l'application React ─────────────────────────────────────
FROM node:20-alpine AS builder

WORKDIR /app

# Copier les manifestes de dépendances en premier pour profiter du cache Docker
COPY package.json package-lock.json ./

# Remplace npm ci
RUN npm install --prefer-offline

# Copier le reste des sources
COPY . .

# Compiler l'application React (output dans /app/dist)
RUN npm run build

# ── Stage 2 : Servir avec Nginx (image minimale) ────────────────────────────────
FROM nginx:1.25-alpine AS runtime

# Supprimer la configuration Nginx par défaut
RUN rm /etc/nginx/conf.d/default.conf

# Copier notre configuration Nginx personnalisée
COPY nginx.conf /etc/nginx/conf.d/app.conf

# Copier les assets compilés depuis le stage de build
COPY --from=builder /app/dist /usr/share/nginx/html

# Nginx écoute sur le port 80
EXPOSE 80

# Nginx en mode foreground (requis par Docker)
CMD ["nginx", "-g", "daemon off;"]
