/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { BookOpen, Mail, Lock, User, Sparkles, Check, RefreshCw } from "lucide-react";
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  updateProfile 
} from "firebase/auth";
import { auth } from "../firebase";
import { saveProfileToFirestore } from "../lib/firestoreService";

interface AuthPageProps {
  onLoginSuccess: (user: { email: string; displayName: string; penName: string }) => void;
}

export default function AuthPage({ onLoginSuccess }: AuthPageProps) {
  const [isRegister, setIsRegister] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [penName, setPenName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  
  // Google config modal state
  const [isGoogleModalOpen, setIsGoogleModalOpen] = useState(false);
  const [redirectUriHint, setRedirectUriHint] = useState("");

  useEffect(() => {
    if (typeof window !== "undefined") {
      setRedirectUriHint(`${window.location.origin}/auth/callback`);
    }
  }, []);

  // Listen for message from popup
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const origin = event.origin;
      if (!origin.endsWith(".run.app") && !origin.includes("localhost")) {
        return;
      }
      if (event.data?.type === "OAUTH_AUTH_SUCCESS" && event.data.user) {
        setSuccess("Connexion Google réussie !");
        setTimeout(() => {
          onLoginSuccess(event.data.user);
        }, 800);
      } else if (event.data?.type === "OAUTH_AUTH_ERROR") {
        setError(event.data.error || "Erreur lors de la connexion Google");
      }
    };
    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, [onLoginSuccess]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsLoading(true);

    const normalizedEmail = email.trim().toLowerCase();
    const url = isRegister ? "/api/auth/register" : "/api/auth/login";
    const body = isRegister 
      ? { email: normalizedEmail, password, displayName, penName } 
      : { email: normalizedEmail, password };

    try {
      // 1. Attempt to Authenticate with Firebase first, as Firestore requires authenticated identity
      try {
        if (isRegister) {
          const userCredential = await createUserWithEmailAndPassword(auth, normalizedEmail, password);
          await updateProfile(userCredential.user, { displayName });
          
          // Auto-provision or update their Public Profile in Firestore
          try {
            await saveProfileToFirestore({
              email: normalizedEmail,
              displayName,
              penName: penName || displayName || normalizedEmail.split("@")[0],
              bio: "Artiste connecté à l'Atelier Littéraire.",
              avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200",
              publishedWorks: [],
              socials: {}
            });
          } catch (profileErr) {
            console.warn("Could not save profile directly into Firestore, continuing:", profileErr);
          }
        } else {
          await signInWithEmailAndPassword(auth, normalizedEmail, password);
        }
      } catch (fbErr: any) {
        // If Email/Password provider is disabled in Firebase, guide the user or proceed with server login only
        if (fbErr.code === "auth/operation-not-allowed" || fbErr.code === "auth/configuration-not-found") {
          console.warn("Email/Password Auth provider is disabled in Firebase console. Logging in server-side only.");
        } else {
          // Key Firebase auth issues (e.g. wrong password / user not found) should block proceeding
          throw new Error(`[Firebase Auth] ${fbErr.message || "Erreur d'authentification"}`);
        }
      }

      // 2. Synchronize / Register with local Express server
      const response = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body)
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Une erreur s'est produite lors de l'authentification sur le serveur.");
      }

      const loggedUser = {
        email: normalizedEmail,
        displayName: data.user?.displayName || displayName || normalizedEmail.split("@")[0],
        penName: data.user?.penName || penName || displayName || normalizedEmail.split("@")[0]
      };

      if (isRegister) {
        setSuccess("Votre compte d'écrivain a bien été créé ! Redirection...");
        setTimeout(() => {
          onLoginSuccess(loggedUser);
        }, 1500);
      } else {
        onLoginSuccess(loggedUser);
      }
    } catch (err: any) {
      setError(err.message || "Impossible de se connecter au serveur d'écriture.");
    } finally {
      setIsLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    setError(null);
    setIsLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      // Enforce Google Account selector prompt
      provider.setCustomParameters({
        prompt: "select_account"
      });
      
      const result = await signInWithPopup(auth, provider);
      const currentUser = result.user;
      
      if (currentUser && currentUser.email) {
        setSuccess("Connexion Google réussie !");
        
        const email = currentUser.email.toLowerCase();
        const displayName = currentUser.displayName || email.split("@")[0];
        const penName = displayName;
        
        const loggedUser = {
          email,
          displayName,
          penName
        };
        
        // Auto-provision or update their Public Profile in Firestore
        try {
          await saveProfileToFirestore({
            email,
            displayName,
            penName,
            bio: "Artiste connecté via Google à l'Atelier Littéraire.",
            avatarUrl: currentUser.photoURL || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200",
            publishedWorks: [],
            socials: {}
          });
        } catch (profileErr) {
          console.warn("Could not save profile directly into Firestore, logging in anyway:", profileErr);
        }
        
        setTimeout(() => {
          onLoginSuccess(loggedUser);
        }, 800);
      } else {
        throw new Error("Impossible de récupérer les détails de l'utilisateur Google.");
      }
    } catch (err: any) {
      console.error("Firebase Auth Google Error:", err);
      // Fallback instruction dialog in case of blocker or popup cancelation
      setError(err.message || "Erreur de connexion Google. Veuillez réessayer.");
      setIsGoogleModalOpen(true);
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to test via simulation right now
  const handleSimulateGoogleLogin = (demoRole: "admin" | "author") => {
    setIsGoogleModalOpen(false);
    setSuccess("Simulation de connexion Google réussie !");
    const demoUser = demoRole === "admin" 
      ? { email: "johnbikaitsotra@gmail.com", displayName: "John Bikaitsotra", penName: "Admin Plume" }
      : { email: "arthur.rimbaud@plume.fr", displayName: "Arthur Rimbaud", penName: "Le Voyant" };
    
    setTimeout(() => {
      onLoginSuccess(demoUser);
    }, 1000);
  };

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-[#E0D7D0] flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden select-none">
      {/* Background radial accents */}
      <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-[#C5A059]/5 blur-3xl pointer-events-none" />
      <div className="absolute bottom-1/4 right-1/4 w-96 h-96 rounded-full bg-slate-800/20 blur-3xl pointer-events-none" />

      <div className="max-w-md w-full z-10 animate-fade-in">
        {/* Brand header */}
        <div className="text-center mb-8">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#C5A059]/10 border border-[#C5A059]/20 mb-4 animate-pulse">
            <BookOpen className="w-7 h-7 text-[#C5A059]" />
          </div>
          <h1 className="text-3xl font-bold font-serif text-[#EAE6E1] tracking-tight uppercase">Plume</h1>
          <p className="text-xs text-[#C5A059]/70 font-mono tracking-widest mt-1.5 uppercase">L'Atelier d'Écriture Littéraire</p>
        </div>

        {/* Auth card overlay */}
        <div className="bg-[#0D0D0D] border border-white/10 rounded-2xl p-6 sm:p-8 shadow-2xl relative overflow-hidden">
          {/* Accent top gradient stripe */}
          <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-transparent via-[#C5A059]/60 to-transparent" />

          {/* Form switch tabs */}
          <div className="flex border-b border-white/10 mb-6">
            <button
              onClick={() => { setIsRegister(false); setError(null); }}
              className={`flex-1 pb-3 text-sm font-semibold tracking-wide transition uppercase ${
                !isRegister 
                  ? "text-[#C5A059] border-b-2 border-[#C5A059]" 
                  : "text-[#E0D7D0]/40 hover:text-[#E0D7D0]/70 cursor-pointer"
              }`}
            >
              Connexion
            </button>
            <button
              onClick={() => { setIsRegister(true); setError(null); }}
              className={`flex-1 pb-3 text-sm font-semibold tracking-wide transition uppercase ${
                isRegister 
                  ? "text-[#C5A059] border-b-2 border-[#C5A059]" 
                  : "text-[#E0D7D0]/40 hover:text-[#E0D7D0]/70 cursor-pointer"
              }`}
            >
              Créer un Compte
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            {error && (
              <div className="p-3 rounded-lg bg-red-950/40 border border-red-500/30 text-red-400 text-xs text-center font-medium">
                {error}
              </div>
            )}
            {success && (
              <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 text-xs flex items-center justify-center gap-2 font-medium">
                <Check className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>{success}</span>
              </div>
            )}

            {isRegister && (
              <>
                <div className="space-y-1">
                  <label className="block text-[10px] text-slate-400 font-mono uppercase tracking-wider">Nom complet de l'auteur</label>
                  <div className="relative">
                    <User className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                    <input
                      type="text"
                      required
                      placeholder="Arthur Rimbaud"
                      value={displayName}
                      onChange={(e) => setDisplayName(e.target.value)}
                      className="w-full bg-[#1A1A1A] border border-white/5 rounded-lg py-2 pl-9 pr-3 text-sm text-[#EAE6E1] focus:outline-none focus:border-[#C5A059]/60 transition font-sans placeholder-slate-600"
                    />
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="block text-[10px] text-slate-400 font-mono uppercase tracking-wider">Nom de plume (d'artiste)</label>
                  <div className="relative">
                    <Sparkles className="absolute left-3 top-2.5 w-4 h-4 text-[#C5A059]/75" />
                    <input
                      type="text"
                      placeholder="Le Voyant (Optionnel)"
                      value={penName}
                      onChange={(e) => setPenName(e.target.value)}
                      className="w-full bg-[#1A1A1A] border border-white/5 rounded-lg py-2 pl-9 pr-3 text-sm text-[#EAE6E1] focus:outline-none focus:border-[#C5A059]/60 transition font-sans placeholder-slate-600"
                    />
                  </div>
                </div>
              </>
            )}

            <div className="space-y-1">
              <label className="block text-[10px] text-slate-400 font-mono uppercase tracking-wider">Adresse Email</label>
              <div className="relative">
                <Mail className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="email"
                  required
                  placeholder="auteur@plume.fr"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="w-full bg-[#1A1A1A] border border-white/5 rounded-lg py-2 pl-9 pr-3 text-sm text-[#EAE6E1] focus:outline-none focus:border-[#C5A059]/60 transition font-sans placeholder-slate-600"
                />
              </div>
            </div>

            <div className="space-y-1">
              <label className="block text-[10px] text-slate-400 font-mono uppercase tracking-wider">Mot de passe secret</label>
              <div className="relative">
                <Lock className="absolute left-3 top-2.5 w-4 h-4 text-slate-500" />
                <input
                  type="password"
                  required
                  placeholder="Pour protéger vos inspirations..."
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full bg-[#1A1A1A] border border-white/5 rounded-lg py-2 pl-9 pr-3 text-sm text-[#EAE6E1] focus:outline-none focus:border-[#C5A059]/60 transition font-sans placeholder-slate-600"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={isLoading}
              className="w-full h-10 bg-[#C5A059] text-black hover:bg-[#B38F4B] rounded-lg font-bold text-xs uppercase cursor-pointer transition flex items-center justify-center gap-2 tracking-wider mt-6 disabled:opacity-50"
            >
              {isLoading ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : isRegister ? (
                "Rallier l'Atelier"
              ) : (
                "Se connecter"
              )}
            </button>
          </form>

          {/* Elegant Divider */}
          <div className="relative my-6 flex items-center justify-center">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-white/5"></div>
            </div>
            <span className="relative bg-[#0D0D0D] px-3 font-mono text-[9px] text-[#E0D7D0]/40 uppercase tracking-widest">OU</span>
          </div>

          {/* Beautiful premium Google login button */}
          <button
            type="button"
            onClick={handleGoogleLogin}
            disabled={isLoading}
            className="w-full h-10 border border-white/10 hover:border-white/20 hover:bg-white/5 rounded-lg text-xs font-semibold uppercase flex items-center justify-center gap-3 transition cursor-pointer text-[#EAE6E1] disabled:opacity-50"
          >
            <svg viewBox="0 0 24 24" className="w-4 h-4" xmlns="http://www.w3.org/2000/svg">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4" />
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853" />
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" fill="#FBBC05" />
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" fill="#EA4335" />
            </svg>
            <span>Se connecter avec Google</span>
          </button>

          {/* Elegant card quote banner */}
          <div className="mt-8 pt-5 border-t border-white/5 text-center">
            <p className="text-[10px] text-[#E0D7D0]/40 font-serif italic">
              "La poésie n'est pas ailleurs, elle est ce silence qui unit l'encre rouge de la révolte aux haillons d'or de la nature."
            </p>
          </div>
        </div>


      </div>

      {/* Google Configuration Dialog Modal */}
      {isGoogleModalOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-[#0D0D0D] border border-white/10 rounded-2xl max-w-lg w-full p-6 sm:p-8 shadow-2xl relative overflow-hidden text-left">
            <div className="absolute top-0 inset-x-0 h-[3px] bg-gradient-to-r from-transparent via-[#C5A059]/60 to-transparent" />
            
            <div className="flex items-center gap-2 text-[#C5A059] mb-4">
              <Sparkles className="w-5 h-5 shrink-0" />
              <h2 className="text-lg font-serif font-bold uppercase tracking-wider">Connexion Google non configurée</h2>
            </div>
            
            <p className="text-xs text-slate-300 leading-relaxed mb-6">
              Pour que la connexion Google fonctionne en production, vous devez enregistrer l'Atelier Littéraire sur votre Google Could Console.
            </p>

            <div className="bg-[#141414] border border-white/5 rounded-lg p-4 mb-6 space-y-3 font-sans text-xs">
              <div className="font-mono text-[10px] text-slate-400">
                <span className="text-[#C5A059]">1. URL DE RAPPEL (REDIRECT URI):</span>
                <div className="bg-[#1E1E1E] p-2 rounded border border-white/5 mt-1 select-all font-mono break-all text-[#EAE6E1]">
                  {redirectUriHint}
                </div>
              </div>
              <div className="leading-relaxed text-slate-400">
                <p><strong className="text-slate-200">2. Configuration Google Cloud:</strong></p>
                <ul className="list-disc pl-4 space-y-1 mt-1 text-[11px]">
                  <li>Allez sur la <a href="https://console.cloud.google.com/apis/credentials" target="_blank" rel="noreferrer" className="text-[#C5A059] underline">Google Developer Console</a>.</li>
                  <li>Créez des identifiants de type <strong className="text-slate-300">"ID client OAuth"</strong> (Application Web).</li>
                  <li>Ajoutez l'URL ci-dessus dans la section <strong className="text-slate-300">"URIs de redirection autorisés"</strong>.</li>
                </ul>
              </div>
              <div className="leading-relaxed text-slate-400">
                <p><strong className="text-slate-200">3. Variables d'environnement de l'applet:</strong></p>
                <p className="mt-1 text-[11px]">Enregistrez les variables suivantes dans le menu Paramètres de l'AI Studio :</p>
                <div className="bg-[#1E1E1E] p-2 rounded border border-white/5 mt-1 font-mono text-[10px] space-y-1 text-[#E0D7D0]">
                  <div>GOOGLE_CLIENT_ID = <span className="text-slate-500">{"<votre-id-client>"}</span></div>
                  <div>GOOGLE_CLIENT_SECRET = <span className="text-slate-500">{"<votre-secret>"}</span></div>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row gap-2 mt-6">
              <button
                onClick={() => handleSimulateGoogleLogin("admin")}
                className="flex-1 h-9 bg-[#C5A059] text-black hover:bg-[#B38F4B] rounded-lg font-bold text-[10px] tracking-wider uppercase cursor-pointer transition text-center"
              >
                Simuler Google (Compte Admin)
              </button>
              <button
                onClick={() => handleSimulateGoogleLogin("author")}
                className="flex-1 h-9 bg-white/5 hover:bg-white/10 text-[#E0D7D0] border border-white/10 rounded-lg font-bold text-[10px] tracking-wider uppercase cursor-pointer transition text-center"
              >
                Simuler Google (Compte Écrivain)
              </button>
              <button
                onClick={() => setIsGoogleModalOpen(false)}
                className="h-9 px-4 bg-transparent hover:bg-white/5 text-slate-400 hover:text-white rounded-lg font-semibold text-[10px] uppercase cursor-pointer transition text-center"
              >
                Fermer
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
