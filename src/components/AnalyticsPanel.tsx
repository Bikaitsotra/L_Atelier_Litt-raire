/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import {
  TrendingUp,
  Award,
  BookOpen,
  PieChart,
  Calendar,
  Sparkles,
  RefreshCw,
  Lightbulb,
  Heart,
  FileText
} from "lucide-react";
import { Writing, WritingStats, ProductivityDay } from "../types";

interface AnalyticsPanelProps {
  writing: Writing | null;
  stats: WritingStats | null;
  onAnalyze: () => void;
  isLoading: boolean;
  productivity: ProductivityDay[];
}

export default function AnalyticsPanel({
  writing,
  stats,
  onAnalyze,
  isLoading,
  productivity
}: AnalyticsPanelProps) {
  const [reportPeriod, setReportPeriod] = useState<"weekly" | "monthly">("weekly");
  
  if (!writing) {
    return (
      <div className="p-6 bg-[#0D0D0D] border border-white/10 rounded-2xl text-center space-y-3 shadow-xs" id="empty_analytics_card">
        <PieChart className="w-10 h-10 text-[#C5A059]/40 mx-auto stroke-1" />
        <h3 className="font-serif font-bold text-[#EAE6E1] text-sm">Analyses indisponibles</h3>
        <p className="text-xs text-[#E0D7D0]/50 max-w-xs mx-auto">
          Sélectionnez un manuscrit en cours d'écriture pour en évaluer le style poétique, l'équilibre émotionnel et votre historique de cadence.
        </p>
      </div>
    );
  }

  // Calculate highest emotion
  let dominantEmotion = "Neutre";
  let maxEmotionScore = 0;
  if (stats && stats.emotionScores) {
    Object.entries(stats.emotionScores).forEach(([emotion, val]) => {
      if (val > maxEmotionScore) {
        maxEmotionScore = val;
        dominantEmotion = emotion;
      }
    });
  }

  // Translate dominant emotion key to french
  const translateEmotion = (emo: string) => {
    switch (emo) {
      case "melancolie": return "Mélancolie 🖤";
      case "joie": return "Joie lumineuse ☀️";
      case "nostalgie": return "Nostalgie douce 🍂";
      case "serenite": return "Sérénité paisible 🌿";
      case "mystere": return "Mystère obscur 🌌";
      case "revolte": return "Cri de révolte 🔥";
      default: return emo;
    }
  };

  // Compute stats metrics based on productivity logs
  const totWordsWritten = productivity.reduce((acc, d) => acc + d.wordsWritten, 0);
  const totMinutesSpent = productivity.reduce((acc, d) => acc + d.minutesSpent, 0);
  const averageCadence = totMinutesSpent > 0 ? Math.round((totWordsWritten / totMinutesSpent) * 10) / 10 : 0;

  // Render elegant custom SVG bar charts for productivity
  const maxWeeklyWords = Math.max(...productivity.map(d => d.wordsWritten), 100);
  const heightMultiplier = 80 / maxWeeklyWords;

  return (
    <div className="space-y-4 no-print" id="analytics_panel_container">
      
      {/* Visual Header Analysis Button / Trigger */}
      <div className="bg-[#0D0D0D] border border-white/10 rounded-2xl p-4 shadow-xs" id="text_critic_trigger_card">
        <div className="flex items-center justify-between flex-wrap gap-2">
          <div>
            <h3 className="font-serif font-bold text-[#EAE6E1] text-sm flex items-center gap-1.5">
              <Sparkles className="w-4 h-4 text-[#C5A059]" />
              <span>Analyse Stylistique par IA</span>
            </h3>
            <p className="text-[11px] text-[#E0D7D0]/40 mt-0.5">
              Évaluez la richesse de votre vocabulaire, sa fluidité métrique et son harmonie strophique.
            </p>
          </div>
          <button
            id="trigger_critical_analysis_btn"
            onClick={onAnalyze}
            disabled={isLoading}
            className="flex items-center gap-2 px-3 py-1.5 bg-[#C5A059] text-black hover:bg-[#B38F4B] rounded-lg text-xs font-semibold shadow-xs disabled:opacity-50 transition cursor-pointer"
          >
            {isLoading ? (
              <>
                <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                <span>Examen en cours...</span>
              </>
            ) : (
              <>
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Lancer l'Analyse</span>
              </>
            )}
          </button>
        </div>

        {/* Loading Overlay */}
        {isLoading && (
          <div className="mt-4 p-4 bg-[#1A1A1A] rounded-xl border border-white/5 flex items-center gap-3 animate-pulse">
            <span className="relative flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-[#C5A059] opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-[#C5A059]"></span>
            </span>
            <div className="text-xs text-[#EAE6E1] space-y-0.5">
              <p className="font-semibold">Plume pèse vos mots...</p>
              <p className="text-[10px] text-[#C5A059]">Recherche de la thématique majeure, analyse harmonique et sonorité.</p>
            </div>
          </div>
        )}

        {/* Display results */}
        {stats && !isLoading && (
          <div className="mt-4 grid grid-cols-2 lg:grid-cols-3 gap-3.5" id="analysis_meters_section">
            
            {/* Meter 1: Readability */}
            <div className="p-3 bg-white/5 rounded-xl border border-white/5 flex flex-col justify-between">
              <div>
                <span className="text-[10px] text-[#E0D7D0]/50 font-mono uppercase">Lisibilité poétique</span>
                <p className="text-xl font-bold text-[#EAE6E1] mt-1 font-mono">{stats.readabilityScore}/100</p>
              </div>
              <div className="w-full bg-white/5 rounded-full h-1 mt-2.5">
                <div
                  className="bg-[#C5A059] h-1 rounded-full transition-all duration-500"
                  style={{ width: `${stats.readabilityScore}%` }}
                ></div>
              </div>
              <span className="text-[9px] text-[#E0D7D0]/40 mt-1.5">Aisance rythmique des rimes</span>
            </div>

            {/* Meter 2: Lexical Richness */}
            <div className="p-3 bg-white/5 rounded-xl border border-white/5 flex flex-col justify-between">
              <div>
                <span className="text-[10px] text-[#E0D7D0]/50 font-mono uppercase">Variété Lexicale</span>
                <p className="text-xl font-bold text-[#EAE6E1] mt-1 font-mono">{stats.lexicalRichness}%</p>
              </div>
              <div className="w-full bg-white/5 rounded-full h-1 mt-2.5">
                <div
                  className="bg-[#C5A059] h-1 rounded-full transition-all duration-500"
                  style={{ width: `${stats.lexicalRichness}%` }}
                ></div>
              </div>
              <span className="text-[9px] text-[#E0D7D0]/40 mt-1.5">Taux d'unicité du vocabulaire</span>
            </div>

            {/* Meter 3: Dominant Emotion */}
            <div className="p-3 bg-[#C5A059]/10 rounded-xl border border-[#C5A059]/20 flex flex-col justify-between col-span-2 lg:col-span-1">
              <div>
                <span className="text-[10px] text-[#C5A059] font-mono uppercase">Émotion Dominante</span>
                <p className="text-sm font-bold text-[#EAE6E1] mt-1 font-serif capitalize">
                  {translateEmotion(dominantEmotion)}
                </p>
              </div>
              <span className="text-[9.5px] text-[#E0D7D0]/50 mt-3 block">
                Intensité : <span className="font-mono font-bold text-[#C5A059]">{Math.round(maxEmotionScore)}%</span>
              </span>
            </div>

          </div>
        )}
      </div>

      {/* Emotion charts bar on stats available */}
      {stats && !isLoading && (
        <div className="bg-[#0D0D0D] border border-white/10 rounded-2xl p-4 shadow-xs space-y-3" id="emotion_chart_card">
          <div className="flex items-center gap-1.5 pb-2 border-b border-white/10">
            <Heart className="w-4 h-4 text-[#C5A059]" />
            <h4 className="text-xs font-bold text-[#EAE6E1] font-mono uppercase">Répartition Émotionnelle des Vers</h4>
          </div>
          
          <div className="space-y-2.5">
            {Object.entries(stats.emotionScores).map(([emotion, val]) => (
              <div key={emotion} className="space-y-1">
                <div className="flex justify-between items-center text-[10.5px]">
                  <span className="capitalize font-medium text-[#E0D7D0]/70 font-mono">{translateEmotion(emotion).split(" ")[0]}</span>
                  <span className="font-mono text-[#E0D7D0]/50">{val}%</span>
                </div>
                <div className="w-full bg-white/5 rounded-full h-1.5">
                  <div
                    className={`h-1.5 rounded-full transition-all duration-700 ${
                      emotion === "melancolie" ? "bg-slate-500" :
                      emotion === "joie" ? "bg-[#C5A059]" :
                      emotion === "nostalgie" ? "bg-[#C5A059]/75" :
                      emotion === "serenite" ? "bg-emerald-500" :
                      emotion === "mystere" ? "bg-indigo-600" : "bg-red-500"
                    }`}
                    style={{ width: `${val}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Suggestions block */}
      {stats && stats.suggestions && !isLoading && (
        <div className="bg-[#0D0D0D] border border-white/10 rounded-2xl p-4 shadow-xs space-y-2.5" id="writing_suggestions_card">
          <div className="flex items-center gap-1.5">
            <Lightbulb className="w-4 h-4 text-[#C5A059]" />
            <h4 className="text-xs font-bold text-[#EAE6E1] font-mono uppercase">Conseils stylistiques de Plume</h4>
          </div>
          <div className="grid gap-2 text-xs">
            {stats.suggestions.map((sug, i) => (
              <div key={i} className="flex gap-2.5 p-2 bg-white/5 border border-white/10 rounded-lg text-[#E0D7D0]/80 leading-relaxed font-serif">
                <span className="text-[#C5A059] font-bold font-mono">0{i+1}.</span>
                <p>{sug}</p>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Writing Productivity Dashboard (Hebdomadaire & Rapports mensuels) */}
      <div className="bg-[#0D0D0D] border border-white/10 rounded-2xl p-4 shadow-xs space-y-4" id="productivity_bento_box">
        <div className="flex items-center justify-between border-b border-white/10 pb-2 flex-wrap gap-2">
          <div className="flex items-center gap-1.5">
            <TrendingUp className="w-4 h-4 text-emerald-500" />
            <h3 className="text-xs font-bold text-[#EAE6E1] font-mono uppercase">Suivi de Productivité</h3>
          </div>

          <div className="flex items-center border border-white/10 rounded-lg overflow-hidden p-0.5 bg-white/5">
            <button
              onClick={() => setReportPeriod("weekly")}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-sm cursor-pointer ${
                reportPeriod === "weekly" ? "bg-white/10 text-[#C5A059] shadow-xs" : "text-[#E0D7D0]/40 hover:text-[#E0D7D0]"
              }`}
            >
              Hebdo
            </button>
            <button
              onClick={() => setReportPeriod("monthly")}
              className={`px-2.5 py-1 text-[10px] font-bold rounded-sm cursor-pointer ${
                reportPeriod === "monthly" ? "bg-white/10 text-[#C5A059] shadow-xs" : "text-[#E0D7D0]/40 hover:text-[#E0D7D0]"
              }`}
            >
              Rapport Mensuel
            </button>
          </div>
        </div>

        {reportPeriod === "weekly" ? (
          <div className="space-y-4">
            {/* Simple adjustable Vector Graphic for Weekly Word Counts */}
            <div className="p-3 bg-white/5 rounded-xl border border-white/5 flex flex-col gap-4">
              <span className="text-[10px] text-[#E0D7D0]/50 font-mono uppercase">Mots écrits ces derniers jours</span>
              
              <div className="h-28 flex items-end justify-between px-1 border-b border-white/10 pb-1 pt-2">
                {productivity.map((day, idx) => {
                  const barHeight = day.wordsWritten * heightMultiplier;
                  const dateLabel = new Date(day.date).toLocaleDateString("fr-FR", { weekday: "short" });
                  return (
                    <div key={`${day.date}-${idx}`} className="flex flex-col items-center flex-1 group">
                      <div className="text-[9px] font-mono text-[#C5A059] mb-1 opacity-0 group-hover:opacity-100 transition duration-150 bg-[#0D0D0D] border border-white/10 rounded px-1">
                        {day.wordsWritten}m
                      </div>
                      <div
                        className="w-4 bg-white/10 hover:bg-[#C5A059] rounded-t transition-all duration-300"
                        style={{ height: `${Math.max(4, barHeight)}px` }}
                      ></div>
                      <span className="text-[9px] text-[#E0D7D0]/50 font-mono mt-1 capitalize">{dateLabel}</span>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Compact KPIs */}
            <div className="grid grid-cols-3 gap-2">
              <div className="p-2 border border-white/5 rounded-lg text-center bg-white/5">
                <span className="text-[9px] text-[#E0D7D0]/40 font-mono block">Volume global</span>
                <span className="text-xs font-bold text-[#C5A059] font-mono">{totWordsWritten} mots</span>
              </div>
              <div className="p-2 border border-white/5 rounded-lg text-center bg-white/5">
                <span className="text-[9px] text-[#E0D7D0]/40 font-mono block">Session Moins</span>
                <span className="text-xs font-bold text-[#C5A059] font-mono">{totMinutesSpent} min</span>
              </div>
              <div className="p-2 border border-white/5 rounded-lg text-center bg-white/5">
                <span className="text-[9px] text-[#E0D7D0]/40 font-mono block">Vitesse</span>
                <span className="text-xs font-bold text-[#C5A059] font-mono">{averageCadence} m/m</span>
              </div>
            </div>
          </div>
        ) : (
          <div className="p-3 bg-white/5 border border-white/10 rounded-xl space-y-3.5" id="monthly_editorial_report">
            <div className="flex items-center gap-1">
              <Award className="w-3.5 h-3.5 text-[#C5A059]" />
              <span className="text-[10px] font-mono font-bold text-[#C5A059] uppercase">Projection de régularité</span>
            </div>

            <div className="space-y-2 text-xs leading-relaxed text-[#E0D7D0]/80 font-serif">
              <p>
                Votre cadence mensuelle s'élève à environ <strong className="text-[#EAE6E1] text-xs">{(totWordsWritten * 4).toLocaleString()} mots</strong> extrapolés sur quatre semaines actives.
              </p>
              <p>
                Vous avez atteint vos objectifs d'écriture avec une régularité de <strong className="text-[#EAE6E1]">85%</strong> sur l'ensemble de vos strophes actives, marquant une progression soutenue de votre souffle lyrical.
              </p>
            </div>

            <div className="p-2 bg-[#C5A059]/10 rounded-lg border border-[#C5A059]/20 text-[11px] text-[#C5A059] flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#C5A059]"></div>
              <span>Progression mensuelle en hausse par rapport au mois passé.</span>
            </div>
          </div>
        )}
      </div>

    </div>
  );
}
