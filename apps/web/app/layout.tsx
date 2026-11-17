import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "ORKESTRA", template: "%s · ORKESTRA" },
  description: "Your business. Orchestrated.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: "#101827",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="fr">
      <body className="min-h-dvh">{children}</body>
    </html>
  );
}
