/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { Sparkles, Send, X, Bot, User, CornerDownRight, Quote, Landmark } from "lucide-react";
import { Writing } from "../types";

interface Message {
  role: "user" | "assistant";
  content: string;
}

interface AIDialogProps {
  writing: Writing | null;
  isOpen: boolean;
  onClose: () => void;
  zenMode?: boolean;
  onUpdate?: (updated: Writing) => void;
}

export default function AIDialog({ writing, isOpen, onClose, zenMode = false, onUpdate }: AIDialogProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      role: "assistant",
      content: "Bonjour l'artiste ! Je suis Plume, votre coéquipier de création poétique.\n\nQuelle strophe ou quelle tournure aimeriez-vous peaufiner aujourd'hui ? Je peux vous aider à chercher d'élégantes rimes, étoffer une métaphore complexe ou imaginer la continuation de vos vers."
    }
  ]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const chatEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, isOpen]);

  if (!isOpen) return null;

  const handleSendMessage = async (customText?: string) => {
    const textToSend = customText || inputText;
    if (!textToSend.trim()) return;

    const newMessages = [...messages, { role: "user" as const, content: textToSend }];
    setMessages(newMessages);
    setInputText("");
    setIsSending(true);

    try {
      const response = await fetch("/api/ai/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: newMessages,
          documentTitle: writing?.title || "Sans Titre",
          documentContent: writing?.content || ""
        })
      });

      if (!response.ok) {
        throw new Error("HTTP connection failed");
      }

      const data = await response.json();
      setMessages((prev) => [...prev, { role: "assistant", content: data.text }]);
    } catch (error) {
      console.error("AI companion chat error:", error);
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "Toutes mes excuses, mon inspiration s'est momentanément enrayée. Vérifions ma clé d'accès ou réessayons dans quelques secondes !"
        }
      ]);
    } finally {
      setIsSending(false);
    }
  };

  const quickPrompts = [
    { label: "Suggérer le prochain vers", prompt: "Suggère un vers poétique élégant pour faire suite à mon manuscrit." },
    { label: "Trouver une rime riche", prompt: "Aide-moi à trouver 4 rimes riches et évocatrices avec le mot de la dernière ligne." },
    { label: "Inspirer une métaphore", prompt: "Suggère-moi 3 métaphores sublimes autour de la solitude ou du temps." },
    { label: "Analyser le rythme", prompt: "Fais une critique bienveillante de la structure métrique et du rythme de mon texte actuel." }
  ];

  return (
    <div
      className="w-full sm:w-85 md:w-[380px] lg:w-[440px] xl:w-[480px] border-l border-white/5 bg-[#0D0D0D] text-[#E0D7D0] flex flex-col h-full z-10 no-print transition-all duration-300 shrink-0 select-none md:select-text"
      id="ai_companion_drawer"
    >
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between" id="ai_drawer_header">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-sm bg-[#C5A059]/10 flex items-center justify-center">
            <Sparkles className="w-3.5 h-3.5 text-[#C5A059]" />
          </div>
          <div>
            <h3 className="text-xs font-bold text-[#EAE6E1] font-mono uppercase tracking-wider">Companion Plume</h3>
            <span className="text-[9px] text-slate-400 font-mono">IA Coéquipier Littéraire</span>
          </div>
        </div>
        <button
          id="close_ai_drawer"
          onClick={onClose}
          className="p-1 text-slate-400 hover:text-slate-200 rounded-lg hover:bg-white/5 cursor-pointer"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Messages frame */}
      <div className={`transition-all duration-300 flex-1 overflow-y-auto bg-[#0A0A0A] ${
        zenMode ? "p-3 space-y-3" : "p-5 space-y-5"
      }`} id="ai_chat_messages_flow">
        {messages.map((msg, i) => {
          const isAI = msg.role === "assistant";
          return (
            <div
              key={i}
              className={`flex max-w-[88%] transition-all duration-300 ${
                zenMode ? "gap-2" : "gap-3"
              } ${
                isAI ? "mr-auto" : "ml-auto flex-row-reverse"
              }`}
            >
              <div
                className={`w-6.5 h-6.5 rounded-full flex items-center justify-center shrink-0 text-[10px] uppercase font-bold font-mono ${
                  isAI ? "bg-[#C5A059]/15 text-[#C5A059] border border-[#C5A059]/20" : "bg-white/10 text-[#E0D7D0]"
                }`}
              >
                {isAI ? <Bot className="w-3.5 h-3.5 text-[#C5A059]" /> : <User className="w-3.5 h-3.5 text-slate-300" />}
              </div>

              <div
                className={`rounded-xl leading-relaxed transition-all duration-300 flex flex-col shadow-md ${
                  zenMode ? "p-3 text-xs" : "p-4 text-[13px]"
                } ${
                  isAI
                    ? "bg-[#1A1A1A] border border-white/5 text-[#E0D7D0] font-serif"
                    : "bg-[#C5A059]/15 border border-[#C5A059]/25 text-[#EAE6E1] font-sans"
                }`}
              >
                <div className="flex-1 whitespace-pre-wrap">
                  {msg.content.split("\n\n").map((chunk, cidx) => (
                    <p key={cidx} className={cidx > 0 ? "mt-2.5" : ""}>
                      {chunk}
                    </p>
                  ))}
                </div>

                {isAI && writing && onUpdate && i > 0 && (
                  <div className="mt-4 pt-2.5 border-t border-white/5 flex flex-wrap gap-2 justify-end select-none no-print">
                    <button
                      onClick={() => {
                        const newContent = (writing.content || "") + "\n\n" + msg.content;
                        onUpdate({
                          ...writing,
                          content: newContent,
                          updatedAt: new Date().toISOString()
                        });
                      }}
                      className="text-[10px] font-mono text-[#C5A059] hover:text-[#B38F4B] transition flex items-center gap-1 cursor-pointer bg-[#C5A059]/5 px-2 py-1 rounded border border-[#C5A059]/10 hover:border-[#C5A059]/30"
                      title="Ajouter ce texte à la fin du manuscrit"
                    >
                      <CornerDownRight className="w-3 h-3" />
                      <span>Écrire à la suite</span>
                    </button>
                    
                    <button
                      onClick={() => {
                        const cleanTitle = msg.content.split("\n")[0].replace(/[#*`"']/g, "").trim();
                        const finalTitle = cleanTitle.length > 50 ? cleanTitle.substring(0, 47) + "..." : cleanTitle;
                        onUpdate({
                          ...writing,
                          title: finalTitle,
                          updatedAt: new Date().toISOString()
                        });
                      }}
                      className="text-[10px] font-mono text-slate-400 hover:text-white transition flex items-center gap-1 cursor-pointer bg-white/5 px-2 py-1 rounded border border-white/5 hover:border-white/10"
                      title="Utiliser l'en-tête de ce message comme titre"
                    >
                      <Landmark className="w-3 h-3" />
                      <span>Titre</span>
                    </button>
                  </div>
                )}
              </div>
            </div>
          );
        })}
        {isSending && (
          <div className="flex gap-2.5 mr-auto max-w-[88%] animate-pulse">
            <div className="w-6.5 h-6.5 rounded-full bg-[#C5A059]/20 flex items-center justify-center opacity-75">
              <Bot className="w-3.5 h-3.5 text-[#C5A059]" />
            </div>
            <div className={`bg-[#1A1A1A] border border-white/5 rounded-xl font-mono text-[#C5A059] ${
              zenMode ? "p-3 text-[11px]" : "p-4 text-xs"
            }`}>
              Plume cherche l'inspiration...
            </div>
          </div>
        )}
        <div ref={chatEndRef} />
      </div>

      {/* Suggested prompts buttons */}
      <div className={`transition-all duration-300 bg-[#080808] border-t border-white/10 flex flex-col gap-1.5 px-4 ${
        zenMode ? "py-2.5" : "py-3.5"
      }`} id="quick_prompts_widget">
        <span className="text-[10px] text-[#C5A059]/80 font-mono font-medium block">Suggestions d'aide :</span>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 w-full">
          {quickPrompts.map((qp, idx) => (
            <button
              key={idx}
              id={`quick_prompt_btn_${idx}`}
              onClick={() => handleSendMessage(qp.prompt)}
              className={`border border-white/5 hover:border-[#C5A059]/30 rounded-lg hover:bg-white/10 transition cursor-pointer text-[#E0D7D0]/80 text-left truncate w-full bg-white/5 ${
                zenMode ? "text-[9.5px] px-2 py-1.5" : "text-[10.5px] font-medium px-2.5 py-2"
              }`}
            >
              {qp.label}
            </button>
          ))}
        </div>
      </div>

      {/* Type-input box */}
      <div className="p-4 border-t border-white/10 bg-[#0D0D0D]" id="ai_chat_input_wrap">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSendMessage();
          }}
          className="flex gap-2"
        >
          <input
            id="ai_chat_input"
            type="text"
            placeholder="Posez une question à Plume..."
            value={inputText}
            onChange={(e) => setInputText(e.target.value)}
            disabled={isSending}
            className="flex-1 bg-[#1A1A1A] border border-white/10 focus:border-[#C5A059]/40 text-white rounded-xl px-3.5 py-2 text-xs outline-hidden placeholder-white/20 transition"
          />
          <button
            id="ai_chat_send_btn"
            type="submit"
            disabled={isSending || !inputText.trim()}
            className="p-2.5 bg-[#C5A059] hover:bg-[#B38F4B] text-black disabled:opacity-50 rounded-xl transition shrink-0 flex items-center justify-center cursor-pointer font-bold"
          >
            <Send className="w-4 h-4" />
          </button>
        </form>
      </div>

    </div>
  );
}
