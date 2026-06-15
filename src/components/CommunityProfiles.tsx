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
  MessageSquare,
  Calendar,
  Send,
  Plus,
  Users,
  Download,
  Eye,
  Trash2,
  FileText,
  Bookmark,
  ChevronLeft,
  ChevronRight,
  X,
  Check
} from "lucide-react";
import { UserProfile, Comment, Writing } from "../types";
import { getProfilesFromFirestore } from "../lib/firestoreService";

interface CommunityProfilesProps {
  currentUserEmail: string;
  onOpenDirectChat?: (recipient: UserProfile) => void;
}

interface WorkshopSubmission {
  id: string;
  userEmail: string;
  penName: string;
  title: string;
  content: string;
  createdAt: string;
  critiques: Array<{
    id: string;
    author: string;
    text: string;
    createdAt: string;
  }>;
}

interface Workshop {
  id: string;
  title: string;
  description: string;
  week: string;
  status: "active" | "upcoming" | "closed";
  submissions: WorkshopSubmission[];
}

interface RecueilWriting {
  id: string;
  title: string;
  content: string;
  authorEmail: string;
  authorPenName: string;
}

interface Recueil {
  id: string;
  title: string;
  description: string;
  createdBy: string;
  createdAt: string;
  contributors: string[];
  writings: RecueilWriting[];
}

interface AnnotatedWriting {
  id: string;
  title: string;
  content: string;
  authorEmail: string;
  authorPenName: string;
  publishedAt: string;
  comments: Comment[];
}

export default function CommunityProfiles({ currentUserEmail, onOpenDirectChat }: CommunityProfilesProps) {
  // Navigation matching internal sub-modules within the Community tab
  const [subTab, setSubTab] = useState<"profiles" | "workshops" | "recueils" | "marges">("profiles");
  
  // General states
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedProfileEmail, setSelectedProfileEmail] = useState<string | null>(null);
  const [isProfilesLoading, setIsProfilesLoading] = useState(false);
  const [myWritings, setMyWritings] = useState<Writing[]>([]);

  // Weekly Workshops state
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [selectedWorkshopId, setSelectedWorkshopId] = useState<string | null>(null);
  const [activeSubmittingToWorkshopId, setActiveSubmittingToWorkshopId] = useState<string | null>(null);
  const [submittingWorkshopText, setSubmittingWorkshopText] = useState("");
  const [submittingWorkshopTitle, setSubmittingWorkshopTitle] = useState("");
  const [selectedMyWritingForWorkshopId, setSelectedMyWritingForWorkshopId] = useState("");
  const [critiqueInputs, setCritiqueInputs] = useState<{ [subId: string]: string }>({});

  // Recueils Group state
  const [recueils, setRecueils] = useState<Recueil[]>([]);
  const [selectedRecueilId, setSelectedRecueilId] = useState<string | null>(null);
  const [isCreatingRecueil, setIsCreatingRecueil] = useState(false);
  const [newRecueilTitle, setNewRecueilTitle] = useState("");
  const [newRecueilDesc, setNewRecueilDesc] = useState("");
  const [selectedMyWritingForRecueilId, setSelectedMyWritingForRecueilId] = useState("");
  const [readingRecueil, setReadingRecueil] = useState<Recueil | null>(null);
  const [bookCurrentPage, setBookCurrentPage] = useState(0); // 0 = Cover/TOC, 1+ = poems

  // Annotated Masterpieces state
  const [annotatedWritings, setAnnotatedWritings] = useState<AnnotatedWriting[]>([]);
  const [selectedAnnotatedId, setSelectedAnnotatedId] = useState<string | null>(null);
  const [selectedMyWritingForAnnotationId, setSelectedMyWritingForAnnotationId] = useState("");
  const [hoveredCommentId, setHoveredCommentId] = useState<string | null>(null);

  // Load profiles and our writings for reference
  useEffect(() => {
    fetchProfiles();
    fetchMyWritings();
  }, [currentUserEmail]);

  // Handle auto queries on tab changes
  useEffect(() => {
    if (subTab === "workshops") fetchWorkshops();
    if (subTab === "recueils") fetchRecueils();
    if (subTab === "marges") fetchAnnotated();
  }, [subTab]);

  const fetchProfiles = async () => {
    setIsProfilesLoading(true);
    try {
      const data = await getProfilesFromFirestore();
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
      setIsProfilesLoading(false);
    }
  };

  const fetchMyWritings = async () => {
    try {
      const res = await fetch(`/api/writings?email=${encodeURIComponent(currentUserEmail)}`);
      if (res.ok) {
        const data = await res.json();
        setMyWritings(data || []);
      } else {
        const cached = localStorage.getItem(`cached_writings_${currentUserEmail}`);
        if (cached) setMyWritings(JSON.parse(cached));
      }
    } catch (e) {
      console.warn("Could not query user writings for community reference", e);
      const cached = localStorage.getItem(`cached_writings_${currentUserEmail}`);
      if (cached) setMyWritings(JSON.parse(cached));
    }
  };

  // 1. WORKSHOPS LOGIC
  const fetchWorkshops = async () => {
    try {
      const res = await fetch("/api/workshops");
      if (res.ok) {
        const data = await res.json();
        setWorkshops(data);
        if (data.length > 0 && !selectedWorkshopId) {
          setSelectedWorkshopId(data[0].id);
        }
      }
    } catch (e) {
      console.error("Could not fetch workshops list", e);
    }
  };

  const handleSelectMyWritingForWorkshop = (writingId: string) => {
    setSelectedMyWritingForWorkshopId(writingId);
    const writing = myWritings.find(w => w.id === writingId);
    if (writing) {
      setSubmittingWorkshopTitle(writing.title);
      setSubmittingWorkshopText(writing.content);
    }
  };

  const handleSubmitToWorkshop = async (workshopId: string) => {
    if (!submittingWorkshopTitle.trim() || !submittingWorkshopText.trim()) return;
    
    // Find penName if available
    const myProfile = profiles.find(p => p.email.toLowerCase() === currentUserEmail.toLowerCase());
    const penName = myProfile?.penName || currentUserEmail.split("@")[0];

    try {
      const res = await fetch(`/api/workshops/${workshopId}/submissions`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          userEmail: currentUserEmail,
          penName: penName,
          title: submittingWorkshopTitle,
          content: submittingWorkshopText
        })
      });

      if (res.ok) {
        setSubmittingWorkshopTitle("");
        setSubmittingWorkshopText("");
        setSelectedMyWritingForWorkshopId("");
        setActiveSubmittingToWorkshopId(null);
        fetchWorkshops();
      }
    } catch (err) {
      console.error("Error submitting to themed workshop", err);
    }
  };

  const handleSubmitCritique = async (workshopId: string, submissionId: string) => {
    const text = critiqueInputs[submissionId];
    if (!text || !text.trim()) return;

    const myProfile = profiles.find(p => p.email.toLowerCase() === currentUserEmail.toLowerCase());
    const penName = myProfile?.penName || currentUserEmail.split("@")[0];

    try {
      const res = await fetch(`/api/workshops/${workshopId}/submissions/${submissionId}/critiques`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          author: penName,
          text: text
        })
      });

      if (res.ok) {
        setCritiqueInputs(prev => ({ ...prev, [submissionId]: "" }));
        fetchWorkshops();
      }
    } catch (err) {
      console.error("Error submitting workshop critique", err);
    }
  };

  // 2. RECUEILS LOGIC
  const fetchRecueils = async () => {
    try {
      const res = await fetch("/api/recueils");
      if (res.ok) {
        const data = await res.json();
        setRecueils(data);
        if (data.length > 0 && !selectedRecueilId) {
          setSelectedRecueilId(data[0].id);
        }
      }
    } catch (e) {
      console.error("Error loading recueils list", e);
    }
  };

  const handleCreateRecueil = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newRecueilTitle.trim() || !newRecueilDesc.trim()) return;

    try {
      const res = await fetch("/api/recueils", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newRecueilTitle,
          description: newRecueilDesc,
          createdBy: currentUserEmail
        })
      });

      if (res.ok) {
        const created = await res.json();
        setNewRecueilTitle("");
        setNewRecueilDesc("");
        setIsCreatingRecueil(false);
        fetchRecueils();
        setSelectedRecueilId(created.id);
      }
    } catch (err) {
      console.error("Could not register new joint anthology", err);
    }
  };

  const handleContributeToRecueil = async (recueilId: string) => {
    if (!selectedMyWritingForRecueilId) return;
    const writing = myWritings.find(w => w.id === selectedMyWritingForRecueilId);
    if (!writing) return;

    const myProfile = profiles.find(p => p.email.toLowerCase() === currentUserEmail.toLowerCase());
    const penName = myProfile?.penName || currentUserEmail.split("@")[0];

    try {
      const res = await fetch(`/api/recueils/${recueilId}/add`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: writing.id,
          title: writing.title,
          content: writing.content,
          authorEmail: currentUserEmail,
          authorPenName: penName
        })
      });

      if (res.ok) {
        setSelectedMyWritingForRecueilId("");
        fetchRecueils();
      }
    } catch (err) {
      console.error("Could not push project to recueil", err);
    }
  };

  const handleDownloadRecueil = (rec: Recueil) => {
    const header = `=========================================\n${rec.title.toUpperCase()}\nUn recueil littéraire collectif\nSaisons de l'Atelier\n=========================================\n\nDescription: ${rec.description}\n` +
      `Date de compilation: ${new Date().toLocaleDateString()}\n` +
      `Auteurs de la Guilde: ${rec.contributors.join(", ")}\n\n`;
    
    let content = header + "--- SOMMAIRE ---\n\n";
    rec.writings.forEach((w, idx) => {
      content += `${idx + 1}. ${w.title} — par ${w.authorPenName}\n`;
    });
    content += "\n\n=========================================\n\n";
    
    rec.writings.forEach((w, idx) => {
      content += `\n\n[ ${idx + 1} ]\n${w.title.toUpperCase()}\nPar ${w.authorPenName}\n\n`;
      content += w.content;
      content += "\n\n-----------------------------------------";
    });

    const blob = new Blob([content], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `${rec.title.replace(/\s+/g, "_")}_Recueil_Collectif.txt`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  // 3. ANNOTATED WRITINGS LOGIC
  const fetchAnnotated = async () => {
    try {
      const res = await fetch("/api/annotated-writings");
      if (res.ok) {
        const data = await res.json();
        setAnnotatedWritings(data);
        if (data.length > 0 && !selectedAnnotatedId) {
          setSelectedAnnotatedId(data[0].id);
        }
      }
    } catch (e) {
      console.error("Could not fetch annotated masterpieces list", e);
    }
  };

  const handleShareAnnotatedWriting = async () => {
    if (!selectedMyWritingForAnnotationId) return;
    const writing = myWritings.find(w => w.id === selectedMyWritingForAnnotationId);
    if (!writing) return;

    if (!writing.comments || writing.comments.length === 0) {
      alert("Seuls les manuscrits ayant reçu ou contenant des notes de marge (commentaires) peuvent être partagés dans cette galerie d'apprentissage.");
      return;
    }

    const myProfile = profiles.find(p => p.email.toLowerCase() === currentUserEmail.toLowerCase());
    const penName = myProfile?.penName || currentUserEmail.split("@")[0];

    try {
      const res = await fetch("/api/annotated-writings", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: writing.id,
          title: writing.title,
          content: writing.content,
          authorEmail: currentUserEmail,
          authorPenName: penName,
          comments: writing.comments
        })
      });

      if (res.ok) {
        setSelectedMyWritingForAnnotationId("");
        fetchAnnotated();
        setSelectedAnnotatedId(writing.id);
      }
    } catch (err) {
      console.error("Could not share annotated manuscript:", err);
    }
  };

  const handleRemoveAnnotatedWriting = async (id: string) => {
    try {
      const res = await fetch(`/api/annotated-writings/${encodeURIComponent(id)}`, {
        method: "DELETE"
      });
      if (res.ok) {
        setSelectedAnnotatedId(null);
        fetchAnnotated();
      }
    } catch (err) {
      console.error("Error unpublishing manuscript:", err);
    }
  };

  // Helper to highlight parts of text in reading annotated
  const renderHighlightedContent = (content: string, comments: Comment[]) => {
    let result: React.ReactNode[] = [content];
    
    // Sort comments by length of selected text descending to prevent nested overlap bugs
    const sortedComments = [...comments]
      .filter(c => c.selectedText && c.selectedText.trim())
      .sort((a, b) => (b.selectedText?.length || 0) - (a.selectedText?.length || 0));

    if (sortedComments.length === 0) {
      return <pre className="whitespace-pre-wrap font-serif text-sm leading-relaxed text-[#E0D7D0]/90 select-text">{content}</pre>;
    }

    // Since a simple string replace is easiest for static displays:
    // Let's split and build segments. We will look for unique index occurrences
    let currentText = content;
    const segments: React.ReactNode[] = [];
    let keyIdx = 0;

    // A simpler but highly interactive approach: lines with inline annotations
    const lines = content.split("\n");
    return (
      <div className="space-y-1 select-text">
        {lines.map((line, lIdx) => {
          let lineElements: React.ReactNode[] = [line];

          sortedComments.forEach((comm) => {
            const term = comm.selectedText || "";
            if (!term) return;

            // Look inside the line elements and replace matches
            const tempElements: React.ReactNode[] = [];
            lineElements.forEach((el) => {
              if (typeof el !== "string") {
                tempElements.push(el);
                return;
              }

              const parts = el.split(term);
              if (parts.length > 1) {
                parts.forEach((part, idx) => {
                  if (idx > 0) {
                    tempElements.push(
                      <span
                        key={`highlight-${comm.id}-${idx}-${keyIdx++}`}
                        onMouseEnter={() => setHoveredCommentId(comm.id)}
                        onMouseLeave={() => setHoveredCommentId(null)}
                        className={`transition duration-150 rounded-xs px-0.5 border-b border-dashed cursor-help relative group ${
                          hoveredCommentId === comm.id
                            ? "bg-[#C5A059]/40 text-white border-[#C5A059]"
                            : "bg-[#C5A059]/15 text-[#EAE6E1] border-[#C5A059]/40 hover:bg-[#C5A059]/25"
                        }`}
                      >
                        {term}
                        {/* Interactive Tooltip in reading area */}
                        <span className="absolute bottom-full left-1/2 -translate-x-1/2 mb-1.5 hidden group-hover:block w-48 p-2 bg-[#141414] border border-[#C5A059]/30 text-[10px] font-sans text-slate-200 rounded-lg shadow-xl z-30 transition leading-snug">
                          <span className="font-bold text-[#C5A059] block mb-0.5">{comm.author} :</span>
                          "{comm.text}"
                        </span>
                      </span>
                    );
                  }
                  if (part) {
                    tempElements.push(part);
                  }
                });
              } else {
                tempElements.push(el);
              }
            });
            lineElements = tempElements;
          });

          return (
            <p key={lIdx} className="font-serif text-[15px] leading-relaxed text-[#EAE6E1] h-6 flex items-center">
              {lineElements.length === 1 && lineElements[0] === "" ? <span className="h-4 block" /> : lineElements}
            </p>
          );
        })}
      </div>
    );
  };

  // Sidebar search and filter for profiles-subTab
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
    <div className="space-y-6" id="community_lobby">
      
      {/* Community Lobby Subtabs Control Header */}
      <div className="flex border-b border-white/5 pb-2" id="community_subtabs_navigation">
        <div className="flex gap-2.5 overflow-x-auto scrollbar-none py-1">
          <button
            onClick={() => setSubTab("profiles")}
            className={`px-4 py-2 rounded-xl text-xs font-serif font-bold transition flex items-center gap-2 border cursor-pointer whitespace-nowrap ${
              subTab === "profiles"
                ? "bg-[#C5A059]/15 border-[#C5A059]/30 text-[#C5A059]"
                : "bg-white/5 border-transparent text-[#E0D7D0]/60 hover:text-white"
            }`}
          >
            <Users className="w-3.5 h-3.5" />
            <span>Poètes du Salon</span>
          </button>
          <button
            onClick={() => setSubTab("workshops")}
            className={`px-4 py-2 rounded-xl text-xs font-serif font-bold transition flex items-center gap-2 border cursor-pointer whitespace-nowrap ${
              subTab === "workshops"
                ? "bg-[#C5A059]/15 border-[#C5A059]/30 text-[#C5A059]"
                : "bg-white/5 border-transparent text-[#E0D7D0]/60 hover:text-white"
            }`}
          >
            <Sparkles className="w-3.5 h-3.5" />
            <span>Ateliers Collaboratifs</span>
          </button>
          <button
            onClick={() => setSubTab("recueils")}
            className={`px-4 py-2 rounded-xl text-xs font-serif font-bold transition flex items-center gap-2 border cursor-pointer whitespace-nowrap ${
              subTab === "recueils"
                ? "bg-[#C5A059]/15 border-[#C5A059]/30 text-[#C5A059]"
                : "bg-white/5 border-transparent text-[#E0D7D0]/60 hover:text-white"
            }`}
          >
            <BookOpen className="w-3.5 h-3.5" />
            <span>Recueils Collectifs</span>
          </button>
          <button
            onClick={() => setSubTab("marges")}
            className={`px-4 py-2 rounded-xl text-xs font-serif font-bold transition flex items-center gap-2 border cursor-pointer whitespace-nowrap ${
              subTab === "marges"
                ? "bg-[#C5A059]/15 border-[#C5A059]/30 text-[#C5A059]"
                : "bg-white/5 border-transparent text-[#E0D7D0]/60 hover:text-white"
            }`}
          >
            <Bookmark className="w-3.5 h-3.5" />
            <span>Marges Partagées</span>
          </button>
        </div>
      </div>

      {/* 1. SUBTAB: PROFILES (ORIGINAL VIEW) */}
      {subTab === "profiles" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 text-[#E0D7D0]" id="community_profiles_module">
          {/* Writers list Column */}
          <div className="lg:col-span-1 flex flex-col gap-4">
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
                {isProfilesLoading ? (
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
                        onClick={() => setSelectedProfileEmail(p.email)}
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
          <div className="lg:col-span-2">
            {selectedProfile ? (
              <div className="bg-[#0D0D0D] border border-white/10 rounded-2xl p-6 lg:p-8 space-y-6" id="profile_details_window">
                <div className="flex flex-col sm:flex-row items-center sm:items-start gap-6 pb-6 border-b border-white/10">
                  <img
                    src={selectedProfile.avatarUrl}
                    alt={selectedProfile.displayName}
                    referrerPolicy="no-referrer"
                    className="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover ring-2 ring-[#C5A059]/40 border-2 border-transparent p-0.5"
                  />
                  
                  <div className="flex-1 text-center sm:text-left space-y-2">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                      <div>
                        <h2 className="text-xl font-serif font-bold text-[#EAE6E1]">
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

                    <div className="flex items-center gap-1.5 justify-center sm:justify-start text-xs text-slate-400 font-mono">
                      <Mail className="w-3.5 h-3.5 text-slate-500" />
                      <span>{selectedProfile.email}</span>
                    </div>

                    {/* Social connections */}
                    <div className="flex flex-wrap items-center justify-center sm:justify-start gap-2.5 pt-2">
                      {selectedProfile.socials?.website && (
                        <a href={selectedProfile.socials.website} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded bg-white/5 hover:bg-white/10 hover:text-[#C5A059] border border-white/5 text-slate-400 transition" title="Site Internet">
                          <Globe className="w-4 h-4" />
                        </a>
                      )}
                      {selectedProfile.socials?.twitter && (
                        <a href={`https://twitter.com/${selectedProfile.socials.twitter}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded bg-white/5 hover:bg-white/10 hover:text-[#C5A059] border border-white/5 text-slate-400 transition" title="X / Twitter">
                          <Twitter className="w-4 h-4" />
                        </a>
                      )}
                      {selectedProfile.socials?.github && (
                        <a href={`https://github.com/${selectedProfile.socials.github}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded bg-white/5 hover:bg-white/10 hover:text-[#C5A059] border border-white/5 text-slate-400 transition" title="GitHub">
                          <Github className="w-4 h-4" />
                        </a>
                      )}
                      {selectedProfile.socials?.linkedin && (
                        <a href={selectedProfile.socials.linkedin.startsWith("http") ? selectedProfile.socials.linkedin : `https://linkedin.com/in/${selectedProfile.socials.linkedin}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded bg-white/5 hover:bg-white/10 hover:text-[#C5A059] border border-white/5 text-slate-400 transition" title="LinkedIn">
                          <Linkedin className="w-4 h-4" />
                        </a>
                      )}
                      {selectedProfile.socials?.instagram && (
                        <a href={`https://instagram.com/${selectedProfile.socials.instagram}`} target="_blank" rel="noopener noreferrer" className="p-1.5 rounded bg-white/5 hover:bg-white/10 hover:text-[#C5A059] border border-white/5 text-slate-400 transition" title="Instagram">
                          <Instagram className="w-4 h-4" />
                        </a>
                      )}
                    </div>
                  </div>
                </div>

                <div className="space-y-2.5">
                  <h3 className="text-xs font-bold font-mono uppercase text-[#C5A059] tracking-wider flex items-center gap-1.5">
                    <Award className="w-4 h-4" />
                    <span>Biographie & Démarche Littéraire Immersive</span>
                  </h3>
                  <div className="p-4 bg-white/5 border border-white/5 rounded-2xl text-sm leading-relaxed text-[#E0D7D0] font-serif whitespace-pre-wrap">
                    {selectedProfile.bio || <p className="text-slate-500 italic font-sans text-xs">Cet écrivain n'a pas encore rédigé sa biographie.</p>}
                  </div>
                </div>

                <div className="space-y-3">
                  <h3 className="text-xs font-bold font-mono uppercase text-[#C5A059] tracking-wider flex items-center gap-1.5">
                    <BookOpen className="w-4 h-4" />
                    <span>Publications Référencées dans la Guilde</span>
                  </h3>

                  {selectedProfile.publishedWorks && selectedProfile.publishedWorks.length > 0 ? (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      {selectedProfile.publishedWorks.map((work, idx) => (
                        <div key={idx} className="p-3.5 bg-[#141414] border border-white/5 rounded-xl hover:border-[#C5A059]/20 transition flex items-center justify-between">
                          <div className="min-w-0 pr-2">
                            <h4 className="text-xs font-bold font-serif text-[#EAE6E1] truncate">{work.title}</h4>
                            <span className="text-[9px] text-[#C5A059]/60 font-mono block mt-0.5">Œuvre publiée</span>
                          </div>
                          {work.url && (
                            <a href={work.url} target="_blank" rel="noopener noreferrer" className="p-1.5 bg-white/5 hover:bg-white/10 hover:text-[#C5A059] rounded border border-white/5 text-slate-400">
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
              <div className="bg-[#0D0D0D] border border-white/10 rounded-2xl p-8 text-center">
                <User className="w-12 h-12 text-[#C5A059]/40 mx-auto stroke-1" />
                <h3 className="font-serif font-bold text-[#EAE6E1] text-base mt-3">Sélectionnez un écrivain</h3>
                <p className="text-xs text-slate-400 mt-1 max-w-sm mx-auto">
                  Explorez les voix poétiques de l'Atelier en sélectionnant un membre de la communauté sur le panneau à gauche.
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* 2. SUBTAB: WORKSHOPS (ATELIERS COLLABORATIFS) */}
      {subTab === "workshops" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="community_workshops_lobby">
          {/* Workshops List Sidebar */}
          <div className="lg:col-span-1 bg-[#0D0D0D] border border-white/10 rounded-2xl p-4 space-y-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-[#C5A059]" />
                <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-[#EAE6E1]">Ateliers Thématiques</h3>
              </div>
            </div>

            <div className="space-y-2.5">
              {workshops.map((ws) => {
                const isActive = ws.id === selectedWorkshopId;
                return (
                  <button
                    key={ws.id}
                    onClick={() => {
                      setSelectedWorkshopId(ws.id);
                      setActiveSubmittingToWorkshopId(null);
                    }}
                    className={`w-full text-left p-3.5 rounded-xl border transition flex flex-col gap-1.5 cursor-pointer ${
                      isActive
                        ? "bg-[#C5A059]/10 border-[#C5A059]/40"
                        : "bg-white/5 border-white/5 hover:border-white/10"
                    }`}
                  >
                    <div className="flex justify-between items-center w-full">
                      <span className="text-[9px] font-mono tracking-widest uppercase text-[#C5A059]">
                        {ws.week}
                      </span>
                      <span className={`text-[8px] font-mono px-1.5 py-0.5 rounded-sm uppercase tracking-wider ${
                        ws.status === "active" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                        ws.status === "upcoming" ? "bg-amber-500/10 text-amber-400 border border-amber-500/20" :
                        "bg-white/5 text-slate-500"
                      }`}>
                        {ws.status === "active" ? "En Cours" : ws.status === "upcoming" ? "À Venir" : "Clôturé"}
                      </span>
                    </div>
                    <h4 className="text-xs font-serif font-bold text-[#EAE6E1]">{ws.title}</h4>
                    <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">{ws.description}</p>
                    <div className="text-[9px] font-mono text-[#C5A059]/60 mt-1">
                      {ws.submissions?.length || 0} strophe(s) partagée(s)
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Workshop focus */}
          <div className="lg:col-span-2 space-y-5">
            {selectedWorkshopId && workshops.find(w => w.id === selectedWorkshopId) ? (() => {
              const ws = workshops.find(w => w.id === selectedWorkshopId)!;
              return (
                <div className="space-y-5">
                  {/* Workshop intro box */}
                  <div className="bg-[#0D0D0D] border border-[#C5A059]/20 rounded-2xl p-6 relative overflow-hidden">
                    {/* Golden luxury shine */}
                    <div className="absolute top-0 right-0 w-32 h-32 bg-radial from-[#C5A059]/5 to-transparent rounded-full pointer-events-none" />
                    <div className="space-y-2">
                      <div className="flex items-center gap-1.5">
                        <Sparkles className="w-4 h-4 text-[#C5A059]" />
                        <span className="text-[10px] font-mono tracking-widest uppercase text-[#C5A059]">{ws.week}</span>
                      </div>
                      <h2 className="text-lg font-serif font-bold text-[#EAE6E1]">{ws.title}</h2>
                      <p className="text-xs text-slate-300 leading-relaxed font-serif">{ws.description}</p>

                      {ws.status === "active" && !activeSubmittingToWorkshopId && (
                        <button
                          onClick={() => {
                            setActiveSubmittingToWorkshopId(ws.id);
                            setSelectedMyWritingForWorkshopId("");
                            setSubmittingWorkshopTitle("");
                            setSubmittingWorkshopText("");
                          }}
                          className="mt-3 px-3 py-1.5 bg-[#C5A059] text-[10px] text-black font-sans font-bold hover:bg-[#B38F4B] transition rounded-lg flex items-center gap-1 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Soumettre mon poème</span>
                        </button>
                      )}
                    </div>
                  </div>

                  {/* Submission form */}
                  {activeSubmittingToWorkshopId === ws.id && (
                    <div className="bg-[#141414] border border-white/10 rounded-2xl p-5 space-y-4">
                      <div className="flex justify-between items-center pb-2 border-b border-white/5">
                        <span className="text-xs font-serif font-bold text-[#EAE6E1]">Nouvelle contribution d'Atelier</span>
                        <button
                          onClick={() => setActiveSubmittingToWorkshopId(null)}
                          className="text-slate-500 hover:text-slate-300 text-xs"
                        >
                          Annuler
                        </button>
                      </div>

                      {/* Dropdown template selector */}
                      <div className="space-y-1">
                        <label className="text-[10px] font-mono uppercase text-[#C5A059] tracking-wider">Importer depuis mes manuscrits (Optionnel)</label>
                        <select
                          value={selectedMyWritingForWorkshopId}
                          onChange={(e) => handleSelectMyWritingForWorkshop(e.target.value)}
                          className="w-full text-xs p-2.5 bg-[#1F1F1F] border border-white/5 focus:border-[#C5A059]/40 text-[#E0D7D0] rounded-xl outline-hidden"
                        >
                          <option value="">-- Choisir un brouillon personnel --</option>
                          {myWritings.map(w => (
                            <option key={w.id} value={w.id}>{w.title}</option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1">
                        <input
                          type="text"
                          placeholder="Titre de votre œuvre..."
                          value={submittingWorkshopTitle}
                          onChange={(e) => setSubmittingWorkshopTitle(e.target.value)}
                          className="w-full text-xs p-2.5 bg-[#1F1F1F] border border-white/5 focus:border-[#C5A059]/40 text-[#EAE6E1] rounded-xl outline-hidden placeholder-slate-600 font-serif"
                        />
                      </div>

                      <div className="space-y-1">
                        <textarea
                          placeholder="Saisissez vos versets ici..."
                          rows={6}
                          value={submittingWorkshopText}
                          onChange={(e) => setSubmittingWorkshopText(e.target.value)}
                          className="w-full text-xs p-2.5 bg-[#1F1F1F] border border-white/5 focus:border-[#C5A059]/40 text-[#E0D7D0] rounded-xl outline-hidden placeholder-slate-600 font-serif whitespace-pre-wrap leading-relaxed"
                        />
                      </div>

                      <button
                        onClick={() => handleSubmitToWorkshop(ws.id)}
                        disabled={!submittingWorkshopTitle.trim() || !submittingWorkshopText.trim()}
                        className="px-4 py-2 bg-[#C5A059] text-xs font-bold text-black hover:bg-[#B38F4B] transition rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1.5"
                      >
                        <Send className="w-3.5 h-3.5" />
                        <span>Publier ma contribution</span>
                      </button>
                    </div>
                  )}

                  {/* Submissions feed list */}
                  <div className="space-y-4">
                    <h3 className="text-xs font-bold font-mono uppercase text-[#C5A059] tracking-wider">Poèmes déposés ({ws.submissions?.length || 0})</h3>
                    
                    {(!ws.submissions || ws.submissions.length === 0) ? (
                      <div className="bg-[#0D0D0D] border border-white/5 border-dashed rounded-2xl p-8 text-center text-xs text-slate-500 font-serif italic">
                        Aucun membre n'a encore transmis ses alexandrins pour cet atelier. Soyez le premier poète inspiré !
                      </div>
                    ) : (
                      ws.submissions.map((sub) => (
                        <div key={sub.id} className="bg-[#0D0D0D] border border-white/10 rounded-2xl overflow-hidden shadow-xs">
                          {/* Top banner */}
                          <div className="p-4 bg-white/3 border-b border-white/5 flex justify-between items-center">
                            <div>
                              <h4 className="text-xs font-serif font-bold text-[#EAE6E1]">{sub.title}</h4>
                              <p className="text-[9px] text-slate-400 font-mono">Plume d'Auteur : <span className="text-[#C5A059] italic font-semibold">{sub.penName}</span></p>
                            </div>
                            <span className="text-[9px] text-slate-500 font-mono">
                              {new Date(sub.createdAt).toLocaleDateString()}
                            </span>
                          </div>

                          {/* Poetry body */}
                          <div className="p-5 bg-black/25">
                            <pre className="font-serif text-[13px] leading-relaxed text-slate-200 whitespace-pre-wrap italic pl-4 border-l border-[#C5A059]/30">
                              {sub.content}
                            </pre>
                          </div>

                          {/* Critiques and replies */}
                          <div className="p-4 bg-white/2 border-t border-white/5 space-y-3">
                            <span className="text-[9px] font-mono uppercase tracking-widest text-[#C5A059]/70 block">
                              Critiques & Analyses {sub.critiques && sub.critiques.length > 0 ? `(${sub.critiques.length})` : ""}
                            </span>

                            {sub.critiques && sub.critiques.length > 0 && (
                              <div className="space-y-2">
                                {sub.critiques.map((crit) => (
                                  <div key={crit.id} className="p-2.5 bg-black/40 border border-white/5 rounded-xl text-xs space-y-1">
                                    <div className="flex justify-between items-center text-[10px] text-slate-400 font-mono">
                                      <span className="text-[#C5A059]/90 font-bold">{crit.author}</span>
                                      <span>{new Date(crit.createdAt).toLocaleDateString()}</span>
                                    </div>
                                    <p className="text-[#E0D7D0] leading-normal font-serif italic">"{crit.text}"</p>
                                  </div>
                                ))}
                              </div>
                            )}

                            {/* Critique input form */}
                            <div className="flex gap-2 pt-1">
                              <input
                                type="text"
                                placeholder="Laisser une critique sur le choix de mot, de rime..."
                                value={critiqueInputs[sub.id] || ""}
                                onChange={(e) => {
                                  const val = e.target.value;
                                  setCritiqueInputs(prev => ({ ...prev, [sub.id]: val }));
                                }}
                                className="flex-1 text-[11px] px-3 py-1.5 bg-black border border-white/5 focus:border-[#C5A059]/40 text-white rounded-lg outline-hidden placeholder-slate-600"
                              />
                              <button
                                onClick={() => handleSubmitCritique(ws.id, sub.id)}
                                disabled={!(critiqueInputs[sub.id] || "").trim()}
                                className="p-1 px-3 bg-[#C5A059] text-black hover:bg-[#B38F4B] transition text-[10px] font-bold rounded-lg cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                              >
                                Soumettre
                              </button>
                            </div>
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                </div>
              );
            })() : (
              <div className="bg-[#0D0D0D] border border-white/15 rounded-2xl p-10 text-center">
                Veuillez sélectionner un atelier thématique pour découvrir ses strophes.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. SUBTAB: RECUEILS (RECUEILS COLLECTIFS) */}
      {subTab === "recueils" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="community_recueils_lobby">
          {/* Sidebar */}
          <div className="lg:col-span-1 bg-[#0D0D0D] border border-white/10 rounded-2xl p-4 flex flex-col gap-4">
            <div className="flex items-center justify-between pb-2 border-b border-white/10">
              <div className="flex items-center gap-1.5">
                <BookOpen className="w-4 h-4 text-[#C5A059]" />
                <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-[#EAE6E1]">Recueils Communs</h3>
              </div>
              <button
                onClick={() => setIsCreatingRecueil(true)}
                className="p-1 bg-[#C5A059]/10 text-[#C5A059] hover:bg-[#C5A059]/20 border border-[#C5A059]/30 rounded-lg text-[10px] font-sans font-bold transition flex items-center gap-0.5 cursor-pointer"
              >
                <Plus className="w-3 h-3" />
                <span>Nouveau</span>
              </button>
            </div>

            {isCreatingRecueil && (
              <form onSubmit={handleCreateRecueil} className="bg-white/3 border border-white/5 p-3 rounded-xl space-y-3">
                <span className="text-[10px] font-mono text-[#C5A059] uppercase block font-semibold">Créer une œuvre collective</span>
                <input
                  type="text"
                  placeholder="Titre du recueil..."
                  value={newRecueilTitle}
                  onChange={(e) => setNewRecueilTitle(e.target.value)}
                  className="w-full text-xs p-2 bg-[#1A1A1A] border border-white/5 text-white rounded-lg outline-hidden font-serif"
                  required
                />
                <textarea
                  placeholder="Description éditoriale de l'anthologie..."
                  rows={3}
                  value={newRecueilDesc}
                  onChange={(e) => setNewRecueilDesc(e.target.value)}
                  className="w-full text-xs p-2 bg-[#1A1A1A] border border-white/5 text-slate-300 rounded-lg outline-hidden font-serif"
                  required
                />
                <div className="flex gap-2 justify-end pt-1">
                  <button type="button" onClick={() => setIsCreatingRecueil(false)} className="text-[10px] text-slate-400">Annuler</button>
                  <button type="submit" className="px-2 py-1 bg-[#C5A059] text-black text-[10px] font-bold rounded-lg">Assembler</button>
                </div>
              </form>
            )}

            <div className="space-y-2.5 max-h-[480px] overflow-y-auto">
              {recueils.map((rec) => {
                const isActive = rec.id === selectedRecueilId;
                return (
                  <button
                    key={rec.id}
                    onClick={() => setSelectedRecueilId(rec.id)}
                    className={`w-full text-left p-3.5 rounded-xl border transition flex flex-col gap-1 cursor-pointer ${
                      isActive
                        ? "bg-[#C5A059]/10 border-[#C5A059]/40"
                        : "bg-white/5 border-white/5 hover:border-white/10"
                    }`}
                  >
                    <h4 className="text-xs font-serif font-bold text-[#EAE6E1]">{rec.title}</h4>
                    <p className="text-[10px] text-slate-400 line-clamp-2 leading-relaxed">{rec.description}</p>
                    <div className="flex justify-between items-center mt-2 pt-1 border-t border-white/5 w-full text-[9px] text-[#C5A059]/70 font-mono">
                      <span>{rec.writings?.length || 0} manuscrit(s)</span>
                      <span>{rec.contributors?.length || 1} poète(s)</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Recueil details Column */}
          <div className="lg:col-span-2">
            {selectedRecueilId && recueils.find(r => r.id === selectedRecueilId) ? (() => {
              const rec = recueils.find(r => r.id === selectedRecueilId)!;
              return (
                <div className="bg-[#0D0D0D] border border-white/10 rounded-2xl p-6 lg:p-8 space-y-6">
                  {/* cover visual layout */}
                  <div className="border border-[#C5A059]/20 p-6 bg-gradient-to-r from-black via-[#0E0B08] to-black rounded-2xl text-center space-y-3 relative overflow-hidden shadow-lg">
                    <div className="absolute top-1 left-1 bottom-1 right-1 border border-white/5 rounded-xl pointer-events-none" />
                    
                    <span className="text-[9px] font-mono tracking-widest uppercase text-[#C5A059]">Anthologie Collaborative</span>
                    <h2 className="text-2xl font-serif font-bold text-[#EAE6E1] uppercase tracking-wide">{rec.title}</h2>
                    <p className="text-xs text-slate-400 max-w-md mx-auto italic font-serif leading-relaxed">"{rec.description}"</p>
                    <p className="text-[9px] text-slate-500 font-mono pt-1">
                      Co-auteurs : {rec.contributors.join(", ") || "Aucun pour le moment"}
                    </p>

                    <div className="flex gap-3 justify-center pt-4">
                      {rec.writings && rec.writings.length > 0 && (
                        <>
                          <button
                            onClick={() => {
                              setReadingRecueil(rec);
                              setBookCurrentPage(0);
                            }}
                            className="px-4 py-1.5 bg-[#C5A059]/10 hover:bg-[#C5A059]/20 border border-[#C5A059]/40 text-[#C5A059] text-xs font-serif font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5"
                          >
                            <Eye className="w-4 h-4" />
                            <span>Lire l'Anthologie</span>
                          </button>
                          <button
                            onClick={() => handleDownloadRecueil(rec)}
                            className="px-4 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 text-[#E0D7D0] text-xs font-serif font-bold rounded-lg transition cursor-pointer flex items-center gap-1.5 animate-pulse"
                            title="Télécharger le fichier .txt formaté du recueil littéraire"
                          >
                            <Download className="w-4 h-4" />
                            <span>Télécharger</span>
                          </button>
                        </>
                      )}
                    </div>
                  </div>

                  {/* Add document contribution */}
                  <div className="p-4 bg-white/3 border border-white/5 rounded-2xl space-y-3">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-[#C5A059] block">Contribuer en y ajoutant vos strophes</span>
                    
                    {myWritings.length === 0 ? (
                      <p className="text-xs text-slate-500 italic font-serif">Vous n'avez pas encore de projet d'écriture local de disponible.</p>
                    ) : (
                      <div className="flex flex-col sm:flex-row gap-3">
                        <select
                          value={selectedMyWritingForRecueilId}
                          onChange={(e) => setSelectedMyWritingForRecueilId(e.target.value)}
                          className="flex-1 text-xs p-2.5 bg-[#1F1F1F] border border-white/5 text-[#E0D7D0] rounded-xl outline-hidden"
                        >
                          <option value="">-- Choisir un de mes manuscrits --</option>
                          {myWritings.map(w => (
                            <option key={w.id} value={w.id}>{w.title}</option>
                          ))}
                        </select>
                        <button
                          onClick={() => handleContributeToRecueil(rec.id)}
                          disabled={!selectedMyWritingForRecueilId}
                          className="px-4 py-2 bg-[#C5A059] text-black text-xs font-bold rounded-xl transition hover:bg-[#B38F4B] cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed"
                        >
                          Incorporer mon œuvre
                        </button>
                      </div>
                    )}
                  </div>

                  {/* Sommaire */}
                  <div className="space-y-3">
                    <span className="text-xs font-bold font-mono uppercase tracking-widest text-slate-400 block pt-1">Sommaire Littéraire ({rec.writings?.length || 0})</span>
                    
                    {(!rec.writings || rec.writings.length === 0) ? (
                      <div className="text-center py-6 bg-white/2 border border-white/5 border-dashed rounded-xl text-xs text-slate-500 font-serif italic">
                        Le sommaire est blanc. Soyez le premier contributeur de cet opus !
                      </div>
                    ) : (
                      <div className="space-y-2.5">
                        {rec.writings.map((wr, idx) => (
                          <div key={wr.id || idx} className="p-3 bg-[#111111] border border-white/5 rounded-xl flex justify-between items-center hover:border-[#C5A059]/20 transition">
                            <div className="flex items-center gap-3">
                              <span className="text-xs font-mono text-[#C5A059]/60">{idx + 1}.</span>
                              <div>
                                <h4 className="text-xs font-serif font-bold text-[#EAE6E1]">{wr.title}</h4>
                                <p className="text-[9px] text-slate-400 font-mono">Signé : <span className="italic text-[#C5A059]">{wr.authorPenName}</span></p>
                              </div>
                            </div>
                            <span className="text-[10px] text-slate-500 font-serif font-medium">{wr.content.trim().split(/\s+/).length} mots</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                </div>
              );
            })() : (
              <div className="bg-[#0D0D0D] border border-white/15 rounded-2xl p-10 text-center">
                Veuillez sélectionner un recueil d'anthologie dans la liste de gauche.
              </div>
            )}
          </div>
        </div>
      )}

      {/* 4. SUBTAB: MARGES PARTAGEES (COMMENTAIRES ANNOTÉS) */}
      {subTab === "marges" && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6" id="community_annotated_lobby">
          {/* List Sidebar */}
          <div className="lg:col-span-1 bg-[#0D0D0D] border border-white/10 rounded-2xl p-4 flex flex-col gap-4">
            <div className="pb-2 border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-1.5">
                <Bookmark className="w-4 h-4 text-[#C5A059]" />
                <h3 className="text-xs font-bold font-mono uppercase tracking-wider text-[#EAE6E1]">Œuvres Annotées</h3>
              </div>
            </div>

            {/* Sharing trigger block */}
            <div className="p-3 bg-white/3 border border-white/5 rounded-xl space-y-2.5">
              <span className="text-[9px] font-mono uppercase tracking-wider text-[#C5A059] block">Partager un projet avec ses critiques</span>
              <select
                value={selectedMyWritingForAnnotationId}
                onChange={(e) => setSelectedMyWritingForAnnotationId(e.target.value)}
                className="w-full text-[11px] p-2 bg-[#1A1A1A] border border-white/5 text-[#E0D7D0] rounded-lg outline-hidden"
              >
                <option value="">-- Choisir un brouillon commenté --</option>
                {myWritings.filter(w => w.comments && w.comments.length > 0).map(w => (
                  <option key={w.id} value={w.id}>{w.title} ({w.comments.length} notes)</option>
                ))}
              </select>
              <button
                onClick={handleShareAnnotatedWriting}
                disabled={!selectedMyWritingForAnnotationId}
                className="w-full py-1.5 bg-[#C5A059]/10 text-[#C5A059] border border-[#C5A059]/30 hover:bg-[#C5A059]/15 text-[10px] font-sans font-bold rounded-lg transition cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed"
              >
                Publier avec mes annotations
              </button>
            </div>

            {/* Scroller list */}
            <div className="space-y-2.5 max-h-[350px] overflow-y-auto">
              {annotatedWritings.map((aw) => {
                const isActive = aw.id === selectedAnnotatedId;
                return (
                  <button
                    key={aw.id}
                    onClick={() => setSelectedAnnotatedId(aw.id)}
                    className={`w-full text-left p-3 rounded-xl border transition flex flex-col gap-1 cursor-pointer ${
                      isActive
                        ? "bg-[#C5A059]/10 border-[#C5A059]/40"
                        : "bg-white/5 border-white/5 hover:border-white/10"
                    }`}
                  >
                    <h4 className="text-xs font-serif font-bold text-[#EAE6E1]">{aw.title}</h4>
                    <span className="text-[10px] text-slate-400 font-mono">Auteur : <span className="text-[#C5A059] italic">{aw.authorPenName}</span></span>
                    <div className="text-[9px] text-[#C5A059]/60 font-mono mt-1 flex justify-between w-full">
                      <span>{aw.comments?.length || 0} note(s) critique(s)</span>
                      <span>Enseignant</span>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Detailed Annotation View */}
          <div className="lg:col-span-2">
            {selectedAnnotatedId && annotatedWritings.find(aw => aw.id === selectedAnnotatedId) ? (() => {
              const aw = annotatedWritings.find(aw => aw.id === selectedAnnotatedId)!;
              return (
                <div className="bg-[#0D0D0D] border border-white/10 rounded-2xl p-6 lg:p-8 space-y-6" id="learning_marginalia_view">
                  
                  {/* Top heading */}
                  <div className="flex justify-between items-center pb-4 border-b border-white/10">
                    <div>
                      <span className="text-[9px] font-mono uppercase tracking-widest text-[#C5A059]">Salon d'Étude & Marges Inspirées</span>
                      <h2 className="text-lg font-serif font-bold text-[#EAE6E1]">{aw.title}</h2>
                      <p className="text-[10px] text-slate-400 font-mono">Par : <span className="text-[#C5A059] italic font-semibold">{aw.authorPenName}</span></p>
                    </div>

                    {aw.authorEmail.toLowerCase() === currentUserEmail.toLowerCase() && (
                      <button
                        onClick={() => handleRemoveAnnotatedWriting(aw.id)}
                        className="p-1.5 text-red-400 hover:bg-red-500/10 rounded-lg transition"
                        title="Retirer de la galerie publique"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>

                  {/* Two column visual: Left side has interactive poem text, Right side has notes list */}
                  <div className="grid grid-cols-1 md:grid-cols-5 gap-6">
                    {/* Left side poem text (spans 3 cols) */}
                    <div className="md:col-span-3 bg-black/30 p-5 rounded-2xl border border-white/5 space-y-4">
                      {renderHighlightedContent(aw.content, aw.comments)}
                    </div>

                    {/* Right side annotations log (spans 2 cols) */}
                    <div className="md:col-span-2 space-y-3.5">
                      <span className="text-[9px] font-mono uppercase text-[#C5A059] tracking-wider block border-b border-white/5 pb-1">Notes de Marge ({aw.comments?.length || 0})</span>
                      
                      <div className="space-y-3 max-h-[380px] overflow-y-auto pr-1">
                        {aw.comments.map((comm) => {
                          const isHovered = hoveredCommentId === comm.id;
                          return (
                            <div
                              key={comm.id}
                              onMouseEnter={() => setHoveredCommentId(comm.id)}
                              onMouseLeave={() => setHoveredCommentId(null)}
                              className={`p-3 rounded-xl border transition duration-150 flex flex-col gap-1.5 ${
                                isHovered
                                  ? "bg-[#C5A059]/10 border-[#C5A059]/40"
                                  : "bg-[#141414] border-white/5"
                              }`}
                            >
                              {comm.selectedText && (
                                <div className="text-[9px] font-serif inline-flex items-center gap-1 text-[#C5A059] italic bg-[#C5A059]/5 border border-[#C5A059]/15 px-1.5 py-0.5 rounded-sm w-fit">
                                  <span>Mots visés :</span>
                                  <span>"{comm.selectedText}"</span>
                                </div>
                              )}
                              <p className="text-xs text-slate-200 font-serif leading-relaxed italic">
                                "{comm.text}"
                              </p>
                              <span className="text-[9px] text-slate-400 font-mono self-end">
                                — {comm.author}
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                </div>
              );
            })() : (
              <div className="bg-[#0D0D0D] border border-white/15 rounded-2xl p-10 text-center text-slate-500 font-serif italic text-xs">
                Sélectionnez une œuvre commentée dans la liste de gauche pour explorer son texte et ses notes de critique littéraire.
              </div>
            )}
          </div>
        </div>
      )}

      {/* IMMERSIVE BOOK SIMULATOR MODAL (FOR READING Anthologies) */}
      {readingRecueil && (
        <div className="fixed inset-0 bg-black/90 backdrop-blur-md flex items-center justify-center p-4 z-[99999] animate-fade-in">
          <div className="absolute top-4 right-4 z-50">
            <button
              onClick={() => {
                setReadingRecueil(null);
                setBookCurrentPage(0);
              }}
              className="p-2.5 bg-black/60 hover:bg-[#C5A059] hover:text-black border border-white/10 text-slate-300 rounded-full transition cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>

          {/* Book frame layout */}
          <div className="bg-[#121110] border border-[#C5A059]/30 rounded-3xl p-6 lg:p-12 max-w-4xl w-full max-h-[85vh] flex flex-col justify-between shadow-2xl relative">
            {/* Red leather outer book cover spine left side visual */}
            <div className="absolute left-0 top-0 bottom-0 w-3 bg-[#3F1111]/45 rounded-l-3xl shadow-inner border-r border-[#C5A059]/15" />
            {/* Elegant Golden Line details inside cover */}
            <div className="absolute top-2 left-5 bottom-2 right-2 border border-[#C5A059]/10 rounded-2xl pointer-events-none" />

            {/* Header booklet meta */}
            <div className="flex justify-between items-center text-[10px] font-mono text-[#C5A059]/70 pb-3 border-b border-[#C5A059]/10">
              <span>Recueil : {readingRecueil.title}</span>
              <span>Atelier Littéraire Éditions</span>
            </div>

            {/* Immersive Scroll/Pages area */}
            <div className="flex-1 my-6 overflow-y-auto font-serif text-[#E0D7D0] px-4 min-h-[300px]">
              {bookCurrentPage === 0 ? (
                /* COVER & TABLE OF CONTENTS */
                <div className="text-center space-y-8 py-8 animate-in fade-in duration-350">
                  <span className="text-xs font-mono uppercase tracking-widest text-[#C5A059]">Anthologie Poétique Collective</span>
                  <div className="space-y-2">
                    <h1 className="text-3xl text-[#EAE6E1] font-serif font-bold uppercase tracking-wide">{readingRecueil.title}</h1>
                    <div className="w-16 h-0.5 bg-[#C5A059] mx-auto opacity-60" />
                  </div>
                  <p className="text-sm italic text-slate-300 max-w-md mx-auto leading-relaxed">
                    "{readingRecueil.description}"
                  </p>
                  
                  {/* Contributors signatures */}
                  <div className="pt-2 text-xs font-mono text-slate-400">
                    <p className="uppercase tracking-widest text-[9px] text-[#C5A059]/60 mb-2">Comptoir des Plumes</p>
                    <div className="flex flex-wrap justify-center gap-x-4 gap-y-1.5 italic">
                      {readingRecueil.contributors.map((contrib, idx) => (
                        <span key={contrib}>
                          {contrib.split("@")[0]}
                          {idx < readingRecueil.contributors.length - 1 ? " •" : ""}
                        </span>
                      ))}
                    </div>
                  </div>

                  {/* Sommaire */}
                  <div className="max-w-md mx-auto pt-6 text-left border-t border-white/5 space-y-3">
                    <span className="text-[10px] font-mono uppercase tracking-widest text-[#C5A059]/70 block text-center">Table des Matières</span>
                    <div className="space-y-1.5">
                      {readingRecueil.writings.map((wr, idx) => (
                        <button
                          key={idx}
                          onClick={() => setBookCurrentPage(idx + 1)}
                          className="w-full flex justify-between items-end gap-2 text-xs text-[#E0D7D0] hover:text-[#C5A059] transition"
                        >
                          <span className="font-bold shrink-0">{idx + 1}. {wr.title}</span>
                          <span className="border-b border-dotted border-white/10 flex-1 h-3" />
                          <span className="font-mono text-[10px] text-slate-400 italic font-semibold shrink-0">par {wr.authorPenName}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : (() => {
                /* INDIVIDUAL POEMS PAGES */
                const poem = readingRecueil.writings[bookCurrentPage - 1];
                if (!poem) return null;
                return (
                  <div className="max-w-xl mx-auto space-y-6 py-6 animate-in fade-in duration-200">
                    <div className="text-center space-y-1">
                      <span className="text-[9px] font-mono uppercase tracking-widest text-[#C5A059]">Page {bookCurrentPage}</span>
                      <h2 className="text-xl font-bold uppercase tracking-wide text-[#EAE6E1]">{poem.title}</h2>
                      <p className="text-xs text-slate-400 font-mono italic">Signé par : <span className="text-[#C5A059] font-serif not-italic font-bold">{poem.authorPenName}</span></p>
                    </div>
                    <div className="w-12 h-[1px] bg-[#C5A059]/50 mx-auto" />
                    
                    {/* Poem text with spacious margins and beautiful Garamond feel */}
                    <div className="p-8 bg-black/20 border border-white/5 rounded-2xl max-w-md mx-auto">
                      <pre className="font-serif text-[15px] leading-relaxed text-slate-100 whitespace-pre-wrap select-text pl-4 border-l-2 border-[#C5A059]">
                        {poem.content}
                      </pre>
                    </div>
                  </div>
                );
              })()}
            </div>

            {/* Footer page turning triggers */}
            <div className="flex justify-between items-center pt-3 border-t border-[#C5A059]/10">
              <button
                onClick={() => setBookCurrentPage(prev => Math.max(0, prev - 1))}
                disabled={bookCurrentPage === 0}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-[#E0D7D0] text-xs font-serif font-bold rounded-xl transition flex items-center gap-1 cursor-pointer disabled:opacity-20"
              >
                <ChevronLeft className="w-4 h-4" />
                <span>Précédent</span>
              </button>

              <span className="text-[10px] text-slate-400 font-mono">
                {bookCurrentPage === 0 ? "Couverture" : `Feuille — ${bookCurrentPage} / ${readingRecueil.writings.length}`}
              </span>

              <button
                onClick={() => setBookCurrentPage(prev => Math.min(readingRecueil.writings.length, prev + 1))}
                disabled={bookCurrentPage >= readingRecueil.writings.length}
                className="px-3 py-1.5 bg-white/5 hover:bg-white/10 text-[#E0D7D0] text-xs font-serif font-bold rounded-xl transition flex items-center gap-1 cursor-pointer disabled:opacity-20"
              >
                <span>Suivant</span>
                <ChevronRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
