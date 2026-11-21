// Tests d'intégration du module d'authentification (lot B), sur une vraie base PostgreSQL,
// en appelant le vrai Better Auth (API serveur et gestionnaire HTTP).
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cookieHeaderFrom, headersWithCookie, secretFromTotpUri, totpCode, uniqueIp, uniqueSuffix } from "./helpers";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)("Authentification ORKESTRA (lot B)", () => {
  let auth: typeof import("../../apps/web/lib/auth/auth").auth;
  let superAdminLib: typeof import("../../apps/web/lib/auth/super-admin");
  let hooksLib: typeof import("../../apps/web/lib/auth/hooks");
  let prisma: typeof import("../../packages/database/client").prisma;

  const suffix = uniqueSuffix();
  const createdUserIds: string[] = [];
  const createdOrgIds: string[] = [];

  /** Utilisateur ordinaire créé directement en base (l'inscription publique est fermée). */
  async function createRegularUser(email: string, password: string): Promise<string> {
    const ctx = await auth.$context;
    const id = randomBytes(16).toString("hex");
    await prisma.user.create({ data: { id, name: "Utilisateur test", email, emailVerified: true } });
    await prisma.account.create({
      data: { id: randomBytes(16).toString("hex"), accountId: id, providerId: "credential", userId: id, password: await ctx.password.hash(password) },
    });
    createdUserIds.push(id);
    return id;
  }

  async function signIn(email: string, password: string) {
    const { headers, response } = await auth.api.signInEmail({ body: { email, password }, returnHeaders: true });
    return { cookie: cookieHeaderFrom(headers), response: response as Record<string, unknown> };
  }

  /** Requête HTTP réelle vers /api/auth/* (active la limitation des tentatives). */
  function httpPost(path: string, body: unknown, ip: string, cookie = ""): Promise<Response> {
    return auth.handler(
      new Request(`http://localhost:3000/api/auth${path}`, {
        method: "POST",
        headers: { "content-type": "application/json", "x-forwarded-for": ip, origin: "http://localhost:3000", cookie },
        body: JSON.stringify(body),
      }),
    );
  }

  beforeAll(async () => {
    ({ auth } = await import("../../apps/web/lib/auth/auth"));
    superAdminLib = await import("../../apps/web/lib/auth/super-admin");
    hooksLib = await import("../../apps/web/lib/auth/hooks");
    ({ prisma } = await import("../../packages/database/client"));
  });

  afterAll(async () => {
    // Le journal d'audit est volontairement conservé (ajout seul).
    await prisma.member.deleteMany({ where: { organizationId: { in: createdOrgIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: createdOrgIds } } });
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  // ─── Inscription ──────────────────────────────────────────────────────────

  describe("Inscription sur invitation uniquement", () => {
    it("refuse l'inscription publique par e-mail", async () => {
      await expect(
        auth.api.signUpEmail({ body: { email: `public-${suffix}@orkestra.test`, password: "MotDePasse-Tres-Long-1", name: "X" } }),
      ).rejects.toThrow();
      expect(await prisma.user.count({ where: { email: `public-${suffix}@orkestra.test` } })).toBe(0);
    });

    it("refuse la création d'un compte via Google ou Microsoft et l'enregistre dans l'audit", async () => {
      const hooks = hooksLib.createAuthHooks(prisma);
      const email = `oauth-${suffix}@orkestra.test`;
      const result = await hooks.validateUserInfo(
        { user: { email }, source: { action: "create-user", method: "oauth", oauth: { providerId: "google" } } },
        null,
      );
      expect(result).toMatchObject({ error: "invitation_required" });
      expect(await prisma.auditLog.count({ where: { action: "auth.signup.blocked", targetId: email } })).toBe(1);
    });
  });

  // ─── SUPER_ADMIN ──────────────────────────────────────────────────────────

  describe("SUPER_ADMIN", () => {
    const email = `admin-${suffix}@orkestra.test`;
    const password = "Orkestra-Admin-2026!";
    let userId = "";
    let totpSecret = "";
    let backupCodes: string[] = [];

    it("est créé par le script avec un mot de passe haché et une entrée d'audit", async () => {
      const result = await superAdminLib.createSuperAdmin({ email: email.toUpperCase(), name: "Admin Test", password });
      userId = result.userId;
      createdUserIds.push(userId);

      const user = await prisma.user.findUniqueOrThrow({ where: { id: userId } });
      expect(user.email).toBe(email);
      expect(user.platformRole).toBe("SUPER_ADMIN");
      expect(user.emailVerified).toBe(true);

      const account = await prisma.account.findFirstOrThrow({ where: { userId, providerId: "credential" } });
      expect(account.password).toBeTruthy();
      expect(account.password).not.toContain(password);
      expect(await prisma.auditLog.count({ where: { action: "auth.super_admin.created", targetId: userId } })).toBe(1);
    });

    it("refuse un doublon et un mot de passe faible", async () => {
      await expect(superAdminLib.createSuperAdmin({ email, name: "Doublon", password })).rejects.toThrow(/existe déjà/);
      await expect(
        superAdminLib.createSuperAdmin({ email: `faible-${suffix}@orkestra.test`, name: "Faible", password: "court" }),
      ).rejects.toThrow(/12 caractères/);
    });

    it("sans 2FA : session limitée à 8 h, accès /admin refusé tant que la 2FA n'est pas activée", async () => {
      const { cookie } = await signIn(email, password);
      const session = await auth.api.getSession({ headers: headersWithCookie(cookie) });
      expect(session?.user.id).toBe(userId);
      const maxExpiry = Date.now() + 8 * 3_600_000 + 60_000;
      expect(new Date(session!.session.expiresAt).getTime()).toBeLessThanOrEqual(maxExpiry);

      const { decideSuperAdminAccess } = await import("../../apps/web/lib/auth/roles");
      expect(decideSuperAdminAccess(session!.session, { platformRole: "SUPER_ADMIN", twoFactorEnabled: false })).toEqual({
        kind: "setup-2fa",
      });
    });

    it("active la 2FA après vérification d'un code ; secret et codes de récupération chiffrés en base", async () => {
      const { cookie } = await signIn(email, password);
      const enabled = await auth.api.enableTwoFactor({ body: { password }, headers: headersWithCookie(cookie) });
      if (enabled.method !== "totp") throw new Error("La méthode TOTP était attendue");
      totpSecret = secretFromTotpUri(enabled.totpURI);
      backupCodes = enabled.backupCodes;
      expect(backupCodes.length).toBeGreaterThanOrEqual(8);

      // Pas encore activée tant que le premier code n'est pas vérifié.
      expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).twoFactorEnabled).toBe(false);

      await auth.api.verifyTOTP({ body: { code: totpCode(totpSecret) }, headers: headersWithCookie(cookie) });
      expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).twoFactorEnabled).toBe(true);

      const stored = await prisma.twoFactor.findFirstOrThrow({ where: { userId } });
      expect(stored.secret).not.toContain(totpSecret);
      for (const code of backupCodes) expect(stored.backupCodes).not.toContain(code);
    });

    it("avec 2FA : le mot de passe seul ne crée aucune session, le code TOTP la crée", async () => {
      const sessionsBefore = await prisma.session.count({ where: { userId } });
      const { cookie, response } = await signIn(email, password);
      expect(response.twoFactorRedirect).toBe(true);
      expect(await prisma.session.count({ where: { userId } })).toBe(sessionsBefore);
      expect(await auth.api.getSession({ headers: headersWithCookie(cookie) })).toBeNull();

      const { headers } = await auth.api.verifyTOTP({
        body: { code: totpCode(totpSecret) },
        headers: headersWithCookie(cookie),
        returnHeaders: true,
      });
      const session = await auth.api.getSession({ headers: headersWithCookie(cookieHeaderFrom(headers, cookie)) });
      expect(session?.user.id).toBe(userId);
    });

    it("refuse un mauvais code TOTP", async () => {
      const { cookie } = await signIn(email, password);
      await expect(auth.api.verifyTOTP({ body: { code: "000000" }, headers: headersWithCookie(cookie) })).rejects.toThrow();
    });

    it("un code de récupération fonctionne une seule fois", async () => {
      const code = backupCodes[0]!;
      const first = await signIn(email, password);
      await auth.api.verifyBackupCode({ body: { code }, headers: headersWithCookie(first.cookie) });

      const second = await signIn(email, password);
      await expect(auth.api.verifyBackupCode({ body: { code }, headers: headersWithCookie(second.cookie) })).rejects.toThrow();
    });

    it("ne peut pas désactiver sa 2FA", async () => {
      const { cookie } = await signIn(email, password);
      const { headers } = await auth.api.verifyTOTP({
        body: { code: totpCode(totpSecret) },
        headers: headersWithCookie(cookie),
        returnHeaders: true,
      });
      const sessionCookie = cookieHeaderFrom(headers, cookie);
      await expect(
        auth.api.disableTwoFactor({ body: { password }, headers: headersWithCookie(sessionCookie) }),
      ).rejects.toThrow(/obligatoire/);
      expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).twoFactorEnabled).toBe(true);
    });

    it("Google et Microsoft sont refusés : connexion, association et session issue d'un retour OAuth", async () => {
      const hooks = hooksLib.createAuthHooks(prisma);
      for (const providerId of ["google", "microsoft"]) {
        for (const action of ["sign-in", "link-account"]) {
          const result = await hooks.validateUserInfo(
            { user: { id: userId, email }, source: { action, method: "oauth", oauth: { providerId } } },
            null,
          );
          expect(result).toMatchObject({ error: "super_admin_password_only" });
        }
      }

      // Création d'un compte Google lié, même par un appel interne : refusée.
      const ctx = await auth.$context;
      await expect(
        ctx.internalAdapter.linkAccount({ userId, providerId: "google", accountId: `google-${suffix}` }),
      ).rejects.toThrow();
      expect(await prisma.account.count({ where: { userId, providerId: "google" } })).toBe(0);

      // Session créée depuis un retour OAuth : refusée.
      await expect(
        hooks.databaseHooks.session.create.before(
          { userId, expiresAt: new Date(Date.now() + 3_600_000), token: "x" },
          { path: "/callback/microsoft" },
        ),
      ).rejects.toThrow();
    });
  });

  // ─── Utilisateurs ordinaires ──────────────────────────────────────────────

  describe("Utilisateurs ordinaires", () => {
    const email = `user-${suffix}@orkestra.test`;
    const password = "Utilisateur-Test-2026!";
    let userId = "";

    beforeAll(async () => {
      userId = await createRegularUser(email, password);
    });

    it("ne peuvent pas s'attribuer le rôle SUPER_ADMIN", async () => {
      const { cookie } = await signIn(email, password);
      await expect(
        auth.api.updateUser({ body: { platformRole: "SUPER_ADMIN" } as never, headers: headersWithCookie(cookie) }),
      ).rejects.toThrow();
      expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).platformRole).toBeNull();
    });

    it("peuvent toujours modifier un champ autorisé (nom)", async () => {
      const { cookie } = await signIn(email, password);
      await auth.api.updateUser({ body: { name: "Nouveau nom" }, headers: headersWithCookie(cookie) });
      expect((await prisma.user.findUniqueOrThrow({ where: { id: userId } })).name).toBe("Nouveau nom");
    });

    it("une session révoquée n'est plus acceptée", async () => {
      const first = await signIn(email, password);
      const second = await signIn(email, password);
      const firstSession = await auth.api.getSession({ headers: headersWithCookie(first.cookie) });
      expect(firstSession).not.toBeNull();

      await auth.api.revokeSession({ body: { token: firstSession!.session.token }, headers: headersWithCookie(second.cookie) });
      expect(await auth.api.getSession({ headers: headersWithCookie(first.cookie) })).toBeNull();
      expect(await auth.api.getSession({ headers: headersWithCookie(second.cookie) })).not.toBeNull();
    });

    it("ne peuvent pas activer une organisation dont ils ne sont pas membres", async () => {
      const orgA = `org_a_${suffix}`;
      const orgB = `org_b_${suffix}`;
      for (const id of [orgA, orgB]) {
        await prisma.organization.create({ data: { id, name: id, slug: id.replaceAll("_", "-"), createdAt: new Date() } });
        createdOrgIds.push(id);
      }
      await prisma.member.create({
        data: { id: `m_${suffix}`, organizationId: orgA, userId, role: "EMPLOYEE", createdAt: new Date() },
      });

      const { cookie } = await signIn(email, password);
      await auth.api.setActiveOrganization({ body: { organizationId: orgA }, headers: headersWithCookie(cookie) });
      await expect(
        auth.api.setActiveOrganization({ body: { organizationId: orgB }, headers: headersWithCookie(cookie) }),
      ).rejects.toThrow();
      await expect(
        auth.api.getFullOrganization({ query: { organizationId: orgB }, headers: headersWithCookie(cookie) }),
      ).rejects.toThrow();

      // Même si la session en base pointait vers l'organisation B, la décision serveur refuse.
      const { decideOrgAccess } = await import("../../apps/web/lib/auth/roles");
      const memberships = await prisma.member.findMany({ where: { userId }, select: { organizationId: true, role: true } });
      expect(decideOrgAccess(orgB, memberships)).toEqual({ kind: "forbidden" });
    });

    it("ne peuvent pas créer d'organisation eux-mêmes", async () => {
      const { cookie } = await signIn(email, password);
      await expect(
        auth.api.createOrganization({ body: { name: "Pirate", slug: `pirate-${suffix}` }, headers: headersWithCookie(cookie) }),
      ).rejects.toThrow();
    });
  });

  // ─── Requêtes HTTP réelles ────────────────────────────────────────────────

  describe("Protection contre l'énumération et la force brute (HTTP)", () => {
    const email = `brute-${suffix}@orkestra.test`;
    const password = "Brute-Force-Test-2026!";

    beforeAll(async () => {
      await createRegularUser(email, password);
    });

    it("même réponse pour un e-mail inconnu et un mauvais mot de passe", async () => {
      const unknown = await httpPost("/sign-in/email", { email: `inconnu-${suffix}@orkestra.test`, password: "Mauvais-Mdp-123" }, uniqueIp());
      const wrong = await httpPost("/sign-in/email", { email, password: "Mauvais-Mdp-123" }, uniqueIp());
      expect(unknown.status).toBe(wrong.status);
      const [a, b] = await Promise.all([unknown.json(), wrong.json()]);
      expect((a as { code?: string }).code).toBe((b as { code?: string }).code);
    });

    it("bloque après 5 tentatives de connexion par minute (429)", async () => {
      const ip = uniqueIp();
      const statuses: number[] = [];
      for (let i = 0; i < 7; i++) {
        const res = await httpPost("/sign-in/email", { email, password: "Mauvais-Mdp-123" }, ip);
        statuses.push(res.status);
      }
      expect(statuses.slice(0, 5).every((s) => s !== 429)).toBe(true);
      expect(statuses.at(-1)).toBe(429);
    });

    it("l'inscription publique est aussi refusée par HTTP", async () => {
      const res = await httpPost("/sign-up/email", { email: `http-${suffix}@orkestra.test`, password: "MotDePasse-Tres-Long-1", name: "X" }, uniqueIp());
      expect(res.ok).toBe(false);
      expect(await prisma.user.count({ where: { email: `http-${suffix}@orkestra.test` } })).toBe(0);
    });

    it("les cookies de session sont HttpOnly, SameSite=Lax et préfixés orkestra", async () => {
      const res = await httpPost("/sign-in/email", { email, password }, uniqueIp());
      expect(res.status).toBe(200);
      const sessionCookie = res.headers.getSetCookie().find((c) => c.startsWith("orkestra.session_token="));
      expect(sessionCookie).toBeDefined();
      expect(sessionCookie).toMatch(/HttpOnly/i);
      expect(sessionCookie).toMatch(/SameSite=Lax/i);
    });
  });
});
