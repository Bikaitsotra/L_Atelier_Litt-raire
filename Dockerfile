# --- Étape de Build ---
FROM node:20-alpine AS builder

WORKDIR /app

# Copie des fichiers de dépendances de package
COPY package*.json ./

# Installation de toutes les dépendances (recquises pour builder le frontend et compiler le backend)
RUN npm ci

# Copie des fichiers de configuration TypeScript et Vite
COPY tsconfig.json vite.config.ts ./

# Copie optionnelle des configurations Firebase utiles au build
COPY firebase-applet-config.json* ./
COPY firebase-blueprint.json* ./

# Copie du code source et des fichiers statiques
COPY src/ ./src
COPY assets/ ./assets
COPY index.html ./
COPY server.ts ./

# Build des assets statiques (Vite) et compilation du serveur backend (esbuild)
RUN npm run build

# --- Étape Finale de Production ---
FROM node:20-alpine

WORKDIR /app

# Déclaration de l'environnement de production
ENV NODE_ENV=production
ENV PORT=3000

# Copie des définitions de dépendance
COPY package*.json ./

# Installation des dépendances de production uniquement (--omit=dev)
RUN npm ci --omit=dev

# Copie des bundles compilés issus de l'étape de Build
COPY --from=builder /app/dist ./dist

# Copie optionnelle des fichiers de config requis au runtime (par exemple firebase-applet-config.json)
COPY --from=builder /app/firebase-applet-config.json* ./
COPY --from=builder /app/firebase-blueprint.json* ./

# Port d'écoute par défaut
EXPOSE 3000

# Lancement de l'application via le script de production
CMD ["npm", "start"]
