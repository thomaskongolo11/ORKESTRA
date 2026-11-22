import Link from "next/link";
import type { ReactNode } from "react";
import { Logo } from "@/components/brand/logo";
import { SignOutButton } from "@/components/auth/sign-out-button";

/**
 * Cadre provisoire des pages connectées (lot D).
 * Il sera remplacé par la navigation latérale des tableaux de bord au lot E.
 */
export function SimpleShell({
  title,
  subtitle,
  email,
  nav,
  children,
}: {
  title: string;
  subtitle?: string;
  email: string;
  nav: { href: string; label: string }[];
  children: ReactNode;
}) {
  return (
    <div className="min-h-dvh bg-background">
      <header className="bg-navy text-white">
        <div className="mx-auto flex max-w-6xl flex-wrap items-center gap-x-8 gap-y-3 px-6 py-4">
          <Link href="/auth/callback" aria-label="Accueil ORKESTRA">
            <Logo />
          </Link>
          <nav className="flex flex-1 flex-wrap gap-1 text-sm">
            {nav.map((item) => (
              <Link key={item.href} href={item.href} className="rounded-md px-3 py-1.5 text-white/75 hover:bg-white/10 hover:text-white">
                {item.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-3">
            <span className="hidden text-sm text-white/60 sm:inline">{email}</span>
            <div className="w-40">
              <SignOutButton variant="ghost" className="text-white/80 hover:bg-white/10 hover:text-white" />
            </div>
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-6 py-10">
        <div className="mb-8">
          <h1 className="text-[26px] font-semibold tracking-tight text-navy">{title}</h1>
          {subtitle && <p className="mt-1 text-[15px] text-muted-foreground">{subtitle}</p>}
        </div>
        {children}
      </main>
    </div>
  );
}

export function Panel({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border bg-card p-6 shadow-xs">
      <h2 className="font-semibold text-navy">{title}</h2>
      {description && <p className="mt-1 text-sm text-muted-foreground">{description}</p>}
      <div className="mt-5">{children}</div>
    </section>
  );
}
