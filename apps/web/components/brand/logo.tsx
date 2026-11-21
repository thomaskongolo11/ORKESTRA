import { cn } from "@/lib/utils";

/**
 * Symbole ORKESTRA : trois agents (points) reliés à un centre — l'orchestration.
 * Dessin original, provisoire en attendant un logo définitif.
 */
export function LogoMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 40 40" className={cn("size-9", className)} role="img" aria-label="ORKESTRA">
      <rect width="40" height="40" rx="10" fill="#233B5D" />
      <circle cx="20" cy="20" r="11" fill="none" stroke="#5B8DEF" strokeOpacity="0.35" strokeWidth="1.5" />
      <path d="M20 20 L20 9 M20 20 L29.5 25.5 M20 20 L10.5 25.5" stroke="#5B8DEF" strokeWidth="1.5" strokeLinecap="round" />
      <circle cx="20" cy="9" r="2.6" fill="#F2F4F7" />
      <circle cx="29.5" cy="25.5" r="2.6" fill="#F2F4F7" />
      <circle cx="10.5" cy="25.5" r="2.6" fill="#F2F4F7" />
      <circle cx="20" cy="20" r="3.4" fill="#5B8DEF" />
    </svg>
  );
}

export function Logo({ className, tone = "light" }: { className?: string; tone?: "light" | "dark" }) {
  return (
    <span className={cn("inline-flex items-center gap-3", className)}>
      <LogoMark />
      <span
        className={cn(
          "text-[17px] font-semibold tracking-[0.28em]",
          tone === "light" ? "text-white" : "text-navy",
        )}
      >
        ORKESTRA
      </span>
    </span>
  );
}
