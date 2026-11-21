/**
 * Gardes côté serveur ORKESTRA.
 *
 * À appeler dans CHAQUE page, layout, action serveur et route API protégée.
 * `proxy.ts` ne fait qu'une redirection rapide : il ne remplace jamais ces gardes.
 *
 * Les rôles et le statut 2FA sont relus en base à chaque appel (jamais depuis un
 * cookie ou une valeur envoyée par le navigateur).
 */
import { prisma } from "@orkestra/database";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { NextResponse } from "next/server";
import { cache } from "react";
import { auth } from "./auth";
import {
  decideOrgAccess,
  decideSuperAdminAccess,
  isSessionFresh,
  type OrgRole,
  type PlatformRole,
} from "./roles";

export type CurrentSession = NonNullable<Awaited<ReturnType<typeof auth.api.getSession>>>;

/** Session courante, lue en base (cache de cookie désactivé). Mise en cache le temps d'une requête. */
export const getCurrentSession = cache(async (): Promise<CurrentSession | null> => {
  return auth.api.getSession({ headers: await headers(), query: { disableCookieCache: true } });
});

async function loadUserFacts(userId: string) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { platformRole: true, twoFactorEnabled: true },
  });
  return user ? { platformRole: (user.platformRole ?? null) as PlatformRole | null, twoFactorEnabled: Boolean(user.twoFactorEnabled) } : null;
}

// ─── Pages et actions serveur (redirections) ─────────────────────────────────

export async function requireUser(): Promise<CurrentSession> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  return session;
}

/** Accès à /admin : SUPER_ADMIN, 2FA activée, session de moins de 8 h. */
export async function requireSuperAdmin(): Promise<CurrentSession> {
  const session = await getCurrentSession();
  const user = session ? await loadUserFacts(session.user.id) : null;
  const decision = decideSuperAdminAccess(session ? session.session : null, user);

  switch (decision.kind) {
    case "allow":
      return session as CurrentSession;
    case "login":
      if (session) {
        // Session SUPER_ADMIN trop ancienne : révoquée en base.
        await prisma.session.deleteMany({ where: { id: session.session.id } });
      }
      redirect("/login?reason=session-expired");
    case "setup-2fa":
      redirect("/two-factor/setup");
    case "unauthorized":
      redirect("/unauthorized");
  }
}

export type OrgContext = {
  session: CurrentSession;
  organizationId: string;
  role: OrgRole;
};

/**
 * Contexte d'organisation pour l'espace client. L'organisation vient de la session
 * côté serveur, et l'appartenance est vérifiée en base à chaque appel.
 */
export async function requireOrgContext(requiredRoles?: readonly OrgRole[]): Promise<OrgContext> {
  const session = await requireUser();
  const user = await loadUserFacts(session.user.id);
  if (user?.platformRole === "SUPER_ADMIN") redirect("/admin");

  const memberships = await prisma.member.findMany({
    where: { userId: session.user.id },
    select: { organizationId: true, role: true },
  });
  const decision = decideOrgAccess(session.session.activeOrganizationId, memberships, requiredRoles);

  switch (decision.kind) {
    case "allow":
      return { session, organizationId: decision.organizationId, role: decision.role };
    case "choose-organization":
      redirect("/unauthorized?reason=choose-organization");
    case "no-organization":
    case "forbidden":
      redirect("/unauthorized");
  }
}

/** Les actions sensibles exigent une connexion de moins de 10 minutes. */
export async function requireFreshSession(): Promise<CurrentSession> {
  const session = await requireUser();
  if (!isSessionFresh(session.session)) redirect("/login?reason=reauthenticate");
  return session;
}

// ─── Routes API (réponses JSON 401 / 403) ────────────────────────────────────

type ApiResult<T> = { ok: true; value: T } | { ok: false; response: NextResponse };

const unauthorized = () => NextResponse.json({ error: "unauthorized" }, { status: 401 });
const forbidden = () => NextResponse.json({ error: "forbidden" }, { status: 403 });

export async function authorizeSuperAdminApi(): Promise<ApiResult<CurrentSession>> {
  const session = await getCurrentSession();
  const user = session ? await loadUserFacts(session.user.id) : null;
  const decision = decideSuperAdminAccess(session ? session.session : null, user);
  if (decision.kind === "allow") return { ok: true, value: session as CurrentSession };
  return { ok: false, response: decision.kind === "login" ? unauthorized() : forbidden() };
}

export async function authorizeOrgApi(requiredRoles?: readonly OrgRole[]): Promise<ApiResult<OrgContext>> {
  const session = await getCurrentSession();
  if (!session) return { ok: false, response: unauthorized() };
  const memberships = await prisma.member.findMany({
    where: { userId: session.user.id },
    select: { organizationId: true, role: true },
  });
  const decision = decideOrgAccess(session.session.activeOrganizationId, memberships, requiredRoles);
  if (decision.kind !== "allow") return { ok: false, response: forbidden() };
  return { ok: true, value: { session, organizationId: decision.organizationId, role: decision.role } };
}
