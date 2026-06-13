/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from "react";
import { Users, BookOpen, ShieldCheck, History, Award, AlertCircle, Trash2, Mail, Ban, UserCheck } from "lucide-react";
import { getAdminOverviewFromFirestore, restrictUser, deleteUser } from "../lib/firestoreService";

interface AdminUser {
  email: string;
  displayName: string;
  penName: string;
  createdAt: string;
  isGoogle: boolean;
  manuscriptsCount: number;
  isRestricted?: boolean;
}

interface AdminOverview {
  totalUsers: number;
  totalWritings: number;
  totalProfiles: number;
  totalVersions: number;
  usersList: AdminUser[];
}

interface AdminPanelProps {
  adminEmail: string;
}

export default function AdminPanel({ adminEmail }: AdminPanelProps) {
  const [data, setData] = useState<AdminOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  // Actions states
  const [selectedUser, setSelectedUser] = useState<AdminUser | null>(null);
  const [confirmAction, setConfirmAction] = useState<"restrict" | "unrestrict" | "delete" | null>(null);
  const [actionLoading, setActionLoading] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  const fetchAdminData = async () => {
    setLoading(true);
    setError(null);

    // Client-side guard check matching the security rules role validation
    if (!adminEmail || adminEmail.trim().toLowerCase() !== "johnbikaitsotra@gmail.com") {
      setError("Accès refusé. Réservé aux administrateurs.");
      setLoading(false);
      return;
    }

    try {
      const result = await getAdminOverviewFromFirestore();
      setData(result);
    } catch (err: any) {
      setError(err.message || "Erreur lors du chargement des statistiques administratives.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAdminData();
  }, [adminEmail]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400 gap-3 font-mono text-xs">
        <svg className="animate-spin h-6 w-6 text-[#C5A059]" viewBox="0 0 24 24" fill="none">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
        </svg>
        <span>Chargement du registre secret des scribes...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 rounded-xl bg-red-950/20 border border-red-500/20 max-w-lg mx-auto text-center my-8">
        <AlertCircle className="w-8 h-8 text-red-400 mx-auto mb-2" />
        <h3 className="font-serif font-bold text-red-200">Accès Administrateur Restreint</h3>
        <p className="text-xs text-red-400/80 mt-1">{error}</p>
      </div>
    );
  }

  const filteredUsers = data?.usersList.filter(user => 
    user.email.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.displayName.toLowerCase().includes(searchTerm.toLowerCase()) ||
    user.penName.toLowerCase().includes(searchTerm.toLowerCase())
  ) || [];

  return (
    <div className="space-y-6 animate-fade-in font-sans" id="admin_panel_wrapper">
      {/* Overview stats bento items */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4" id="admin_stats_bento">
        
        <div className="bg-[#0D0D0D] border border-white/5 rounded-xl p-4 flex items-center gap-3.5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-[#C5A059]/5 rounded-full blur-2xl pointer-events-none" />
          <div className="p-2.5 bg-[#C5A059]/10 rounded-lg text-[#C5A059] border border-[#C5A059]/15">
            <Users className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-mono tracking-wider text-slate-500 uppercase">Scribes inscrits</div>
            <div className="text-2xl font-bold text-[#EAE6E1]">{data?.totalUsers}</div>
          </div>
        </div>

        <div className="bg-[#0D0D0D] border border-white/5 rounded-xl p-4 flex items-center gap-3.5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-slate-800/20 rounded-full blur-2xl pointer-events-none" />
          <div className="p-2.5 bg-slate-800/40 rounded-lg text-slate-300 border border-white/5">
            <BookOpen className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-mono tracking-wider text-slate-500 uppercase">Manuscrits créés</div>
            <div className="text-2xl font-bold text-[#EAE6E1]">{data?.totalWritings}</div>
          </div>
        </div>

        <div className="bg-[#0D0D0D] border border-white/5 rounded-xl p-4 flex items-center gap-3.5 relative overflow-hidden">
          <div className="absolute top-0 right-0 w-24 h-24 bg-slate-800/20 rounded-full blur-2xl pointer-events-none" />
          <div className="p-2.5 bg-slate-800/40 rounded-lg text-slate-300 border border-white/5">
            <History className="w-5 h-5" />
          </div>
          <div>
            <div className="text-[10px] font-mono tracking-wider text-slate-500 uppercase">Versions sauvegardées</div>
            <div className="text-2xl font-bold text-[#EAE6E1]">{data?.totalVersions}</div>
          </div>
        </div>

        <div className="bg-[#0D0D0D] border border-[#C5A059]/10 rounded-xl p-4 flex items-center gap-3.5 relative overflow-hidden">
          <div className="absolute inset-x-0 top-0 h-[2px] bg-gradient-to-r from-transparent via-[#C5A059]/40 to-transparent" />
          <div className="p-2.5 bg-[#C5A059]/15 rounded-lg text-[#C5A059] border border-[#C5A059]/20">
            <ShieldCheck className="w-5 h-5 animate-pulse" />
          </div>
          <div>
            <div className="text-[10px] font-mono tracking-wider text-slate-400 uppercase">Statut Administrateur</div>
            <div className="text-xs font-bold text-[#C5A059] tracking-widest uppercase">Admin Principal</div>
          </div>
        </div>

      </div>

      {/* Action panel & users table */}
      <div className="bg-[#0D0D0D] border border-white/5 rounded-2xl overflow-hidden shadow-xl">
        <div className="p-5 border-b border-white/5 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-sm font-serif font-bold text-[#EAE6E1] uppercase tracking-wider flex items-center gap-2">
              <Award className="w-4 h-4 text-[#C5A059]" />
              Registre secret des auteurs de Plume
            </h3>
            <p className="text-[11px] text-slate-500 mt-1">Supervisez et observez l'ensemble des activités littéraires de l'atelier.</p>
          </div>

          <div className="w-full sm:w-64">
            <input
              type="text"
              placeholder="Rechercher un scribe..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full bg-[#141414] border border-white/5 rounded-lg py-1.5 px-3 text-xs text-[#EAE6E1] focus:outline-none focus:border-[#C5A059]/60 transition font-sans placeholder-slate-600"
            />
          </div>
        </div>

        {/* Authors grid/table */}
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs border-collapse">
            <thead>
              <tr className="border-b border-white/5 font-mono text-[10px] text-slate-500 uppercase">
                <th className="p-4">Scribe / Nom d'artiste</th>
                <th className="p-4">Adresse Email</th>
                <th className="p-4">Date de ralliement</th>
                <th className="p-4">Authentification & Statut</th>
                <th className="p-4 text-center">Manuscrits Actifs</th>
                <th className="p-4 text-right">Contrôles Securitaires</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filteredUsers.length === 0 ? (
                <tr>
                  <td colSpan={6} className="p-8 text-center text-slate-500 italic">
                    Aucun auteur ne correspond à votre recherche littéraire.
                  </td>
                </tr>
              ) : (
                filteredUsers.map((user) => {
                  const isAdminStyle = user.email.toLowerCase() === "johnbikaitsotra@gmail.com";
                  const isSuspended = !!user.isRestricted;
                  return (
                    <tr 
                      key={user.email} 
                      className={`hover:bg-white/[0.02] transition ${
                        isAdminStyle ? "bg-[#C5A059]/2" : ""
                      } ${isSuspended ? "bg-red-950/10 opacity-80" : ""}`}
                    >
                      <td className="p-4">
                        <div>
                          <span className="font-serif font-bold text-[#EAE6E1] flex items-center gap-1.5">
                            {user.displayName}
                            {isAdminStyle && (
                              <span className="text-[9px] bg-[#C5A059]/10 border border-[#C5A059]/30 text-[#C5A059] px-1 rounded font-mono uppercase font-normal">
                                Super
                              </span>
                            )}
                            {isSuspended && (
                              <span className="text-[9px] bg-red-500/15 border border-red-500/30 text-red-400 px-1.5 rounded font-mono uppercase font-normal inline-flex items-center gap-0.5">
                                <Ban className="w-2.5 h-2.5" /> Suspendu
                              </span>
                            )}
                          </span>
                          <span className="text-[10px] text-[#C5A059]/80 font-mono italic block">{user.penName}</span>
                        </div>
                      </td>
                      <td className="p-4 font-mono text-slate-400 select-all">{user.email}</td>
                      <td className="p-4 text-slate-400">
                        {new Date(user.createdAt).toLocaleDateString("fr-FR", {
                          day: "numeric",
                          month: "long",
                          year: "numeric"
                        })}
                      </td>
                      <td className="p-4 text-slate-400 space-y-1">
                        {user.isGoogle ? (
                          <div className="inline-flex items-center gap-1.5 text-blue-400 font-medium">
                            <span className="w-1.5 h-1.5 rounded-full bg-blue-500 animate-pulse" />
                            <span>Google Oauth</span>
                          </div>
                        ) : (
                          <div className="inline-flex items-center gap-1.5 text-[#C5A059]/80">
                            <span className="w-1.5 h-1.5 rounded-full bg-[#C5A059]" />
                            <span>Atelier Plume</span>
                          </div>
                        )}
                        <div>
                          {isSuspended ? (
                            <span className="text-[9px] text-red-400 bg-red-950/40 border border-red-500/15 px-1.5 py-0.5 rounded-md font-sans">
                              Accès Révoqué
                            </span>
                          ) : (
                            <span className="text-[9px] text-[#C5A059] bg-[#C5A059]/5 border border-[#C5A059]/10 px-1.5 py-0.5 rounded-md font-sans">
                              Accès Autorisé
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="p-4 text-center">
                        <span className={`inline-flex items-center justify-center font-mono font-medium rounded-full px-2 py-0.5 text-[11px] ${
                          user.manuscriptsCount > 0 
                            ? "bg-emerald-950/40 text-emerald-400 border border-emerald-500/10" 
                            : "bg-slate-900 text-slate-500 border border-white/5"
                        }`}>
                          {user.manuscriptsCount} draft{user.manuscriptsCount !== 1 ? "s" : ""}
                        </span>
                      </td>
                      <td className="p-4 text-right">
                        {isAdminStyle ? (
                          <span className="text-[10px] font-mono uppercase text-[#C5A059] bg-[#C5A059]/10 px-1.5 py-0.5 rounded border border-[#C5A059]/20 font-bold tracking-wider">
                            Admin
                          </span>
                        ) : (
                          <div className="flex items-center justify-end gap-2">
                            {isSuspended ? (
                              <button
                                onClick={() => {
                                  setSelectedUser(user);
                                  setConfirmAction("unrestrict");
                                }}
                                className="inline-flex items-center gap-1 bg-emerald-950/40 hover:bg-emerald-900/40 text-emerald-400 border border-emerald-500/20 px-2 py-1 rounded-lg text-[10px] uppercase font-mono tracking-wide transition cursor-pointer"
                                title="Réactiver le compte d'auteur"
                              >
                                <UserCheck className="w-3 h-3" />
                                <span>Activer</span>
                              </button>
                            ) : (
                              <button
                                onClick={() => {
                                  setSelectedUser(user);
                                  setConfirmAction("restrict");
                                }}
                                className="inline-flex items-center gap-1 bg-amber-950/40 hover:bg-amber-900/40 text-amber-400 border border-amber-500/20 px-2 py-1 rounded-lg text-[10px] uppercase font-mono tracking-wide transition cursor-pointer"
                                title="Suspendre l'auteur temporairement"
                              >
                                <Ban className="w-3 h-3" />
                                <span>Suspendre</span>
                              </button>
                            )}

                            <button
                              onClick={() => {
                                setSelectedUser(user);
                                setConfirmAction("delete");
                              }}
                              className="inline-flex items-center justify-center bg-red-950/40 hover:bg-red-900/40 text-red-400 border border-red-500/20 p-1.5 rounded-lg transition cursor-pointer"
                              title="Supprimer définitivement l'auteur"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation Modal */}
      {selectedUser && confirmAction && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-fade-in" id="admin_confirm_modal">
          <div className="w-full max-w-sm bg-[#0D0D0D] border border-white/5 rounded-2xl p-6 space-y-5 shadow-2xl relative">
            <div className="absolute top-0 inset-x-0 h-[2px] bg-gradient-to-r from-transparent via-[#C5A059]/30 to-transparent" />
            <div className={`w-12 h-12 rounded-full flex items-center justify-center mx-auto text-xs ${
              confirmAction === "delete" 
                ? "bg-red-500/10 text-red-500 border border-red-500/20" 
                : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
            }`}>
              {confirmAction === "delete" && <Trash2 className="w-5 h-5" />}
              {confirmAction === "restrict" && <Ban className="w-5 h-5" />}
              {confirmAction === "unrestrict" && <UserCheck className="w-5 h-5" />}
            </div>

            <div className="text-center space-y-1">
              <h4 className="text-sm font-serif font-bold text-[#EAE6E1] uppercase tracking-wider">
                {confirmAction === "delete" && "Exclure définitivement ?"}
                {confirmAction === "restrict" && "Suspendre l'auteur ?"}
                {confirmAction === "unrestrict" && "Réactiver le scribe ?"}
              </h4>
              <p className="text-[11px] text-slate-400">
                Auteur ciblé : <span className="font-serif font-bold text-[#C5A059]">{selectedUser.displayName}</span> (<span className="font-mono">{selectedUser.email}</span>)
              </p>
            </div>

            {confirmAction === "delete" && (
              <p className="text-[10px] text-slate-500 text-center leading-relaxed font-sans">
                Cette décision est irréversible. L'intégralité de sa bibliothèque de drafts, ses versions d'historique, ses rapports d'écriture et de statistiques seront purgés de l'Atelier Plume sans possibilité de retour.
              </p>
            )}

            {confirmAction === "restrict" && (
              <p className="text-[10px] text-slate-500 text-center leading-relaxed font-sans">
                Le compte sera instantanément verrouillé. Le scribe ne pourra plus accéder à son tableau de bord ni utiliser l'assistance de Plume jusqu'à sa réhabilitation.
              </p>
            )}

            {confirmAction === "unrestrict" && (
              <p className="text-[10px] text-slate-500 text-center leading-relaxed font-sans">
                La sanction de suspension sera levée immédiatement. L'auteur retrouvera un accès intégral à ses drafts de manuscrits.
              </p>
            )}

            {actionError && (
              <div className="p-2 border border-red-500/10 bg-red-950/20 text-red-400 text-[10px] rounded text-center">
                {actionError}
              </div>
            )}

            <div className="grid grid-cols-2 gap-3 pt-1">
              <button
                disabled={actionLoading}
                onClick={() => {
                  setSelectedUser(null);
                  setConfirmAction(null);
                  setActionError(null);
                }}
                className="py-1.5 bg-[#141414] hover:bg-white/[0.04] text-slate-400 hover:text-white border border-white/5 rounded-lg text-[11px] font-mono tracking-wide uppercase transition cursor-pointer"
              >
                Annuler
              </button>
              
              <button
                disabled={actionLoading}
                onClick={async () => {
                  setActionLoading(true);
                  setActionError(null);
                  try {
                    if (confirmAction === "delete") {
                      await deleteUser(adminEmail, selectedUser.email);
                    } else if (confirmAction === "restrict") {
                      await restrictUser(adminEmail, selectedUser.email, true);
                    } else if (confirmAction === "unrestrict") {
                      await restrictUser(adminEmail, selectedUser.email, false);
                    }
                    await fetchAdminData();
                    setSelectedUser(null);
                    setConfirmAction(null);
                  } catch (err: any) {
                    setActionError(err.message || "Erreur de traitement.");
                  } finally {
                    setActionLoading(false);
                  }
                }}
                className={`py-1.5 text-white rounded-lg text-[11px] font-mono tracking-wide uppercase transition flex items-center justify-center gap-1 cursor-pointer bg-red-700 hover:bg-red-600 border border-red-500/20`}
              >
                {actionLoading && (
                  <svg className="animate-spin h-3.5 w-3.5 text-white" viewBox="0 0 24 24" fill="none">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                  </svg>
                )}
                <span>Confirmer</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Security Guidance panel */}
      <div className="p-4 rounded-xl bg-[#141414] border border-white/5 flex gap-3 text-xs text-slate-400 leading-relaxed">
        <Mail className="w-5 h-5 text-[#C5A059] shrink-0 mt-0.5" />
        <div>
          <p className="font-semibold text-slate-300">Contrôle de Sécurité de l'Atelier</p>
          <p className="mt-1">
            En tant qu'administrateur exclusif, vous avez un accès direct à cette vue d'arrière-boutique. Les données affichées ci-dessus proviennent en temps réel du stockage sécurisé du serveur Express.
          </p>
        </div>
      </div>
    </div>
  );
}
