/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import {
  FileText,
  TrendingUp,
  Sparkles,
  CloudCheck,
  Plus,
  RefreshCw,
  HelpCircle,
  WifiOff,
  Wifi,
  Sparkle,
  MessageSquare,
  Users,
  User,
  Menu,
  LogOut,
  Shield,
  Check,
  X,
  AlertCircle,
  ChevronDown,
  ShieldAlert
} from "lucide-react";
import Sidebar from "./components/Sidebar";
import Editor from "./components/Editor";
import AnalyticsPanel from "./components/AnalyticsPanel";
import AIDialog from "./components/AIDialog";
import PrivateMessagesPanel from "./components/PrivateMessagesPanel";
import CommunityProfiles from "./components/CommunityProfiles";
import MyProfile from "./components/MyProfile";
import AuthPage from "./components/AuthPage";
import AdminPanel from "./components/AdminPanel";
import { Writing, WritingStats, Version, ProductivityDay, UserProfile } from "./types";
import {
  getWritingsFromFirestore,
  saveWritingToFirestore,
  deleteWritingFromFirestore,
  getVersionsFromFirestore,
  saveVersionToFirestore,
  getProductivityFromFirestore,
  saveProductivityToFirestore,
  getProfilesFromFirestore
} from "./lib/firestoreService";
import { auth } from "./firebase";

export default function App() {
  const [writings, setWritings] = useState<Writing[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"write" | "stats" | "community" | "admin">("write");
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    if (typeof window !== "undefined") {
      return window.innerWidth >= 1024;
    }
    return false;
  });
  const [versions, setVersions] = useState<Version[]>([]);
  
  // AI and Analytics
  const [activeStats, setActiveStats] = useState<{ [docId: string]: WritingStats }>({});
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [isAIChatOpen, setIsAIChatOpen] = useState(false);
  const [isPrivateMessagesOpen, setIsPrivateMessagesOpen] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  
  // Offline and Syncing
  const [isOffline, setIsOffline] = useState(!navigator.onLine);
  const [isSyncing, setIsSyncing] = useState(false);
  const [productivity, setProductivity] = useState<ProductivityDay[]>([]);

  // User Session State
  const [user, setUser] = useState<{ email: string; displayName: string; penName: string } | null>(() => {
    if (typeof window !== "undefined") {
      const saved = localStorage.getItem("user_session");
      if (saved) {
        try {
          return JSON.parse(saved);
        } catch (e) {
          return null;
        }
      }
    }
    return null;
  });

  const [isAuthChecking, setIsAuthChecking] = useState(true);
  const userEmail = user?.email || "";

  // Dropdown States and Refs
  const [isProfileDropdownOpen, setIsProfileDropdownOpen] = useState(false);
  const profileDropdownRef = useRef<HTMLDivElement>(null);
  const [currentUserProfile, setCurrentUserProfile] = useState<UserProfile | null>(null);

  // Dialog configurations replacing blocking window.confirm and alert inside iframes
  const [modalType, setModalType] = useState<"logout" | "delete" | "restore" | null>(null);
  const [modalTargetId, setModalTargetId] = useState<string | null>(null);
  const [notification, setNotification] = useState<{ message: string; type: "success" | "error" } | null>(null);

  const showLocalNotification = (message: string, type: "success" | "error" = "success") => {
    setNotification({ message, type });
  };

  useEffect(() => {
    if (!notification) return;
    const timer = setTimeout(() => {
      setNotification(null);
    }, 4000);
    return () => clearTimeout(timer);
  }, [notification]);

  // Listen to Firebase Auth state change to sync user session and prevent premature calls
  useEffect(() => {
    const unsubscribe = auth.onAuthStateChanged((firebaseUser) => {
      setIsAuthChecking(false);
      if (firebaseUser) {
        const email = firebaseUser.email || "";
        const displayName = firebaseUser.displayName || email.split("@")[0];
        
        let savedPenName = displayName;
        const savedSession = localStorage.getItem("user_session");
        if (savedSession) {
          try {
            const parsed = JSON.parse(savedSession);
            if (parsed.email.toLowerCase() === email.toLowerCase() && parsed.penName) {
              savedPenName = parsed.penName;
            }
          } catch (e) {}
        }
        
        const synchronizedUser = {
          email,
          displayName,
          penName: savedPenName
        };
        setUser(synchronizedUser);
        localStorage.setItem("user_session", JSON.stringify(synchronizedUser));
      } else {
        // If Firebase Auth is null but we have a session from legacy server login,
        // we keep the local state so they can use offline cache.
      }
    });

    return () => unsubscribe();
  }, []);

  // Sync current user's profile and avatar
  useEffect(() => {
    if (isAuthChecking) return;
    if (userEmail) {
      getProfilesFromFirestore()
        .then((profs) => {
          const profile = profs.find((p) => p.email.toLowerCase() === userEmail.toLowerCase());
          if (profile) {
            setCurrentUserProfile(profile);
          }
        })
        .catch((err) => console.error("Failed to load user profile in App:", err));
    } else {
      setCurrentUserProfile(null);
    }
  }, [userEmail, isAuthChecking, activeTab]);

  // Handle click outside of the profile menu dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileDropdownRef.current && !profileDropdownRef.current.contains(event.target as Node)) {
        setIsProfileDropdownOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  // Watch network status
  useEffect(() => {
    const handleOnline = () => {
      setIsOffline(false);
      triggerSyncOfflineQueue();
    };
    const handleOffline = () => setIsOffline(true);

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [writings]);

  // Initial and reactive Fetching (only when auth checking is completed)
  useEffect(() => {
    if (isAuthChecking) return;
    if (userEmail) {
      fetchWritings(userEmail);
    }
    fetchProductivity();
  }, [userEmail, isAuthChecking]);

  // Default static template writings to seed if a first-time user registers
  const DEFAULT_WRITINGS: Writing[] = [
    {
      id: "dormeur-du-val",
      title: "Le Dormeur du val",
      content: `C’est un trou de verdure où chante une rivière,\nAccrochant follement aux herbes des haillons\nD’argent ; où le soleil, de la montagne fière,\nLuit : c’est un petit val qui mousse de rayons.\n\nUn soldat jeune, bouche ouverte, tête nue,\nEt la nuque baignant dans le frais cresson bleu,\nDort ; il est étendu dans l’herbe, sous la nue,\nPâle dans son lit vert où la lumière pleut.\n\nLes pieds dans les glaïeuls, il dort. Souriant comme\nSourirait un enfant malade, il fait un somme :\nNature, berce-le chaudement : il a froid.\n\nLes parfums ne font pas frissonner sa narine ;\nIl dort dans le soleil, la main sur sa poitrine,\nTranquille. Il a deux trous rouges au côté droit.`,
      themes: ["Nature", "Guerre", "Sommeil"],
      emotions: ["mélancolie", "mystère", "sérénité"],
      createdAt: new Date("1870-10-01T12:00:00Z").toISOString(),
      updatedAt: new Date("1870-10-01T12:00:00Z").toISOString(),
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
      ],
      userEmail: userEmail
    },
    {
      id: "albatros",
      title: "L'Albatros",
      content: `Souvent, pour s’amuser, les hommes d’équipage\nPrennent des albatros, vastes oiseaux des mers,\nQui suivent, indolents compagnons de voyage,\nLe navire glissant sur les gouffres amers.\n\nA peine les ont-ils déposés sur les planches,\nQue ces rois de l’azur, maladroits et honteux,\nLaissent piteusement leurs grandes ailes blanches\nComme des avirons traîner à côté d’eux.\n\nCe voyageur ailé, comme il est gauche et veule !\nLui, naguère si beau, qu’il est comique et laid !\nL’un agace son bec avec un brûle-gueule,\nL’autre mime, en boitant, l’infirme qui volait !\n\nLe Poète est semblable au prince des nuées\nQui hante la tempête et se rit de l’archer ;\nExilé sur le sol au milieu des huées,\nSes ailes de géant l’empêchent de marcher.`,
      themes: ["Poésie", "Solitude", "Société"],
      emotions: ["révolte", "mélancolie", "nostalgie"],
      createdAt: new Date("1857-06-25T12:00:00Z").toISOString(),
      updatedAt: new Date("1857-06-25T12:00:00Z").toISOString(),
      deadlineDate: null,
      deadlineWordCount: null,
      comments: [],
      userEmail: userEmail
    }
  ];

  // Fetch from Firestore, falling back to cached local storage
  const fetchWritings = async (emailToUse?: string) => {
    const targetEmail = emailToUse || userEmail;
    if (!targetEmail) return;

    if (!auth.currentUser) {
      console.warn("Client not authenticated on Firebase. Loading writings from offline storage.");
      const cached = localStorage.getItem(`cached_writings_${targetEmail}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        setWritings(parsed);
        if (parsed.length > 0) {
          setActiveDocId(parsed[0].id);
        }
      }
      return;
    }

    try {
      let data = await getWritingsFromFirestore(targetEmail);
      
      // Auto-provision initial beautiful template poems if user's cloud collection is completely empty
      if (!data || data.length === 0) {
        const cloned = DEFAULT_WRITINGS.map(w => ({
          ...w,
          id: "doc_" + Math.random().toString(36).substr(2, 9),
          userEmail: targetEmail,
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString()
        }));
        
        for (const docObj of cloned) {
          await saveWritingToFirestore(docObj);
        }
        data = cloned;
      }

      setWritings(data);
      localStorage.setItem(`cached_writings_${targetEmail}`, JSON.stringify(data));
      
      // Auto-select first document
      if (data.length > 0) {
        setActiveDocId(data[0].id);
        fetchVersions(data[0].id);
      } else {
        setActiveDocId(null);
      }
    } catch (e) {
      console.warn("Firestore unreachable, using local storage cache", e);
      const cached = localStorage.getItem(`cached_writings_${targetEmail}`);
      if (cached) {
        const parsed = JSON.parse(cached);
        setWritings(parsed);
        if (parsed.length > 0) {
          setActiveDocId(parsed[0].id);
        }
      }
    }
  };

  const fetchVersions = async (docId: string) => {
    if (!auth.currentUser) {
      console.warn("Client not authenticated. Skipping Cloud versions fetch.");
      return;
    }
    try {
      const data = await getVersionsFromFirestore(docId);
      if (data) {
        setVersions(data);
      }
    } catch (e) {
      console.error("Could not load versions from Firestore", e);
    }
  };

  const fetchProductivity = async () => {
    if (!userEmail) return;

    if (!auth.currentUser) {
      console.warn("Client not authenticated. Loading productivity logs from offline storage.");
      const cached = localStorage.getItem(`cached_productivity_${userEmail}`);
      if (cached) {
        setProductivity(JSON.parse(cached));
      }
      return;
    }

    try {
      const data = await getProductivityFromFirestore(userEmail);
      if (data) {
        setProductivity(data);
        localStorage.setItem(`cached_productivity_${userEmail}`, JSON.stringify(data));
      }
    } catch (e) {
      const cached = localStorage.getItem(`cached_productivity_${userEmail}`);
      if (cached) {
        setProductivity(JSON.parse(cached));
      }
    }
  };

  // Synchronise cached offline changes back to Firestore
  const triggerSyncOfflineQueue = async () => {
    if (!auth.currentUser) {
      console.warn("Client not authenticated. Postponing offline synchronization.");
      return;
    }
    setIsSyncing(true);
    const keys = Object.keys(localStorage);
    
    for (const key of keys) {
      if (key.startsWith("offline_writing_")) {
        try {
          const docData = JSON.parse(localStorage.getItem(key) || "");
          await saveWritingToFirestore(docData);
          localStorage.removeItem(key);
        } catch (err) {
          console.error("Failed to sync offline item back to Firestore", key, err);
        }
      }
    }
    
    // Refresh list
    await fetchWritings();
    setIsSyncing(false);
  };

  // Triggered on active doc switch
  const handleSelectWriting = (id: string) => {
    setActiveDocId(id);
    fetchVersions(id);
    setIsSidebarOpen(false);
  };

  // Create empty new manuscript
  const handleNewWriting = async () => {
    setIsSidebarOpen(false);
    const newDoc: Writing = {
      id: "doc_" + Math.random().toString(36).substr(2, 9),
      title: "Nouveau Poème",
      content: "Dans le vent doux du soir...",
      themes: ["Poésie"],
      emotions: ["sérénité"],
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      deadlineDate: null,
      deadlineWordCount: null,
      comments: [],
      userEmail: userEmail
    };

    setWritings(prev => [newDoc, ...prev]);
    setActiveDocId(newDoc.id);
    setVersions([]);

    // Save locally and push to cloud
    localStorage.setItem(`offline_writing_${newDoc.id}`, JSON.stringify(newDoc));
    if (!isOffline && auth.currentUser) {
      try {
        await saveWritingToFirestore(newDoc);
        localStorage.removeItem(`offline_writing_${newDoc.id}`);
        fetchWritings();
      } catch (e) {
        console.warn("Failed to save doc to Firestore immediately, kept in offline cache", e);
      }
    }
  };

  const executeDeleteWriting = async (id: string) => {
    setWritings(prev => prev.filter(w => w.id !== id));
    if (activeDocId === id) {
      setActiveDocId(null);
      setVersions([]);
    }

    if (!isOffline && auth.currentUser) {
      try {
        await deleteWritingFromFirestore(id);
        fetchWritings();
        showLocalNotification("Manuscrit supprimé du nuage poétique.", "success");
      } catch (err) {
        console.error("Could not delete from Firestore", err);
        showLocalNotification("Erreur lors de la suppression sur le cloud.", "error");
      }
    } else {
      showLocalNotification("Manuscrit supprimé de votre atelier local.", "success");
    }
    localStorage.removeItem(`offline_writing_${id}`);
  };

  // Delete document triggers confirmation modal
  const handleDeleteWriting = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    setModalTargetId(id);
    setModalType("delete");
  };

  // Update a document dynamically from editor
  const handleUpdateWriting = async (updated: Writing) => {
    if (!updated.userEmail && userEmail) {
      updated.userEmail = userEmail;
    }
    setWritings(prev => prev.map(w => w.id === updated.id ? updated : w));
    
    // Register some productivity metrics on typing changes
    const activeDoc = writings.find(w => w.id === updated.id);
    const prevLen = activeDoc?.content.length || 0;
    const diffWords = Math.abs(updated.content.length - prevLen);

    if (diffWords > 10) {
      // Register productivity chunk
      registerProductivityChunk(Math.ceil(diffWords / 5));
    }

    // Save locally
    localStorage.setItem(`offline_writing_${updated.id}`, JSON.stringify(updated));
    localStorage.setItem(`cached_writings_${userEmail}`, JSON.stringify(writings.map(w => w.id === updated.id ? updated : w)));

    // Debounced or fast post call to update cloud
    if (!isOffline && auth.currentUser) {
      try {
        // Automatic versioning: save a historical copy to versions if content changes heavily
        if (activeDoc && activeDoc.content !== updated.content && Math.abs(activeDoc.content.length - updated.content.length) > 50) {
          const autoVersion: Version = {
            id: "ver_" + Math.random().toString(36).substr(2, 9),
            writingId: updated.id,
            title: activeDoc.title,
            content: activeDoc.content,
            savedAt: new Date().toISOString(),
            label: `Sauvegarde automatique (${new Date().toLocaleTimeString("fr-FR")})`,
            type: "auto"
          };
          try {
            await saveVersionToFirestore(autoVersion);
            // Refresh versions silently in background
            fetchVersions(updated.id);
          } catch (verErr) {
            console.warn("Could not record background auto-snapshot to Firestore", verErr);
          }
        }

        await saveWritingToFirestore(updated);
        // Remove from offline queue if saved on server
        localStorage.removeItem(`offline_writing_${updated.id}`);
      } catch (e) {
        console.warn("Firestore save error, cached locally", e);
      }
    }
  };

  // Log productivity words written
  const registerProductivityChunk = async (wordsCount: number) => {
    const todayStr = new Date().toISOString().split("T")[0];
    
    // Update local state instantly
    let updatedLog: Omit<ProductivityDay, "userEmail"> = { date: todayStr, wordsWritten: wordsCount, minutesSpent: 1 };
    
    setProductivity(prev => {
      const idx = prev.findIndex(p => p.date === todayStr);
      if (idx >= 0) {
        const updated = [...prev];
        updated[idx].wordsWritten += wordsCount;
        updatedLog = {
          date: todayStr,
          wordsWritten: updated[idx].wordsWritten,
          minutesSpent: updated[idx].minutesSpent
        };
        return updated;
      } else {
        return [...prev, { date: todayStr, wordsWritten: wordsCount, minutesSpent: 1 }];
      }
    });

    if (!isOffline && auth.currentUser) {
      try {
        await saveProductivityToFirestore(userEmail, updatedLog);
        localStorage.setItem(`cached_productivity_${userEmail}`, JSON.stringify(productivity));
      } catch (e) {
        console.error("Failed to log Firestore productivity", e);
      }
    }
  };

  // Save manual snapshot
  const handleSaveVersion = async (label: string) => {
    const target = writings.find(w => w.id === activeDocId);
    if (!target) return;

    try {
      const newVersion: Version = {
        id: "ver_" + Math.random().toString(36).substr(2, 9),
        writingId: activeDocId!,
        title: target.title,
        content: target.content,
        savedAt: new Date().toISOString(),
        label: label || "Sauvegarde manuelle",
        type: "manual",
      };
      
      if (!isOffline && auth.currentUser) {
        await saveVersionToFirestore(newVersion);
        fetchVersions(activeDocId!);
      }
    } catch (e) {
      console.error("Could not save snapshot to Firestore", e);
    }
  };

  const executeRestoreVersion = async (verId: string) => {
    if (!activeDocId) return;
    try {
      const targetVersion = versions.find(v => v.id === verId);
      const writingIdx = writings.findIndex(w => w.id === activeDocId);
      
      if (targetVersion && writingIdx >= 0) {
        const updatedWriting = {
          ...writings[writingIdx],
          content: targetVersion.content,
          title: targetVersion.title,
          updatedAt: new Date().toISOString()
        };
        
        if (!isOffline && auth.currentUser) {
          await saveWritingToFirestore(updatedWriting);
        }
        setWritings(prev => prev.map(w => w.id === activeDocId ? updatedWriting : w));
        showLocalNotification("Version restaurée avec succès !", "success");
      } else {
        showLocalNotification("Version ou document introuvable.", "error");
      }
    } catch (e) {
      console.error("Restoration failed", e);
      showLocalNotification("Une erreur s'est produite lors de la restauration.", "error");
    }
  };

  // Restore snapshots triggers confirmation modal
  const handleRestoreVersion = (verId: string) => {
    setModalTargetId(verId);
    setModalType("restore");
  };

  // Trigger Gemini detailed critical analysis
  const handleAnalyzeStats = async () => {
    const target = writings.find(w => w.id === activeDocId);
    if (!target) return;

    setIsAnalyzing(true);
    try {
      const response = await fetch("/api/ai/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: target.title,
          content: target.content
        })
      });

      if (response.ok) {
        const metrics: WritingStats = await response.json();
        setActiveStats(prev => ({
          ...prev,
          [target.id]: metrics
        }));
        showLocalNotification("Analyse littéraire de Plume complétée !", "success");
      } else {
        const errData = await response.json().catch(() => ({ error: "Veuillez vérifier vos vers." }));
        showLocalNotification(`Échec de l'analyse : ${errData.error || "Impossible d'analyser le texte."}`, "error");
      }
    } catch (e) {
      console.error("Gemini critical analysis failed", e);
      showLocalNotification("Une erreur réseau s'est produite lors de la communication avec l'analyseur Plume.", "error");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const activeDoc = writings.find(w => w.id === activeDocId) || null;
  const currentStats = activeDoc ? activeStats[activeDoc.id] || null : null;
  const isAnyDrawerOpen = isAIChatOpen || isPrivateMessagesOpen;

  const handleLoginSuccess = (authenticatedUser: { email: string; displayName: string; penName: string }) => {
    localStorage.setItem("user_session", JSON.stringify(authenticatedUser));
    setUser(authenticatedUser);
  };

  if (isAuthChecking) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] text-[#E0D7D0] flex flex-col items-center justify-center p-4 font-sans relative overflow-hidden select-none">
        <div className="absolute top-1/4 left-1/4 w-96 h-96 rounded-full bg-[#C5A059]/5 blur-3xl pointer-events-none" />
        <div className="max-w-md w-full text-center z-13 animate-pulse">
          <div className="inline-flex items-center justify-center w-14 h-14 rounded-full bg-[#C5A059]/10 border border-[#C5A059]/20 mb-4">
            <RefreshCw className="w-7 h-7 text-[#C5A059] animate-spin" />
          </div>
          <h1 className="text-2xl font-semibold font-serif text-[#EAE6E1]">Chargement de l'Atelier...</h1>
          <p className="text-xs text-[#C5A059]/70 font-mono tracking-widest mt-1.5 uppercase">Changement de plume</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <AuthPage onLoginSuccess={handleLoginSuccess} />;
  }

  if (currentUserProfile?.isRestricted) {
    return (
      <div className="min-h-screen bg-[#060606] text-[#E0D7D0] flex flex-col items-center justify-center p-6 text-center select-none animate-fade-in" id="restriction_lockout_screen">
        <div className="max-w-md bg-[#0D0D0D] border border-red-500/20 rounded-2xl p-8 space-y-6 shadow-2xl relative">
          <div className="absolute top-0 inset-x-0 h-1 bg-red-500 rounded-t-2xl animate-pulse" />
          <div className="w-16 h-16 bg-red-500/10 border border-red-500/20 text-red-500 rounded-full flex items-center justify-center mx-auto">
            <ShieldAlert className="w-8 h-8" />
          </div>
          
          <div className="space-y-1">
            <h1 className="text-xl font-serif font-bold text-[#EAE6E1]">Accès Restreint à l'Atelier</h1>
            <p className="text-xs text-[#C5A059]/80 font-mono italic">{userEmail}</p>
          </div>
          
          <p className="text-sm font-serif leading-relaxed text-slate-300">
            Votre compte d'auteur a été suspendu ou restreint par un administrateur du Salon de l'Atelier Plume. Vous ne pouvez plus éditer vos drafts, ni synchroniser vos manuscrits, ni interagir au sein de notre communauté littéraire de créateurs.
          </p>

          <button
            onClick={async () => {
              await auth.signOut();
              setUser(null);
              setCurrentUserProfile(null);
              localStorage.removeItem("user_session");
            }}
            className="w-full py-2.5 bg-red-950/40 hover:bg-red-900/30 border border-red-500/30 text-red-400 font-semibold rounded-xl text-xs transition cursor-pointer flex items-center justify-center gap-2"
          >
            <LogOut className="w-4 h-4" />
            <span>Déconnexion de l'Atelier</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#0A0A0A] text-[#E0D7D0]" id="application_root">
      
      {/* Sidebar backdrop for mobile screens */}
      {isSidebarOpen && (
        <div
          id="sidebar_backdrop"
          onClick={() => setIsSidebarOpen(false)}
          className="fixed inset-0 bg-black/70 z-30 lg:hidden transition-opacity duration-300"
        />
      )}

      {/* Sidebar with collection list, deadlines alerts, drive status */}
      <Sidebar
        writings={writings}
        activeId={activeDocId}
        onSelect={handleSelectWriting}
        onNew={handleNewWriting}
        onDelete={handleDeleteWriting}
        userEmail={userEmail}
        isOffline={isOffline}
        isOpen={isSidebarOpen}
        onClose={() => setIsSidebarOpen(false)}
      />

      {/* Center workspace */}
      <div className="flex-1 flex flex-col h-full overflow-hidden" id="workspace_pane_center">
        
        {/* Navigation tabs between sheet editor and metrics bento */}
        <div className={`transition-all duration-300 flex items-center justify-between no-print ${
          zenMode ? "h-11 border-b border-white/5 bg-[#080808] px-2 sm:px-3" : "h-14 border-b border-white/5 bg-[#0D0D0D] px-4 sm:px-6"
        }`} id="workspace_header_nav">
          <div className="flex items-center gap-2 sm:gap-4">
            {/* Sidebar toggle for all screen sizes */}
            <button
               id="sidebar_toggle_mobile_btn"
               onClick={() => setIsSidebarOpen(!isSidebarOpen)}
               className="p-1.5 text-[#E0D7D0]/70 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition shrink-0 cursor-pointer"
               title="Afficher/Masquer le menu"
            >
              <Menu className="w-5 h-5" />
            </button>

            <button
              id="tab_writing_btn"
              onClick={() => setActiveTab("write")}
              className={`flex items-center gap-1.5 px-1 font-semibold tracking-wide border-b-2 transition uppercase cursor-pointer shrink-0 ${
                zenMode ? "py-2.5 text-[10px]" : "py-4 text-xs"
              } ${
                activeTab === "write"
                  ? "border-[#C5A059] text-white"
                  : "border-transparent text-[#E0D7D0]/40 hover:text-white"
              }`}
            >
              <FileText className={`${zenMode ? "w-3.5 h-3.5" : "w-4 h-4"}`} />
              <span className={`hidden ${isAnyDrawerOpen ? "" : "lg:inline"}`}>Plume d'Écriture</span>
            </button>
            
            <button
              id="tab_stats_btn"
              onClick={() => setActiveTab("stats")}
              className={`flex items-center gap-1.5 px-1 font-semibold tracking-wide border-b-2 transition uppercase cursor-pointer shrink-0 ${
                zenMode ? "py-2.5 text-[10px]" : "py-4 text-xs"
              } ${
                activeTab === "stats"
                  ? "border-[#C5A059] text-white"
                  : "border-transparent text-[#E0D7D0]/40 hover:text-white"
              }`}
            >
              <TrendingUp className={`${zenMode ? "w-3.5 h-3.5" : "w-4 h-4"}`} />
              <span className={`hidden ${isAnyDrawerOpen ? "" : "lg:inline"}`}>Rapports de Productivité</span>
            </button>

            <button
              id="tab_community_btn"
              onClick={() => setActiveTab("community")}
              className={`flex items-center gap-1.5 px-1 font-semibold tracking-wide border-b-2 transition uppercase cursor-pointer shrink-0 ${
                zenMode ? "py-2.5 text-[10px]" : "py-4 text-xs"
              } ${
                activeTab === "community"
                  ? "border-[#C5A059] text-white"
                  : "border-transparent text-[#E0D7D0]/40 hover:text-white"
              }`}
            >
              <Users className={`${zenMode ? "w-3.5 h-3.5" : "w-4 h-4"}`} />
              <span className={`hidden ${isAnyDrawerOpen ? "" : "lg:inline"}`}>Communauté</span>
            </button>




          </div>

          <div className="flex items-center gap-2 sm:gap-3 shrink-0">
            {/* Companion AI Open Toggle */}
            <button
              id="toggle_ai_chat_btn"
              onClick={() => {
                setIsAIChatOpen(!isAIChatOpen);
                if (isPrivateMessagesOpen) setIsPrivateMessagesOpen(false);
              }}
              className={`flex items-center gap-1.5 rounded-lg border transition cursor-pointer shadow-xs ${
                zenMode ? "px-1.5 py-1 text-[10px]" : "px-2 py-1.5 sm:px-3 text-xs"
              } ${
                isAIChatOpen
                  ? "bg-[#C5A059]/10 text-[#C5A059] border-[#C5A059]/30"
                  : "bg-white/5 text-[#E0D7D0]/90 border-white/10 hover:border-[#C5A059]/30"
              }`}
            >
              <Sparkle className={`${zenMode ? "w-3 h-3 text-[#C5A059]" : "w-3.5 h-3.5 text-[#C5A059]"}`} />
              <span className={`hidden ${isAnyDrawerOpen ? "" : "lg:inline"}`}>Plume</span>
            </button>

            {/* Direct Private Messages open toggle */}
            <button
              id="toggle_private_messages_btn"
              onClick={() => {
                setIsPrivateMessagesOpen(!isPrivateMessagesOpen);
                if (isAIChatOpen) setIsAIChatOpen(false);
              }}
              className={`flex items-center gap-1.5 rounded-lg border transition cursor-pointer shadow-xs ${
                zenMode ? "px-1.5 py-1 text-[10px]" : "px-2 py-1.5 sm:px-3 text-xs"
              } ${
                isPrivateMessagesOpen
                  ? "bg-[#C5A059]/10 text-[#C5A059] border-[#C5A059]/30"
                  : "bg-white/5 text-[#E0D7D0]/90 border-white/10 hover:border-[#C5A059]/30"
              }`}
            >
              <MessageSquare className={`${zenMode ? "w-3 h-3 text-[#C5A059]" : "w-3.5 h-3.5 text-[#C5A059]"}`} />
              <span className={`hidden ${isAnyDrawerOpen ? "" : "lg:inline"}`}>Messages</span>
            </button>

            {/* Profile Dropdown replacement */}
            <div className="relative" ref={profileDropdownRef}>
              <button
                id="profile_dropdown_toggle_btn"
                onClick={() => setIsProfileDropdownOpen(!isProfileDropdownOpen)}
                className={`flex items-center gap-1.5 sm:gap-2 rounded-full border border-white/10 p-0.5 hover:border-[#C5A059]/40 transition duration-200 cursor-pointer shadow-xs focus:outline-none focus:ring-1 focus:ring-[#C5A059]/50 ${
                  zenMode ? "max-w-[120px]" : ""
                }`}
                title="Mon Compte / Menu"
              >
                {currentUserProfile?.avatarUrl ? (
                  <img
                    src={currentUserProfile.avatarUrl}
                    alt={user?.penName || "Avatar"}
                    referrerPolicy="no-referrer"
                    className="w-7 h-7 sm:w-8 sm:h-8 rounded-full object-cover border border-[#C5A059]/30"
                  />
                ) : (
                  <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-full bg-gradient-to-tr from-[#C5A059]/30 to-[#C5A059]/10 text-[#C5A059] border border-[#C5A059]/30 flex items-center justify-center font-bold font-serif text-xs sm:text-sm shrink-0">
                    {(user?.penName || user?.displayName || "P").charAt(0).toUpperCase()}
                  </div>
                )}
                <span className={`text-[#E0D7D0] text-xs font-serif hidden max-w-[100px] truncate px-1 ${
                  isAnyDrawerOpen ? "" : "sm:inline"
                }`}>
                  {user?.penName || user?.displayName || "Écrivain"}
                </span>
                <ChevronDown className={`w-3.5 h-3.5 text-[#E0D7D0]/60 hidden mr-1 ${
                  isAnyDrawerOpen ? "" : "sm:inline"
                }`} />
              </button>

              {isProfileDropdownOpen && (
                <div 
                  className="absolute right-0 mt-2 w-56 rounded-lg bg-[#0C0C0C]/95 backdrop-blur-md border border-white/10 shadow-xl py-1 z-50 text-left overflow-hidden origin-top-right transition-all duration-150"
                  id="profile_dropdown_menu"
                >
                  {/* User Profile Info Header */}
                  <div className="px-4 py-2 border-b border-white/5 bg-white/2">
                    <p className="text-[10px] text-[#C5A059] font-mono tracking-widest uppercase">Auteur Connecté</p>
                    <p className="text-sm font-serif font-semibold text-white truncate max-w-[190px]">
                      {user?.penName || user?.displayName}
                    </p>
                    <p className="text-[10px] text-[#E0D7D0]/40 truncate max-w-[190px]">
                      {user?.email}
                    </p>
                  </div>

                  {/* Navigation Actions */}
                  <div className="py-1">
                    <button
                      onClick={() => {
                        setActiveTab("write");
                        setIsProfileDropdownOpen(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-4 py-2 text-xs transition cursor-pointer text-[#E0D7D0]/80 hover:bg-white/5 hover:text-white ${
                        activeTab === "write" ? "bg-white/5 text-[#C5A059] font-medium" : ""
                      }`}
                    >
                      <FileText className="w-4 h-4 text-[#C5A059]/80" />
                      <span>Plume d'Écriture</span>
                    </button>

                    <button
                      onClick={() => {
                        setActiveTab("stats");
                        setIsProfileDropdownOpen(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-4 py-2 text-xs transition cursor-pointer text-[#E0D7D0]/80 hover:bg-white/5 hover:text-white ${
                        activeTab === "stats" ? "bg-white/5 text-[#C5A059] font-medium" : ""
                      }`}
                    >
                      <TrendingUp className="w-4 h-4 text-emerald-400/80" />
                      <span>Rapports & Stats</span>
                    </button>

                    <button
                      onClick={() => {
                        setActiveTab("profile");
                        setIsProfileDropdownOpen(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-4 py-2 text-xs transition cursor-pointer text-[#E0D7D0]/80 hover:bg-white/5 hover:text-white ${
                        activeTab === "profile" ? "bg-white/5 text-[#C5A059] font-medium" : ""
                      }`}
                    >
                      <User className="w-4 h-4 text-[#C5A059]" />
                      <span>Mon Profil d'Auteur</span>
                    </button>

                    <button
                      onClick={() => {
                        setActiveTab("community");
                        setIsProfileDropdownOpen(false);
                      }}
                      className={`w-full flex items-center gap-2.5 px-4 py-2 text-xs transition cursor-pointer text-[#E0D7D0]/80 hover:bg-white/5 hover:text-white ${
                        activeTab === "community" ? "bg-white/5 text-[#C5A059] font-medium" : ""
                      }`}
                    >
                      <Users className="w-4 h-4 text-blue-400/80" />
                      <span>Salon de la Communauté</span>
                    </button>

                    {/* Admin panel only shown if administrative access is granted */}
                    {user?.email.toLowerCase() === "johnbikaitsotra@gmail.com" && (
                      <button
                        onClick={() => {
                          setActiveTab("admin");
                          setIsProfileDropdownOpen(false);
                        }}
                        className={`w-full flex items-center gap-2.5 px-4 py-2 text-xs font-semibold tracking-wide transition cursor-pointer text-amber-300 hover:bg-amber-500/10 ${
                          activeTab === "admin" ? "bg-amber-500/5 text-amber-400" : ""
                        }`}
                      >
                        <Shield className="w-4 h-4 text-amber-400" />
                        <span>Espace Administration</span>
                      </button>
                    )}
                  </div>

                  {/* Logout Separator */}
                  <div className="border-t border-white/5 my-1" />

                  {/* Sign Out Trigger with high contrast styling */}
                  <div className="py-0.5">
                    <button
                      id="logout_btn"
                      onClick={() => {
                        setIsProfileDropdownOpen(false);
                        setModalType("logout");
                      }}
                      className="w-full flex items-center gap-2.5 px-4 py-2 text-xs text-red-400 hover:bg-red-500/10 transition cursor-pointer font-medium"
                    >
                      <LogOut className="w-4 h-4 text-red-400" />
                      <span>Déconnecter</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* View switching panel */}
        <div className={`flex-1 transition-all duration-300 ${zenMode ? "overflow-hidden p-0" : "overflow-y-auto"}`} id="main_workspace_canvas">
          {activeTab === "write" ? (
            <Editor
              writing={activeDoc}
              onUpdate={handleUpdateWriting}
              onSaveVersion={handleSaveVersion}
              versions={versions}
              onRestoreVersion={handleRestoreVersion}
              onAskAI={handleAnalyzeStats}
              zenMode={zenMode}
              setZenMode={setZenMode}
              isAnyDrawerOpen={isAnyDrawerOpen}
            />
          ) : activeTab === "stats" ? (
            <div className="max-w-4xl mx-auto p-6 space-y-4" id="stats_tab_canvas">
              <div className="flex items-center justify-between pb-3 border-b border-white/5" id="stats_canvas_header">
                <div>
                  <h2 className="text-lg font-serif font-bold text-[#EAE6E1]">Rapports de style & de productivité</h2>
                  <p className="text-xs text-[#E0D7D0]/50">Visualisez vos jalons d'écriture et vos progrès stylistiques.</p>
                </div>
              </div>
              <AnalyticsPanel
                writing={activeDoc}
                stats={currentStats}
                onAnalyze={handleAnalyzeStats}
                isLoading={isAnalyzing}
                productivity={productivity}
              />
            </div>
          ) : activeTab === "profile" ? (
            <div className="max-w-4xl mx-auto p-6 space-y-4 font-sans" id="my_profile_tab_canvas">
              <div className="flex items-center justify-between pb-3 border-b border-white/5" id="my_profile_canvas_header">
                <div>
                  <h2 className="text-lg font-serif font-bold text-[#EAE6E1]">Mon Profil d'Auteur</h2>
                  <p className="text-xs text-[#E0D7D0]/50">Gérez votre identité poétique, parlez de votre voix artistique et liez vos publications.</p>
                </div>
              </div>
              <MyProfile 
                currentUserEmail={userEmail}
                onProfileUpdated={(updatedProf) => {
                  setCurrentUserProfile(updatedProf);
                  if (user) {
                    const nextUser = {
                      ...user,
                      displayName: updatedProf.displayName,
                      penName: updatedProf.penName
                    };
                    setUser(nextUser);
                    localStorage.setItem("user_session", JSON.stringify(nextUser));
                  }
                }}
              />
            </div>
          ) : activeTab === "admin" && user?.email.toLowerCase() === "johnbikaitsotra@gmail.com" ? (
            <div className="max-w-6xl mx-auto p-6 space-y-4 font-sans" id="admin_tab_canvas">
              <div className="flex items-center justify-between pb-3 border-b border-white/5" id="admin_canvas_header">
                <div>
                  <h2 className="text-lg font-serif font-bold text-[#EAE6E1]">Pupitre d'Administration Exclusive</h2>
                  <p className="text-xs text-[#E0D7D0]/50">Gérez le salon, régulez les archives et observez l'historique des scribes.</p>
                </div>
              </div>
              <AdminPanel adminEmail={user?.email} />
            </div>
          ) : (
            <div className="max-w-6xl mx-auto p-6 space-y-4 font-sans" id="community_tab_canvas">
              <div className="flex items-center justify-between pb-3 border-b border-white/5" id="community_canvas_header">
                <div>
                  <h2 className="text-lg font-serif font-bold text-[#EAE6E1]">Salon Littéraire de la Communauté</h2>
                  <p className="text-xs text-[#E0D7D0]/50">Explorez les démarches littéraires des autres écrivains et écrivez-leur en privé.</p>
                </div>
              </div>
              <CommunityProfiles 
                currentUserEmail={userEmail} 
                onOpenDirectChat={(recipient) => {
                  setIsPrivateMessagesOpen(true);
                }}
              />
            </div>
          )}
        </div>

      </div>

      {/* Companion Sliding Chat Drawer Panel */}
      <AIDialog
        writing={activeDoc}
        onUpdate={handleUpdateWriting}
        isOpen={isAIChatOpen}
        onClose={() => setIsAIChatOpen(false)}
        zenMode={zenMode}
      />

      {/* Private Messaging Panel */}
      <PrivateMessagesPanel
        currentUserEmail={userEmail}
        isOpen={isPrivateMessagesOpen}
        onClose={() => setIsPrivateMessagesOpen(false)}
        zenMode={zenMode}
      />

      {/* Custom Confirmation Modals replacing browser-blocking window.confirm inside iframe */}
      {modalType && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-[9999] animate-fade-in duration-200">
          <div className="bg-[#0D0D0D] border border-white/10 rounded-xl p-6 max-w-md w-full shadow-2xl relative animate-in fade-in zoom-in-95 duration-200">
            {/* Elegant Golden Line Indicator */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-transparent via-[#C5A059] to-transparent rounded-t-xl" />
            
            {modalType === "logout" && (
              <div id="logout_confirm_modal">
                <h3 className="text-xl font-serif text-[#EAE6E1] mb-2 font-semibold">Fermer votre plume ?</h3>
                <p className="text-sm text-[#E0D7D0]/70 mb-6 font-sans leading-relaxed">
                  Souhaitez-vous vous déconnecter de votre cahier d'écriture poétique ? Les mots enregistrés sur votre terminal resteront accessibles hors ligne sur ce navigateur.
                </p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => setModalType(null)}
                    className="px-4 py-2 text-sm font-medium text-[#E0D7D0]/60 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition duration-200 cursor-pointer"
                  >
                    Rester connecté
                  </button>
                  <button
                    id="confirm_logout_action"
                    onClick={async () => {
                      setModalType(null);
                      try {
                        await auth.signOut();
                      } catch (e) {
                        console.error("Signout error", e);
                      }
                      localStorage.removeItem("user_session");
                      setUser(null);
                      showLocalNotification("Vous avez fermé votre cahier d'écrivain.", "success");
                    }}
                    className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-md transition duration-200 cursor-pointer"
                  >
                    Se déconnecter de l'Atelier
                  </button>
                </div>
              </div>
            )}

            {modalType === "delete" && (
              <div id="delete_confirm_modal">
                <h3 className="text-xl font-serif text-[#EAE6E1] mb-2 font-semibold">Réduire en cendres ?</h3>
                <p className="text-sm text-[#E0D7D0]/70 mb-6 font-sans leading-relaxed">
                  Êtes-vous sûr de vouloir supprimer définitivement ce recueil littéraire ? Cette action efface les vers du nuage de l'Atelier.
                </p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => {
                      setModalType(null);
                      setModalTargetId(null);
                    }}
                    className="px-4 py-2 text-sm font-medium text-[#E0D7D0]/60 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition duration-200 cursor-pointer"
                  >
                    Conserver le manuscrit
                  </button>
                  <button
                    id="confirm_delete_action"
                    onClick={async () => {
                      const idToDelete = modalTargetId;
                      setModalType(null);
                      setModalTargetId(null);
                      if (idToDelete) {
                        await executeDeleteWriting(idToDelete);
                      }
                    }}
                    className="px-4 py-2 text-sm font-semibold text-white bg-red-600 hover:bg-red-700 rounded-lg shadow-md transition duration-200 cursor-pointer"
                  >
                    Brûler le brouillon
                  </button>
                </div>
              </div>
            )}

            {modalType === "restore" && (
              <div id="restore_confirm_modal">
                <h3 className="text-xl font-serif text-[#EAE6E1] mb-2 font-semibold">Restituer les strophes ?</h3>
                <p className="text-sm text-[#E0D7D0]/70 mb-6 font-sans leading-relaxed">
                  Cette action écrasera vos proses actuelles avec les vers capturés dans l'historique de cette version poétique antérieure. Souhaitez-vous poursuivre ?
                </p>
                <div className="flex gap-3 justify-end">
                  <button
                    onClick={() => {
                      setModalType(null);
                      setModalTargetId(null);
                    }}
                    className="px-4 py-2 text-sm font-medium text-[#E0D7D0]/60 hover:text-white bg-white/5 hover:bg-white/10 rounded-lg transition duration-200 cursor-pointer"
                  >
                    Laisser en l'état
                  </button>
                  <button
                    id="confirm_restore_action"
                    onClick={async () => {
                      const versionId = modalTargetId;
                      setModalType(null);
                      setModalTargetId(null);
                      if (versionId) {
                        await executeRestoreVersion(versionId);
                      }
                    }}
                    className="px-4 py-2 text-sm font-semibold text-black bg-[#C5A059] hover:bg-[#D5B069] rounded-lg shadow-md transition duration-200 cursor-pointer"
                  >
                    Restaurer d'anciens vers
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Elegant Styled Toast Notifications for cloud saves/actions */}
      {notification && (
        <div className="fixed bottom-6 right-6 z-[10000] animate-in fade-in slide-in-from-bottom-5 duration-300 max-w-sm" id="local_toast_notification">
          <div className={`p-4 rounded-xl shadow-xl flex items-center gap-3 border ${
            notification.type === "success" 
              ? "bg-[#0E1B0E]/95 border-green-500/20 text-green-200" 
              : "bg-[#2A0F0F]/95 border-red-500/20 text-red-200"
          }`}>
            {notification.type === "success" ? (
              <Check className="w-5 h-5 text-green-400 shrink-0" />
            ) : (
              <AlertCircle className="w-5 h-5 text-red-400 shrink-0" />
            )}
            <p className="text-sm font-medium font-sans leading-relaxed">{notification.message}</p>
            <button 
              onClick={() => setNotification(null)}
              className="ml-auto hover:bg-white/5 p-1 rounded-lg transition text-[#E0D7D0]/40 hover:text-white shrink-0 cursor-pointer"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

    </div>
  );
}
