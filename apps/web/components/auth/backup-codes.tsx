"use client";

import { Check, Copy, Download } from "lucide-react";
import { useState } from "react";
import { Button } from "@/components/ui/button";

/** Affichage unique des codes de récupération, avec copie et téléchargement. */
export function BackupCodesList({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(codes.join("\n"));
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  function download() {
    const content = [
      "ORKESTRA — Codes de récupération",
      `Générés le ${new Date().toLocaleString("fr-BE")}`,
      "Chaque code ne fonctionne qu'une seule fois. Conservez ce fichier en lieu sûr.",
      "",
      ...codes,
    ].join("\n");
    const url = URL.createObjectURL(new Blob([content], { type: "text/plain;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "orkestra-codes-recuperation.txt";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-3">
      <ul className="grid grid-cols-2 gap-2 rounded-lg border bg-card p-4 font-mono text-sm text-navy" aria-label="Codes de récupération">
        {codes.map((c) => (
          <li key={c} className="rounded bg-mist px-2 py-1.5 text-center tracking-wider">
            {c}
          </li>
        ))}
      </ul>
      <div className="grid grid-cols-2 gap-3">
        <Button type="button" variant="outline" onClick={copy}>
          {copied ? <Check /> : <Copy />}
          {copied ? "Copiés" : "Copier"}
        </Button>
        <Button type="button" variant="outline" onClick={download}>
          <Download />
          Télécharger
        </Button>
      </div>
    </div>
  );
}
