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
const PORT = 3000;

// Initialize Firebase Admin SDK using local applet configurations
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
let fbConfig: any = {};
if (fs.existsSync(configPath)) {
  fbConfig = JSON.parse(fs.readFileSync(configPath, "utf8"));
}

admin.initializeApp({
  projectId: fbConfig.projectId,
});

const db = getFirestore(undefined, fbConfig.firestoreDatabaseId);

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
    try {
      userRecord = await getAuth().getUserByEmail(adminEmail);
      // Compte existant : on réinitialise son mot de passe pour faciliter la reconnexion locale
      await getAuth().updateUser(userRecord.uid, {
        password: defaultPassword,
        displayName: "John Bikaitsotra"
      });
      console.log(`[Firebase Admin] Mot de passe admin réinitialisé par défaut à: "${defaultPassword}"`);
    } catch (authErr: any) {
      if (authErr.code === "auth/user-not-found") {
        userRecord = await getAuth().createUser({
          email: adminEmail,
          password: defaultPassword,
          displayName: "John Bikaitsotra",
          emailVerified: true
        });
        console.log(`[Firebase Admin] Compte admin créé avec succès avec le mot de passe par défaut: "${defaultPassword}"`);
      } else {
        throw authErr;
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
      uid: userRecord.uid,
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
      if (authErr.code === "auth/email-already-exists") {
        const existingAuth = await getAuth().getUserByEmail(normalizedEmail);
        uid = existingAuth.uid;
      } else {
        throw authErr;
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
  const { title, content, label } = req.body;

  try {
    const newVersion = {
      id: "ver_" + Math.random().toString(36).substr(2, 9),
      writingId: docId,
      title,
      content,
      savedAt: new Date().toISOString(),
      label: label || "Sauvegarde manuelle",
      type: "manual",
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
  const { title, content } = req.body;

  if (!content || content.trim().length === 0) {
    return res.status(400).json({ error: "Le contenu est vide." });
  }

  if (!ai) {
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
      ai.models.generateContent({
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
  const { messages, documentTitle, documentContent } = req.body;

  if (!ai) {
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
      ai.models.generateContent({
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
  const { content } = req.body;

  if (!content || content.trim().length === 0) {
    return res.json({ title: "Un Songe Silencieux" });
  }

  if (!ai) {
    return res.json({ title: "Sérénité d'un Instant" });
  }

  try {
    const response = await retryWithBackoff(() =>
      ai.models.generateContent({
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
  const { title, content } = req.body;

  if (!ai) {
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
      ai.models.generateContent({
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
