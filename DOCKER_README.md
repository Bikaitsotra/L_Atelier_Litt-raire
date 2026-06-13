# Guide de Déploiement Docker de l'Atelier Littéraire

Ce répertoire contient tous les fichiers nécessaires pour conteneuriser, construire et déployer facilement votre application **L'Atelier Littéraire (Firestore BFF)** n'importe où, avec Docker ou Docker Compose.

---

## 📋 Prérequis

1. **Docker** installé sur votre serveur ou machine locale.
2. **Docker Compose** (souvent inclus d'office avec Docker Desktop ou les versions récentes de Docker).
3. (Recommandé) Vos propres clés et configurations :
   - Clé d'API Gemini : `GEMINI_API_KEY`
   - Le fichier de configuration client Firebase : `firebase-applet-config.json`

---

## 🚀 Lancement rapide avec Docker Compose (Recommandé)

Docker Compose est le moyen le plus simple pour configurer et orchestrer le démarrage de votre application.

### 1. Configuration des variables d'environnement

Créez un fichier `.env` à la racine de votre dossier (à côté du fichier `docker-compose.yml`) avec les clés suivantes :

```env
GEMINI_API_KEY=votre_cle_gemini_api_ici
APP_URL=http://votre-domaine.com
```

### 2. Démarrage de l'application

Pour lancer la construction de l'image et démarrer le conteneur en arrière-plan :

```bash
docker compose up -d --build
```

- L'application sera accessible immédiatement sur : **`http://localhost:3000`** (ou votre adresse IP de serveur).
- Pour visualiser les logs en direct : `docker compose logs -f`
- Pour arrêter le conteneur : `docker compose down`

---

## 🛠️ Utilisation direct avec Docker CLI (Sans Docker Compose)

Si vous préférez compiler et exécuter l'image manuellement avec la commande `docker` :

### 1. Construction de l'image Docker

```bash
docker build -t atelier-litteraire:latest .
```

### 2. Lancement du conteneur

Remplacez `votre_cle_gemini_api_ici` par votre clé API et lancez la commande suivante :

```bash
docker run -d \
  --name atelier-litteraire-app \
  -p 3000:3000 \
  -e GEMINI_API_KEY="votre_cle_gemini_api_ici" \
  -e APP_URL="http://localhost:3000" \
  --restart always \
  atelier-litteraire:latest
```

---

## ⚙️ Configuration Avancée : Injecter un fichier Firebase tiers

Si vous déployez sur un autre serveur et souhaitez connecter l'image à une base de données Firebase Firestore différente de celle qui est fournie localement :

### Méthode 1 : Montage à chaud via Docker Compose (Idéal)
Vous pouvez lier un fichier de configuration Firestore externe directement au conteneur au démarrage sans devoir re-compiler l'image.

Dans votre `docker-compose.yml`, décommentez la section `volumes` et liez votre fichier local :

```yaml
    volumes:
      - ./mon-firebase-config.json:/app/firebase-applet-config.json:ro
```

### Méthode 2 : Pré-intégration lors du build
Placez simplement votre fichier final sous le nom `firebase-applet-config.json` à la racine de ce dossier avant de lancer la commande `docker build` ou `docker compose up --build`. Le processus d'intégration le copiera automatiquement à l'intérieur de l'image pour le frontend et le backend.

---

## 🩺 Diagnostics et Surveillance

- **Vérifier l’état de santé** : `docker ps`
- **Inspecter l'utilisation des ressources** : `docker stats`
- **Rebooter le conteneur** : `docker restart atelier-litteraire-app`
