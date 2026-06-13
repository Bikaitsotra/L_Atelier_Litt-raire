/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  BookOpen,
  Plus,
  Search,
  Trash2,
  Calendar,
  Cloud,
  Check,
  Clock,
  Heart,
  Smile,
  AlertTriangle,
  RefreshCw,
  X,
  ChevronDown
} from "lucide-react";
import { Writing } from "../types";

interface SidebarProps {
  writings: Writing[];
  activeId: string | null;
  onSelect: (id: string) => void;
  onNew: () => void;
  onDelete: (id: string, e: React.MouseEvent) => void;
  userEmail?: string;
  isOffline: boolean;
  isOpen: boolean;
  onClose: () => void;
}

export default function Sidebar({
  writings,
  activeId,
  onSelect,
  onNew,
  onDelete,
  userEmail,
  isOffline,
  isOpen,
  onClose
}: SidebarProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedTheme, setSelectedTheme] = useState<string | null>(null);
  const [selectedEmotion, setSelectedEmotion] = useState<string | null>(null);
  const [driveConnected, setDriveConnected] = useState(true);
  const [isSyncing, setIsSyncing] = useState(false);

  const [isBrandCollapsed, setIsBrandCollapsed] = useState(false);
  const [isFiltersCollapsed, setIsFiltersCollapsed] = useState(false);
  const [isWritingsCollapsed, setIsWritingsCollapsed] = useState(false);

  // Extract all unique themes and emotions across all writings
  const allThemes = Array.from(new Set(writings.flatMap(w => w.themes || [])));
  const allEmotions = Array.from(new Set(writings.flatMap(w => w.emotions || [])));

  // Filter writings
  const filteredWritings = writings.filter(w => {
    const matchesSearch =
      w.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
      w.content.toLowerCase().includes(searchQuery.toLowerCase());
    
    const matchesTheme = !selectedTheme || w.themes?.includes(selectedTheme);
    const matchesEmotion = !selectedEmotion || w.emotions?.includes(selectedEmotion);

    return matchesSearch && matchesTheme && matchesEmotion;
  });

  const handleSyncDrive = () => {
    setIsSyncing(true);
    setTimeout(() => {
      setIsSyncing(false);
    }, 1500);
  };

  // Compute active deadline alerts
  const deadlines = writings
    .filter(w => w.deadlineDate)
    .map(w => {
      const diffTime = new Date(w.deadlineDate!).getTime() - Date.now();
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
      const textCount = w.content.trim().split(/\s+/).filter(Boolean).length;
      const targetPercent = w.deadlineWordCount ? Math.min(100, Math.floor((textCount / w.deadlineWordCount) * 100)) : 0;

      return {
        id: w.id,
        title: w.title,
        daysLeft: diffDays,
        targetWords: w.deadlineWordCount,
        progress: targetPercent,
        isOverdue: diffDays < 0,
      };
    });

  return (
    <div
      className={`border-r border-white/5 bg-[#0D0D0D] text-[#E0D7D0] z-40 no-print transition-all duration-300 fixed inset-y-0 left-0 lg:relative ${
        isOpen ? "translate-x-0 w-80 opacity-100" : "-translate-x-full lg:translate-x-0 lg:w-0 lg:opacity-0 pointer-events-none lg:border-r-0"
      }`}
      id="sidebar_container"
    >
      <div className="w-80 h-full flex flex-col overflow-hidden">
        {/* Brand & Auth Section */}
        <div className="p-4 border-b border-white/10 flex flex-col gap-3 shrink-0" id="sidebar_brand_header">
          <div className="flex items-center justify-between">
            <div 
              className="flex items-center gap-2 cursor-pointer select-none group"
              onClick={() => setIsBrandCollapsed(!isBrandCollapsed)}
              title={isBrandCollapsed ? "Déplier l'Atelier" : "Plier l'Atelier"}
            >
              <div className="w-8 h-8 rounded-lg bg-[#C5A059]/10 flex items-center justify-center shrink-0">
                <BookOpen className="w-4.5 h-4.5 text-[#C5A059]" />
              </div>
              <div>
                <div className="flex items-center gap-1.5">
                  <h1 className="text-sm font-bold text-[#EAE6E1] tracking-tight font-serif uppercase">L'Atelier Littéraire</h1>
                  <ChevronDown className={`w-3.5 h-3.5 text-[#C5A059] transition-transform duration-200 ${isBrandCollapsed ? "" : "rotate-180"}`} />
                </div>
                <p className="text-[10px] text-slate-400 font-mono">Espace de création pure</p>
              </div>
            </div>
            
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                id="new_manuscript_btn"
                onClick={onNew}
                className="p-1.5 bg-[#C5A059] text-black hover:bg-[#B38F4B] rounded-lg shadow-sm transition active:scale-95 cursor-pointer flex items-center justify-center font-medium"
                title="Créer un nouveau texte"
              >
                <Plus className="w-4 h-4" />
              </button>
              <button
                id="close_sidebar_mobile_btn"
                onClick={onClose}
                className="lg:hidden p-1.5 bg-white/5 text-[#E0D7D0]/80 hover:text-white rounded-lg transition"
                title="Fermer le menu"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>

          {/* Google Drive and Cloud Sync Info */}
          <div className={`transition-all duration-300 overflow-hidden ${isBrandCollapsed ? "max-h-0 opacity-0 pointer-events-none" : "max-h-40 opacity-100"}`}>
            <div className="p-2.5 rounded-lg bg-[#1A1A1A] border border-white/5 text-[11px] flex flex-col gap-1.5" id="sync_status_card">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-medium text-slate-300">
                  <Cloud className={`w-3.5 h-3.5 ${isSyncing ? "text-[#C5A059] animate-spin" : "text-[#C5A059]"}`} />
                  <span>Sauvegarde Cloud & Drive</span>
                </span>
                <div className="flex items-center gap-1">
                  <span className={`w-1.5 h-1.5 rounded-full ${isOffline ? "bg-red-500" : "bg-emerald-500"}`}></span>
                  <span className="text-[9px] text-slate-400 font-mono uppercase">
                    {isOffline ? "Hors-ligne" : "En Ligne"}
                  </span>
                </div>
              </div>

              <div className="text-[10px] text-slate-500 flex flex-wrap justify-between items-center gap-1">
                <span>Client : <span className="font-mono text-[#C5A059]">{userEmail || "Auteur"}</span></span>
                <button
                  id="sync_now_btn"
                  onClick={handleSyncDrive}
                  disabled={isOffline}
                  type="button"
                  className="text-[#C5A059] hover:text-[#B38F4B] font-mono text-[9px] font-bold border border-[#C5A059]/30 rounded-sm px-1.5 py-0.5 hover:bg-white/5 transition flex items-center gap-0.5"
                >
                  <RefreshCw className={`w-2 h-2 ${isSyncing ? "animate-spin" : ""}`} />
                  <span>Synchro</span>
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Advanced Searching Filters */}
        <div className="p-3 border-b border-white/10 flex flex-col gap-2 bg-[#080808] shrink-0" id="search_filters_box">
          <div 
            className="flex items-center justify-between cursor-pointer select-none hover:text-white"
            onClick={() => setIsFiltersCollapsed(!isFiltersCollapsed)}
            title={isFiltersCollapsed ? "Déplier la recherche" : "Plier la recherche"}
          >
            <span className="text-[10px] text-[#C5A059] font-mono tracking-wider font-bold uppercase">
              Recherche & Filtres
            </span>
            <ChevronDown className={`w-3.5 h-3.5 text-[#C5A059] transition-transform duration-200 ${isFiltersCollapsed ? "" : "rotate-180"}`} />
          </div>

          <div className={`transition-all duration-300 flex flex-col gap-2 overflow-hidden ${isFiltersCollapsed ? "max-h-0 opacity-0 pointer-events-none" : "max-h-96 opacity-100"}`}>
            {/* Keywords */}
            <div className="relative">
              <Search className="w-3.5 h-3.5 absolute left-2.5 top-2.5 text-slate-500" />
              <input
                id="search_manuscript_input"
                type="text"
                placeholder="Rechercher par titre ou texte..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="w-full pl-8 pr-3 py-1.5 text-xs bg-[#1A1A1A] border border-white/5 rounded-lg text-[#EAE6E1] focus:outline-hidden focus:border-[#C5A059]/60 transition font-sans placeholder-slate-500"
              />
            </div>

            {/* Themes tags */}
            {allThemes.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-[#E0D7D0]/40 font-mono">Thématiques :</span>
                <div className="flex flex-wrap gap-1">
                  <button
                    id="all_themes_btn"
                    onClick={() => setSelectedTheme(null)}
                    className={`px-1.5 py-0.5 rounded-sm text-[10px] font-medium transition cursor-pointer ${
                      !selectedTheme ? "bg-[#C5A059] text-black" : "bg-white/5 text-[#E0D7D0]/60 hover:bg-white/10"
                    }`}
                  >
                    Tout
                  </button>
                  {allThemes.map(theme => (
                    <button
                      key={theme}
                      onClick={() => setSelectedTheme(selectedTheme === theme ? null : theme)}
                      className={`px-1.5 py-0.5 rounded-sm text-[10px] font-medium transition cursor-pointer ${
                        selectedTheme === theme ? "bg-[#C5A059]/20 text-[#C5A059] border border-[#C5A059]/40" : "bg-white/5 text-[#E0D7D0]/60 hover:bg-white/10"
                      }`}
                    >
                      {theme}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Emotions badges */}
            {allEmotions.length > 0 && (
              <div className="flex flex-col gap-1">
                <span className="text-[10px] text-[#E0D7D0]/40 font-mono">Émotions :</span>
                <div className="flex flex-wrap gap-1">
                  <button
                    id="all_emotions_btn"
                    onClick={() => setSelectedEmotion(null)}
                    className={`px-1.5 py-0.5 rounded-sm text-[10px] font-medium transition cursor-pointer ${
                      !selectedEmotion ? "bg-[#C5A059] text-black" : "bg-white/5 text-[#E0D7D0]/60 hover:bg-white/10"
                    }`}
                  >
                    Tout
                  </button>
                  {allEmotions.map(emotion => (
                    <button
                      key={emotion}
                      onClick={() => setSelectedEmotion(selectedEmotion === emotion ? null : emotion)}
                      className={`px-1.5 py-0.5 rounded-sm text-[10px] font-medium capitalize transition cursor-pointer ${
                        selectedEmotion === emotion ? "bg-[#C5A059]/20 text-[#C5A059] border border-[#C5A059]/40" : "bg-white/5 text-[#E0D7D0]/60 hover:bg-white/10"
                      }`}
                    >
                      {emotion}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Manuscripts List Header */}
        <div 
          className="px-4 py-2 border-b border-white/5 bg-[#0A0A0A]/60 flex items-center justify-between cursor-pointer select-none hover:text-white shrink-0"
          onClick={() => setIsWritingsCollapsed(!isWritingsCollapsed)}
          title={isWritingsCollapsed ? "Déplier la liste des manuscrits" : "Plier la liste des manuscrits"}
        >
          <span className="text-[10px] text-[#C5A059] font-mono tracking-wider font-bold uppercase">
            Mes Manuscrits ({filteredWritings.length})
          </span>
          <ChevronDown className={`w-3.5 h-3.5 text-[#C5A059] transition-transform duration-200 ${isWritingsCollapsed ? "" : "rotate-180"}`} />
        </div>

        {/* Manuscripts List */}
        <div 
          className={`flex-1 overflow-y-auto p-2 space-y-1.5 transition-all duration-300 ${
            isWritingsCollapsed ? "max-h-0 opacity-0 pointer-events-none py-0" : "opacity-100"
          }`} 
          id="sidebar_writings_list"
        >
          {!isWritingsCollapsed && (
            filteredWritings.length === 0 ? (
              <div className="py-8 text-center text-slate-500 text-xs" id="no_writings_state">
                Aucun document ne correspond à vos filtres.
              </div>
            ) : (
              filteredWritings.map(w => {
                const wordCount = w.content.trim().split(/\s+/).filter(Boolean).length;
                const updatedDate = new Date(w.updatedAt).toLocaleDateString("fr-FR");
                const isSelected = w.id === activeId;

                return (
                  <div
                    key={w.id}
                    onClick={() => onSelect(w.id)}
                    className={`group relative p-3 rounded-lg border text-left cursor-pointer transition flex flex-col gap-1.5 ${
                      isSelected
                        ? "bg-[#C5A059]/10 border-[#C5A059]/40 shadow-xs"
                        : "bg-[#0A0A0A]/40 border-white/5 hover:border-white/15"
                    }`}
                  >
                    <div className="flex items-start justify-between pr-5">
                      <h3 className="text-xs font-semibold text-[#EAE6E1] font-serif line-clamp-1">
                        {w.title || "Document sans titre"}
                      </h3>
                      <button
                        onClick={(e) => onDelete(w.id, e)}
                        className="absolute right-2 top-2.5 p-1 text-slate-500 hover:text-red-400 rounded-sm opacity-100 lg:opacity-0 lg:group-hover:opacity-100 hover:bg-white/5 transition duration-150"
                        title="Supprimer"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                    
                    {/* Meta details */}
                    <div className="flex items-center gap-2 text-[10px] text-[#E0D7D0]/50 font-mono">
                      <span className="flex items-center gap-0.5">
                        <Clock className="w-2.5 h-2.5" />
                        {updatedDate}
                      </span>
                      <span>•</span>
                      <span>{wordCount} mots</span>
                    </div>

                    {/* Tags preview */}
                    <div className="flex flex-wrap gap-1 mt-0.5">
                      {w.themes?.slice(0, 2).map(tag => (
                        <span key={tag} className="px-1 text-[8.5px] rounded-sm bg-white/5 text-[#E0D7D0]/60 border border-white/5 lowercase">
                          {tag}
                        </span>
                      ))}
                      {w.emotions?.slice(0, 1).map(emo => (
                        <span key={emo} className="px-1 text-[8.5px] rounded-sm bg-[#C5A059]/10 text-[#C5A059] border border-[#C5A059]/20 lowercase">
                          {emo}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })
            )
          )}
        </div>

      {/* Deadlines Section */}
      {deadlines.length > 0 && (
        <div className="p-3 border-t border-white/10 bg-[#080808]" id="deadlines_alert_widget">
          <span className="text-[10px] text-[#C5A059]/80 font-mono block mb-1.5 font-semibold">
            ALERTES ET ÉCHÉANCES :
          </span>
          <div className="space-y-2">
            {deadlines.slice(0, 2).map((dl, idx) => {
              const overdue = dl.daysLeft <= 0;
              return (
                <div
                  key={`${dl.id}-${idx}`}
                  className={`p-2 rounded border text-[10.5px] flex flex-col gap-1 ${
                    overdue
                      ? "bg-red-950/30 border-red-900/50 text-red-300"
                      : "bg-white/5 border-white/10 text-[#E0D7D0]/80"
                  }`}
                >
                  <div className="flex items-center justify-between font-medium">
                    <span className="truncate font-serif max-w-[130px]">{dl.title}</span>
                    <span className="flex items-center gap-0.5 font-mono text-[9px]">
                      {overdue ? (
                        <span className="text-red-400 flex items-center gap-0.5 font-bold">
                          <AlertTriangle className="w-3 h-3 text-red-400 shrink-0" /> Expiré !
                        </span>
                      ) : (
                        <span className="text-[#C5A059] font-bold">{dl.daysLeft}j restants</span>
                      )}
                    </span>
                  </div>
                  <div className="w-full bg-white/5 rounded-full h-1">
                    <div
                      className={`h-1 rounded-full ${overdue ? "bg-red-500" : "bg-[#C5A059]"}`}
                      style={{ width: `${dl.progress}%` }}
                    ></div>
                  </div>
                  <div className="flex justify-between items-center text-[9px] text-slate-500 font-mono">
                    <span>Objectif: {dl.targetWords} mots</span>
                    <span>Progression: {dl.progress}%</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
      </div>
    </div>
  );
}
