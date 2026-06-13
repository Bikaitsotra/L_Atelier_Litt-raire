/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from "react";
import {
  Sparkles,
  MessageSquare,
  History,
  Settings,
  X,
  Plus,
  Eye,
  EyeOff,
  CloudCheck,
  Check,
  Clock,
  RotateCcw,
  BookOpen,
  Calendar,
  Layers,
  ChevronDown,
  FileDown
} from "lucide-react";
import { Writing, Comment, Version } from "../types";
import ExportMenu from "./ExportMenu";

interface EditorProps {
  writing: Writing | null;
  onUpdate: (updated: Writing) => void;
  onSaveVersion: (label: string) => void;
  versions: Version[];
  onRestoreVersion: (versionId: string) => void;
  onAskAI: () => void;
  zenMode: boolean;
  setZenMode: (zm: boolean) => void;
  isAnyDrawerOpen?: boolean;
}

export default function Editor({
  writing,
  onUpdate,
  onSaveVersion,
  versions,
  onRestoreVersion,
  onAskAI,
  zenMode,
  setZenMode,
  isAnyDrawerOpen = false
}: EditorProps) {
  const [serifFont, setSerifFont] = useState(true);
  const [fontSize, setFontSize] = useState("text-xl"); // text-lg, text-xl, text-2xl
  
  // Versions and settings states
  const [showHistory, setShowHistory] = useState(false);
  const [showGoalSettings, setShowGoalSettings] = useState(false);
  const [newVersionLabel, setNewVersionLabel] = useState("");
  
  // Commenting features
  const [commentText, setCommentText] = useState("");
  const [selectedText, setSelectedText] = useState("");
  const [commenting, setCommenting] = useState(false);
  const [showComments, setShowComments] = useState(true);
  const [generalCommentText, setGeneralCommentText] = useState("");
  const [replyingToId, setReplyingToId] = useState<string | null>(null);
  const [replyTexts, setReplyTexts] = useState<{ [commentId: string]: string }>({});

  // Auto-saving indicators
  const [lastAutoSaved, setLastAutoSaved] = useState<string | null>(null);

  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const [isGeneratingTitle, setIsGeneratingTitle] = useState(false);
  const [isGeneratingContinuation, setIsGeneratingContinuation] = useState(false);

  const handleGenerateTitleInline = async () => {
    if (isGeneratingTitle) return;
    setIsGeneratingTitle(true);
    try {
      const response = await fetch("/api/ai/generate-title", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: writing?.content || "" })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.title && writing) {
          onUpdate({
            ...writing,
            title: data.title,
            updatedAt: new Date().toISOString()
          });
        }
      }
    } catch (err) {
      console.error("Error generating title inline:", err);
    } finally {
      setIsGeneratingTitle(false);
    }
  };

  const handleWriteContinuationInline = async () => {
    if (isGeneratingContinuation) return;
    setIsGeneratingContinuation(true);
    try {
      const response = await fetch("/api/ai/write-continuation", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: writing?.title || "",
          content: writing?.content || ""
        })
      });
      if (response.ok) {
        const data = await response.json();
        if (data.continuation && writing) {
          const newContent = (writing.content || "") + data.continuation;
          onUpdate({
            ...writing,
            content: newContent,
            updatedAt: new Date().toISOString()
          });
          
          // Re-focus the editor and scroll to bottom
          setTimeout(() => {
            if (textareaRef.current) {
              textareaRef.current.focus();
              textareaRef.current.scrollTop = textareaRef.current.scrollHeight;
            }
          }, 100);
        }
      }
    } catch (err) {
      console.error("Error writing continuation inline:", err);
    } finally {
      setIsGeneratingContinuation(false);
    }
  };

  useEffect(() => {
    if (writing) {
      setLastAutoSaved(new Date().toLocaleTimeString("fr-FR"));
    }
  }, [writing?.updatedAt]);

  if (!writing) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-[#0A0A0A] text-[#E0D7D0]/60 p-8 text-center" id="empty_editor_view">
        <div className="max-w-md space-y-3">
          <BookOpen className="w-12 h-12 text-[#C5A059]/60 mx-auto stroke-1" />
          <h2 className="text-lg font-serif font-semibold text-[#EAE6E1]">Aucun projet littéraire sélectionné</h2>
          <p className="text-xs text-[#E0D7D0]/40 leading-relaxed">
            Sélectionnez une œuvre existante dans le panneau de gauche ou impulsez un nouveau manuscrit pour libérer votre créativité poétique.
          </p>
        </div>
      </div>
    );
  }

  // Count metrics
  const cleanText = writing.content.trim();
  const wordCount = cleanText === "" ? 0 : cleanText.split(/\s+/).filter(Boolean).length;
  const characterCount = writing.content.length;
  // Count standard French syllables estimate (vowels groupings)
  const syllableEstimate = cleanText === "" ? 0 : (cleanText.match(/[aeiouyœæàâäéèêëîïôöùûü]+/gi) || []).length;
  // Paragraphs / Strophes
  const strophesCount = cleanText === "" ? 0 : cleanText.split(/\n\s*\n/).filter(Boolean).length;

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    onUpdate({
      ...writing,
      content: e.target.value
    });
  };

  const handleTitleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    onUpdate({
      ...writing,
      title: e.target.value
    });
  };

  const handleDeadlineChange = (date: string | null, wCount: number | null) => {
    onUpdate({
      ...writing,
      deadlineDate: date || null,
      deadlineWordCount: wCount || null
    });
  };

  const handleSelection = () => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start !== end) {
      const selectedStr = textarea.value.substring(start, end);
      setSelectedText(selectedStr);
    }
  };

  const addComment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!commentText.trim()) return;

    const newComment: Comment = {
      id: "comm_" + Math.random().toString(36).substr(2, 9),
      selectedText: selectedText || undefined,
      author: "Vous",
      text: commentText,
      createdAt: new Date().toISOString()
    };

    onUpdate({
      ...writing,
      comments: [newComment, ...writing.comments]
    });

    setCommentText("");
    setSelectedText("");
    setCommenting(false);
  };

  const removeComment = (id: string) => {
    onUpdate({
      ...writing,
      comments: writing.comments.filter(c => c.id !== id)
    });
  };

  const addReply = (commentId: string) => {
    const text = replyTexts[commentId];
    if (!text || !text.trim()) return;

    const newReply = {
      id: "reply_" + Math.random().toString(36).substr(2, 9),
      author: "Vous",
      text: text.trim(),
      createdAt: new Date().toISOString()
    };

    onUpdate({
      ...writing,
      comments: writing.comments.map(comm => {
        if (comm.id === commentId) {
          return {
            ...comm,
            replies: [...(comm.replies || []), newReply]
          };
        }
        return comm;
      })
    });

    setReplyTexts(prev => ({ ...prev, [commentId]: "" }));
    setReplyingToId(null);
  };

  const removeReply = (commentId: string, replyId: string) => {
    onUpdate({
      ...writing,
      comments: writing.comments.map(comm => {
        if (comm.id === commentId) {
          return {
            ...comm,
            replies: (comm.replies || []).filter(r => r.id !== replyId)
          };
        }
        return comm;
      })
    });
  };

  return (
    <div
      className={`flex-1 flex flex-col h-full bg-[#0A0A0A] transition-all duration-300 ${
        zenMode ? "p-3 sm:p-4" : "p-2 sm:p-4"
      }`}
      id="editor_view_container"
    >
      {/* Top action controls bar */}
      <div className={`transition-all duration-300 flex flex-wrap items-center no-print ${
        zenMode 
          ? "gap-2 p-2 sm:p-3 mb-3 border border-white/10 bg-[#0D0D0D] shadow-xs rounded-xl" 
          : "gap-2 p-2 sm:p-3 mb-3 border border-white/10 bg-[#0D0D0D] shadow-xs rounded-xl"
      }`} id="editor_tools_strip">
        {/* Distraction free toggle */}
        <button
          id="zen_mode_toggle_btn"
          onClick={() => setZenMode(!zenMode)}
          className={`flex items-center gap-1.5 font-medium transition cursor-pointer px-2 py-1.5 sm:px-3 text-xs rounded-lg border ${
            zenMode
              ? "bg-[#C5A059] text-black border-[#C5A059] hover:bg-[#B38F4B]"
              : "bg-white/5 text-[#E0D7D0]/80 border-white/10 hover:bg-white/10"
          }`}
          title="Prendre son envol : Mode Sans Distraction"
        >
          {zenMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          <span className="hidden lg:inline">{zenMode ? "Fermer le Zen" : "Mode Zen"}</span>
        </button>
 
        {/* Typography styling options */}
        <div className="flex items-center border border-white/10 rounded-lg overflow-hidden bg-white/5 p-0.5">
          <button
            onClick={() => setSerifFont(true)}
            className={`font-semibold rounded-sm cursor-pointer transition px-2 py-1 text-[10px] ${
              serifFont ? "bg-white/10 text-[#C5A059] shadow-xs" : "text-[#E0D7D0]/40 hover:text-[#E0D7D0]"
            }`}
          >
            <span className="hidden lg:inline">Garamond</span>
            <span className="lg:hidden font-serif">G</span>
          </button>
          <button
            onClick={() => setSerifFont(false)}
            className={`font-semibold rounded-sm cursor-pointer transition px-2 py-1 text-[10px] ${
              !serifFont ? "bg-white/10 text-[#C5A059] shadow-xs" : "text-[#E0D7D0]/40 hover:text-[#E0D7D0]"
            }`}
          >
            <span className="hidden lg:inline">Inter</span>
            <span className="lg:hidden font-sans">I</span>
          </button>
        </div>

        {/* Size choices */}
        <div className="flex items-center border border-white/10 rounded-lg overflow-hidden bg-white/5 p-0.5">
          {["text-lg", "text-xl", "text-2xl"].map((size) => (
            <button
               key={size}
               onClick={() => setFontSize(size)}
               className={`rounded-sm cursor-pointer flex items-center justify-center font-bold font-mono uppercase transition w-6 h-6 text-[10.5px] ${
                 fontSize === size ? "bg-white/10 text-[#C5A059] shadow-xs" : "text-[#E0D7D0]/40 hover:text-[#E0D7D0]"
               }`}
            >
              {size === "text-lg" ? "A-" : size === "text-xl" ? "A" : "A+"}
            </button>
          ))}
        </div>

        {/* Spacer to push secondary actions right on screens with room */}
        <div className="flex-1 min-w-[20px] hidden sm:block pointer-events-none" />

        {/* Autosafe Status Indicator */}
        <span className="text-[#E0D7D0]/60 font-mono flex items-center gap-1 bg-white/5 border border-white/5 rounded-md px-2 py-1 text-[10px]">
          <CloudCheck className="w-3 h-3 text-emerald-400 animate-pulse" />
          <span className="hidden sm:inline">{lastAutoSaved || ""}</span>
        </span>

        {/* Exporter list */}
        <ExportMenu writing={writing} zenMode={false} />

        {/* Versions tracker dropdown trigger */}
        <button
          id="versions_history_btn"
          onClick={() => setShowHistory(!showHistory)}
          className={`flex items-center gap-1 font-medium transition cursor-pointer ${
            zenMode 
              ? "px-2 py-1.5 sm:px-3 text-xs border border-white/10 rounded-lg" 
              : "px-2 py-1.5 sm:px-3 text-xs border border-white/10 rounded-lg"
          } ${
            showHistory
              ? "bg-[#C5A059]/10 text-[#C5A059] border-[#C5A059]/40"
              : "bg-[#1A1A1A] text-[#E0D7D0] border-white/5 hover:bg-white/5"
          }`}
        >
          <History className={`${zenMode ? "w-3.5 h-3.5" : "w-3.5 h-3.5"} text-[#C5A059]`} />
          <span className="hidden lg:inline">Historique</span>
        </button>

        {/* Comments toggle trigger */}
        <button
          id="comments_toggle_btn"
          onClick={() => setShowComments(!showComments)}
          className={`flex items-center gap-1 font-medium transition cursor-pointer ${
            zenMode 
              ? "px-2 py-1.5 sm:px-3 text-xs border border-white/10 rounded-lg" 
              : "px-2 py-1.5 sm:px-3 text-xs border border-white/10 rounded-lg"
          } ${
            showComments && writing.comments.length > 0
              ? "bg-[#C5A059]/10 text-[#C5A059] border-[#C5A059]/40"
              : "bg-[#1A1A1A] text-[#E0D7D0] border-white/5 hover:bg-white/5"
          }`}
          title="Afficher/Masquer le panneau de commentaires"
        >
          <MessageSquare className={`${zenMode ? "w-3.5 h-3.5" : "w-3.5 h-3.5"} text-[#C5A059]`} />
          {writing.comments.length > 0 && (
            <span className="text-[10px] font-mono tracking-wider text-[#C5A059]">{writing.comments.length}</span>
          )}
        </button>

        {/* Objective Setter trigger */}
        <button
          id="objective_settings_btn"
          onClick={() => setShowGoalSettings(!showGoalSettings)}
          className={`flex items-center gap-1 font-medium transition cursor-pointer ${
            zenMode 
              ? "px-2 py-1.5 sm:px-3 text-xs border border-white/10 rounded-lg" 
              : "px-2 py-1.5 sm:px-3 text-xs border border-white/10 rounded-lg"
          } ${
            showGoalSettings
              ? "bg-[#C5A059]/10 text-[#C5A059] border-[#C5A059]/40"
              : "bg-[#1A1A1A] text-[#E0D7D0] border-white/5 hover:bg-white/5"
          }`}
          title="Définir des jalons ou échéance pour ce manuscrit"
        >
          <Calendar className={`${zenMode ? "w-3.5 h-3.5" : "w-3.5 h-3.5"} text-[#C5A059]`} />
          <span className="hidden lg:inline">Écheance</span>
        </button>

        {/* Quick AI analysis trigger */}
        <button
          id="quick_analyze_ai_btn"
          onClick={onAskAI}
          className="flex items-center gap-1.5 px-2 py-1.5 sm:px-3 text-xs font-semibold bg-[#C5A059] text-black hover:bg-[#B38F4B] rounded-lg shadow-xs transition active:scale-95 cursor-pointer border border-[#C5A059]/10"
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span className="hidden lg:inline">Analyser</span>
        </button>
      </div>

      {/* Goal Settings Panel Modal overlay */}
      {showGoalSettings && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center z-50 no-print" id="deadline_settings_modal">
          <div className="bg-[#0D0D0D] rounded-xl shadow-xl border border-white/10 p-5 max-w-sm w-full space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <h3 className="font-serif font-bold text-[#EAE6E1] text-sm flex items-center gap-1.5">
                <Calendar className="w-4 h-4 text-[#C5A059]" />
                <span>Définir l'échéance d'écriture</span>
              </h3>
              <button
                id="close_goal_modal_btn"
                onClick={() => setShowGoalSettings(false)}
                className="text-[#E0D7D0]/60 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            
            <div className="space-y-3">
              <div>
                <label className="block text-[10.5px] font-mono text-[#E0D7D0]/40 uppercase mb-1">Date limite :</label>
                <input
                  id="deadline_date_input"
                  type="date"
                  value={writing.deadlineDate || ""}
                  onChange={(e) => handleDeadlineChange(e.target.value || null, writing.deadlineWordCount)}
                  className="w-full text-xs bg-[#1A1A1A] border border-white/10 text-white rounded-lg p-2 focus:border-[#C5A059]/40 outline-hidden"
                />
              </div>

              <div>
                <label className="block text-[10.5px] font-mono text-[#E0D7D0]/40 uppercase mb-1">But (nombre de mots requis) :</label>
                <input
                  id="deadline_words_input"
                  type="number"
                  placeholder="Ex: 500"
                  value={writing.deadlineWordCount || ""}
                  onChange={(e) => handleDeadlineChange(writing.deadlineDate, e.target.value ? parseInt(e.target.value) : null)}
                  className="w-full text-xs bg-[#1A1A1A] border border-white/10 text-white rounded-lg p-2 focus:border-[#C5A059]/40 outline-hidden"
                />
              </div>
            </div>

            <button
              id="save_goal_btn"
              onClick={() => setShowGoalSettings(false)}
              className="w-full bg-[#C5A059] hover:bg-[#B38F4B] text-black font-semibold rounded-lg p-2 text-xs transition-colors cursor-pointer"
            >
              Enregistrer l'échéance
            </button>
          </div>
        </div>
      )}

      {/* Main active editing and sub panels */}
      <div className="flex-1 flex gap-4 overflow-hidden relative" id="editor_grid_area">
        {/* Core Writing Space Card */}
        <div
          className={`flex-1 flex flex-col bg-[#0D0D0D] border border-white/10 rounded-2xl shadow-xs overflow-hidden transition-all duration-300 ${
            zenMode ? "border-none shadow-none rounded-none bg-transparent" : ""
          }`}
          id="editor_sheet"
        >
          {/* Header titles input */}
          <div className={`transition-all duration-300 no-print flex items-center justify-between gap-4 ${
            zenMode ? "p-3 border-b border-white/5" : "p-6 border-b border-white/10"
          }`} id="sheet_header_titles">
            <input
              id="editor_document_title"
              type="text"
              value={writing.title}
              onChange={handleTitleChange}
              placeholder="Titre de l'œuvre..."
              className={`flex-1 font-serif font-bold text-[#EAE6E1] placeholder-white/20 bg-transparent focus:outline-hidden transition-all duration-300 ${
                zenMode ? "text-base lg:text-lg" : "text-xl lg:text-2xl"
              }`}
            />
            <button
              id="generate_title_plume_btn"
              onClick={handleGenerateTitleInline}
              disabled={isGeneratingTitle}
              className={`flex items-center gap-1.5 px-2 py-1 bg-[#C5A059]/10 hover:bg-[#C5A059]/20 border border-[#C5A059]/20 hover:border-[#C5A059]/40 text-[#C5A059] rounded-lg text-[11px] font-mono transition duration-200 shrink-0 cursor-pointer ${
                isGeneratingTitle ? "animate-pulse opacity-60 cursor-wait" : ""
              }`}
              title="Laisser Plume trouver un titre inspirant"
            >
              <Sparkles className="w-3 h-3 text-[#C5A059]" />
              <span className={`hidden ${isAnyDrawerOpen ? "" : "sm:inline"}`}>{isGeneratingTitle ? "Rédaction..." : "Titre par Plume"}</span>
            </button>
          </div>

          {/* Typewriter text editor block */}
          <div className={`flex-1 flex flex-col overflow-hidden transition-all duration-300 ${
            zenMode ? "p-3 sm:p-4" : "p-6"
          }`} id="sheet_body_editor">
            <textarea
              id="editor_textarea"
              ref={textareaRef}
              value={writing.content}
              onChange={handleTextChange}
              onMouseUp={handleSelection}
              onKeyUp={handleSelection}
              placeholder="Écrivez vos vers ou prose ici..."
              className={`flex-1 w-full leading-relaxed resize-none focus:outline-hidden bg-transparent text-[#D1C9C0] placeholder-white/20 ${
                serifFont ? "font-serif tracking-normal" : "font-sans tracking-tight"
              } ${fontSize}`}
            />

            {/* Direct Plume Write bar */}
            <div className="flex items-center justify-between pt-2.5 border-t border-white/5 mt-2 gap-3" id="plume_inline_actions">
              <span className="text-[10px] text-[#E0D7D0]/40 font-mono flex items-center gap-1">
                <span className="w-1.5 h-1.5 rounded-full bg-[#C5A059] animate-ping" />
                <span className={isAnyDrawerOpen ? "hidden md:inline" : ""}>Plume peut écrire directement dans votre manuscrit</span>
                <span className={isAnyDrawerOpen ? "inline md:hidden" : "hidden"}>Écriture assistée</span>
              </span>
              <button
                id="write_continuation_plume_btn"
                onClick={handleWriteContinuationInline}
                disabled={isGeneratingContinuation}
                className={`flex items-center gap-1.5 px-3 py-1.5 bg-[#C5A059] hover:bg-[#B38F4B] text-black font-semibold rounded-lg text-xs transition duration-150 cursor-pointer shadow-md ${
                  isGeneratingContinuation ? "animate-pulse opacity-80 cursor-wait bg-[#C5A059]/60" : ""
                }`}
                title="Demander à Plume de rédiger la suite de votre texte"
              >
                <Sparkles className="w-3.5 h-3.5" />
                <span className={`hidden ${isAnyDrawerOpen ? "" : "sm:inline"}`}>{isGeneratingContinuation ? "Plume écrit..." : "Rédiger la suite (Plume)"}</span>
              </button>
            </div>
          </div>

          {/* Metrics ribbon */}
          <div className={`transition-all duration-300 bg-[#080808] border-t border-white/10 flex items-center justify-between font-mono no-print ${
            zenMode ? "px-3 py-1.5 border-t border-white/5 text-[10px]" : "px-5 py-2.5 border-t border-white/10 text-[11px] text-[#E0D7D0]/40"
          }`} id="sheet_footer_metrics">
            <div className="flex items-center gap-4">
              <span>Strophes: <span className="font-bold text-[#C5A059]">{strophesCount}</span></span>
              <span>Mots: <span className="font-bold text-[#C5A059]">{wordCount}</span></span>
              <span>Lettres: <span className="font-bold text-[#C5A059]">{characterCount}</span></span>
              <span className="hidden sm:inline">Vibrations syllabiques : <span className="font-bold text-[#C5A059]">{syllableEstimate}</span></span>
            </div>

            {selectedText && (
              <button
                id="comment_bubble_btn"
                onClick={() => setCommenting(true)}
                className="flex items-center gap-1.5 px-2 py-1 text-xs bg-[#C5A059]/15 text-[#C5A059] hover:bg-[#C5A059]/25 rounded-sm border border-[#C5A059]/30 transition"
              >
                <Plus className="w-3 h-3" />
                <span>Commenter la sélection</span>
              </button>
            )}
          </div>
        </div>

        {/* Dynamic Inline Comment Form overlay */}
        {commenting && (
          <div className="absolute inset-x-0 bottom-12 p-3 bg-[#1A1A1A] border-t border-b border-white/10 flex flex-col gap-2 z-10 no-print animate-slide-up" id="comment_sheet_drawer">
            <div className="flex justify-between items-center text-xs text-[#EAE6E1]">
              <span className="font-medium truncate max-w-[400px]">Sélection paysagée : "{selectedText}"</span>
              <button id="close_comment_drawer" onClick={() => setCommenting(false)} className="text-[#C5A059] hover:text-[#B38F4B]">
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
            <form onSubmit={addComment} className="flex gap-2">
              <input
                id="comment_text_input"
                type="text"
                required
                placeholder="Écrivez votre commentaire, analyse de rime, ou note de correction..."
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                className="flex-1 bg-[#0A0A0A] border border-white/10 rounded-lg px-3 py-1.5 text-xs text-white outline-hidden focus:border-[#C5A059]/40"
              />
              <button
                id="submit_comment_btn"
                type="submit"
                className="bg-[#C5A059] text-black hover:bg-[#B38F4B] rounded-lg px-4 py-1.5 text-xs font-semibold transition"
              >
                Ajouter
              </button>
            </form>
          </div>
        )}

        {/* Sidebar panels for Version history & Inline comments */}
        {(showHistory || showComments) && !zenMode && (
          <div className="w-80 max-w-full lg:relative absolute right-0 top-0 h-full z-20 bg-[#0D0D0D] border-l border-white/10 flex flex-col no-print" id="editorial_right_drawers">
            
            {/* Version History Drawer */}
            {showHistory && (
              <div className={`flex flex-col min-h-0 ${showComments ? "h-1/2 border-b border-white/10" : "flex-1"}`} id="version_list_card">
                <div className="p-4 border-b border-white/10 flex items-center justify-between" id="history_drawer_header">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded bg-[#C5A059]/10 flex items-center justify-center">
                      <History className="w-3.5 h-3.5 text-[#C5A059]" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-[#EAE6E1] font-mono uppercase tracking-wider">Versions</h3>
                      <span className="text-[9px] text-[#E0D7D0]/40 font-mono">Archivage temporel</span>
                    </div>
                  </div>
                  <button
                    id="close_history_panel"
                    onClick={() => setShowHistory(false)}
                    className="p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-white/5 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Save snapshot explicitly form */}
                <div className="p-3 bg-[#0D0D0D] border-b border-white/5 flex gap-1.5" id="save_snapshot_panel">
                  <input
                    id="manual_version_tag_input"
                    type="text"
                    placeholder="Étiquette... ex: Strophe 2"
                    value={newVersionLabel}
                    onChange={(e) => setNewVersionLabel(e.target.value)}
                    className="flex-1 bg-[#1A1A1A] border border-white/10 rounded-lg px-2.5 py-1.5 text-xs text-white outline-none focus:border-[#C5A059]/40"
                  />
                  <button
                    id="trigger_manual_save_btn"
                    onClick={() => {
                      if (!newVersionLabel.trim()) return;
                      onSaveVersion(newVersionLabel);
                      setNewVersionLabel("");
                    }}
                    className="px-3 py-1.5 bg-[#C5A059] text-black font-semibold rounded-lg text-xs hover:bg-[#B38F4B] transition flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    <span>Figer</span>
                  </button>
                </div>

                {/* Old snapshots list */}
                <div className="flex-1 overflow-y-auto space-y-2 p-4 bg-[#0A0A0A]" id="versions_list_container">
                  {versions.length === 0 ? (
                    <p className="text-[11px] text-slate-500 text-center py-4">Aucune version archivée pour l'instant.</p>
                  ) : (
                    versions.map((ver) => (
                      <div
                        key={ver.id}
                        className="p-2 border border-white/5 rounded-lg hover:bg-white/5 flex flex-col gap-1 text-[11px] bg-[#111111]/40"
                      >
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-[#EAE6E1] truncate max-w-[120px]">{ver.label}</span>
                          <span className="text-[9px] font-mono text-[#E0D7D0]/40">
                            {new Date(ver.savedAt).toLocaleTimeString("fr-FR")}
                          </span>
                        </div>
                        <p className="text-[10px] text-[#E0D7D0]/60 font-serif truncate">{ver.content}</p>
                        <button
                          id={`restore_ver_${ver.id}`}
                          onClick={() => onRestoreVersion(ver.id)}
                          className="text-[9.5px] font-mono text-[#C5A059] hover:text-[#B38F4B] font-bold mt-1 text-left flex items-center gap-0.5 cursor-pointer"
                        >
                          <RotateCcw className="w-2.5 h-2.5" />
                          Restaurer cette version
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Comments List Drawer */}
            {showComments && (
              <div className={`flex flex-col min-h-0 ${showHistory ? "h-1/2" : "flex-1"}`} id="comments_list_card">
                <div className="p-4 border-b border-white/10 flex items-center justify-between" id="comments_drawer_header">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded bg-[#C5A059]/10 flex items-center justify-center">
                      <MessageSquare className="w-3.5 h-3.5 text-[#C5A059]" />
                    </div>
                    <div>
                      <h3 className="text-xs font-bold text-[#EAE6E1] font-mono uppercase tracking-wider">Commentaires</h3>
                      <span className="text-[9px] text-[#E0D7D0]/40 font-mono">Notes de marge ({writing.comments.length})</span>
                    </div>
                  </div>
                  <button
                    id="close_comments_panel"
                    onClick={() => setShowComments(false)}
                    className="p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-white/5 cursor-pointer"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                <div className="flex-1 overflow-y-auto space-y-3 p-4 bg-[#0A0A0A]" id="comments_list_container">
                  {writing.comments.length === 0 ? (
                    <p className="text-xs text-slate-400/40 text-center py-6">Aucun commentaire pour le moment. Laissez un mot de passe ou une idée générale ci-dessous.</p>
                  ) : (
                    writing.comments.map((comm) => (
                      <div
                        key={comm.id}
                        className="p-2.5 bg-[#141414] border border-white/5 rounded-lg text-[11px] space-y-1 relative group"
                        id={`comment_card_${comm.id}`}
                      >
                        <button
                          onClick={() => removeComment(comm.id)}
                          className="absolute right-1 top-1 text-slate-500 hover:text-rose-400 opacity-0 group-hover:opacity-100 transition duration-150 cursor-pointer"
                          title="Résoudre le commentaire"
                          id={`resolve_comm_btn_${comm.id}`}
                        >
                          <X className="w-3 h-3" />
                        </button>
                        <div className="flex justify-between items-center text-[10px] text-slate-500">
                          <span className="font-bold text-[#EAE6E1]">{comm.author}</span>
                          <span>{new Date(comm.createdAt).toLocaleTimeString("fr-FR")}</span>
                        </div>
                        {comm.selectedText && (
                          <p className="text-[9.5px] text-[#D1C9C0] italic bg-[#0A0A0A]/60 rounded-sm border-l-2 border-[#C5A059] px-1.5 py-0.5 truncate">
                            « {comm.selectedText} »
                          </p>
                        )}
                        <p className="text-[#E0D7D0]/80 bg-black/10 p-1.5 rounded-sm">{comm.text}</p>

                        {/* Nested Replies */}
                        {comm.replies && comm.replies.length > 0 && (
                          <div className="mt-2 pl-3 border-l-2 border-white/15 space-y-2" id={`replies_container_${comm.id}`}>
                            {comm.replies.map((reply) => (
                              <div key={reply.id} className="relative group/reply bg-white/2 p-2 rounded-lg text-[10.5px]" id={`reply_card_${reply.id}`}>
                                <button
                                  onClick={() => removeReply(comm.id, reply.id)}
                                  className="absolute right-1.5 top-1.5 text-slate-500 hover:text-rose-400 opacity-0 group-hover/reply:opacity-100 transition duration-150 cursor-pointer"
                                  title="Supprimer la réponse"
                                  id={`delete_reply_btn_${reply.id}`}
                                >
                                  <X className="w-2.5 h-2.5" />
                                </button>
                                <div className="flex justify-between items-center text-[9px] text-slate-500 mb-1">
                                  <span className="font-semibold text-white">{reply.author}</span>
                                  <span>{new Date(reply.createdAt).toLocaleTimeString("fr-FR")}</span>
                                </div>
                                <p className="text-[#E0D7D0]/70">{reply.text}</p>
                              </div>
                            ))}
                          </div>
                        )}

                        {/* Reply Action Form */}
                        <div className="mt-2 pt-1 border-t border-white/5 flex flex-col" id={`comment_reply_action_${comm.id}`}>
                          {replyingToId === comm.id ? (
                            <div className="flex gap-1.5 items-center mt-1">
                              <input
                                id={`reply_input_${comm.id}`}
                                type="text"
                                placeholder="Répondre..."
                                value={replyTexts[comm.id] || ""}
                                onChange={(e) => setReplyTexts({ ...replyTexts, [comm.id]: e.target.value })}
                                onKeyDown={(e) => {
                                  if (e.key === "Enter") {
                                    e.preventDefault();
                                    addReply(comm.id);
                                  }
                                }}
                                className="flex-1 bg-[#0A0A0A] border border-white/10 rounded-lg px-2 py-1 text-[10.5px] text-white focus:border-[#C5A059]/40 outline-hidden"
                                autoFocus
                              />
                              <button
                                id={`submit_reply_btn_${comm.id}`}
                                onClick={() => addReply(comm.id)}
                                className="px-2 py-1 bg-[#C5A059] hover:bg-[#B38F4B] text-black rounded-lg text-[10px] font-semibold cursor-pointer"
                              >
                                Publier
                              </button>
                              <button
                                id={`cancel_reply_btn_${comm.id}`}
                                onClick={() => setReplyingToId(null)}
                                className="p-1 hover:bg-white/5 text-slate-400 rounded-lg cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              id={`trigger_reply_btn_${comm.id}`}
                              onClick={() => setReplyingToId(comm.id)}
                              className="text-[9.5px] font-semibold text-[#C5A059] hover:text-[#B38F4B] transition-colors mt-1 text-left flex items-center gap-1 cursor-pointer self-start"
                            >
                              Répondre
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>

                {/* General Comment Input Form */}
                <div className="p-3 bg-[#0D0D0D] border-t border-white/10" id="general_comment_form_wrapper">
                  <form
                    id="general_comment_form"
                    onSubmit={(e) => {
                      e.preventDefault();
                      if (!generalCommentText.trim()) return;
                      const newComment: Comment = {
                        id: "comm_" + Math.random().toString(36).substr(2, 9),
                        author: "Vous",
                        text: generalCommentText.trim(),
                        createdAt: new Date().toISOString()
                      };
                      onUpdate({
                        ...writing,
                        comments: [newComment, ...writing.comments]
                      });
                      setGeneralCommentText("");
                    }}
                    className="flex gap-1.5"
                  >
                    <input
                      id="general_comment_input"
                      type="text"
                      placeholder="Commentaire général..."
                      value={generalCommentText}
                      onChange={(e) => setGeneralCommentText(e.target.value)}
                      className="flex-1 bg-[#1A1A1A] border border-white/10 rounded-lg p-1.5 text-xs text-white focus:border-[#C5A059]/40 outline-hidden"
                    />
                    <button
                      id="add_general_comment_btn"
                      type="submit"
                      className="bg-[#C5A059] hover:bg-[#B38F4B] text-black font-semibold rounded-lg px-3 text-xs cursor-pointer flex items-center justify-center transition shrink-0"
                    >
                      Ajouter
                    </button>
                  </form>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
