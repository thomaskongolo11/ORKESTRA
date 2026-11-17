import { describe, expect, it } from "vitest";
import { authEnvSchema } from "../../packages/validation/schemas/auth-env";
import { isOAuthCallbackPath } from "../../apps/web/lib/auth/hooks";
import {
  ORG_PERMISSIONS,
  assignableRoles,
  decideOrgAccess,
  decideSuperAdminAccess,
  hasOrgPermission,
  homePathFor,
  isSessionFresh,
} from "../../apps/web/lib/auth/roles";

const NOW = new Date("2026-11-17T12:00:00Z");
const minutesAgo = (m: number) => new Date(NOW.getTime() - m * 60_000);
const inHours = (h: number) => new Date(NOW.getTime() + h * 3_600_000);

describe("decideSuperAdminAccess", () => {
  const freshSession = { createdAt: minutesAgo(5), expiresAt: inHours(7) };
  const superAdmin2fa = { platformRole: "SUPER_ADMIN" as const, twoFactorEnabled: true };

  it("autorise un SUPER_ADMIN avec 2FA et session récente", () => {
    expect(decideSuperAdminAccess(freshSession, superAdmin2fa, NOW)).toEqual({ kind: "allow" });
  });

  it("exige l'activation de la 2FA avant tout accès", () => {
    expect(decideSuperAdminAccess(freshSession, { ...superAdmin2fa, twoFactorEnabled: false }, NOW)).toEqual({
      kind: "setup-2fa",
    });
  });

  it("refuse un utilisateur sans rôle de plateforme, même CLIENT_ADMIN d'une organisation", () => {
    expect(decideSuperAdminAccess(freshSession, { platformRole: null, twoFactorEnabled: true }, NOW)).toEqual({
      kind: "unauthorized",
    });
  });

  it("renvoie vers la connexion sans session, avec session expirée ou de plus de 8 h", () => {
    expect(decideSuperAdminAccess(null, null, NOW)).toEqual({ kind: "login" });
    expect(decideSuperAdminAccess({ createdAt: minutesAgo(5), expiresAt: minutesAgo(1) }, superAdmin2fa, NOW)).toEqual({
      kind: "login",
    });
    expect(decideSuperAdminAccess({ createdAt: minutesAgo(8 * 60 + 1), expiresAt: inHours(24) }, superAdmin2fa, NOW)).toEqual({
      kind: "login",
    });
  });
});

describe("decideOrgAccess — isolation entre organisations", () => {
  const memberships = [{ organizationId: "org_a", role: "MANAGER" }];

  it("autorise l'organisation dont l'utilisateur est membre", () => {
    expect(decideOrgAccess("org_a", memberships)).toEqual({ kind: "allow", organizationId: "org_a", role: "MANAGER" });
  });

  it("refuse une organisation active dont l'utilisateur n'est pas membre", () => {
    expect(decideOrgAccess("org_b", memberships)).toEqual({ kind: "forbidden" });
  });

  it("choisit automatiquement l'unique organisation, demande un choix s'il y en a plusieurs", () => {
    expect(decideOrgAccess(null, memberships)).toMatchObject({ kind: "allow", organizationId: "org_a" });
    expect(
      decideOrgAccess(null, [...memberships, { organizationId: "org_c", role: "EMPLOYEE" }]),
    ).toEqual({ kind: "choose-organization" });
  });

  it("refuse si le rôle requis n'est pas atteint", () => {
    expect(decideOrgAccess("org_a", memberships, ["CLIENT_ADMIN"])).toEqual({ kind: "forbidden" });
  });

  it("ignore un rôle inconnu (ex. SUPER_ADMIN injecté) au lieu de l'accepter", () => {
    expect(decideOrgAccess("org_a", [{ organizationId: "org_a", role: "SUPER_ADMIN" }])).toEqual({
      kind: "no-organization",
    });
  });
});

describe("Rôles et permissions", () => {
  it("aucun inviteur ne peut attribuer SUPER_ADMIN", () => {
    const cases = [
      assignableRoles({ platformRole: "SUPER_ADMIN", orgRole: null }),
      assignableRoles({ platformRole: null, orgRole: "CLIENT_ADMIN" }),
      assignableRoles({ platformRole: null, orgRole: "MANAGER" }),
      assignableRoles({ platformRole: null, orgRole: "EMPLOYEE" }),
    ];
    for (const roles of cases) expect(roles).not.toContain("SUPER_ADMIN");
    expect(cases[0]).toEqual(["CLIENT_ADMIN"]);
    expect(cases[1]).toEqual(["MANAGER", "EMPLOYEE"]);
    expect(cases[2]).toEqual([]);
    expect(cases[3]).toEqual([]);
  });

  it("un EMPLOYEE ne peut ni gérer les membres, ni les agents, ni les paramètres", () => {
    expect(hasOrgPermission("EMPLOYEE", "members:manage")).toBe(false);
    expect(hasOrgPermission("EMPLOYEE", "agents:manage")).toBe(false);
    expect(hasOrgPermission("EMPLOYEE", "settings:manage")).toBe(false);
    expect(hasOrgPermission("EMPLOYEE", "tasks:read")).toBe(true);
  });

  it("seul CLIENT_ADMIN peut inviter", () => {
    expect(ORG_PERMISSIONS["members:invite"]).toEqual(["CLIENT_ADMIN"]);
  });

  it("redirige SUPER_ADMIN vers /admin, les autres vers /overview", () => {
    expect(homePathFor({ platformRole: "SUPER_ADMIN", twoFactorEnabled: true })).toBe("/admin");
    expect(homePathFor({ platformRole: null, twoFactorEnabled: false })).toBe("/overview");
  });

  it("une session est « récente » pendant 10 minutes", () => {
    expect(isSessionFresh({ createdAt: minutesAgo(9), expiresAt: inHours(1) }, NOW)).toBe(true);
    expect(isSessionFresh({ createdAt: minutesAgo(11), expiresAt: inHours(1) }, NOW)).toBe(false);
  });
});

describe("Détection des retours OAuth", () => {
  it("reconnaît les chemins de retour Google / Microsoft", () => {
    expect(isOAuthCallbackPath("/callback/google")).toBe(true);
    expect(isOAuthCallbackPath("/callback/microsoft")).toBe(true);
    expect(isOAuthCallbackPath("/oauth2/callback/x")).toBe(true);
    expect(isOAuthCallbackPath("/sign-in/email")).toBe(false);
    expect(isOAuthCallbackPath("/two-factor/verify-totp")).toBe(false);
    expect(isOAuthCallbackPath(undefined)).toBe(false);
  });
});

describe("Variables d'environnement de l'authentification", () => {
  const base = { BETTER_AUTH_SECRET: "x".repeat(32), BETTER_AUTH_URL: "http://localhost:3000" };

  it("accepte une configuration minimale valide", () => {
    expect(authEnvSchema.safeParse(base).success).toBe(true);
  });

  it("refuse un secret trop court", () => {
    expect(authEnvSchema.safeParse({ ...base, BETTER_AUTH_SECRET: "court" }).success).toBe(false);
  });

  it("refuse un identifiant Google sans son secret", () => {
    expect(authEnvSchema.safeParse({ ...base, GOOGLE_CLIENT_ID: "id" }).success).toBe(false);
  });
});
