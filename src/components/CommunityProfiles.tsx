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
  Search,
  ExternalLink,
  Sparkles,
  Award,
  User,
  MessageSquare
} from "lucide-react";
import { UserProfile } from "../types";
import { getProfilesFromFirestore } from "../lib/firestoreService";

interface CommunityProfilesProps {
  currentUserEmail: string;
  onOpenDirectChat?: (recipient: UserProfile) => void;
}

export default function CommunityProfiles({ currentUserEmail, onOpenDirectChat }: CommunityProfilesProps) {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProfileEmail, setSelectedProfileEmail] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    fetchProfiles();
  }, [currentUserEmail]);

  const fetchProfiles = async () => {
    setIsLoading(true);
    try {
      const data = await getProfilesFromFirestore();
      // Filter out the current user so they only see the rest of the community
      const otherProfiles = (data || []).filter(
        (p) => p.email.toLowerCase() !== currentUserEmail.toLowerCase()
      );
      setProfiles(otherProfiles);
      
      if (otherProfiles.length > 0) {
        setSelectedProfileEmail(otherProfiles[0].email);
      }
    } catch (err) {
      console.error("Failed to load community profiles", err);
    } finally {
      setIsLoading(false);
    }
  };

  const filteredProfiles = profiles.filter(p => {
    const q = searchQuery.toLowerCase();
    return (
      (p.displayName || "").toLowerCase().includes(q) ||
      (p.penName || "").toLowerCase().includes(q) ||
      (p.bio || "").toLowerCase().includes(q)
    );
  });

  const selectedProfile = profiles.find(p => p.email === selectedProfileEmail) || null;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-[#E0D7D0]" id="community_profiles_module">
      
      {/* Writers list Column */}
      <div className="lg:col-span-1 flex flex-col gap-4" id="community_writers_column">
        <div className="bg-[#0D0D0D] border border-white/10 rounded-2xl p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2 pb-2 border-b border-white/10">
            <Sparkles className="w-4 h-4 text-[#C5A059]" />
            <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-[#EAE6E1]">Auteurs du Salon</h3>
          </div>
          
          {/* Search bar */}
          <div className="relative">
            <Search className="w-3.5 h-3.5 absolute left-3 top-3 text-slate-500" />
            <input
              id="search_writer_input"
              type="text"
              placeholder="Rechercher un poète..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full pl-9 pr-3 py-2 text-xs bg-[#1A1A1A] border border-white/5 focus:border-[#C5A059]/40 rounded-xl text-white outline-hidden placeholder-slate-600 transition"
            />
          </div>

          {/* List of Authors */}
          <div className="space-y-2 max-h-[480px] overflow-y-auto pr-1" id="writers_scrollable_list">
            {isLoading ? (
              <div className="text-center py-6 text-xs text-slate-500 animate-pulse">
                Exploration de la communauté...
              </div>
            ) : filteredProfiles.length === 0 ? (
              <div className="text-center py-6 text-xs text-slate-500">
                Aucun poète trouvé
              </div>
            ) : (
              filteredProfiles.map((p) => {
                const isSelected = p.email === selectedProfileEmail;
                return (
                  <button
                    key={p.email}
                    onClick={() => {
                      setSelectedProfileEmail(p.email);
                    }}
                    className={`w-full text-left p-3 rounded-xl border transition flex items-center gap-3 cursor-pointer ${
                      isSelected
                        ? "bg-[#C5A059]/10 border-[#C5A059]/40"
                        : "bg-white/5 border-white/5 hover:border-white/10"
                    }`}
                  >
                    <img
                      src={p.avatarUrl}
                      alt={p.displayName}
                      referrerPolicy="no-referrer"
                      className="w-10 h-10 rounded-full object-cover border border-white/10 shrink-0"
                    />
                    <div className="min-w-0 flex-1">
                      <h4 className="text-xs font-serif font-bold text-[#EAE6E1] truncate">
                        {p.displayName}
                      </h4>
                      <p className="text-[10px] text-slate-400 font-mono italic truncate mt-0.5">
                        {p.penName || "Plume Libre"}
                      </p>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Quick reminder card */}
        <div className="bg-[#C5A059]/5 border border-[#C5A059]/15 rounded-2xl p-4 text-xs font-serif leading-relaxed text-[#E0D7D0]/90">
          <p className="italic">
            "La poésie n’est pas un fait solitaire. Elle résonne plus fort lorsque les cœurs s’accordent et que les plumes s’unissent."
          </p>
          <span className="block mt-2 font-mono text-[9px] text-[#C5A059] uppercase tracking-wider text-right">— L'Atelier</span>
        </div>
      </div>

      {/* Profil details Column */}
      <div className="lg:col-span-2" id="community_details_column">
        {selectedProfile ? (
          /* DETAILED PROFILE VIEW */
          <div className="bg-[#0D0D0D] border border-white/10 rounded-2xl p-6 lg:p-8 space-y-6" id="profile_details_window">
            
            {/* Header: main card layout */}
            <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 pb-6 border-b border-white/10">
              <img
                src={selectedProfile.avatarUrl}
                alt={selectedProfile.displayName}
                referrerPolicy="no-referrer"
                className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover ring-2 ring-[#C5A059]/40 border-2 border-transparent shadow p-0.5"
              />
              
              <div className="flex-1 text-center sm:text-left space-y-2">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="space-y-0.5">
                    <h2 className="text-xl font-serif font-bold text-[#EAE6E1]" id="writer_profile_name">
                      {selectedProfile.displayName}
                    </h2>
                    <p className="text-[#C5A059] font-mono text-xs font-semibold italic">
                      {selectedProfile.penName || "Plume Libre"}
                    </p>
                  </div>

                  {onOpenDirectChat && (
                    <button
                      onClick={() => onOpenDirectChat(selectedProfile)}
                      className="px-3.5 py-1.5 bg-[#C5A059] text-[#0C0C0C] hover:bg-[#B38F4B] text-xs font-sans font-semibold rounded-lg transition flex items-center justify-center gap-1.5 cursor-pointer mx-auto sm:mx-0 shadow-sm"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>Envoyer une lettre</span>
                    </button>
                  )}
                </div>

                {/* Email representation with clean envelope icon */}
                <div className="flex items-center gap-1.5 justify-center sm:justify-start text-xs text-slate-400 font-mono">
                  <Mail className="w-3.5 h-3.5 text-slate-500" />
                  <span>{selectedProfile.email}</span>
                </div>

                {/* Social media connections visual badges */}
                <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 pt-2">
                  {selectedProfile.socials?.website && (
                    <a
                      href={selectedProfile.socials.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded bg-white/5 hover:bg-white/10 hover:text-[#C5A059] border border-white/5 text-[#E0D7D0]/80 transition"
                      title="Site Internet officiel"
                    >
                      <Globe className="w-4 h-4" />
                    </a>
                  )}
                  {selectedProfile.socials?.twitter && (
                    <a
                      href={`https://twitter.com/${selectedProfile.socials.twitter}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded bg-white/5 hover:bg-white/10 hover:text-[#C5A059] border border-white/5 text-[#E0D7D0]/80 transition"
                      title="Profil Twitter / X"
                    >
                      <Twitter className="w-4 h-4" />
                    </a>
                  )}
                  {selectedProfile.socials?.github && (
                    <a
                      href={`https://github.com/${selectedProfile.socials.github}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded bg-white/5 hover:bg-white/10 hover:text-[#C5A059] border border-white/5 text-[#E0D7D0]/80 transition"
                      title="Espace GitHub"
                    >
                      <Github className="w-4 h-4" />
                    </a>
                  )}
                  {selectedProfile.socials?.linkedin && (
                    <a
                      href={selectedProfile.socials.linkedin.startsWith("http") ? selectedProfile.socials.linkedin : `https://linkedin.com/in/${selectedProfile.socials.linkedin}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded bg-white/5 hover:bg-white/10 hover:text-[#C5A059] border border-white/5 text-[#E0D7D0]/80 transition"
                      title="Profil LinkedIn"
                    >
                      <Linkedin className="w-4 h-4" />
                    </a>
                  )}
                  {selectedProfile.socials?.instagram && (
                    <a
                      href={`https://instagram.com/${selectedProfile.socials.instagram}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="p-1.5 rounded bg-white/5 hover:bg-white/10 hover:text-[#C5A059] border border-white/5 text-[#E0D7D0]/80 transition"
                      title="Profil Instagram"
                    >
                      <Instagram className="w-4 h-4" />
                    </a>
                  )}
                  {!selectedProfile.socials?.twitter && 
                   !selectedProfile.socials?.github && 
                   !selectedProfile.socials?.linkedin && 
                   !selectedProfile.socials?.instagram && 
                   !selectedProfile.socials?.website && (
                     <span className="text-[10px] text-slate-500 font-mono">Aucun compte social connecté</span>
                  )}
                </div>
              </div>
            </div>

            {/* Main Column Body: Biography */}
            <div className="space-y-2.5">
              <h3 className="text-xs font-bold font-mono uppercase text-[#C5A059] tracking-wider flex items-center gap-1.5">
                <Award className="w-4 h-4" />
                <span>Biographie & Démarche Littéraire</span>
              </h3>
              <div className="p-4 bg-white/5 border border-white/5 rounded-2xl text-sm leading-relaxed text-[#E0D7D0] font-serif whitespace-pre-wrap">
                {selectedProfile.bio ? selectedProfile.bio : (
                  <p className="text-slate-500 italic font-sans text-xs">Cet écrivain n'a pas encore rédigé sa biographie.</p>
                )}
              </div>
            </div>

            {/* Sub-column Content: Published Works list */}
            <div className="space-y-3">
              <h3 className="text-xs font-bold font-mono uppercase text-[#C5A059] tracking-wider flex items-center gap-1.5">
                <BookOpen className="w-4 h-4" />
                <span>Publications Littéraires & Travaux Marquants</span>
              </h3>

              {selectedProfile.publishedWorks && selectedProfile.publishedWorks.length > 0 ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3" id="published_works_grid">
                  {selectedProfile.publishedWorks.map((work, idx) => (
                    <div
                      key={idx}
                      className="p-3.5 bg-[#141414] border border-white/5 rounded-xl hover:border-[#C5A059]/20 transition flex items-center justify-between"
                    >
                      <div className="min-w-0 pr-2">
                        <h4 className="text-xs font-bold font-serif text-[#EAE6E1] truncate">{work.title}</h4>
                        <span className="text-[9px] text-[#C5A059]/60 font-mono uppercase block mt-0.5 font-sans">Œuvre publiée</span>
                      </div>
                      
                      {work.url && (
                        <a
                          href={work.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="p-1 bg-white/5 hover:bg-white/10 hover:text-[#C5A059] rounded border border-white/5 text-slate-400"
                          title="Consulter l'œuvre originale"
                        >
                          <ExternalLink className="w-3.5 h-3.5" />
                        </a>
                      )}
                    </div>
                  ))}
                </div>
              ) : (
                <div className="p-4 text-center bg-white/5 border border-white/5 border-dashed rounded-2xl text-xs text-slate-500">
                  Aucune œuvre d'art littéraire n'est encore référencée.
                </div>
              )}
            </div>

          </div>
        ) : (
          <div className="bg-[#0D0D0D] border border-white/10 rounded-2xl p-8 text-center" id="empty_profile_fallback">
            <User className="w-12 h-12 text-[#C5A059]/40 mx-auto stroke-1" />
            <h3 className="font-serif font-bold text-[#EAE6E1] text-base mt-3">Sélectionnez un écrivain</h3>
            <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
              Explorez les voix poétiques de l'Atelier en sélectionnant un membre de la communauté sur le panneau latéral.
            </p>
          </div>
        )}
      </div>

    </div>
  );
}
