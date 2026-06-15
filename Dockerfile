# ==========================================
# Étape 1 : Build (builder)
# ==========================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copie des fichiers de configuration des dépendances
COPY package*.json ./

# Utilisation d'un cache mount pour accélérer l'installation de toutes les dépendances
RUN --mount=type=cache,target=/root/.npm \
    npm ci

# Copie des configurations TypeScript and Vite
COPY tsconfig.json vite.config.ts ./

# Copie des configurations Firebase (si présentes dans l'environnement)
COPY firebase-applet-config.json* ./
COPY firebase-blueprint.json* ./

# Copie de l'ensemble du code source de l'atelier littéraire
COPY src/ ./src
COPY assets/ ./assets
COPY index.html ./
COPY server.ts ./

# Compilation de l'application (Vite + esbuild pour le serveur)
RUN npm run build

# ==========================================
# Étape 2 : Production Runtime
# ==========================================
FROM node:20-alpine AS runner

WORKDIR /app

# Définition des variables d'environnement pour la production
ENV NODE_ENV=production
ENV PORT=3000

# Création du dossier et attribution des droits au user non-root "node"
RUN mkdir -p /app && chown -R node:node /app

# On bascule sur l'utilisateur "node" pour des raisons de sécurité évidentes (non-root)
USER node

# Copie des fichiers de configuration des paquets avec les droits adéquats
COPY --chown=node:node package*.json ./

# Utilisation d'un cache mount pour accélérer l'installation des dépendances de production uniquement
RUN --mount=type=cache,target=/home/node/.npm \
    npm ci --omit=dev

# Copie des fichiers compilés depuis l'environnement builder
COPY --from=builder --chown=node:node /app/dist ./dist

# Copie des fichiers optionnels utiles au runtime (Firebase Blueprint...)
COPY --from=builder --chown=node:node /app/firebase-applet-config.json* ./
COPY --from=builder --chown=node:node /app/firebase-blueprint.json* ./

# Port d'écoute exposé pour l'ingress (Cloud Run)
EXPOSE 3000

# Commande de démarrage par défaut de l'Atelier
CMD ["npm", "start"]
