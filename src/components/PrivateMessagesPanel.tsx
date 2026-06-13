/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useRef, useEffect } from "react";
import { MessageSquare, Send, X, User, ChevronDown, CheckCheck, Landmark } from "lucide-react";
import { PrivateMessage, UserProfile } from "../types";
import { saveMessageToFirestore, getProfilesFromFirestore } from "../lib/firestoreService";
import { collection, query, where, onSnapshot } from "firebase/firestore";
import { db } from "../firebase";

interface PrivateMessagesPanelProps {
  currentUserEmail: string;
  isOpen: boolean;
  onClose: () => void;
  zenMode?: boolean;
}

export default function PrivateMessagesPanel({
  currentUserEmail,
  isOpen,
  onClose,
  zenMode = false
}: PrivateMessagesPanelProps) {
  const [profiles, setProfiles] = useState<UserProfile[]>([]);
  const [selectedRecipient, setSelectedRecipient] = useState<UserProfile | null>(null);
  const [messages, setMessages] = useState<PrivateMessage[]>([]);
  const [inputText, setInputText] = useState("");
  const [isSending, setIsSending] = useState(false);
  const [isUserSelectorOpen, setIsUserSelectorOpen] = useState(false);
  const [conversations, setConversations] = useState<{ profile: UserProfile; lastMessage?: PrivateMessage }[]>([]);

  const chatEndRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Load registered user profiles
  useEffect(() => {
    if (!isOpen || !currentUserEmail) return;
    getProfilesFromFirestore()
      .then((profs) => {
        // filter out current user
        const otherProfs = profs.filter(p => p.email.toLowerCase() !== currentUserEmail.toLowerCase());
        setProfiles(otherProfs);
      })
      .catch((err) => console.error("Could not load authors list for messaging:", err));
  }, [isOpen, currentUserEmail]);

  // Real-time bidirectional message synchronize with Firestore
  useEffect(() => {
    if (!currentUserEmail || !isOpen) return;

    const qSent = query(
      collection(db, "messages"),
      where("senderEmail", "==", currentUserEmail.trim().toLowerCase())
    );
    const qReceived = query(
      collection(db, "messages"),
      where("receiverEmail", "==", currentUserEmail.trim().toLowerCase())
    );

    let sentMsgs: PrivateMessage[] = [];
    let receivedMsgs: PrivateMessage[] = [];

    const updateMerged = () => {
      const merged = [...sentMsgs, ...receivedMsgs];
      // Deduplicate by unique document id
      const unique = Array.from(new Map(merged.map(m => [m.id, m])).values());
      // Sort oldest to newest
      unique.sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      setMessages(unique);
    };

    const unsubSent = onSnapshot(qSent, (snapshot) => {
      const msgs: PrivateMessage[] = [];
      snapshot.forEach(doc => {
        msgs.push(doc.data() as PrivateMessage);
      });
      sentMsgs = msgs;
      updateMerged();
    }, (err) => {
      console.error("Error subscribing to sent messages:", err);
    });

    const unsubReceived = onSnapshot(qReceived, (snapshot) => {
      const msgs: PrivateMessage[] = [];
      snapshot.forEach(doc => {
        msgs.push(doc.data() as PrivateMessage);
      });
      receivedMsgs = msgs;
      updateMerged();
    }, (err) => {
      console.error("Error subscribing to received messages:", err);
    });

    return () => {
      unsubSent();
      unsubReceived();
    };
  }, [currentUserEmail, isOpen]);

  // Derive conversation list from messages history
  useEffect(() => {
    if (profiles.length === 0) return;

    // Track latest message per user email
    const latestMsgMap = new Map<string, PrivateMessage>();
    messages.forEach((msg) => {
      const otherEmail = msg.senderEmail.toLowerCase() === currentUserEmail.toLowerCase()
        ? msg.receiverEmail.toLowerCase()
        : msg.senderEmail.toLowerCase();
      
      const existing = latestMsgMap.get(otherEmail);
      if (!existing || new Date(msg.createdAt) > new Date(existing.createdAt)) {
        latestMsgMap.set(otherEmail, msg);
      }
    });

    // Generate list of conversations, sorted by latest message date descending
    const list = profiles.map((prof) => {
      const lastMessage = latestMsgMap.get(prof.email.toLowerCase());
      return { profile: prof, lastMessage };
    });

    // Sort: profiles with messages come first, sorted by message time descending, then alphabetical
    list.sort((a, b) => {
      if (a.lastMessage && b.lastMessage) {
        return new Date(b.lastMessage.createdAt).getTime() - new Date(a.lastMessage.createdAt).getTime();
      }
      if (a.lastMessage) return -1;
      if (b.lastMessage) return 1;
      return a.profile.penName.localeCompare(b.profile.penName);
    });

    setConversations(list);
  }, [messages, profiles, currentUserEmail]);

  // Click outside to close user dropdown
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsUserSelectorOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  // Scroll to bottom on updates
  useEffect(() => {
    if (chatEndRef.current) {
      chatEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, selectedRecipient]);

  if (!isOpen) return null;

  // Filter messages for the current active thread
  const activeThreadMessages = messages.filter((msg) => {
    if (!selectedRecipient) return false;
    const sentToSelected = msg.senderEmail.toLowerCase() === currentUserEmail.toLowerCase() &&
                           msg.receiverEmail.toLowerCase() === selectedRecipient.email.toLowerCase();
    const receivedFromSelected = msg.receiverEmail.toLowerCase() === currentUserEmail.toLowerCase() &&
                                 msg.senderEmail.toLowerCase() === selectedRecipient.email.toLowerCase();
    return sentToSelected || receivedFromSelected;
  });

  const handleSendMessage = async () => {
    if (!inputText.trim() || !selectedRecipient || isSending) return;

    setIsSending(true);
    const messageId = `msg_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
    const newMessage: PrivateMessage = {
      id: messageId,
      senderEmail: currentUserEmail.trim().toLowerCase(),
      receiverEmail: selectedRecipient.email.trim().toLowerCase(),
      content: inputText.trim(),
      createdAt: new Date().toISOString()
    };

    try {
      await saveMessageToFirestore(newMessage);
      setInputText("");
    } catch (err) {
      console.error("Failed to transmit direct message:", err);
    } finally {
      setIsSending(false);
    }
  };

  return (
    <div
      className="w-full sm:w-85 md:w-[380px] lg:w-[440px] xl:w-[480px] border-l border-white/5 bg-[#0D0D0D] text-[#E0D7D0] flex flex-col h-full z-10 no-print transition-all duration-300 shrink-0 select-none md:select-text"
      id="private_messaging_drawer"
    >
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between" id="pm_drawer_header">
        <div className="flex items-center gap-2">
          <div className="w-7 h-7 rounded-sm bg-[#C5A059]/10 flex items-center justify-center">
            <MessageSquare className="w-3.5 h-3.5 text-[#C5A059]" />
          </div>
          <div>
            <h4 className="text-sm font-serif font-bold text-white leading-none">Messagerie</h4>
            <span className="text-[10px] text-[#C5A059] font-mono tracking-wider uppercase">Échanges Privés</span>
          </div>
        </div>
        <button
          onClick={onClose}
          className="text-[#E0D7D0]/50 hover:text-white transition cursor-pointer"
          title="Fermer la boîte de messagerie"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Selector list or Active chat */}
      <div className="p-3 border-b border-white/5 flex flex-col gap-2 relative bg-[#090909]" ref={dropdownRef}>
        <button
          onClick={() => setIsUserSelectorOpen(!isUserSelectorOpen)}
          className="w-full flex items-center justify-between p-2 rounded bg-white/5 border border-white/10 text-xs font-sans text-[#E0D7D0]/90 hover:border-[#C5A059]/30 transition text-left"
          id="pm_recipient_selector_trigger"
        >
          <span className="truncate">
            {selectedRecipient 
              ? `Échanger avec : ${selectedRecipient.penName}`
              : "Nouveau message poétique..."}
          </span>
          <ChevronDown className="w-3.5 h-3.5 text-[#E0D7D0]/50 ml-1 shrink-0" />
        </button>

        {/* User Search Dropdown */}
        {isUserSelectorOpen && (
          <div className="absolute top-11 left-3 right-3 bg-[#0D0D0D] border border-white/10 rounded-lg shadow-xl max-h-48 overflow-y-auto z-50 py-1" id="pm_recipient_selector_items">
            {profiles.length === 0 ? (
              <p className="text-[10px] text-[#E0D7D0]/40 p-2.5 text-center italic">Aucun autre poète inscrit</p>
            ) : (
              profiles.map((p) => (
                <button
                  key={p.email}
                  onClick={() => {
                    setSelectedRecipient(p);
                    setIsUserSelectorOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2 text-left text-xs hover:bg-white/5 transition"
                >
                  {p.avatarUrl ? (
                    <img src={p.avatarUrl} alt={p.penName} className="w-5 h-5 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="w-5 h-5 rounded-full bg-[#C5A059]/20 text-[#C5A059] font-bold text-[10px] flex items-center justify-center shrink-0 uppercase">
                      {p.penName.charAt(0)}
                    </div>
                  )}
                  <div className="truncate">
                    <p className="font-serif font-medium text-white truncate">{p.penName}</p>
                    <p className="text-[9px] text-[#E0D7D0]/40 truncate">{p.displayName}</p>
                  </div>
                </button>
              ))
            )}
          </div>
        )}
      </div>

      {/* Main Container: Split or Conversation thread */}
      <div className="flex-1 overflow-y-auto flex flex-col" id="pm_content_area">
        {!selectedRecipient ? (
          /* List of past conversations or starter instructions */
          <div className="flex-1 flex flex-col p-4 space-y-3" id="pm_blank_state">
            <p className="text-[11px] text-[#C5A059] font-mono tracking-widest uppercase mb-1">Fils de discussion</p>
            {conversations.length === 0 ? (
              <div className="text-center py-10 px-4 flex-1 flex flex-col justify-center items-center">
                <div className="w-12 h-12 rounded-full border border-white/5 bg-white/2 flex items-center justify-center mb-3">
                  <Landmark className="w-5 h-5 text-[#E0D7D0]/30" />
                </div>
                <p className="text-xs font-serif text-[#E0D7D0]/80">Boîte aux lettres vide</p>
                <p className="text-[10px] text-[#E0D7D0]/40 mt-1 max-w-[180px] leading-relaxed mx-auto">
                  Sélectionnez un poète dans le menu ci-dessus pour entamer un dialogue secret.
                </p>
              </div>
            ) : (
              <div className="space-y-1.5 overflow-y-auto flex-1">
                {conversations.map((conv) => {
                  const isActive = selectedRecipient?.email === conv.profile.email;
                  return (
                    <button
                      key={conv.profile.email}
                      onClick={() => setSelectedRecipient(conv.profile)}
                      className={`w-full flex items-center gap-3 p-2.5 rounded-lg border text-left transition ${
                        isActive
                          ? "bg-[#C5A059]/10 border-[#C5A059]/30"
                          : "bg-[#111] border-white/5 hover:border-white/10 hover:bg-white/2"
                      }`}
                    >
                      {conv.profile.avatarUrl ? (
                        <img src={conv.profile.avatarUrl} alt={conv.profile.penName} className="w-8 h-8 rounded-full object-cover border border-white/10 shrink-0" referrerPolicy="no-referrer" />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-gradient-to-tr from-[#C5A059]/20 to-[#C5A059]/5 border border-[#C5A059]/10 text-[#C5A059] font-serif font-bold text-sm flex items-center justify-center shrink-0 uppercase">
                          {conv.profile.penName.charAt(0)}
                        </div>
                      )}
                      <div className="min-w-0 flex-1">
                        <div className="flex justify-between items-baseline mb-0.5">
                          <p className="text-xs font-serif font-semibold text-white truncate">{conv.profile.penName}</p>
                          {conv.lastMessage && (
                            <span className="text-[8px] text-[#E0D7D0]/30 font-mono">
                              {new Date(conv.lastMessage.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                            </span>
                          )}
                        </div>
                        <p className="text-[10px] text-[#E0D7D0]/50 truncate leading-tight">
                          {conv.lastMessage ? conv.lastMessage.content : "Aucun message poétique échangé."}
                        </p>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        ) : (
          /* Active Thread messages container */
          <div className="flex-1 flex flex-col h-full bg-[#090909]/40">
            {/* Active partner profile card */}
            <div className="bg-[#111111] px-4 py-2 border-b border-white/5 flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                {selectedRecipient.avatarUrl ? (
                  <img src={selectedRecipient.avatarUrl} alt={selectedRecipient.penName} className="w-6 h-6 rounded-full object-cover shrink-0" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-6 h-6 rounded-full bg-[#C5A059]/10 text-[#C5A059] border border-[#C5A059]/20 text-xs font-bold font-serif flex items-center justify-center shrink-0 uppercase">
                    {selectedRecipient.penName.charAt(0)}
                  </div>
                )}
                <div className="min-w-0">
                  <p className="text-xs font-serif font-semibold text-[#E0D7D0] leading-tight truncate">{selectedRecipient.penName}</p>
                  <p className="text-[9px] text-[#C5A059]/80 leading-none truncate">{selectedRecipient.bio || "Auteur de l'Atelier"}</p>
                </div>
              </div>
              <button 
                onClick={() => setSelectedRecipient(null)}
                className="text-xs text-[#C5A059] hover:underline cursor-pointer"
              >
                Retour
              </button>
            </div>

            {/* Bubble logs area */}
            <div className="flex-1 overflow-y-auto p-4 space-y-3" id="pm_messages_bubble_list">
              {activeThreadMessages.length === 0 ? (
                <div className="text-center py-10 px-4">
                  <p className="text-xs font-serif italic text-[#E0D7D0]/40">Aucune lettre partagée</p>
                  <p className="text-[9px] text-[#E0D7D0]/30 mt-1 max-w-[180px] mx-auto leading-relaxed">
                    Les correspondances sont secrètes et protégées de bout en bout.
                  </p>
                </div>
              ) : (
                activeThreadMessages.map((msg) => {
                  const isOwn = msg.senderEmail.toLowerCase() === currentUserEmail.toLowerCase();
                  return (
                    <div 
                      key={msg.id}
                      className={`flex flex-col max-w-[85%] ${isOwn ? "ml-auto items-end" : "mr-auto items-start"}`}
                    >
                      <div 
                        className={`p-3 rounded-xl text-xs leading-relaxed break-words font-sans selection:bg-[#C5A059]/30 selection:text-white shadow-sm ${
                          isOwn 
                            ? "bg-gradient-to-tr from-[#C5A059]/15 to-[#C5A059]/5 border border-[#C5A059]/25 text-[#EAE6E1] rounded-tr-none" 
                            : "bg-[#181818] border border-white/5 text-[#E0D7D0] rounded-tl-none"
                        }`}
                      >
                        {msg.content}
                      </div>
                      <span className="text-[8px] text-[#E0D7D0]/30 font-mono mt-1 px-1">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>
                  );
                })
              )}
              <div ref={chatEndRef} />
            </div>

            {/* Text entering area */}
            <div className="p-4 border-t border-white/5 bg-[#0D0D0D] shrink-0">
              <div className="flex items-center gap-2 bg-[#1A1A1A] rounded-xl p-2 border border-white/10 focus-within:border-[#C5A059]/40 transition">
                <input
                  type="text"
                  value={inputText}
                  onChange={(e) => setInputText(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      handleSendMessage();
                    }
                  }}
                  placeholder="Écrivez votre lettre..."
                  className="flex-1 bg-transparent text-xs text-[#E0D7D0] placeholder-[#E0D7D0]/30 border-none outline-none focus:ring-0 px-3 py-1"
                  disabled={isSending}
                  id="pm_input_field"
                />
                <button
                  onClick={handleSendMessage}
                  disabled={!inputText.trim() || isSending}
                  className="p-2.5 rounded-xl bg-[#C5A059] hover:bg-[#B38D48] text-[#0C0C0C] transition disabled:opacity-35 disabled:hover:bg-[#C5A059] cursor-pointer shrink-0"
                  id="pm_send_btn"
                  title="Envoyer le message"
                >
                  <Send className="w-4 h-4 shrink-0" />
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
