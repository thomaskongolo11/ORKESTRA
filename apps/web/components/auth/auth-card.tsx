import type { ReactNode } from "react";

/** En-tête commun des pages d'authentification. */
export function AuthHeading({ title, description }: { title: string; description?: ReactNode }) {
  return (
    <div className="mb-7">
      <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-navy">{title}</h1>
      {description && <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{description}</p>}
    </div>
  );
}

export function FieldError({ id, children }: { id: string; children?: ReactNode }) {
  if (!children) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {children}
    </p>
  );
}
