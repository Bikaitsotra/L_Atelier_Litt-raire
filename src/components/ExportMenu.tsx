/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState } from "react";
import { Download, FileText, FileCode, Printer, Check, ChevronDown } from "lucide-react";
import { Writing } from "../types";

interface ExportMenuProps {
  writing: Writing;
  zenMode?: boolean;
}

export default function ExportMenu({ writing, zenMode = false }: ExportMenuProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [copied, setCopied] = useState(false);

  const exportMarkdown = () => {
    const meta = `---
title: "${writing.title}"
themes: [${writing.themes.map(t => `"${t}"`).join(", ")}]
emotions: [${writing.emotions.map(e => `"${e}"`).join(", ")}]
createdAt: "${writing.createdAt}"
updatedAt: "${writing.updatedAt}"
---

# ${writing.title}

${writing.content}

---
*Généré sur L'Atelier Littéraire*
`;
    triggerDownload(meta, `${writing.title.toLowerCase().replace(/\s+/g, "_")}.md`, "text/markdown");
    setIsOpen(false);
  };

  const exportWord = () => {
    const formattedContent = writing.content.replace(/\n/g, "<br/>");
    const html = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
<head>
<meta charset="utf-8">
<style>
  body {
    font-family: 'Georgia', serif;
    line-height: 1.8;
    color: #2D3748;
    margin: 1.5in 1in;
  }
  h1 {
    font-size: 26pt;
    text-align: center;
    font-weight: normal;
    margin-bottom: 8pt;
    color: #1A202C;
  }
  .meta {
    text-align: center;
    font-style: italic;
    color: #718096;
    font-size: 10pt;
    margin-bottom: 40pt;
  }
  .poetry {
    text-align: center;
    font-size: 12pt;
    white-space: pre-line;
  }
</style>
</head>
<body>
  <h1>${writing.title}</h1>
  <div class="meta">Thématiques : ${writing.themes.join(", ") || "Aucune"} | Émotions : ${writing.emotions.join(", ") || "Aucune"}</div>
  <div class="poetry">
    ${formattedContent}
  </div>
</body>
</html>`;

    triggerDownload(html, `${writing.title.toLowerCase().replace(/\s+/g, "_")}.doc`, "application/msword");
    setIsOpen(false);
  };

  const triggerDownload = (content: string, filename: string, mimeType: string) => {
    const blob = new Blob([content], { type: `${mimeType};charset=utf-8;` });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const printPdf = () => {
    // Generate specialized print window or trigger standard print stylesheet
    window.print();
    setIsOpen(false);
  };

  return (
    <div className="relative inline-block text-left no-print" id="export_dropdown_container">
      <button
        id="export_menu_btn"
        onClick={() => setIsOpen(!isOpen)}
        className={`flex items-center text-xs font-medium text-[#E0D7D0] bg-white/5 border border-white/10 rounded-lg hover:border-[#C5A059]/45 hover:bg-white/10 transition active:scale-95 cursor-pointer shadow-xs ${
          zenMode ? "px-1.5 py-1 text-[10px] gap-1" : "px-3.5 py-1.5 gap-2"
        }`}
      >
        <Download className={`${zenMode ? "w-3 h-3" : "w-3.5 h-3.5"} text-[#C5A059]`} />
        <span className="hidden lg:inline">Exporter</span>
        <ChevronDown className={`${zenMode ? "w-3 h-3" : "w-3.5 h-3.5"} text-[#E0D7D0]/40 hidden lg:inline`} />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-10"
            onClick={() => setIsOpen(false)}
          />
          <div
            id="export_menu_items"
            className="absolute right-0 mt-1.5 w-48 origin-top-right rounded-lg bg-[#0D0D0D] border border-white/10 shadow-lg ring-1 ring-black/5 focus:outline-hidden z-20 overflow-hidden"
          >
            <div className="py-1">
              <button
                id="export_md_btn"
                onClick={exportMarkdown}
                className="flex items-center gap-2.5 w-full px-4 py-2 text-xs text-left text-[#EAE6E1] hover:bg-white/5 transition cursor-pointer"
              >
                <FileCode className="w-3.5 h-3.5 text-[#C5A059]" />
                <span>Format Markdown (.md)</span>
              </button>
              <button
                id="export_doc_btn"
                onClick={exportWord}
                className="flex items-center gap-2.5 w-full px-4 py-2 text-xs text-left text-[#EAE6E1] hover:bg-white/5 transition cursor-pointer"
              >
                <FileText className="w-3.5 h-3.5 text-[#C5A059]" />
                <span>Format MS Word (.doc)</span>
              </button>
              <button
                id="export_pdf_btn"
                onClick={printPdf}
                className="flex items-center gap-2.5 w-full px-4 py-2 text-xs text-left text-[#EAE6E1] hover:bg-white/5 border-t border-white/10 transition cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5 text-[#C5A059]" />
                <span>Impression / PDF (.pdf)</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
