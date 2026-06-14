/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import {
  Globe,
  Twitter,
  Github,
  Linkedin,
  Instagram,
  Mail,
  BookOpen,
  Edit3,
  User,
  Save,
  Plus,
  Trash2,
  ExternalLink,
  Award,
  Sparkles,
  Key
} from "lucide-react";
import { UserProfile, PublishedWork } from "../types";
import { getProfilesFromFirestore, saveProfileToFirestore } from "../lib/firestoreService";
import { 
  updatePassword, 
  reauthenticateWithCredential, 
  EmailAuthProvider 
} from "firebase/auth";
import { auth } from "../firebase";

interface MyProfileProps {
  currentUserEmail: string;
  onProfileUpdated?: (profile: UserProfile) => void;
}

export default function MyProfile({ currentUserEmail, onProfileUpdated }: MyProfileProps) {
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isEditing, setIsEditing] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Edit form state
  const [editDisplayName, setEditDisplayName] = useState("");
  const [editPenName, setEditPenName] = useState("");
  const [editBio, setEditBio] = useState("");
  const [editAvatarUrl, setEditAvatarUrl] = useState("");
  const [editSocials, setEditSocials] = useState({
    twitter: "",
    github: "",
    linkedin: "",
    instagram: "",
    website: ""
  });
  const [editPublishedWorks, setEditPublishedWorks] = useState<PublishedWork[]>([]);
  const [editGeminiApiKey, setEditGeminiApiKey] = useState("");
  
  // Local state for adding a single published work
  const [numWorkTitle, setNumWorkTitle] = useState("");
  const [numWorkUrl, setNumWorkUrl] = useState("");

  // Password change states
  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState<string | null>(null);
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);
  const [showPasswordFields, setShowPasswordFields] = useState(false);

  const handlePasswordChange = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);
    setPasswordSuccess(null);

    if (!currentPassword) {
      setPasswordError("Veuillez saisir votre mot de passe actuel.");
      return;
    }

    if (newPassword.length < 6) {
      setPasswordError("Le nouveau mot de passe doit contenir au moins 6 caractères.");
      return;
    }

    if (newPassword !== confirmPassword) {
      setPasswordError("Les nouveaux mots de passe ne correspondent pas.");
      return;
    }

    setIsUpdatingPassword(true);

    try {
      const user = auth.currentUser;
      if (!user || !user.email) {
        throw new Error("Aucun utilisateur connecté ou session expirée.");
      }

      // Reauthentifier l'utilisateur en premier pour éviter l'erreur de session expirée de Firebase
      const credential = EmailAuthProvider.credential(user.email, currentPassword);
      await reauthenticateWithCredential(user, credential);

      // Mettre à jour le mot de passe
      await updatePassword(user, newPassword);

      setPasswordSuccess("Votre mot de passe a été modifié avec succès !");
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");
    } catch (err: any) {
      console.error("Error updating password:", err);
      if (err.code === "auth/invalid-credential" || err.code === "auth/wrong-password" || err.code === "auth/invalid-verification-code") {
        setPasswordError("Le mot de passe actuel est incorrect.");
      } else {
        setPasswordError(err.message || "Impossible de modifier le mot de passe. Veuillez réessayer.");
      }
    } finally {
      setIsUpdatingPassword(false);
    }
  };

  const presetAvatars = [
    { name: "La plume d'or", url: "https://images.unsplash.com/photo-1544005313-94ddf0286df2?auto=format&fit=crop&q=80&w=200" },
    { name: "Encre nocturne", url: "https://images.unsplash.com/photo-1506794778202-cad84cf45f1d?auto=format&fit=crop&q=80&w=200" },
    { name: "Sagesse antique", url: "https://images.unsplash.com/photo-1507003211169-0a1dd7228f2d?auto=format&fit=crop&q=80&w=200" },
    { name: "Lettres libres", url: "https://images.unsplash.com/photo-1534528741775-53994a69daeb?auto=format&fit=crop&q=80&w=200" }
  ];

  useEffect(() => {
    fetchProfile();
  }, [currentUserEmail]);

  const fetchProfile = async () => {
    if (!currentUserEmail) return;
    setIsLoading(true);
    try {
      const data = await getProfilesFromFirestore();
      const myProf = data.find((p) => p.email.toLowerCase() === currentUserEmail.toLowerCase());
      if (myProf) {
        setProfile(myProf);
      } else {
        // Create an initial template profile with defaults
        const defaultProfile: UserProfile = {
          email: currentUserEmail,
          displayName: currentUserEmail.split("@")[0],
          penName: "Auteur Novice",
          bio: "Écrivez ici votre biographie littéraire...",
          avatarUrl: "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200",
          publishedWorks: [],
          socials: {}
        };
        setProfile(defaultProfile);
      }
    } catch (err) {
      console.error("Failed to load user profile:", err);
    } finally {
      setIsLoading(false);
    }
  };

  const handleStartEdit = () => {
    if (!profile) return;
    setEditDisplayName(profile.displayName || "");
    setEditPenName(profile.penName || "");
    setEditBio(profile.bio || "");
    setEditAvatarUrl(profile.avatarUrl || "");
    setEditSocials({
      twitter: profile.socials?.twitter || "",
      github: profile.socials?.github || "",
      linkedin: profile.socials?.linkedin || "",
      instagram: profile.socials?.instagram || "",
      website: profile.socials?.website || ""
    });
    setEditPublishedWorks(profile.publishedWorks || []);
    setEditGeminiApiKey(profile.geminiApiKey || "");
    setIsEditing(true);
  };

  const handleAddWork = (e: React.FormEvent) => {
    e.preventDefault();
    if (!numWorkTitle.trim()) return;
    
    let finalUrl = numWorkUrl.trim();
    if (finalUrl && !/^https?:\/\//i.test(finalUrl)) {
      finalUrl = "https://" + finalUrl;
    }

    const newWork: PublishedWork = {
      title: numWorkTitle.trim(),
      url: finalUrl || "https://example.com"
    };

    setEditPublishedWorks([...editPublishedWorks, newWork]);
    setNumWorkTitle("");
    setNumWorkUrl("");
  };

  const handleRemoveWork = (index: number) => {
    setEditPublishedWorks(editPublishedWorks.filter((_, idx) => idx !== index));
  };

  const handleSaveProfile = async () => {
    const updatedProfile: UserProfile = {
      email: currentUserEmail,
      displayName: editDisplayName.trim() || "Auteur Anonyme",
      penName: editPenName.trim() || "Plume Libre",
      bio: editBio.trim() || "Cet écrivain préfère faire durer le mystère...",
      avatarUrl: editAvatarUrl.trim() || "https://images.unsplash.com/photo-1535713875002-d1d0cf377fde?auto=format&fit=crop&q=80&w=200",
      publishedWorks: editPublishedWorks,
      socials: {
        twitter: editSocials.twitter.trim() || undefined,
        github: editSocials.github.trim() || undefined,
        linkedin: editSocials.linkedin.trim() || undefined,
        instagram: editSocials.instagram.trim() || undefined,
        website: editSocials.website.trim() || undefined
      },
      geminiApiKey: editGeminiApiKey.trim() || undefined
    };

    try {
      await saveProfileToFirestore(updatedProfile);
      setProfile(updatedProfile);
      setIsEditing(false);
      if (onProfileUpdated) {
        onProfileUpdated(updatedProfile);
      }
    } catch (err) {
      console.error("Could not save profile details", err);
    }
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-slate-500 font-sans text-xs animate-pulse">
        Chargement de votre plume d'auteur...
      </div>
    );
  }

  if (!profile) {
    return null;
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6 text-[#E0D7D0]" id="my_profile_module">
      {isEditing ? (
        /* EDIT PROFILE DETAILS FORM */
        <div className="bg-[#0D0D0D] border border-white/10 rounded-2xl p-5 space-y-5" id="my_profile_editor">
          <div className="flex items-center justify-between pb-3 border-b border-white/10">
            <div className="flex items-center gap-2">
              <Edit3 className="w-4 h-4 text-[#C5A059]" />
              <h3 className="text-sm font-bold font-serif text-[#EAE6E1]">Modifier mon Profil d'Écrivain</h3>
            </div>
            <button
              onClick={() => setIsEditing(false)}
              className="text-xs font-mono text-slate-400 hover:text-white px-2 py-1 hover:bg-white/5 rounded transition cursor-pointer"
            >
              Annuler
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Left Column: Essential identifiers */}
            <div className="space-y-3">
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase text-slate-400">Nom public d'Auteur</label>
                <input
                  type="text"
                  value={editDisplayName}
                  onChange={(e) => setEditDisplayName(e.target.value)}
                  className="w-full bg-[#1A1A1A] border border-white/5 rounded-xl px-3 py-2 text-xs focus:border-[#C5A059]/40 text-white outline-hidden transition"
                  placeholder="ex: Paul Verlaine"
                />
              </div>
              
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase text-slate-400">Pseudonyme poétique / Prélude</label>
                <input
                  type="text"
                  value={editPenName}
                  onChange={(e) => setEditPenName(e.target.value)}
                  className="w-full bg-[#1A1A1A] border border-white/5 rounded-xl px-3 py-2 text-xs focus:border-[#C5A059]/40 text-white outline-hidden transition"
                  placeholder="ex: Le Poète Maudit"
                />
              </div>

              <div className="space-y-1.5">
                <label className="text-[10px] font-mono uppercase text-slate-400 block">Avatar littéraire</label>
                <div className="flex gap-2 mb-2">
                  {presetAvatars.map((av, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setEditAvatarUrl(av.url)}
                      className={`w-9 h-9 rounded-full overflow-hidden border transition shrink-0 cursor-pointer ${
                        editAvatarUrl === av.url ? "border-[#C5A059] scale-105 shadow" : "border-transparent opacity-60"
                      }`}
                      title={av.name}
                    >
                      <img src={av.url} alt={av.name} className="w-full h-full object-cover" />
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={editAvatarUrl}
                  onChange={(e) => setEditAvatarUrl(e.target.value)}
                  className="w-full bg-[#1A1A1A] border border-white/5 rounded-xl px-3 py-1.5 text-[11px] focus:border-[#C5A059]/40 text-white outline-hidden transition"
                  placeholder="URL de votre image de profil..."
                />
              </div>
            </div>

            {/* Right Column: Social contacts */}
            <div className="space-y-3 p-3.5 bg-white/5 border border-white/5 rounded-xl">
              <span className="text-[11px] font-mono text-[#C5A059] block uppercase tracking-wider pb-1 border-b border-white/5">
                Réseaux & Liens
              </span>

              <div className="space-y-2.5 text-xs">
                <div className="flex gap-2 items-center">
                  <Twitter className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Twitter / X (@nom)"
                    value={editSocials.twitter}
                    onChange={(e) => setEditSocials({ ...editSocials, twitter: e.target.value })}
                    className="flex-1 bg-[#1A1A1A] border border-white/5 rounded-md px-2.5 py-1 text-xs text-white"
                  />
                </div>

                <div className="flex gap-2 items-center">
                  <Github className="w-3.5 h-3.5 text-white shrink-0" />
                  <input
                    type="text"
                    placeholder="GitHub username"
                    value={editSocials.github}
                    onChange={(e) => setEditSocials({ ...editSocials, github: e.target.value })}
                    className="flex-1 bg-[#1A1A1A] border border-white/5 rounded-md px-2.5 py-1 text-xs text-white"
                  />
                </div>

                <div className="flex gap-2 items-center">
                  <Linkedin className="w-3.5 h-3.5 text-[#0077b5] shrink-0" />
                  <input
                    type="text"
                    placeholder="LinkedIn profile"
                    value={editSocials.linkedin}
                    onChange={(e) => setEditSocials({ ...editSocials, linkedin: e.target.value })}
                    className="flex-1 bg-[#1A1A1A] border border-white/5 rounded-md px-2.5 py-1 text-xs text-white"
                  />
                </div>

                <div className="flex gap-2 items-center">
                  <Instagram className="w-3.5 h-3.5 text-pink-400 shrink-0" />
                  <input
                    type="text"
                    placeholder="Instagram"
                    value={editSocials.instagram}
                    onChange={(e) => setEditSocials({ ...editSocials, instagram: e.target.value })}
                    className="flex-1 bg-[#1A1A1A] border border-white/5 rounded-md px-2.5 py-1 text-xs text-white"
                  />
                </div>

                <div className="flex gap-2 items-center">
                  <Globe className="w-3.5 h-3.5 text-[#C5A059] shrink-0" />
                  <input
                    type="text"
                    placeholder="Site internet"
                    value={editSocials.website}
                    onChange={(e) => setEditSocials({ ...editSocials, website: e.target.value })}
                    className="flex-1 bg-[#1A1A1A] border border-white/5 rounded-md px-2.5 py-1 text-xs text-white"
                  />
                </div>
              </div>
            </div>
          </div>

          <div className="space-y-1">
            <label className="text-[10px] font-mono uppercase text-slate-400">Biographie d'artiste / Manifeste d'écriture</label>
            <textarea
              rows={4}
              value={editBio}
              onChange={(e) => setEditBio(e.target.value)}
              className="w-full bg-[#1A1A1A] border border-white/5 rounded-xl px-3 py-2 text-xs focus:border-[#C5A059]/40 text-white outline-hidden transition font-serif resize-none"
              placeholder="Exposez votre démarche artistique et les thèmes poétiques qui vous habitent..."
            />
          </div>

          {/* Published Works section */}
          <div className="space-y-2.5 p-3.5 bg-white/5 border border-white/5 rounded-xl">
            <span className="text-[11px] font-mono text-[#C5A059] block uppercase tracking-wider pb-1 border-b border-white/5">
              Publications & Recueils ({editPublishedWorks.length})
            </span>

            {editPublishedWorks.length > 0 && (
              <div className="space-y-1.5 max-h-24 overflow-y-auto pr-1">
                {editPublishedWorks.map((work, idx) => (
                  <div key={idx} className="flex items-center justify-between bg-black/30 p-2 rounded border border-white/5 text-xs">
                    <div className="min-w-0 flex-1 flex items-center gap-1.5 font-serif">
                      <BookOpen className="w-3.5 h-3.5 text-[#C5A059]/60 shrink-0" />
                      <span className="font-bold truncate text-[#EAE6E1]">{work.title}</span>
                      {work.url && <span className="text-[9px] text-slate-500 truncate font-mono">({work.url})</span>}
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveWork(idx)}
                      className="text-slate-400 hover:text-red-400 p-1 rounded hover:bg-white/5 transition duration-150"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}

            <form onSubmit={handleAddWork} className="grid grid-cols-1 lg:grid-cols-3 gap-2 pt-1">
              <input
                type="text"
                placeholder="Titre de l'œuvre"
                value={numWorkTitle}
                onChange={(e) => setNumWorkTitle(e.target.value)}
                className="bg-[#1A1A1A] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white lg:col-span-1"
              />
              <input
                type="text"
                placeholder="Lien optionnel (Scribd, Wattpad...)"
                value={numWorkUrl}
                onChange={(e) => setNumWorkUrl(e.target.value)}
                className="bg-[#1A1A1A] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white lg:col-span-1"
              />
              <button
                type="submit"
                className="bg-[#C5A059] text-black hover:bg-[#B38F4B] transition rounded-lg h-full text-xs font-bold lg:col-span-1 py-1.5 flex items-center justify-center gap-1 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Ajouter</span>
              </button>
            </form>
          </div>

          {/* Configuration Gemini Personnelle */}
          <div className="space-y-2.5 p-3.5 bg-white/5 border border-white/5 rounded-xl">
            <span className="flex items-center gap-1.5 text-[11px] font-mono text-[#C5A059] uppercase tracking-wider pb-1 border-b border-white/5">
              <Sparkles className="w-3.5 h-3.5 text-[#C5A059]" />
              Intelligence Artificielle - Plume
            </span>
            <div className="space-y-2 pt-1 text-xs">
              <div className="space-y-1">
                <label className="text-[10px] font-mono uppercase text-[#C5A059]">Votre Clé API Gemini (Optionnelle)</label>
                <input
                  type="password"
                  value={editGeminiApiKey}
                  onChange={(e) => setEditGeminiApiKey(e.target.value)}
                  placeholder="Laisser vide pour utiliser la clé globale de l'Atelier (BFF)"
                  className="w-full bg-[#1A1A1A] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#C5A059]/40"
                />
              </div>
              <p className="text-[10px] text-slate-400 leading-relaxed font-sans">
                Renseignez votre propre clé d'API Google Gemini si vous souhaitez utiliser votre compte personnel. À défaut, l'Atelier utilisera la clé centrale de Plume configurée sur le serveur.
              </p>
            </div>
          </div>

          {/* Sécurité et mot de passe */}
          <div className="space-y-2.5 p-3.5 bg-white/5 border border-white/5 rounded-xl">
            <button
              type="button"
              onClick={() => {
                setShowPasswordFields(!showPasswordFields);
                setPasswordError(null);
                setPasswordSuccess(null);
                setCurrentPassword("");
                setNewPassword("");
                setConfirmPassword("");
              }}
              className="flex items-center justify-between w-full text-[11px] font-mono text-[#C5A059] uppercase tracking-wider pb-1 border-b border-white/5 text-left cursor-pointer transition hover:text-[#B38F4B]"
            >
              <span className="flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5" />
                Sécurité &amp; Mot de passe
              </span>
              <span className="text-[10px] text-slate-400 capitalize hover:text-white font-sans">
                {showPasswordFields ? "Masquer ▲" : "Afficher ▼"}
              </span>
            </button>

            {showPasswordFields && (
              <div className="space-y-3 pt-2 text-xs animate-fade-in">
                {passwordError && (
                  <div className="p-2.5 rounded-lg bg-red-950/40 border border-red-500/30 text-red-400 text-[11px] text-center font-medium">
                    {passwordError}
                  </div>
                )}
                {passwordSuccess && (
                  <div className="p-2.5 rounded-lg bg-emerald-950/40 border border-emerald-500/30 text-emerald-400 text-[11px] text-center flex items-center justify-center gap-1.5 font-medium">
                    <span>{passwordSuccess}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono uppercase text-slate-400">Mot de passe actuel</label>
                    <input
                      type="password"
                      value={currentPassword}
                      onChange={(e) => setCurrentPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-[#1A1A1A] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#C5A059]/40"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono uppercase text-slate-400">Nouveau mot de passe</label>
                    <input
                      type="password"
                      value={newPassword}
                      onChange={(e) => setNewPassword(e.target.value)}
                      placeholder="Min. 6 caractères"
                      className="w-full bg-[#1A1A1A] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#C5A059]/40"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-[10px] font-mono uppercase text-slate-400">Confirmer le nouveau</label>
                    <input
                      type="password"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full bg-[#1A1A1A] border border-white/5 rounded-lg px-2.5 py-1.5 text-xs text-white placeholder-slate-600 focus:outline-none focus:border-[#C5A059]/40"
                    />
                  </div>
                </div>

                <div className="flex justify-end pt-1">
                  <button
                    type="button"
                    onClick={handlePasswordChange}
                    disabled={isUpdatingPassword}
                    className="px-3 py-1.5 bg-[#C5A059]/20 border border-[#C5A059]/40 hover:border-[#C5A059]/70 text-[#C5A059] hover:bg-[#C5A059]/30 text-[10px] font-bold font-mono uppercase rounded-lg transition cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                  >
                    {isUpdatingPassword ? "Mise à jour..." : "Enregistrer le mot de passe"}
                  </button>
                </div>
              </div>
            )}
          </div>

          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={() => setIsEditing(false)}
              className="px-4 py-2 border border-white/5 hover:border-white/10 hover:bg-white/5 text-xs font-mono rounded-xl transition cursor-pointer"
            >
              Annuler
            </button>
            <button
              type="button"
              onClick={handleSaveProfile}
              className="px-4 py-2 bg-[#C5A059] text-black hover:bg-[#B38F4B] text-xs font-bold font-mono rounded-xl flex items-center gap-1.5 transition cursor-pointer"
            >
              <Save className="w-3.5 h-3.5" />
              <span>Enregistrer</span>
            </button>
          </div>
        </div>
      ) : (
        /* STANDARD READ-ONLY DETAILED PROFILE CARD */
        <div className="bg-[#0D0D0D] border border-white/10 rounded-2xl p-6 lg:p-8 space-y-6 animate-fade-in" id="my_profile_view">
          <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 pb-6 border-b border-white/10">
            <img
              src={profile.avatarUrl}
              alt={profile.displayName}
              referrerPolicy="no-referrer"
              className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover ring-2 ring-[#C5A059]/40 border-2 border-transparent shadow p-0.5"
            />
            
            <div className="flex-1 text-center sm:text-left space-y-2">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <h2 className="text-xl font-serif font-bold text-[#EAE6E1]" id="my_profile_display_name">
                    {profile.displayName}
                  </h2>
                  <p className="text-[#C5A059] font-mono text-xs font-semibold italic">
                    {profile.penName || "Plume Novice"}
                  </p>
                </div>
                
                <button
                  onClick={handleStartEdit}
                  className="px-3.5 py-1.5 bg-[#C5A059]/10 border border-[#C5A059]/30 hover:border-[#C5A059]/60 text-xs font-mono font-medium rounded-lg text-[#C5A059] transition flex items-center justify-center gap-1 cursor-pointer mx-auto sm:mx-0 shadow-xs"
                >
                  <Edit3 className="w-3.5 h-3.5" />
                  <span>Modifier mon Profil</span>
                </button>
              </div>

              <div className="flex items-center gap-1.5 justify-center sm:justify-start text-xs text-slate-400 font-mono">
                <Mail className="w-3.5 h-3.5 text-slate-500" />
                <span>{profile.email}</span>
              </div>

              {/* Social Channels badges */}
              <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 pt-2">
                {profile.socials?.website && (
                  <a
                    href={profile.socials.website}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded bg-white/5 hover:bg-white/10 hover:text-[#C5A059] border border-white/5 text-[#E0D7D0]/80 transition"
                    title="Site Internet officiel"
                  >
                    <Globe className="w-4 h-4" />
                  </a>
                )}
                {profile.socials?.twitter && (
                  <a
                    href={`https://twitter.com/${profile.socials.twitter}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded bg-white/5 hover:bg-white/10 hover:text-[#C5A059] border border-white/5 text-[#E0D7D0]/80 transition"
                    title="Profil Twitter / X"
                  >
                    <Twitter className="w-4 h-4" />
                  </a>
                )}
                {profile.socials?.github && (
                  <a
                    href={`https://github.com/${profile.socials.github}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded bg-white/5 hover:bg-white/10 hover:text-[#C5A059] border border-white/5 text-[#E0D7D0]/80 transition"
                    title="Espace GitHub"
                  >
                    <Github className="w-4 h-4" />
                  </a>
                )}
                {profile.socials?.linkedin && (
                  <a
                    href={profile.socials.linkedin.startsWith("http") ? profile.socials.linkedin : `https://linkedin.com/in/${profile.socials.linkedin}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded bg-white/5 hover:bg-white/10 hover:text-[#C5A059] border border-white/5 text-[#E0D7D0]/80 transition"
                    title="Profil LinkedIn"
                  >
                    <Linkedin className="w-4 h-4" />
                  </a>
                )}
                {profile.socials?.instagram && (
                  <a
                    href={`https://instagram.com/${profile.socials.instagram}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-1.5 rounded bg-white/5 hover:bg-white/10 hover:text-[#C5A059] border border-white/5 text-[#E0D7D0]/80 transition"
                    title="Profil Instagram"
                  >
                    <Instagram className="w-4 h-4" />
                  </a>
                )}
                {!profile.socials?.twitter && 
                 !profile.socials?.github && 
                 !profile.socials?.linkedin && 
                 !profile.socials?.instagram && 
                 !profile.socials?.website && (
                   <span className="text-[10px] text-slate-500 font-mono">Aucun compte social connecté</span>
                )}
              </div>
            </div>
          </div>

          {/* Biography content */}
          <div className="space-y-2.5">
            <h3 className="text-xs font-bold font-mono uppercase text-[#C5A059] tracking-wider flex items-center gap-1.5">
              <Award className="w-4 h-4" />
              <span>Ma Biographie & Démarche Littéraire</span>
            </h3>
            <div className="p-4 bg-[#141414] border border-white/5 rounded-2xl text-sm leading-relaxed text-[#E0D7D0] font-serif whitespace-pre-wrap">
              {profile.bio ? profile.bio : (
                <p className="text-slate-500 italic font-sans text-xs">Veuillez écrire votre biographie d'auteur pour inspirer le salon.</p>
              )}
            </div>
          </div>

          {/* Published works */}
          <div className="space-y-3">
            <h3 className="text-xs font-bold font-mono uppercase text-[#C5A059] tracking-wider flex items-center gap-1.5">
              <BookOpen className="w-4 h-4" />
              <span>Mes Publications & Œuvres poétiques</span>
            </h3>

            {profile.publishedWorks && profile.publishedWorks.length > 0 ? (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" id="my_published_grid">
                {profile.publishedWorks.map((work, idx) => (
                  <div
                    key={idx}
                    className="p-3.5 bg-[#141414] border border-white/5 rounded-xl hover:border-[#C5A059]/20 transition flex items-center justify-between hover:shadow-md"
                  >
                    <div className="min-w-0 pr-2">
                      <h4 className="text-xs font-bold font-serif text-[#EAE6E1] truncate">{work.title}</h4>
                      <span className="text-[9px] text-[#C5A059]/60 font-mono uppercase block mt-0.5">Œuvre poétique</span>
                    </div>
                    {work.url && (
                      <a
                        href={work.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="p-1.5 bg-white/5 hover:bg-white/10 hover:text-[#C5A059] rounded border border-white/5 text-slate-400"
                        title="Consulter"
                      >
                        <ExternalLink className="w-3.5 h-3.5" />
                      </a>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="p-4 text-center bg-white/5 border border-white/5 border-dashed rounded-2xl text-xs text-slate-500">
                Vous n'avez pas encore lié d'œuvres publiées à votre profil.
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
