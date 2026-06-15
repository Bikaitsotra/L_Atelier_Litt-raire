/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import { GoogleGenAI, Type } from "@google/genai";
import dotenv from "dotenv";
import admin from "firebase-admin";
import { getFirestore } from "firebase-admin/firestore";
import { getAuth } from "firebase-admin/auth";

dotenv.config();

const app = express();
const PORT = process.env.PORT ? parseInt(process.env.PORT) : 3000;

// Initialize Firebase Admin SDK using local applet configurations
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
let fbConfig: any = {};
if (fs.existsSync(configPath)) {
  fbConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
}

// For server-side access to Firestore in Cloud Run, we use the container's native project ID or fallback to the config project ID.
// Letting Firebase Admin resolve it automatically on Cloud Run avoids cross-project gRPC PERMISSION_DENIED errors.
admin.initializeApp({
  projectId: fbConfig.projectId,
});

const realDb = getFirestore(undefined, fbConfig.firestoreDatabaseId);
const LOCAL_DB_PATH = path.join(process.cwd(), "local_store.json");

class ResilientDocumentSnapshot {
  public ref: ResilientDocument;

  constructor(
    public id: string,
    private _data: any,
    public exists: boolean,
    col: ResilientCollection
  ) {
    this.ref = new ResilientDocument(col, id);
  }

  data() {
    return this._data;
  }
}

class ResilientQuerySnapshot {
  constructor(public docs: ResilientDocumentSnapshot[]) {}

  get size() {
    return this.docs.length;
  }

  get empty() {
    return this.docs.length === 0;
  }

  forEach(callback: (doc: ResilientDocumentSnapshot) => void) {
    this.docs.forEach(callback);
  }
}

class ResilientDocument {
  constructor(public col: ResilientCollection, public id: string) {}

  async get() {
    try {
      if (!this.col.db.isOffline) {
        const snap = await realDb.collection(this.col.name).doc(this.id).get();
        if (snap.exists) {
          if (!this.col.db.localDb[this.col.name]) {
            this.col.db.localDb[this.col.name] = {};
          }
          this.col.db.localDb[this.col.name][this.id] = snap.data();
          this.col.db.saveLocalDb();
        }
        return new ResilientDocumentSnapshot(snap.id, snap.data(), snap.exists, this.col);
      }
    } catch (err: any) {
      this.col.db.handleError(err);
    }

    const colDocs = this.col.db.localDb[this.col.name] || {};
    const exists = Object.prototype.hasOwnProperty.call(colDocs, this.id);
    const data = colDocs[this.id] || null;
    return new ResilientDocumentSnapshot(this.id, data, exists, this.col);
  }

  async set(data: any, options?: any) {
    try {
      if (!this.col.db.isOffline) {
        await realDb.collection(this.col.name).doc(this.id).set(data, options);
      }
    } catch (err: any) {
      this.col.db.handleError(err);
    }

    if (!this.col.db.localDb[this.col.name]) {
      this.col.db.localDb[this.col.name] = {};
    }
    
    if (options && options.merge) {
      const existing = this.col.db.localDb[this.col.name][this.id] || {};
      this.col.db.localDb[this.col.name][this.id] = { ...existing, ...data };
    } else {
      this.col.db.localDb[this.col.name][this.id] = { ...data };
    }
    
    this.col.db.saveLocalDb();
  }

  async update(data: any) {
    try {
      if (!this.col.db.isOffline) {
        await realDb.collection(this.col.name).doc(this.id).update(data);
      }
    } catch (err: any) {
      this.col.db.handleError(err);
    }

    if (!this.col.db.localDb[this.col.name]) {
      this.col.db.localDb[this.col.name] = {};
    }
    
    const existing = this.col.db.localDb[this.col.name][this.id] || {};
    this.col.db.localDb[this.col.name][this.id] = { ...existing, ...data };
    this.col.db.saveLocalDb();
  }

  async delete() {
    try {
      if (!this.col.db.isOffline) {
        await realDb.collection(this.col.name).doc(this.id).delete();
      }
    } catch (err: any) {
      this.col.db.handleError(err);
    }

    if (this.col.db.localDb[this.col.name]) {
      delete this.col.db.localDb[this.col.name][this.id];
      this.col.db.saveLocalDb();
    }
  }
}

class ResilientQuery {
  private clauses: Array<{ field: string; op: string; val: any }> = [];
  private limitNum?: number;

  constructor(public col: ResilientCollection) {}

  where(field: string, op: string, val: any) {
    this.clauses.push({ field, op, val });
    return this;
  }

  limit(n: number) {
    this.limitNum = n;
    return this;
  }

  async get() {
    try {
      if (!this.col.db.isOffline) {
        let q: any = realDb.collection(this.col.name);
        for (const c of this.clauses) {
          q = q.where(c.field, c.op, c.val);
        }
        if (this.limitNum !== undefined) {
          q = q.limit(this.limitNum);
        }
        const snap = await q.get();
        return new ResilientQuerySnapshot(snap.docs.map((d: any) => new ResilientDocumentSnapshot(d.id, d.data(), true, this.col)));
      }
    } catch (err: any) {
      this.col.db.handleError(err);
    }

    const colDocs = this.col.db.localDb[this.col.name] || {};
    let docs = Object.entries(colDocs).map(([id, data]) => new ResilientDocumentSnapshot(id, data, true, this.col));

    for (const c of this.clauses) {
      docs = docs.filter(d => {
        const data = d.data();
        if (!data) return false;
        return data[c.field] === c.val;
      });
    }

    if (this.limitNum !== undefined) {
      docs = docs.slice(0, this.limitNum);
    }

    return new ResilientQuerySnapshot(docs);
  }
}

class ResilientCollection {
  constructor(public db: ResilientFirestore, public name: string) {}

  doc(id?: string) {
    const finalId = id || crypto.randomBytes(12).toString("hex");
    return new ResilientDocument(this, finalId);
  }

  where(field: string, op: string, val: any) {
    const q = new ResilientQuery(this);
    return q.where(field, op, val);
  }

  limit(n: number) {
    const q = new ResilientQuery(this);
    return q.limit(n);
  }

  async get() {
    const q = new ResilientQuery(this);
    return q.get();
  }
}

class ResilientBatch {
  private ops: Array<{ 
    type: "set" | "delete"; 
    doc: ResilientDocument; 
    data?: any; 
    options?: any 
  }> = [];

  constructor(public db: ResilientFirestore) {}

  set(doc: ResilientDocument, data: any, options?: any) {
    this.ops.push({ type: "set", doc, data, options });
    return this;
  }

  delete(doc: ResilientDocument) {
    this.ops.push({ type: "delete", doc });
    return this;
  }

  async commit() {
    try {
      if (!this.db.isOffline) {
        const batch = realDb.batch();
        for (const op of this.ops) {
          const realDoc = realDb.collection(op.doc.col.name).doc(op.doc.id);
          if (op.type === "set") {
            batch.set(realDoc, op.data, op.options);
          } else if (op.type === "delete") {
            batch.delete(realDoc);
          }
        }
        await batch.commit();
      }
    } catch (err: any) {
      this.db.handleError(err);
    }

    for (const op of this.ops) {
      const colName = op.doc.col.name;
      const docId = op.doc.id;
      
      if (op.type === "set") {
        if (!this.db.localDb[colName]) {
          this.db.localDb[colName] = {};
        }
        if (op.options && op.options.merge) {
          const existing = this.db.localDb[colName][docId] || {};
          this.db.localDb[colName][docId] = { ...existing, ...op.data };
        } else {
          this.db.localDb[colName][docId] = { ...op.data };
        }
      } else if (op.type === "delete") {
        if (this.db.localDb[colName]) {
          delete this.db.localDb[colName][docId];
        }
      }
    }
    this.db.saveLocalDb();
  }
}

class ResilientFirestore {
  public localDb: { [col: string]: { [docId: string]: any } } = {};
  public isOffline = false;

  constructor() {
    this.loadLocalDb();
  }

  private loadLocalDb() {
    try {
      if (fs.existsSync(LOCAL_DB_PATH)) {
        this.localDb = JSON.parse(fs.readFileSync(LOCAL_DB_PATH, "utf8"));
        console.log("[Resilient DB] Loaded existing fallback local database from file.");
      }
    } catch (err) {
      console.error("[Resilient DB] Failed to load local DB:", err);
    }
  }

  public saveLocalDb() {
    try {
      fs.writeFileSync(LOCAL_DB_PATH, JSON.stringify(this.localDb, null, 2), "utf8");
    } catch (err) {
      console.error("[Resilient DB] Failed to save local DB:", err);
    }
  }

  public handleError(err: any) {
    const errorStr = String(err);
    if (
      errorStr.includes("PERMISSION_DENIED") ||
      errorStr.includes("7") ||
      errorStr.includes("Metadata") ||
      errorStr.includes("insufficient permissions")
    ) {
      if (!this.isOffline) {
        console.warn("[Resilient DB] SWITCHING TO OFFLINE LOCAL FILE DB MODE due to Firebase Admin error:", err.message || err);
        this.isOffline = true;
      }
    } else {
      console.error("[Resilient DB] Firestore error:", err.message || err);
    }
  }

  collection(name: string) {
    return new ResilientCollection(this, name);
  }

  batch() {
    return new ResilientBatch(this);
  }
}

const db = new ResilientFirestore();

// Express JSON parsing middleware
app.use(express.json({ limit: "15mb" }));

// Initialize GoogleGenAI SDK
const apiKey = process.env.GEMINI_API_KEY;
const ai = apiKey && apiKey !== "MY_GEMINI_API_KEY" && apiKey.trim() !== ""
  ? new GoogleGenAI({
      apiKey: apiKey,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    })
  : null;

// Get dynamic AI client based on user's custom API key or default fallback
async function getAIClientForUser(userEmail?: string): Promise<GoogleGenAI | null> {
  if (userEmail && userEmail.trim().length > 0) {
    try {
      const normalizedEmail = userEmail.trim().toLowerCase();
      const profileDoc = await db.collection("profiles").doc(normalizedEmail).get();
      if (profileDoc.exists) {
        const data = profileDoc.data();
        if (data && data.geminiApiKey && data.geminiApiKey.trim().length > 0) {
          const userKey = data.geminiApiKey.trim();
          console.log(`[AI Client] Using custom Gemini API key for user: ${normalizedEmail}`);
          return new GoogleGenAI({
            apiKey: userKey,
            httpOptions: {
              headers: {
                "User-Agent": "aistudio-build-custom",
              },
            },
          });
        }
      }
    } catch (err) {
      console.error(`[AI Client] Failed to fetch custom Gemini API key for user: ${userEmail}`, err);
    }
  }

  // Fallback to default central AI client
  return ai;
}

// Retry utility with backoff for API calls
async function retryWithBackoff<T>(fn: () => Promise<T>, retries = 3, delay = 1200): Promise<T> {
  try {
    return await fn();
  } catch (error: any) {
    const errorMsg = error?.message || "";
    const hasStatus = error && (error.status || error.statusCode || error.code);
    const errorStr = `${errorMsg} status:${hasStatus} ${JSON.stringify(error)} ${String(error)}`;
    
    const isRetryable =
      errorStr.includes("503") ||
      errorStr.includes("UNAVAILABLE") ||
      errorStr.includes("429") ||
      errorStr.includes("RESOURCE_EXHAUSTED") ||
      errorStr.includes("500") ||
      errorStr.toLowerCase().includes("demand") ||
      errorStr.toLowerCase().includes("overloaded") ||
      errorStr.toLowerCase().includes("temporary") ||
      (typeof hasStatus === "number" && (hasStatus === 503 || hasStatus === 429 || hasStatus === 500));

    if (retries <= 0 || !isRetryable) {
      throw error;
    }
    console.warn(`[L'Atelier Littéraire Cache] Transient Gemini error. Retrying in ${delay}ms... (${retries} left): ${errorStr}`);
    await new Promise(resolve => setTimeout(resolve, delay));
    return retryWithBackoff(fn, retries - 1, delay * 2);
  }
}

// Global seeding function for legacy/default public profiles and content
async function seedDefaultsToFirestore() {
  try {
    const profilesSnap = await db.collection("profiles").limit(1).get();
    if (profilesSnap.empty) {
      console.log("[Firebase Admin] Seeding legacy poet profiles to Firestore...");
      const defaultProfiles = [
        {
          email: "johnbikaitsotra@gmail.com",
          displayName: "John Bikaitsotra",
          penName: "Plume de Sommeil",
          bio: "Amant des mots, poète amateur, à la recherche des mélodies oubliées dans le souffle du crépuscule. J'écris pour capturer l'éphémère.",
          avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200",
          publishedWorks: [
            { title: "Mes Vers du Soir", url: "https://example.com/vers-du-soir" }
          ],
          socials: {
            twitter: "john_poete",
            github: "johnb_dev",
            website: "https://john-writer.example.org",
            linkedin: "johnb-poesie"
          }
        },
        {
          email: "arthur.rimbaud@plume.fr",
          displayName: "Arthur Rimbaud",
          penName: "Le Voyant",
          bio: "Né en 1854 à Charleville, j'ai voulu être voyant, me faire voyant. Poète fulgurant du désordre de tous les sens et compagnon d'aventures littéraires absolues.",
          avatarUrl: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=200",
          publishedWorks: [
            { title: "Une saison en enfer", url: "https://fr.wikipedia.org/wiki/Une_saison_en_enfer" },
            { title: "Illuminations", url: "https://fr.wikipedia.org/wiki/Illuminations_(Rimbaud)" }
          ],
          socials: {
            twitter: "arthur_rimbaud",
            website: "https://la-poesie.org/arthur-rimbaud/"
          }
        },
        {
          email: "charles.baudelaire@plume.fr",
          displayName: "Charles Baudelaire",
          penName: "Le Prince des Nuées",
          bio: "Auteur des Fleurs du Mal et critique d’art. Mon âme recherche continuellement la beauté extraite du Mal, coincé entre les gouffres du Spleen de Paris et de l'Idéal céleste.",
          avatarUrl: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&q=80&w=200",
          publishedWorks: [
            { title: "Les Fleurs du Mal", url: "https://fr.wikipedia.org/wiki/Les_Fleurs_du_mal" },
            { title: "Le Spleen de Paris", url: "https://fr.wikipedia.org/wiki/Le_Spleen_de_Paris" }
          ],
          socials: {
            twitter: "charles_baudelaire",
            website: "https://www.poetes.com/baudelaire/"
          }
        },
        {
          email: "paul.verlaine@plume.fr",
          displayName: "Paul Verlaine",
          penName: "Le Pauvre Lelian",
          bio: "Poète maudit français de la fin du XIXe siècle. De la musique avant toute chose ! J'invite à l'harmonie des vers impairs et aux mélancolies des romances sans paroles.",
          avatarUrl: "https://images.unsplash.com/photo-1500648767791-00dcc994a43e?auto=format&fit=crop&q=80&w=200",
          publishedWorks: [
            { title: "Poèmes saturniens", url: "https://fr.wikipedia.org/wiki/Po%C3%A8mes_saturniens" },
            { title: "Romances sans paroles", url: "https://fr.wikipedia.org/wiki/Romances_sans_paroles" }
          ],
          socials: {
            website: "https://verlaine.example.org"
          }
        },
        {
          email: "marceline@plume.fr",
          displayName: "Marceline Desbordes-Valmore",
          penName: "La Muse Romantique",
          bio: "Cantatrice et poétesse majeure de l'école romantique. Mes cris lyriques et mes élégies sincères ont inspiré Verlaine et Baudelaire par leur vérité rythmique sans fioritures.",
          avatarUrl: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200",
          publishedWorks: [
            { title: "Les Pleurs", url: "https://fr.wikipedia.org/wiki/Les_Pleurs" },
            { title: "Les Poésies (1830)", url: "https://fr.wikipedia.org/wiki/Marceline_Desbordes-Valmore" }
          ],
          socials: {
            instagram: "marceline_desbordes",
            website: "https://marceline-desbordes-valmore.fr"
          }
        }
      ];

      const batch = db.batch();
      defaultProfiles.forEach(prof => {
        const docRef = db.collection("profiles").doc(prof.email);
        batch.set(docRef, prof);
      });
      await batch.commit();
      console.log("[Firebase Admin] Legacy poet profiles successfully seeded to Firestore!");
    }
    // Provisonner également le compte administrateur avec son mot de passe par défaut pour le serveur local
    await seedAdminUser();
  } catch (err) {
    console.error("[Firebase Admin] Error seeding default profiles:", err);
  }
}

// Fonction de provisionnement du compte administrateur avec mot de passe par défaut
async function seedAdminUser() {
  const adminEmail = "johnbikaitsotra@gmail.com";
  const defaultPassword = "plumeAdmin2026!";
  try {
    console.log(`[Firebase Admin] Vérification et provisionnement du compte admin (${adminEmail})...`);
    
    let userRecord;
    let uid = "admin-fallback-uid";
    try {
      userRecord = await getAuth().getUserByEmail(adminEmail);
      // Compte existant : on réinitialise son mot de passe pour faciliter la reconnexion locale
      await getAuth().updateUser(userRecord.uid, {
        password: defaultPassword,
        displayName: "John Bikaitsotra"
      });
      uid = userRecord.uid;
      console.log(`[Firebase Admin] Mot de passe admin réinitialisé par défaut à: "${defaultPassword}"`);
    } catch (authErr: any) {
      if (authErr && authErr.code === "auth/user-not-found") {
        try {
          userRecord = await getAuth().createUser({
            email: adminEmail,
            password: defaultPassword,
            displayName: "John Bikaitsotra",
            emailVerified: true
          });
          uid = userRecord.uid;
          console.log(`[Firebase Admin] Compte admin créé avec succès avec le mot de passe par défaut: "${defaultPassword}"`);
        } catch (innerCreateErr: any) {
          console.warn("[Firebase Admin] Failed to create admin user via getAuth:", innerCreateErr.message || innerCreateErr);
        }
      } else {
        console.warn("[Firebase Admin] Failed to verify/update admin user via Firebase Auth (this is normal if Cloud Run default credentials lack Identity Toolkit access on customer tenant). Proceeding with local DB seeding:", authErr.message || authErr);
      }
    }

    // Provisionnement / Mise à jour dans la collection Firestore "users"
    const userRef = db.collection("users").doc(adminEmail);
    const userDoc = await userRef.get();
    const userData = {
      email: adminEmail,
      displayName: "John Bikaitsotra",
      penName: "Admin Plume",
      createdAt: new Date().toISOString(),
      uid: uid,
      isAdmin: true
    };
    if (!userDoc.exists) {
      await userRef.set(userData);
    } else {
      await userRef.update({
        uid: userRecord.uid,
        isAdmin: true
      });
    }

    // Provisionnement / Mise à jour dans la collection Firestore "profiles"
    const profileRef = db.collection("profiles").doc(adminEmail);
    const profileDoc = await profileRef.get();
    if (!profileDoc.exists) {
      await profileRef.set({
        email: adminEmail,
        displayName: "John Bikaitsotra",
        penName: "Admin Plume",
        bio: "Administrateur principal du Salon de l'Atelier Littéraire.",
        avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200",
        publishedWorks: [
          { title: "Mes Vers du Soir", url: "https://example.com/vers-du-soir" }
        ],
        socials: {
          twitter: "john_poete",
          github: "johnb_dev"
        }
      });
    }

    console.log("[Firebase Admin] Synchronisation des données admin Firestore réussie.");
  } catch (err) {
    console.error("[Firebase Admin] Échec du provisionnement du compte administrateur:", err);
  }
}


// REST Endpoints Connected Directly to Cloud Firestore (BFF Mode)

// Google OAuth URL Generation
app.get("/api/auth/google/url", (req, res) => {
  const host = req.get("host") || "";
  const protocol = req.protocol === "https" || host.includes("run.app") ? "https" : "http";
  const redirectUri = `${protocol}://${host}/auth/callback`;
  
  const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
  if (!googleClientId) {
    return res.status(400).json({ 
      error: "Google Client ID non configuré.",
      instructions: "Veuillez définir GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET dans vos variables d'environnement."
    });
  }

  const params = new URLSearchParams({
    client_id: googleClientId,
    redirect_uri: redirectUri,
    response_type: "code",
    scope: "https://www.googleapis.com/auth/userinfo.email https://www.googleapis.com/auth/userinfo.profile",
    state: "google",
    prompt: "select_account"
  });

  res.json({ url: `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}` });
});

// Google OAuth Callback Handler redirecting data to Firestore
app.get(["/auth/callback", "/auth/callback/"], async (req, res) => {
  const { code } = req.query;

  if (!code) {
    return res.send(`
      <html>
        <body style="background: #0A0A0A; color: #E0D7D0; font-family: sans-serif; display: flex; align-items: center; justify-content: center; height: 100vh; text-align: center;">
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: 'Code Google manquant' }, '*');
              window.close();
            } else {
              window.location.href = '/';
            }
          </script>
          <p>Code Google manquant ou expiré.</p>
        </body>
      </html>
    `);
  }

  const host = req.get("host") || "";
  const protocol = req.protocol === "https" || host.includes("run.app") ? "https" : "http";
  const redirectUri = `${protocol}://${host}/auth/callback`;

  try {
    const googleClientId = process.env.GOOGLE_CLIENT_ID || "";
    const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET || "";

    // Exchange authorization code for token
    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        client_id: googleClientId,
        client_secret: googleClientSecret,
        code: code as string,
        grant_type: "authorization_code",
        redirect_uri: redirectUri,
      }).toString(),
    });

    if (!tokenResponse.ok) {
      const errorText = await tokenResponse.text();
      throw new Error(`Erreur échange jeton: ${errorText}`);
    }

    const tokenData = await tokenResponse.json();
    const accessToken = tokenData.access_token;

    // Fetch user details from Google Resource Server
    const userinfoResponse = await fetch("https://www.googleapis.com/oauth2/v3/userinfo", {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (!userinfoResponse.ok) {
      throw new Error("Impossible de requérir les informations utilisateur Google.");
    }

    const profileData = await userinfoResponse.json();
    const email = profileData.email;
    const displayName = profileData.name || profileData.given_name || "Auteur Google";
    const penName = profileData.given_name || displayName;
    const avatarUrl = profileData.picture || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200";

    const normalizedEmail = email.trim().toLowerCase();

    // Register or retrieve user from Firestore
    const userRef = db.collection("users").doc(normalizedEmail);
    const userDoc = await userRef.get();
    let displayNameToUse = displayName;
    let penNameToUse = penName;

    if (!userDoc.exists) {
      await userRef.set({
        email: normalizedEmail,
        displayName: displayName,
        penName: penName,
        createdAt: new Date().toISOString(),
        isGoogleUser: true
      });
    } else {
      const uData = userDoc.data();
      displayNameToUse = uData?.displayName || displayNameToUse;
      penNameToUse = uData?.penName || penNameToUse;
    }

    // Provision profile if missing from Firestore
    const profileRef = db.collection("profiles").doc(normalizedEmail);
    const profileDoc = await profileRef.get();
    if (!profileDoc.exists) {
      await profileRef.set({
        email: normalizedEmail,
        displayName: displayNameToUse,
        penName: penNameToUse,
        bio: "Artiste connecté via Google à l'Atelier Littéraire.",
        avatarUrl: avatarUrl,
        publishedWorks: [],
        socials: {}
      });
    }

    const userPayload = JSON.stringify({
      email: normalizedEmail,
      displayName: displayNameToUse,
      penName: penNameToUse
    });

    res.send(`
      <html>
        <body style="background: #0A0A0A; color: #E0D7D0; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; text-align: center;">
          <h2 style="color: #C5A059; font-family: serif; margin-bottom: 8px;">Plume - Atelier d'Écriture</h2>
          <p>Connexion Google réussie !</p>
          <p style="font-size: 11px; color: #888;">Fermeture automatique de cette fenêtre...</p>
          <script>
            setTimeout(() => {
              if (window.opener) {
                window.opener.postMessage({ 
                  type: 'OAUTH_AUTH_SUCCESS', 
                  user: ${userPayload} 
                }, '*');
                window.close();
              } else {
                localStorage.setItem('user_session', '${userPayload}');
                window.location.href = '/';
              }
            }, 500);
          </script>
        </body>
      </html>
    `);

  } catch (error: any) {
    console.error("Erreur d'authentification callback Google :", error);
    res.send(`
      <html>
        <body style="background: #0A0A0A; color: #E0D7D0; font-family: sans-serif; display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100vh; text-align: center; padding: 16px;">
          <h2 style="color: #EF4444; font-family: serif; margin-bottom: 8px;">Erreur de Connexion</h2>
          <p style="font-size: 13px;">${error.message || "Erreur interne de communication."}</p>
          <p style="font-size: 11px; color: #666; margin-top: 20px;">Veuillez fermer cette fenêtre pour réessayer.</p>
          <script>
            if (window.opener) {
              window.opener.postMessage({ type: 'OAUTH_AUTH_ERROR', error: '${error.message || "Erreur"}' }, '*');
            }
          </script>
        </body>
      </html>
    `);
  }
});

// Admin Statistics & Security Control Endpoint powered by Firestore
app.get("/api/admin/overview", async (req, res) => {
  const adminEmail = req.query.adminEmail as string;
  if (!adminEmail || adminEmail.trim().toLowerCase() !== "johnbikaitsotra@gmail.com") {
    return res.status(403).json({ error: "Accès refusé. Réservé aux administrateurs." });
  }

  try {
    const usersSnap = await db.collection("users").get();
    const writingsSnap = await db.collection("writings").get();
    const profilesSnap = await db.collection("profiles").get();
    const versionsSnap = await db.collection("versions").get();

    const writingsList: any[] = [];
    writingsSnap.forEach(d => {
      writingsList.push(d.data());
    });

    const userMap = new Map<string, any>();

    // 1. Populate from users
    usersSnap.forEach(d => {
      const u = d.data();
      if (u && u.email) {
        const emailLower = u.email.trim().toLowerCase();
        userMap.set(emailLower, {
          email: u.email,
          displayName: u.displayName || "",
          penName: u.penName || "",
          createdAt: u.createdAt || "Inconnue",
          isGoogle: !!u.isGoogleUser
        });
      }
    });

    // 2. Supplement from profiles so everyone with an artist profile (including default seeded accounts or simulated admins) is accounted for
    profilesSnap.forEach(d => {
      const p = d.data();
      if (p && p.email) {
        const emailLower = p.email.trim().toLowerCase();
        if (!userMap.has(emailLower)) {
          userMap.set(emailLower, {
            email: p.email,
            displayName: p.displayName || "",
            penName: p.penName || "",
            createdAt: p.createdAt || new Date().toISOString(),
            isGoogle: emailLower.endsWith("gmail.com")
          });
        }
      }
    });

    const listUsers: any[] = [];
    userMap.forEach(u => {
      const count = writingsList.filter((w: any) => w.userEmail && w.userEmail.trim().toLowerCase() === u.email.trim().toLowerCase()).length;
      listUsers.push({
        ...u,
        manuscriptsCount: count
      });
    });

    res.json({
      totalUsers: userMap.size,
      totalWritings: writingsSnap.size,
      totalProfiles: profilesSnap.size,
      totalVersions: versionsSnap.size,
      usersList: listUsers
    });

  } catch (err) {
    console.error("Error generating admin overview:", err);
    res.status(500).json({ error: "Erreur lors de la récupération des données de supervision." });
  }
});

// Admin: Restrict or unrestrict a user
app.post("/api/admin/restrict", async (req, res) => {
  const { adminEmail, userEmail, restrict } = req.body;
  
  if (!adminEmail || adminEmail.trim().toLowerCase() !== "johnbikaitsotra@gmail.com") {
    return res.status(403).json({ error: "Accès refusé. Réservé aux administrateurs." });
  }
  
  if (!userEmail) {
    return res.status(400).json({ error: "Adresse email de l'utilisateur requise." });
  }

  const normalizedEmail = userEmail.trim().toLowerCase();

  try {
    // 1. Update in 'users' collection
    const userRef = db.collection("users").doc(normalizedEmail);
    const userDoc = await userRef.get();
    if (userDoc.exists) {
      await userRef.update({ isRestricted: !!restrict });
    }

    // 2. Update in 'profiles' collection
    const profileRef = db.collection("profiles").doc(normalizedEmail);
    const profileDoc = await profileRef.get();
    if (profileDoc.exists) {
      await profileRef.update({ isRestricted: !!restrict });
    }

    res.json({ success: true, isRestricted: !!restrict });
  } catch (err) {
    console.error("Failed to restrict user:", err);
    res.status(500).json({ error: "Erreur serveur lors de la restriction de l'utilisateur." });
  }
});

// Admin: Permanently delete a user and all their manuscripts and versions
app.post("/api/admin/delete", async (req, res) => {
  const { adminEmail, userEmail } = req.body;
  
  if (!adminEmail || adminEmail.trim().toLowerCase() !== "johnbikaitsotra@gmail.com") {
    return res.status(403).json({ error: "Accès refusé. Réservé aux administrateurs." });
  }
  
  if (!userEmail) {
    return res.status(400).json({ error: "Adresse email de l'utilisateur requise." });
  }

  const normalizedEmail = userEmail.trim().toLowerCase();

  try {
    // 1. Delete user record
    await db.collection("users").doc(normalizedEmail).delete();

    // 2. Delete profile record
    await db.collection("profiles").doc(normalizedEmail).delete();

    // 3. Delete writings & versions in cascade
    const writingsSnap = await db.collection("writings").where("userEmail", "==", normalizedEmail).get();
    for (const doc of writingsSnap.docs) {
      const id = doc.id;
      await db.collection("writings").doc(id).delete();

      // Delete versions
      const versionsSnap = await db.collection("versions").where("writingId", "==", id).get();
      for (const verDoc of versionsSnap.docs) {
        await db.collection("versions").doc(verDoc.id).delete();
      }
    }

    // 4. Delete productivity logs
    const productivitySnap = await db.collection("productivity").where("userEmail", "==", normalizedEmail).get();
    for (const doc of productivitySnap.docs) {
      await db.collection("productivity").doc(doc.id).delete();
    }

    // 5. Delete private messages (either sender or receiver)
    const sentMsg = await db.collection("messages").where("senderEmail", "==", normalizedEmail).get();
    for (const doc of sentMsg.docs) {
      await db.collection("messages").doc(doc.id).delete();
    }
    const recMsg = await db.collection("messages").where("receiverEmail", "==", normalizedEmail).get();
    for (const doc of recMsg.docs) {
      await db.collection("messages").doc(doc.id).delete();
    }

    res.json({ success: true });
  } catch (err) {
    console.error("Failed to fully delete user:", err);
    res.status(500).json({ error: "Erreur serveur lors de la suppression intégrale de l'utilisateur." });
  }
});

// Auth registration using Cloud Firestore and Firebase Auth
app.post("/api/auth/register", async (req, res) => {
  const { email, password, displayName, penName } = req.body;
  if (!email || !password || !displayName) {
    return res.status(400).json({ error: "Veuillez remplir tous les champs obligatoires (Email, Nom d'artiste)." });
  }

  const normalizedEmail = email.trim().toLowerCase();
  
  try {
    // 1. Check if user already exists in cloud users collection
    const userRef = db.collection("users").doc(normalizedEmail);
    const userDoc = await userRef.get();
    if (userDoc.exists) {
      return res.status(400).json({ error: "Cette adresse email est déjà enregistrée." });
    }

    // 2. Provision / Sync with Real Firebase Authentication
    let uid = "";
    try {
      const createdRecord = await getAuth().createUser({
        email: normalizedEmail,
        password: password,
        displayName: displayName.trim()
      });
      uid = createdRecord.uid;
    } catch (authErr: any) {
      // If user list already had this account in Auth but we missed it, handle smoothly
      if (authErr && authErr.code === "auth/email-already-exists") {
        try {
          const existingAuth = await getAuth().getUserByEmail(normalizedEmail);
          uid = existingAuth.uid;
        } catch (innerErr: any) {
          console.warn("[Auth Fallback] Failed to retrieve existing user auth via getAuth, using fallback uid:", innerErr.message || innerErr);
          uid = "fallback-uid-" + Math.random().toString(36).substring(2, 11);
        }
      } else {
        console.warn("[Auth Fallback] Failed to communicate with Firebase Auth on server. Generating fallback UID:", authErr.message || authErr);
        // We use a fallback pseudo-UID to keep local flow functional
        uid = "fallback-uid-" + Math.random().toString(36).substring(2, 11);
      }
    }

    const newUser = {
      email: normalizedEmail,
      displayName: displayName.trim(),
      penName: (penName || displayName).trim(),
      createdAt: new Date().toISOString(),
      uid: uid
    };

    await userRef.set(newUser);

    // 3. Auto-creation of Profile
    const profileRef = db.collection("profiles").doc(normalizedEmail);
    const profileDoc = await profileRef.get();
    if (!profileDoc.exists) {
      const defaultAvatarUrl = "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200";
      await profileRef.set({
        email: normalizedEmail,
        displayName: newUser.displayName,
        penName: newUser.penName,
        bio: "Nouvel auteur inspiré rejoignant l'Atelier Littéraire.",
        avatarUrl: defaultAvatarUrl,
        publishedWorks: [],
        socials: {}
      });
    }

    res.json({
      success: true,
      user: {
        email: newUser.email,
        displayName: newUser.displayName,
        penName: newUser.penName
      }
    });

  } catch (error: any) {
    console.error("Error creating user :", error);
    res.status(500).json({ error: error.message || "Erreur de création de compte." });
  }
});

// Auth login verification (Firebase sync / fallback)
app.post("/api/auth/login", async (req, res) => {
  const { email } = req.body;
  if (!email) {
    return res.status(400).json({ error: "L'adresse email est requise." });
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    // Read the user directly from cloud Firestore for penName configurations
    const userDoc = await db.collection("users").doc(normalizedEmail).get();
    if (userDoc.exists) {
      const u = userDoc.data();
      if (u?.isRestricted) {
        return res.status(403).json({ error: "Votre compte a été suspendu par l'administrateur de l'Atelier." });
      }
      return res.json({
        success: true,
        user: {
          email: u?.email || normalizedEmail,
          displayName: u?.displayName || normalizedEmail.split("@")[0],
          penName: u?.penName || u?.displayName || normalizedEmail.split("@")[0]
        }
      });
    }

    // Try to fallback / query on public profiles
    const profDoc = await db.collection("profiles").doc(normalizedEmail).get();
    if (profDoc.exists) {
      const p = profDoc.data();
      if (p?.isRestricted) {
        return res.status(403).json({ error: "Votre compte a été suspendu par l'administrateur de l'Atelier." });
      }
      return res.json({
        success: true,
        user: {
          email: normalizedEmail,
          displayName: p?.displayName || normalizedEmail.split("@")[0],
          penName: p?.penName || p?.displayName || normalizedEmail.split("@")[0]
        }
      });
    }

    // If client was signed in correctly using client SDK, provision them a default record on backend dynamically:
    res.json({
      success: true,
      user: {
        email: normalizedEmail,
        displayName: normalizedEmail.split("@")[0],
        penName: normalizedEmail.split("@")[0]
      }
    });

  } catch (err: any) {
    console.error("Login verification failed on BFF Backend: ", err);
    res.status(401).json({ error: "Échec de synchronisation de la session." });
  }
});

// Writings list with email filtering and auto-seeding in Firestore
app.get("/api/writings", async (req, res) => {
  const email = req.query.email as string;

  if (!email) {
    return res.json([]);
  }

  const normalizedEmail = email.trim().toLowerCase();

  try {
    const writingsSnap = await db.collection("writings")
      .where("userEmail", "==", normalizedEmail)
      .get();
    
    const writings: any[] = [];
    writingsSnap.forEach(doc => {
      writings.push(doc.data());
    });

    if (writings.length === 0) {
      console.log(`[Firebase Admin] Dynamic auto-seeding 2 classical poetics for new writer: ${normalizedEmail}`);
      const defaultWritings = [
        {
          id: "dormeur-du-val",
          title: "Le Dormeur du val",
          content: `C’est un trou de verdure où chante une rivière,\nAccrochant follement aux herbes des haillons\nD’argent ; où le soleil, de la montagne fière,\nLuit : c’est un petit val qui mousse de rayons.\n\nUn soldat jeune, bouche ouverte, tête nue,\nEt la nuque baignant dans le frais cresson bleu,\nDort ; il est étendu dans l’herbe, sous la nue,\nPâle dans son lit vert où la lumière pleut.\n\nLes pieds dans les glaïeuls, il dort. Souriant comme\nSourirait un enfant malade, il fait un somme :\nNature, berce-le chaudement : il a froid.\n\nLes parfums ne font pas frissonner sa narine ;\nIl dort dans le soleil, la main sur sa poitrine,\nTranquille. Il a deux trous rouges au côté droit.`,
          themes: ["Nature", "Guerre", "Sommeil"],
          emotions: ["mélancolie", "mystère", "sérénité"],
          deadlineDate: null,
          deadlineWordCount: null,
          comments: [
            {
              id: "c1",
              selectedText: "La main sur sa poitrine",
              author: "Arthur Rimbaud",
              text: "Ce vers installe une fausse idée de paix avant le choc de la révélation finale.",
              createdAt: new Date().toISOString()
            },
            {
              id: "c2",
              selectedText: "Deux trous rouges",
              author: "Critique Littéraire",
              text: "C'est l'un des retournements poétiques les plus puissants du XIXe siècle.",
              createdAt: new Date().toISOString()
            }
          ]
        },
        {
          id: "albatros",
          title: "L'Albatros",
          content: `Souvent, pour s’amuser, les hommes d’équipage\nPrennent des albatros, vastes oiseaux des mers,\nQui suivent, indolents compagnons de voyage,\nLe navire glissant sur les gouffres amers.\n\nA peine les ont-ils déposés sur les planches,\nQue ces rois de l’azur, maladroits et honteux,\nLaissent piteusement leurs grandes ailes blanches\nComme des avirons traîner à côté d’eux.\n\nCe voyageur ailé, comme il est gauche et veule !\nLui, naguère si beau, qu’il est comique et laid !\nL’un agace son bec avec un brûle-gueule,\nL’autre mime, en boitant, l’infirme qui volait !\n\nLe Poète est semblable au prince des nuées\nQui hante la tempête et se rit de l'archer ;\nExilé sur le sol au milieu des huées,\nSes ailes de géant l'empêchent de marcher.`,
          themes: ["Poésie", "Solitude", "Société"],
          emotions: ["révolte", "mélancolie", "nostalgie"],
          deadlineDate: null,
          deadlineWordCount: null,
          comments: []
        }
      ];

      const cloned = defaultWritings.map((w: any) => ({
        ...w,
        id: "doc_" + Math.random().toString(36).substr(2, 9),
        userEmail: normalizedEmail,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      }));

      const batch = db.batch();
      cloned.forEach(docObj => {
        const ref = db.collection("writings").doc(docObj.id);
        batch.set(ref, docObj);
      });
      await batch.commit();
      return res.json(cloned);
    }

    res.json(writings);

  } catch (err) {
    console.error("Error retrieving writings from Cloud Firestore:", err);
    res.status(500).json({ error: "Impossible de récupérer vos manuscrits." });
  }
});

// Create or update writing in Firestore
app.post("/api/writings", async (req, res) => {
  const writing = req.body;

  if (!writing.id) {
    writing.id = "doc_" + Math.random().toString(36).substr(2, 9);
    writing.createdAt = new Date().toISOString();
  }
  writing.updatedAt = new Date().toISOString();

  try {
    // Generate an automatic version snapshot if the content has changed significantly
    const writingRef = db.collection("writings").doc(writing.id);
    const existingDoc = await writingRef.get();

    if (existingDoc.exists) {
      const oldWriting = existingDoc.data();
      if (
        oldWriting &&
        oldWriting.content !== writing.content &&
        Math.abs((oldWriting.content || "").length - (writing.content || "").length) > 50
      ) {
        const newVersion = {
          id: "ver_" + Math.random().toString(36).substr(2, 9),
          writingId: writing.id,
          title: oldWriting.title || "Titre inconnu",
          content: oldWriting.content || "",
          savedAt: new Date().toISOString(),
          label: `Sauvegarde automatique (${new Date().toLocaleTimeString("fr-FR")})`,
          type: "auto",
        };
        await db.collection("versions").doc(newVersion.id).set(newVersion);
      }
    }

    await writingRef.set(writing);
    res.json(writing);

  } catch (err) {
    console.error("Error saving writing to Cloud Firestore:", err);
    res.status(500).json({ error: "Erreur technique de sauvegarde du projet." });
  }
});

// Delete writing in Firestore
app.delete("/api/writings/:id", async (req, res) => {
  const docId = req.params.id;
  try {
    await db.collection("writings").doc(docId).delete();

    // Clear all snapshot versions of this document to save database size
    const versionsSnap = await db.collection("versions")
      .where("writingId", "==", docId)
      .get();

    const batch = db.batch();
    versionsSnap.forEach(doc => {
      batch.delete(doc.ref);
    });
    await batch.commit();

    res.json({ success: true });

  } catch (err) {
    console.error("Error deleting writing from Cloud Firestore:", err);
    res.status(500).json({ error: "Erreur technique d'effacement du manuscrit." });
  }
});

// Versions checklist from Firestore
app.get("/api/writings/:id/versions", async (req, res) => {
  const docId = req.params.id;
  try {
    const versionsSnap = await db.collection("versions")
      .where("writingId", "==", docId)
      .get();

    const versionsList: any[] = [];
    versionsSnap.forEach(doc => {
      versionsList.push(doc.data());
    });

    // Sort by savedAt descending
    versionsList.sort((a, b) => new Date(b.savedAt).getTime() - new Date(a.savedAt).getTime());
    res.json(versionsList);

  } catch (err) {
    console.error("Error loading versions history:", err);
    res.status(500).json({ error: "Impossible de charger l'historique des sauvegardes." });
  }
});

// Save explicit manual version to Firestore
app.post("/api/writings/:id/versions", async (req, res) => {
  const docId = req.params.id;
  const { id, title, content, label, type, savedAt } = req.body;

  try {
    const newVersion = {
      id: id || "ver_" + Math.random().toString(36).substr(2, 9),
      writingId: docId,
      title: title || "",
      content: content || "",
      savedAt: savedAt || new Date().toISOString(),
      label: label || "Sauvegarde manuelle",
      type: type || "manual",
    };

    await db.collection("versions").doc(newVersion.id).set(newVersion);
    res.json(newVersion);

  } catch (err) {
    console.error("Error logging manual version to Firestore:", err);
    res.status(500).json({ error: "Erreur technique lors de la création du cliché." });
  }
});

// Restore version contents inside Firestore
app.post("/api/writings/:id/versions/:verId/restore", async (req, res) => {
  const { id, verId } = req.params;

  try {
    const versionDoc = await db.collection("versions").doc(verId).get();
    if (!versionDoc.exists) {
      return res.status(404).json({ error: "Version introuvable" });
    }
    const verData = versionDoc.data();

    const writingRef = db.collection("writings").doc(id);
    const writingDoc = await writingRef.get();
    if (!writingDoc.exists) {
      return res.status(404).json({ error: "Document parent introuvable." });
    }

    const updatedWriting = {
      ...writingDoc.data(),
      content: verData?.content || "",
      title: verData?.title || "Sans Titre",
      updatedAt: new Date().toISOString()
    };

    await writingRef.set(updatedWriting);
    res.json(updatedWriting);

  } catch (err) {
    console.error("Error restoring version snapshot in Firestore:", err);
    res.status(500).json({ error: "Erreur de restauration de la strophe." });
  }
});

// Public user Profiles endpoints using Firestore
app.get("/api/profiles", async (req, res) => {
  try {
    const snap = await db.collection("profiles").get();
    const listProfiles: any[] = [];
    snap.forEach(doc => {
      listProfiles.push(doc.data());
    });
    res.json(listProfiles);

  } catch (err) {
    console.error("Error reading profiles from Cloud Firestore:", err);
    res.status(500).json({ error: "Erreur de chargement des auteurs de la guilde." });
  }
});

// POST to update/insert public artist profile
app.post("/api/profiles", async (req, res) => {
  const updatedProfile = req.body;

  if (!updatedProfile.email) {
    return res.status(400).json({ error: "L'adresse email est requise pour le profil d'auteur." });
  }

  const normalizedEmail = updatedProfile.email.trim().toLowerCase();

  try {
    const profileRef = db.collection("profiles").doc(normalizedEmail);
    const existingDoc = await profileRef.get();
    let profileData = {};
    if (existingDoc.exists) {
      profileData = { ...existingDoc.data(), ...updatedProfile };
    } else {
      profileData = updatedProfile;
    }

    await profileRef.set(profileData);
    res.json(profileData);

  } catch (err) {
    console.error("Error updating public profile in Firestore:", err);
    res.status(500).json({ error: "Impossible de mettre à jour votre plume." });
  }
});

// GET private messages involving a specific user email
app.get("/api/messages", async (req, res) => {
  const email = req.query.email as string;
  if (!email) {
    return res.status(400).json({ error: "L'adresse email est requise." });
  }
  const normalizedEmail = email.trim().toLowerCase();
  try {
    const sentSnap = await db.collection("messages").where("senderEmail", "==", normalizedEmail).get();
    const receivedSnap = await db.collection("messages").where("receiverEmail", "==", normalizedEmail).get();
    
    const messages: any[] = [];
    sentSnap.forEach(d => messages.push(d.data()));
    receivedSnap.forEach(d => messages.push(d.data()));
    
    const uniqueMap = new Map<string, any>();
    messages.forEach(m => uniqueMap.set(m.id, m));
    const uniqueList = Array.from(uniqueMap.values());
    
    uniqueList.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    
    res.json(uniqueList);
  } catch (err) {
    console.error("Error fetching messages from Admin Firestore: ", err);
    res.status(500).json({ error: "Impossible de récupérer les missives." });
  }
});

// POST to save a private message
app.post("/api/messages", async (req, res) => {
  const message = req.body;
  if (!message || !message.id || !message.senderEmail || !message.receiverEmail) {
    return res.status(400).json({ error: "Structure de missive incomplète." });
  }
  try {
    await db.collection("messages").doc(message.id).set(message);
    res.json({ success: true, message });
  } catch (err) {
    console.error("Error saving message via Admin Firestore: ", err);
    res.status(500).json({ error: "Impossible d'envoyer la missive." });
  }
});

// Ateliers Collaboratifs (Thematic Writing Workshops)
app.get("/api/workshops", async (req, res) => {
  try {
    const snap = await db.collection("workshops").get();
    const workshopsList: any[] = [];
    snap.forEach(d => workshopsList.push(d.data()));
    
    // Auto-seed default workshops if empty
    if (workshopsList.length === 0) {
      const initialWorkshops = [
        {
          id: "ws_givre",
          title: "Poésie Floconneuse & Givre",
          description: "Rédigez un poème mélancolique explorant le givre matinal et les métaphores du silence glacial.",
          week: "Semaine en cours",
          status: "active", // active | closed
          submissions: [
            {
              id: "sub_demo_1",
              userEmail: "marceline@desbordes.com",
              penName: "La Muse Romantique",
              title: "Le Cristal Suspendu",
              content: "Le givre a déposé son linceul de satin\nSur les branches frileuses de mon vieux jardin.\nComme un vers oublié, une rime endormie,\nChaque perle de glace chante une harmonie.",
              createdAt: new Date(Date.now() - 3600000 * 24).toISOString(),
              critiques: [
                {
                  id: "crit_1",
                  author: "Admin Plume",
                  text: "Une très belle ballade hivernale, la césure du deuxième vers est impeccable !",
                  createdAt: new Date().toISOString()
                }
              ]
            }
          ]
        },
        {
          id: "ws_crepuscule",
          title: "L'Heure d'Or & Spleen",
          description: "Capturez la transition éphémère du crépuscule où la lumière décline et laisse place aux nostalgies rêveuses.",
          week: "Prochaine semaine",
          status: "upcoming",
          submissions: []
        }
      ];
      const batch = db.batch();
      initialWorkshops.forEach(ws => {
        batch.set(db.collection("workshops").doc(ws.id), ws);
      });
      await batch.commit();
      return res.json(initialWorkshops);
    }
    
    res.json(workshopsList);
  } catch (err) {
    console.error("Error retrieving workshops:", err);
    res.status(500).json({ error: "Impossible de récupérer les ateliers." });
  }
});

app.post("/api/workshops", async (req, res) => {
  const ws = req.body;
  if (!ws.title || !ws.description) {
    return res.status(400).json({ error: "Titre et description requis." });
  }
  if (!ws.id) {
    ws.id = "ws_" + Math.random().toString(36).substring(2, 11);
  }
  ws.submissions = ws.submissions || [];
  ws.status = ws.status || "active";
  try {
    await db.collection("workshops").doc(ws.id).set(ws);
    res.json(ws);
  } catch (err) {
    console.error("Error creating workshop:", err);
    res.status(500).json({ error: "Impossible de créer l'atelier." });
  }
});

app.post("/api/workshops/:id/submissions", async (req, res) => {
  const wsId = req.params.id;
  const sub = req.body; // { userEmail, penName, title, content }
  if (!sub.userEmail || !sub.title || !sub.content) {
    return res.status(400).json({ error: "Informations de soumission incomplètes." });
  }
  sub.id = "sub_" + Math.random().toString(36).substring(2, 11);
  sub.createdAt = new Date().toISOString();
  sub.critiques = [];
  try {
    const wsRef = db.collection("workshops").doc(wsId);
    const snap = await wsRef.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "Atelier non trouvé." });
    }
    const ws = snap.data();
    ws.submissions.push(sub);
    await wsRef.set(ws);
    res.json(sub);
  } catch (err) {
    console.error("Error submitting to workshop:", err);
    res.status(500).json({ error: "Erreur lors de la soumission de votre œuvre." });
  }
});

app.post("/api/workshops/:id/submissions/:subId/critiques", async (req, res) => {
  const { id: wsId, subId } = req.params;
  const { author, text } = req.body;
  if (!author || !text) {
    return res.status(400).json({ error: "Auteur et texte requis." });
  }
  const newCritique = {
    id: "crit_" + Math.random().toString(36).substring(2, 11),
    author,
    text,
    createdAt: new Date().toISOString()
  };
  try {
    const wsRef = db.collection("workshops").doc(wsId);
    const snap = await wsRef.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "Atelier non trouvé." });
    }
    const ws = snap.data();
    const sub = ws.submissions.find((s: any) => s.id === subId);
    if (!sub) {
      return res.status(404).json({ error: "Soumission non trouvée." });
    }
    sub.critiques = sub.critiques || [];
    sub.critiques.push(newCritique);
    await wsRef.set(ws);
    res.json(newCritique);
  } catch (err) {
    console.error("Error critiques saving:", err);
    res.status(500).json({ error: "Erreur lors de l'enregistrement de votre critique." });
  }
});

// Recueils Collectifs Participatifs
app.get("/api/recueils", async (req, res) => {
  try {
    const snap = await db.collection("recueils").get();
    const list: any[] = [];
    snap.forEach(d => list.push(d.data()));
    
    // Auto-seed if empty
    if (list.length === 0) {
      const demoRecueil = {
        id: "rec_demo_1",
        title: "Symphonie de la Brume",
        description: "Un recueil collectif unissant d'humbles versets mélancoliques sur la buée, les songes vaporeux et les matins d'esprit.",
        createdBy: "johnbikaitsotra@gmail.com",
        createdAt: new Date().toISOString(),
        contributors: ["johnbikaitsotra@gmail.com", "marceline@desbordes.com"],
        writings: [
          {
            id: "writ_r1",
            title: "Le Nuage Vagabond",
            content: "Un morceau de vapeur voyageant dans le gris,\nQui s'étire et se meurt sans laisser de pays.",
            authorEmail: "johnbikaitsotra@gmail.com",
            authorPenName: "Admin Plume"
          },
          {
            id: "writ_r2",
            title: "Brume Matinale",
            content: "Les chemins s'enveloppent d'une nappe d'argent,\nOù les spectres d'hier marchent sereinement.",
            authorEmail: "marceline@desbordes.com",
            authorPenName: "La Muse Romantique"
          }
        ]
      };
      await db.collection("recueils").doc(demoRecueil.id).set(demoRecueil);
      return res.json([demoRecueil]);
    }
    res.json(list);
  } catch (err) {
    console.error("Error retrieving recueils:", err);
    res.status(500).json({ error: "Erreur de chargement des recueils." });
  }
});

app.post("/api/recueils", async (req, res) => {
  const rec = req.body; // { title, description, createdBy, authorPenName }
  if (!rec.title || !rec.description) {
    return res.status(400).json({ error: "Titre et description requis." });
  }
  rec.id = rec.id || "rec_" + Math.random().toString(36).substring(2, 11);
  rec.createdAt = new Date().toISOString();
  rec.contributors = rec.contributors || [rec.createdBy];
  rec.writings = rec.writings || [];
  try {
    await db.collection("recueils").doc(rec.id).set(rec);
    res.json(rec);
  } catch (err) {
    console.error("Error creating recueil:", err);
    res.status(500).json({ error: "Erreur lors de la création du recueil." });
  }
});

app.post("/api/recueils/:id/add", async (req, res) => {
  const recId = req.params.id;
  const writingObj = req.body; // { id, title, content, authorEmail, authorPenName }
  if (!writingObj.title || !writingObj.content || !writingObj.authorEmail) {
    return res.status(400).json({ error: "Données de soumission insuffisantes." });
  }
  try {
    const recRef = db.collection("recueils").doc(recId);
    const snap = await recRef.get();
    if (!snap.exists) {
      return res.status(404).json({ error: "Recueil non trouvé." });
    }
    const rec = snap.data();
    if (!rec.contributors.includes(writingObj.authorEmail)) {
      rec.contributors.push(writingObj.authorEmail);
    }
    // Check if writing already in recueil
    const index = rec.writings.findIndex((w: any) => w.id === writingObj.id || (w.title === writingObj.title && w.authorEmail === writingObj.authorEmail));
    if (index >= 0) {
      rec.writings[index] = writingObj;
    } else {
      rec.writings.push(writingObj);
    }
    await recRef.set(rec);
    res.json(rec);
  } catch (err) {
    console.error("Error adding to recueil:", err);
    res.status(500).json({ error: "Erreur de contribution au recueil." });
  }
});

// Commentaires Annotés Partagés (Marges Partagées)
app.get("/api/annotated-writings", async (req, res) => {
  try {
    const snap = await db.collection("annotated_writings").get();
    const list: any[] = [];
    snap.forEach(d => list.push(d.data()));
    
    // Auto-seed if empty
    if (list.length === 0) {
      const demoAnnotated = {
        id: "annot_demo_1",
        title: "Soleil Couchant d'Été",
        content: "Voici les soirs d'été où la lande s'enflamme,\nOù la brise s'envole en emportant mon âme.\nLe ruisseau de saphir reflète un pourpre pur,\nDernier clin d'œil du jour sur l'immensité d'azur.",
        authorEmail: "johnbikaitsotra@gmail.com",
        authorPenName: "Admin Plume",
        publishedAt: new Date().toISOString(),
        comments: [
          {
            id: "comm_demo_1",
            selectedText: "la lande s'enflamme",
            author: "La Muse Romantique",
            text: "Cette métaphore de l'embrasement est magnifique, elle donne un élan lyrique immédiat au poème.",
            createdAt: new Date().toISOString()
          },
          {
            id: "comm_demo_2",
            selectedText: "ruisseau de saphir",
            author: "Victor de Guilde",
            text: "Très bel usage d'oxymore ou de contraste de couleur entre le saphir (bleu) et le pourpre pur (rouge/rose) !",
            createdAt: new Date().toISOString()
          }
        ]
      };
      await db.collection("annotated_writings").doc(demoAnnotated.id).set(demoAnnotated);
      return res.json([demoAnnotated]);
    }
    res.json(list);
  } catch (err) {
    console.error("Error fetching annotated writings:", err);
    res.status(500).json({ error: "Erreur lors du chargement des œuvres annotées." });
  }
});

app.post("/api/annotated-writings", async (req, res) => {
  const data = req.body; // { id, title, content, authorEmail, authorPenName, comments }
  if (!data.id || !data.title || !data.content) {
    return res.status(400).json({ error: "Données requises incomplètes." });
  }
  data.publishedAt = new Date().toISOString();
  try {
    await db.collection("annotated_writings").doc(data.id).set(data);
    res.json({ success: true, published: data });
  } catch (err) {
    console.error("Error publishing annotated writing:", err);
    res.status(500).json({ error: "Erreur lors de la publication annotée." });
  }
});

app.delete("/api/annotated-writings/:id", async (req, res) => {
  const { id } = req.params;
  try {
    await db.collection("annotated_writings").doc(id).delete();
    res.json({ success: true, message: "Œuvre dépubliée de la galerie publique." });
  } catch (err) {
    console.error("Error deleting annotated writing:", err);
    res.status(500).json({ error: "Erreur lors du retrait de l'œuvre." });
  }
});

// Productivity stats endpoints using Firestore
app.get("/api/productivity", async (req, res) => {
  const email = req.query.email as string;

  try {
    let query: any = db.collection("productivity");
    if (email) {
      query = query.where("userEmail", "==", email.trim().toLowerCase());
    }
    const snap = await query.get();
    const listProd: any[] = [];
    snap.forEach(doc => {
      listProd.push(doc.data());
    });
    res.json(listProd);

  } catch (err) {
    console.error("Error listing productivity stats from Firestore:", err);
    res.status(500).json({ error: "Erreur de synchro des métriques journalières." });
  }
});

// Push productivity log into Cloud Firestore
app.post("/api/productivity", async (req, res) => {
  const { date, wordsWritten, minutesSpent, email } = req.body;
  const userEmail = email ? email.trim().toLowerCase() : "anonymous_writer";
  const dayId = `${userEmail}_${date}`;

  try {
    const docRef = db.collection("productivity").doc(dayId);
    const snap = await docRef.get();

    let finalLog = {
      date,
      wordsWritten: wordsWritten || 0,
      minutesSpent: minutesSpent || 0,
      userEmail
    };

    if (snap.exists) {
      const exitingLog = snap.data();
      finalLog.wordsWritten += (exitingLog?.wordsWritten || 0);
      finalLog.minutesSpent += (exitingLog?.minutesSpent || 0);
    }

    await docRef.set(finalLog);
    res.json({ success: true, updatedDay: finalLog });

  } catch (err) {
    console.error("Error reporting log productivity inside Firestore:", err);
    res.status(500).json({ error: "Erreur lors du calcul du journal d'écriture." });
  }
});

// Gemini endpoints preserved exactly for creative workspace assistance
// Gemini-powered text styling analytics
app.post("/api/ai/analyze", async (req, res) => {
  const { title, content, userEmail } = req.body;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: "Le contenu est vide." });
  }

  const activeAi = await getAIClientForUser(userEmail);

  if (!activeAi) {
    console.warn("GEMINI_API_KEY non configurée. Utilisation de l'analyse locale simulée.");
    const words = content.trim().split(/\s+/).length;
    const chars = content.length;
    const lines = content.split("\n").filter((l: string) => l.trim().length > 0).length;

    return res.json({
      wordCount: words,
      charCount: chars,
      linesCount: lines,
      readabilityScore: Math.min(100, Math.max(20, 100 - lines * 2)),
      lexicalRichness: 72,
      emotionScores: {
        melancolie: content.includes("noir") || content.includes("pleure") || content.includes("mort") ? 80 : 30,
        joie: content.includes("soleil") || content.includes("sourire") || content.includes("merveille") ? 85 : 20,
        nostalgie: content.includes("souvenir") || content.includes("vieux") || content.includes("autrefois") ? 90 : 25,
        serenite: content.includes("calme") || content.includes("paisible") || content.includes("doux") ? 80 : 40,
        mystere: content.includes("ombre") || content.includes("nuit") || content.includes("secret") ? 85 : 35,
        revolte: content.includes("cri") || content.includes("sang") || content.includes("non") ? 75 : 15,
      },
      suggestions: [
        "Augmentez la variété d'images sensorielles (le goût, l'odorat, le toucher).",
        "Essayez de casser la régularité rythmique pour insuffler de la surprise.",
        "Favorisez les tournures métaphoriques plutôt que les descriptions littérales."
      ]
    });
  }

  try {
    const words = content.trim().split(/\s+/).length;
    const chars = content.length;
    const lines = content.split("\n").length;

    const analysisPrompt = `Analyse l'écriture littéraire suivante de manière détaillée :
Titre : ${title || "Sans Titre"}
Contenu :
${content}

Tu es un critique littéraire et un poète chevronné. Analyse méticuleusement le texte et fournis un bilan de style au format JSON :
1. "readabilityScore" : une note de confort et fluidité d'écriture poétique (de 0 à 100).
2. "lexicalRichness" : une estimation de la richesse et variété du vocabulaire (de 0 à 100).
3. "emotionScores" : un dictionnaire avec le pourcentage d'intensité des émotions suivantes : (melancolie, joie, nostalgie, serenite, mystere, revolte) - chaque émotion va de 0 à 100.
4. "suggestions" : un tableau contenant exactement 3 suggestions d'amélioration constructives, inspirantes et poétiques en français (par rapport aux rimes, au rythme des syllabes, au choix des images poétiques ou aux métaphores).

Renvoie UNIQUEMENT le JSON sous cette structure exacte :
{
  "readabilityScore": nombre,
  "lexicalRichness": nombre,
  "emotionScores": {
    "melancolie": nombre,
    "joie": nombre,
    "nostalgie": nombre,
    "serenite": nombre,
    "mystere": nombre,
    "revolte": nombre
  },
  "suggestions": ["Sugg 1", "Sugg 2", "Sugg 3"]
}`;

    const response = await retryWithBackoff(() =>
      activeAi.models.generateContent({
        model: "gemini-3.5-flash",
        contents: analysisPrompt,
        config: {
          responseMimeType: "application/json",
          responseSchema: {
            type: Type.OBJECT,
            properties: {
              readabilityScore: {
                type: Type.INTEGER,
                description: "Note de confort et fluidité d'écriture poétique (de 0 à 100)."
              },
              lexicalRichness: {
                type: Type.INTEGER,
                description: "Estimation de la richesse et variété du vocabulaire (de 0 à 100)."
              },
              emotionScores: {
                type: Type.OBJECT,
                description: "Pourcentage d'intensité des émotions poétiques de 0 à 100.",
                properties: {
                  melancolie: { type: Type.INTEGER },
                  joie: { type: Type.INTEGER },
                  nostalgie: { type: Type.INTEGER },
                  serenite: { type: Type.INTEGER },
                  mystere: { type: Type.INTEGER },
                  revolte: { type: Type.INTEGER },
                },
                required: ["melancolie", "joie", "nostalgie", "serenite", "mystere", "revolte"],
              },
              suggestions: {
                type: Type.ARRAY,
                items: {
                  type: Type.STRING,
                },
                description: "Tableau contenant exactement 3 suggestions d'amélioration constructives."
              },
            },
            required: ["readabilityScore", "lexicalRichness", "emotionScores", "suggestions"],
          },
        },
      })
    );

    const resultText = response.text ? response.text.trim() : "{}";
    let cleanedJson = resultText;
    if (cleanedJson.startsWith("```")) {
      cleanedJson = cleanedJson.replace(/^```json\s*/i, "").replace(/```$/, "").trim();
    }
    const data = JSON.parse(cleanedJson);

    res.json({
      wordCount: words,
      charCount: chars,
      linesCount: lines,
      readabilityScore: data.readabilityScore || 75,
      lexicalRichness: data.lexicalRichness || 80,
      emotionScores: data.emotionScores || {
        melancolie: 30,
        joie: 30,
        nostalgie: 30,
        serenite: 30,
        mystere: 30,
        revolte: 30,
      },
      suggestions: data.suggestions || [
        "Affinez la cadence en lisant vos vers à haute voix.",
        "Renforcez le contraste ombres/lumières dans les strophes.",
        "Variez les structures rythmiques pour donner du souffle au texte."
      ],
    });
  } catch (error: any) {
    console.warn("Gemini context analysis was bypassed. Falling back to local analysis model due to high demand:", error?.message || error);
    
    const words = content.trim().split(/\s+/).length;
    const chars = content.length;
    const lines = content.split("\n").filter((l: string) => l.trim().length > 0).length;

    res.json({
      wordCount: words,
      charCount: chars,
      linesCount: lines,
      readabilityScore: Math.min(100, Math.max(30, 100 - lines * 1.5)),
      lexicalRichness: 65,
      emotionScores: {
        melancolie: content.includes("noir") || content.includes("pleure") || content.includes("mort") || content.includes("triste") ? 75 : 35,
        joie: content.includes("soleil") || content.includes("sourire") || content.includes("merveille") || content.includes("heureux") ? 70 : 30,
        nostalgie: content.includes("souvenir") || content.includes("vieux") || content.includes("autrefois") || content.includes("passé") ? 80 : 40,
        serenite: content.includes("calme") || content.includes("paisible") || content.includes("doux") || content.includes("paix") ? 75 : 45,
        mystere: content.includes("ombre") || content.includes("nuit") || content.includes("secret") || content.includes("sombre") ? 80 : 35,
        revolte: content.includes("cri") || content.includes("sang") || content.includes("non") || content.includes("colère") ? 65 : 20,
      },
      suggestions: [
        "Le service d'analyse par IA est temporairement saturé (limite de requêtes atteinte), mais vous pouvez continuer d'écrire !",
        "Essayez de varier le rythme mélodique de vos rimes pour surprendre le lecteur.",
        "Favorisez les évocations sensuelles (les odeurs, les sons, les textures) par rapport au sens brut des mots."
      ]
    });
  }
});

// Interactive Teammate Companion endpoint
app.post("/api/ai/chat", async (req, res) => {
  const { messages, documentTitle, documentContent, userEmail } = req.body;

  const activeAi = await getAIClientForUser(userEmail);

  if (!activeAi) {
    const isPlaceholder = process.env.GEMINI_API_KEY === "MY_GEMINI_API_KEY";
    const missingReason = isPlaceholder 
      ? "votre clé GEMINI_API_KEY est configurée avec la valeur d'exemple par défaut ('MY_GEMINI_API_KEY')"
      : "aucune clé GEMINI_API_KEY n'est configurée dans l'environnement";
    
    return res.json({
      text: `Bonjour ! Je suis Plume, votre compagnon littéraire.\n\nActuellement, je fonctionne en mode d'inspiration locale limité car ${missingReason}.\n\nPour me donner toute ma puissance créative sur votre serveur Docker, veuillez :\n1. Obtenir une clé d'API Gemini gratuite sur Google AI Studio.\n2. Configurer la variable d'environnement \`GEMINI_API_KEY\` avec votre clé réelle dans votre fichier \`.env\` ou vos paramètres Docker Compose.\n3. Redémarrer votre conteneur.\n\nEn attendant, écrivez librement et je reste disponible pour vous inspirer !`
    });
  }

  try {
    const formattedHistory = messages.map((m: any) => ({
      role: m.role === "assistant" ? "model" as const : "user" as const,
      parts: [{ text: m.content }]
    }));

    const systemInstruction = `Tu es "Plume", un assistant IA et coéquipier d'écriture littéraire de haut niveau. 
Tu accompagnes l'utilisateur de manière amicale, poétique et constructive dans la création de ses textes.
Voici les détails du document actif sur lequel l'auteur travaille actuellement :
Titre : ${documentTitle || "Sans Titre"}
Contenu :
"""
${documentContent || ""}
"""

Conseille-le de manière inspirée sur ses tournures, aide-le à rimer, suggère la strophe suivante si demandé.
Parle toujours en français, avec un ton bienveillant et élégant. Garde tes interventions compactes et passionnantes pour encourager l'acte de création.`;

    const lastUserMessage = messages[messages.length - 1];
    
    const response = await retryWithBackoff(() => 
      activeAi.models.generateContent({
        model: "gemini-3.5-flash",
        contents: [
          ...formattedHistory.slice(0, -1),
          { role: "user" as const, parts: [{ text: `Contexte du document : ${documentTitle}. \n\nMessage de l'auteur : ${lastUserMessage.content}` }] }
        ],
        config: {
          systemInstruction,
          temperature: 0.8,
        },
      })
    );

    res.json({ text: response.text });
  } catch (error: any) {
    const errorMsg = error?.message || String(error);
    console.warn("Gemini Chat assistant failed:", errorMsg);
    
    let userHelpfulMsg = "Bonjour ! Il semble que notre canal de communication direct avec Plume soit temporairement saturé en raison des limites de requêtes de l'API Gemini (quota dépassé). Pas de panique, je reste à vos côtés en mode d'inspiration locale ! \n\nContinuez d'écrire vos créations, et n'hésitez pas à me solliciter de nouveau dans quelques minutes.";
    
    if (errorMsg.includes("API key not valid") || errorMsg.includes("API_KEY_INVALID") || errorMsg.includes("key is invalid") || errorMsg.includes("API key")) {
      userHelpfulMsg = "Bonjour ! Je suis Plume. Il s'avère que la clé d'API `GEMINI_API_KEY` configurée sur votre serveur local n'est pas reconnue ou est invalide.\n\nVeuillez vérifier la validité de votre clé créative Gemini dans votre fichier `.env` ou vos configurations Docker.";
    } else if (errorMsg.includes("ENOTFOUND") || errorMsg.includes("EAI_AGAIN") || errorMsg.includes("connect ECONNREFUSED") || errorMsg.includes("fetch failed")) {
      userHelpfulMsg = "Bonjour ! C'est Plume.\n\nJe n'ai pas pu me connecter aux serveurs Google Gemini (erreur de réseau ou DNS). Veuillez vérifier la connectivité Internet de votre conteneur Docker ou si un pare-feu/proxy bloque les connexions sortantes vers `generativelanguage.googleapis.com`.";
    }
    
    res.json({ text: userHelpfulMsg });
  }
});

// Endpoint to generate a poetic title based on content
app.post("/api/ai/generate-title", async (req, res) => {
  const { content, userEmail } = req.body;

  if (!content || content.trim().length === 0) {
    return res.json({ title: "Un Songe Silencieux" });
  }

  const activeAi = await getAIClientForUser(userEmail);

  if (!activeAi) {
    return res.json({ title: "Sérénité d'un Instant" });
  }

  try {
    const response = await retryWithBackoff(() =>
      activeAi.models.generateContent({
        model: "gemini-3.5-flash",
        contents: `Voici un texte poétique / littéraire :\n\n${content}\n\nSuggère un titre magnifique, court, profond et extrêmement poétique en français pour cette œuvre. Renvoie uniquement le titre suggéré, sans guillemets, sans fioritures ni explications.`,
        config: {
          temperature: 0.9,
        },
      })
    );

    const generatedTitle = response.text ? response.text.trim().replace(/^["']|["']$/g, "") : "Sans Titre Évocateur";
    res.json({ title: generatedTitle });
  } catch (error: any) {
    console.warn("Title generation failed, falling back to default:", error);
    res.json({ title: "Méditation Poétique" });
  }
});

// Endpoint to generate a continuation of the writing
app.post("/api/ai/write-continuation", async (req, res) => {
  const { title, content, userEmail } = req.body;

  const activeAi = await getAIClientForUser(userEmail);

  if (!activeAi) {
    return res.json({
      continuation: "\n\n(Le murmure du vent s'élève à nouveau,\nL'encre espère le retour du jour nouveau,\nQuand la muse guidera l'esprit de sa plume.)"
    });
  }

  try {
    const prompt = `Voici une œuvre littéraire en cours de création :
Titre : ${title || "Sans Titre"}
Contenu existant :
${content || "Écrivez vos vers ou prose ici..."}

Poursuis l'écriture de cette œuvre. Écris la suite logique, harmonieuse et inspirée de ce texte (environ 1 ou 2 strophes sublimes si c'est de la poésie, ou un paragraphe élégant si c'est de la prose). Conserve exactement le même style de langage, le rythme, les rimes et le ton. Renvoie uniquement le texte de la suite suggérée, sans préambule ni explications, en commençant directement par la suite.`;

    const response = await retryWithBackoff(() =>
      activeAi.models.generateContent({
        model: "gemini-3.5-flash",
        contents: prompt,
        config: {
          temperature: 0.85,
        },
      })
    );

    const continuation = response.text ? "\n\n" + response.text.trim() : "";
    res.json({ continuation });
  } catch (error: any) {
    console.warn("Continuation writing failed, falling back to gentle poet line:", error);
    res.json({
      continuation: "\n\nEt dans le silence bleu de la nuit étoilée,\nS'éveille le chant d'une harpe oubliée."
    });
  }
});

// Start listening and run initializer seeds
async function startServer() {
  // Vite setup for developer visual previews
  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  app.listen(PORT, "0.0.0.0", () => {
    console.log(`[L'Atelier Littéraire Server (Firestore BFF)] Connected cloud-side on port ${PORT}`);
    // Run startup cloud seedings in the background so it never blocks the port health check
    seedDefaultsToFirestore().catch(err => {
      console.error("[Firebase Admin] Seeding initialization failed:", err);
    });
  });
}

startServer();
