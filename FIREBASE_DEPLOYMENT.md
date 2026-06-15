# Guide de Déploiement sur Firebase - L'Atelier Littéraire

Ce guide vous explique étape par étape comment configurer et héberger **L'Atelier Littéraire** sur Google Firebase. Comme il s'agit d'une application Full-Stack (un client React/Vite et un serveur backend Express/Node), deux architectures de déploiement s'offrent à vous.

---

## Méthode A : Firebase Hosting + Cloud Run (Recommandation Industrielle)

Dans cette configuration, les fichiers statiques de votre interface poétique (générés dans `/dist` par `npm run build`) sont hébergés et mis en cache mondialement par le CDN à haute performance de **Firebase Hosting**. 
Toutes les requêtes d'Aides/Analyse IA administrées sous `/api/**` ou d'authentification Google OAuth sous `/auth/**` sont elles transmises de manière sécurisée et ultra-rapide à un conteneur **Google Cloud Run** léger et à mise à l'échelle automatique.

Cette méthode utilise le `Dockerfile` optimisé que nous avons déjà configuré.

### 1. Construire et Déployer le Conteneur Backend sur Cloud Run
Installez l'outil de commande Google Cloud (`gcloud`) et exécutez ces commandes à la racine du projet :
```bash
# Se connecter et définir votre projet actif
gcloud auth login
gcloud config set project isometric-woods-0h7sp

# Compiler le conteneur et l'envoyer sur Google Artifact Registry
gcloud builds submit --tag gcr.io/isometric-woods-0h7sp/atelier-litteraire

# Déployer le service Cloud Run (votre API backend)
gcloud run deploy atelier-litteraire \
  --image gcr.io/isometric-woods-0h7sp/atelier-litteraire \
  --platform managed \
  --region us-central1 \
  --allow-unauthenticated \
  --set-env-vars="NODE_ENV=production,GEMINI_API_KEY=VOTRE_ALE_API_GEMINI"
```
Prenez note de l'URL fournie par Cloud Run à la fin du déploiement (ex: `https://atelier-litteraire-xxxx-uc.a.run.app`).

### 2. Configurer Firebase Hosting pour pointer vers Cloud Run
Modifiez votre fichier `/firebase.json` à la racine pour associer le trafic API vers votre service de conteneur :

```json
{
  "hosting": {
    "public": "dist",
    "ignore": [
      "firebase.json",
      "**/.*",
      "**/node_modules/**"
    ],
    "rewrites": [
      {
        "source": "/api/**",
        "run": {
          "serviceId": "atelier-litteraire",
          "region": "us-central1"
        }
      },
      {
        "source": "/auth/**",
        "run": {
          "serviceId": "atelier-litteraire",
          "region": "us-central1"
        }
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

### 3. Compiler le Frontend & Déployer
```bash
# Installer l'outil CLI Firebase mondialement si non présent
npm install -g firebase-tools

# Se connecter à votre compte Firebase/Google
firebase login

# Compiler vos fichiers web statiques (Vite) de production
npm run build

# Déployer l'hébergement web statique et les règles de sécurité
firebase deploy --only hosting,firestore:rules
```

---

## Méthode B : Firebase Hosting + Cloud Functions (Tout-en-un Serverless)

Si vous préférez ne pas gérer de conteneurs Docker séparés, vous pouvez déployer le serveur Express sous forme de **Cloud Function** (créant ainsi un backend serverless unifié).

### 1. Installer et Configurer les Dépendances Functions
Créez un dossier appelé `functions` à la racine pour votre script serverless, ou vous pouvez configurer l'Express d'origine de cette façon :

```bash
# Initialiser Firebase Functions dans votre dépôt si désiré
firebase init functions
```

Une fois initialisé, modifiez le fichier d'entrée de vos fonctions (ex: `functions/index.js` ou `functions/src/index.ts`) pour intégrer et écouter votre configuration Express backend de `server.ts` :

```typescript
import { onRequest } from "firebase-functions/v2/https";
import express from "express";

// Importez l'instance Express 'app' existante de votre serveur
// ou initialisez-la directement sous v2 onRequest :
const expressApp = require('./path/to/compiled/server.js');

export const api = onRequest({ cors: true, maxInstances: 10 }, expressApp);
```

### 2. Utiliser le fichier de routage par défaut `firebase.json`
Le fichier de configuration standard `/firebase.json` que nous avons créé est pré-configuré par défaut pour cette méthode :
```json
{
  "hosting": {
    "public": "dist",
    "rewrites": [
      {
        "source": "/api/**",
        "function": "api"
      },
      {
        "source": "/auth/**",
        "function": "api"
      },
      {
        "source": "**",
        "destination": "/index.html"
      }
    ]
  }
}
```

Déployez ensuite le tout d'un seul coup :
```bash
firebase deploy --only hosting,functions,firestore:rules
```

---

## Guide de Gestion & Sécurité de Base de Données (Tranquillité d'Esprit)

Notre projet contient déjà deux fichiers fondamentaux pour protéger vos manuscrits d'artistes en ligne :
1. **`firebase-blueprint.json`** : L'architecture type et documentée de vos collections (`users`, `profiles`, `writings`, `versions`, `productivity`, `messages`).
2. **`firestore.rules`** : Un pare-feu hautement sécurisé utilisant des clés strictes (`incoming()`), des validations de types, la détection des Spoofs d'identity, et l'isolation PII pour les informations de profil.

Vous pouvez mettre à jour et déployer les règles de sécurité à n'importe quel moment en exécutant :
```bash
firebase deploy --only firestore:rules
```

---

### Variables d'Environnement Clés (Firebase Console)
Assurez-vous de définir et d'injecter la variable suivante dans l'onglet **Paramètres / Cloud Run** ou **Fonctions** selon la méthode choisie :
- `GEMINI_API_KEY` : Requis pour faire fonctionner le compagnon d'analyse d'écriture de poèmes par l'IA.
- `GOOGLE_CLIENT_ID` / `GOOGLE_CLIENT_SECRET` : Facultatifs, à insérer requis si vous activez les flux Google OAuth communautaires.
