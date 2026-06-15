# Guide de Déploiement sur Render - L'Atelier Littéraire

Ce guide vous explique étape par étape comment héberger **L'Atelier Littéraire (Plume)** sur la plateforme Cloud **Render**. Le projet est entièrement prêt pour la production (Vite + Express backend compact).

Vous avez **deux méthodes d'hébergement** possibles sur Render :
1. **Déploiement Natif Node.js (Recommandé : plus rapide et gratuit/très économique)**
2. **Déploiement Docker (Utilise le Dockerfile optimisé avec cache que nous avons configuré)**

---

## Méthode 1 : Déploiement Natif Node.js (Le plus simple & rapide)

Render peut cloner directement votre dépôt Git et l'exécuter sur son architecture managée Node.js.

### Étapes de configuration :

1. Créez un compte ou connectez-vous sur [Render.com](https://render.com).
2. Cliquez sur le bouton **"New +"** et choisissez **"Web Service"**.
3. Connectez votre dépôt Git (GitHub ou GitLab) contenant ce projet.
4. Dans le formulaire de création, configurez les options suivantes :
   - **Name :** `atelier-litteraire` (ou le nom de votre choix)
   - **Region :** Choisissez la région la plus proche (ex: Frankfurt pour l'Europe)
   - **Branch :** Sélectionnez votre branche principale (ex: `main` ou `master`)
   - **Runtime :** `Node`
   - **Build Command :** `npm install && npm run build`
   - **Start Command :** `npm start`
   - **Instance Type :** `Free` ou `Starter` selon vos besoins de ressources.

5. Ajoutez les **Variables d'environnement** (Détails dans la section suivante).
6. Cliquez sur **"Deploy Web Service"**.

---

## Méthode 2 : Déploiement Docker (Conteneur d'isolation)

Si vous préférez encapsuler l'application dans son conteneur Docker strict avec les bons droits d'utilisateur non-root comme configurés dans notre `Dockerfile`.

### Étapes de configuration :

1. Connectez-vous sur [Render.com](https://render.com).
2. Cliquez sur **"New +"** et choisissez **"Web Service"**.
3. Connectez votre dépôt Git.
4. Configurez les options :
   - **Name :** `atelier-litteraire`
   - **Runtime :** `Docker` (Render détectera automatiquement le fichier `Dockerfile` à la racine).
   - **Instance Type :** Les services Docker gratuits ne sont plus supportés sur Render, un plan payant minimum (`Starter` à ~7$/mois) est nécessaire pour l'exécution d’un Dockerfile personnalisé.
5. Ajoutez les **Variables d'environnement**.
6. Cliquez sur **"Deploy Web Service"**.

---

## Configuration des Variables d'Environnement (Crucial)

Pour que l'application fonctionne parfaitement sur Render, vous devez définir ces variables d'environnement dans l'onglet **Environment** de votre service Render :

| Clé | Valeur attendue | Rôle |
| :--- | :--- | :--- |
| `NODE_ENV` | `production` | Active le mode optimisé de production de l'API. |
| `PORT` | `3000` ou vide | Port sur lequel Render va router le trafic Web externe. |
| `GEMINI_API_KEY` | *Votre clé API de Google AI Studio* | Clé API requise pour toute l'intelligence artificielle d'accompagnement littéraire. |
| `GOOGLE_CLIENT_ID` | *Votre ID Client Google* (Optionnel) | Requis si vous souhaitez proposer la connexion universelle Google OAuth (BFF). |
| `GOOGLE_CLIENT_SECRET` | *Votre Clé Secrète Google* (Optionnel) | Requis pour compléter l'échange de jeton Google OAuth. |

---

## Persistance des données (Firebase Firestore vs. Fichier Local)

L'Atelier Littéraire dispose d'un **moteur de stockage résilient et hybride** (`ResilientFirestore`) conçu pour s'adapter à votre hébergement :

### Option A : Connexion Cloud Firestore (Recommandée pour la production)
Si `firebase-applet-config.json` est présent ou configuré, l'application stockera les manuscrits et les utilisateurs de manière hautement sécurisée sur votre base de données Cloud Firestore. Vos données seront pérennes quelle que soit l'activité du serveur Render.

### Option B : Sauvegarde Locale Éphémère (local_store.json)
Si Firebase n'est pas configuré, le serveur basculera automatiquement en mode local résistant sur le fichier `/app/local_store.json`.
*Note : Sur Render, le système de fichiers est ephemeral.* Si le serveur redémarre ou est mis à jour, les textes sauvegardés localement seront réinitialisés.
* **Astuce Render :** Si vous n'utilisez pas Firebase et que vous souhaitez garder vos textes locaux en sécurité perpétuellement, vous pouvez monter un **Render Disk** (Lecteur Persistant) payant de 1 Go dans l'arborescence, monté sur le chemin d'accès `/app` ou configurer simplement une base de données Firestore (qui possède un niveau d'utilisation gratuit généreux).

---

## Résolution d'erreurs courantes

### 1. Le site s'ouvre sur un écran blanc ou "Not Found" :
Render applique parfois de la mise en cache agressive. Assurez-vous que la commande de build (`npm run build`) s'est exécutée avec un code retour de succès (code `0`). Notre script unifié compile à la fois le client statique frontend dans `/dist` et le serveur léger Node dans `dist/server.cjs`.

### 2. Erreur d'écoute de Port :
Si Render se plaint que l'application n'écoute pas sur le bon port, aucun souci : notre modification sur `server.ts` extrait dynamiquement `process.env.PORT` délégué par Render et démarre le serveur dessus de manière transparente.
