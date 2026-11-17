import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";

export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      {/* Panneau de marque (écrans larges) */}
      <aside className="relative hidden overflow-hidden bg-navy text-white lg:flex lg:flex-col lg:justify-between lg:p-12">
        <div
          aria-hidden
          className="pointer-events-none absolute inset-0 opacity-[0.07]"
          style={{
            backgroundImage:
              "linear-gradient(#F2F4F7 1px, transparent 1px), linear-gradient(90deg, #F2F4F7 1px, transparent 1px)",
            backgroundSize: "48px 48px",
          }}
        />
        <div
          aria-hidden
          className="pointer-events-none absolute -bottom-40 -left-24 size-[520px] rounded-full bg-electric/20 blur-3xl"
        />
        <Logo className="relative" />
        <div className="relative max-w-md">
          <p className="text-4xl leading-tight font-semibold tracking-tight">
            Your business.
            <br />
            <span className="text-electric">Orchestrated.</span>
          </p>
          <p className="mt-5 text-base leading-relaxed text-white/65">
            Des agents IA spécialisés prennent en charge les tâches administratives répétitives. Vous gardez la main sur
            chaque décision.
          </p>
        </div>
        <p className="relative text-xs text-white/40">© {new Date().getFullYear()} ORKESTRA</p>
      </aside>

      {/* Zone du formulaire */}
      <main className="flex flex-col">
        <header className="flex items-center bg-navy px-6 py-4 lg:hidden">
          <Logo />
        </header>
        <div className="flex flex-1 items-center justify-center px-6 py-10 sm:px-10">
          <div className="w-full max-w-[400px] animate-fade-in">{children}</div>
        </div>
      </main>
    </div>
  );
}
