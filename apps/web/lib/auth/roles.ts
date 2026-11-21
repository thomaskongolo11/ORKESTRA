/**
 * Rôles et décisions d'accès ORKESTRA.
 *
 * Ce fichier ne dépend ni de Next.js ni de Better Auth : les décisions sont des
 * fonctions pures, testées unitairement. Les gardes (guards.ts) les appliquent.
 *
 * Deux dimensions indépendantes :
 *  - le rôle de PLATEFORME (User.platformRole) : SUPER_ADMIN ou aucun ;
 *  - le rôle d'ORGANISATION (Member.role) : CLIENT_ADMIN, MANAGER ou EMPLOYEE.
 * Un rôle d'organisation ne donne jamais accès à l'administration de la plateforme.
 */

export const ORG_ROLES = ["CLIENT_ADMIN", "MANAGER", "EMPLOYEE"] as const;
export type OrgRole = (typeof ORG_ROLES)[number];

export const PLATFORM_ROLES = ["SUPER_ADMIN"] as const;
export type PlatformRole = (typeof PLATFORM_ROLES)[number];

/** Durée maximale d'une session SUPER_ADMIN, quelle que soit son activité. */
export const SUPER_ADMIN_SESSION_MAX_AGE_SECONDS = 8 * 60 * 60;

/** Une action sensible exige une connexion récente (réauthentification). */
export const FRESH_SESSION_MAX_AGE_SECONDS = 10 * 60;

export function isOrgRole(value: unknown): value is OrgRole {
  return typeof value === "string" && (ORG_ROLES as readonly string[]).includes(value);
}

// ─── Permissions applicatives par rôle d'organisation ────────────────────────

export const ORG_PERMISSIONS = {
  "organization:manage": ["CLIENT_ADMIN"],
  "members:manage": ["CLIENT_ADMIN"],
  "members:invite": ["CLIENT_ADMIN"],
  "agents:manage": ["CLIENT_ADMIN"],
  "agents:read": ["CLIENT_ADMIN", "MANAGER", "EMPLOYEE"],
  "tasks:manage": ["CLIENT_ADMIN", "MANAGER"],
  "tasks:read": ["CLIENT_ADMIN", "MANAGER", "EMPLOYEE"],
  "reports:read": ["CLIENT_ADMIN", "MANAGER"],
  "settings:manage": ["CLIENT_ADMIN"],
} as const satisfies Record<string, readonly OrgRole[]>;

export type OrgPermission = keyof typeof ORG_PERMISSIONS;

export function hasOrgPermission(role: OrgRole, permission: OrgPermission): boolean {
  return (ORG_PERMISSIONS[permission] as readonly OrgRole[]).includes(role);
}

/** Rôles qu'un inviteur peut attribuer. SUPER_ADMIN n'est jamais attribuable. */
export function assignableRoles(inviter: { platformRole: PlatformRole | null; orgRole: OrgRole | null }): readonly OrgRole[] {
  if (inviter.platformRole === "SUPER_ADMIN") return ["CLIENT_ADMIN"];
  if (inviter.orgRole === "CLIENT_ADMIN") return ["MANAGER", "EMPLOYEE"];
  return [];
}

// ─── Décisions d'accès ───────────────────────────────────────────────────────

export type SessionFacts = {
  /** Date de création de la session (connexion). */
  createdAt: Date;
  expiresAt: Date;
};

export type UserFacts = {
  platformRole: PlatformRole | null;
  twoFactorEnabled: boolean;
};

export type SuperAdminDecision =
  | { kind: "allow" }
  | { kind: "login" } // pas de session ou session trop ancienne
  | { kind: "unauthorized" } // connecté, mais pas SUPER_ADMIN
  | { kind: "setup-2fa" }; // SUPER_ADMIN sans 2FA activée : aucun accès à /admin

export function decideSuperAdminAccess(
  session: SessionFacts | null,
  user: UserFacts | null,
  now: Date = new Date(),
): SuperAdminDecision {
  if (!session || !user) return { kind: "login" };
  if (session.expiresAt.getTime() <= now.getTime()) return { kind: "login" };
  if (user.platformRole !== "SUPER_ADMIN") return { kind: "unauthorized" };
  const ageSeconds = (now.getTime() - session.createdAt.getTime()) / 1000;
  if (ageSeconds > SUPER_ADMIN_SESSION_MAX_AGE_SECONDS) return { kind: "login" };
  if (!user.twoFactorEnabled) return { kind: "setup-2fa" };
  return { kind: "allow" };
}

export type OrgAccessDecision =
  | { kind: "allow"; organizationId: string; role: OrgRole }
  | { kind: "no-organization" }
  | { kind: "choose-organization" }
  | { kind: "forbidden" };

/**
 * Détermine l'organisation active. L'identifiant vient de la session côté serveur
 * (activeOrganizationId) et l'appartenance est vérifiée sur les données en base,
 * jamais sur une valeur envoyée par le navigateur.
 */
export function decideOrgAccess(
  activeOrganizationId: string | null | undefined,
  memberships: ReadonlyArray<{ organizationId: string; role: string }>,
  requiredRoles?: readonly OrgRole[],
): OrgAccessDecision {
  const valid = memberships.filter((m): m is { organizationId: string; role: OrgRole } => isOrgRole(m.role));
  if (valid.length === 0) return { kind: "no-organization" };

  let membership: { organizationId: string; role: OrgRole } | undefined;
  if (activeOrganizationId) {
    membership = valid.find((m) => m.organizationId === activeOrganizationId);
    // Organisation active dont l'utilisateur n'est (plus) membre : refus.
    if (!membership) return { kind: "forbidden" };
  } else if (valid.length === 1) {
    membership = valid[0];
  } else {
    return { kind: "choose-organization" };
  }
  if (!membership) return { kind: "no-organization" };

  if (requiredRoles && !requiredRoles.includes(membership.role)) return { kind: "forbidden" };
  return { kind: "allow", organizationId: membership.organizationId, role: membership.role };
}

export function isSessionFresh(session: SessionFacts, now: Date = new Date()): boolean {
  return (now.getTime() - session.createdAt.getTime()) / 1000 <= FRESH_SESSION_MAX_AGE_SECONDS;
}

/** Page d'arrivée après une authentification complète. */
export function homePathFor(user: UserFacts): "/admin" | "/overview" {
  return user.platformRole === "SUPER_ADMIN" ? "/admin" : "/overview";
}
