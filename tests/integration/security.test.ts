// Tests d'intégration des paramètres de sécurité (lot F), sur PostgreSQL et le vrai Better Auth.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { cookieHeaderFrom, headersWithCookie, secretFromTotpUri, totpCode, uniqueSuffix } from "./helpers";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)("Paramètres de sécurité (lot F)", () => {
  let auth: typeof import("../../apps/web/lib/auth/auth").auth;
  let prisma: typeof import("../../packages/database/client").prisma;
  let security: typeof import("../../apps/web/lib/security/service");
  let providers: typeof import("../../apps/web/lib/email/providers");
  const suffix = uniqueSuffix();
  const userIds: string[] = [];

  async function createUser(name: string, password: string): Promise<{ id: string; email: string }> {
    const ctx = await auth.$context;
    const id = randomBytes(16).toString("hex");
    const email = `${name}-${suffix}@orkestra.test`;
    await prisma.user.create({ data: { id, name, email, emailVerified: true } });
    await prisma.account.create({
      data: { id: randomBytes(16).toString("hex"), accountId: id, providerId: "credential", userId: id, password: await ctx.password.hash(password) },
    });
    userIds.push(id);
    return { id, email };
  }

  async function signIn(email: string, password: string) {
    const { headers } = await auth.api.signInEmail({ body: { email, password }, returnHeaders: true });
    const cookie = cookieHeaderFrom(headers);
    const session = await auth.api.getSession({ headers: headersWithCookie(cookie) });
    return { cookie, sessionId: session!.session.id };
  }

  async function waitForEmail(to: string, subjectPart: string, timeoutMs = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (providers.simulatedOutbox().some((m) => m.to === to && m.subject.includes(subjectPart))) return;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`Aucun e-mail « ${subjectPart} » pour ${to}`);
  }

  beforeAll(async () => {
    ({ auth } = await import("../../apps/web/lib/auth/auth"));
    ({ prisma } = await import("../../packages/database/client"));
    security = await import("../../apps/web/lib/security/service");
    providers = await import("../../apps/web/lib/email/providers");
  });

  afterAll(async () => {
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  describe("Sessions actives", () => {
    it("liste les sessions sans exposer les jetons, la session courante en premier", async () => {
      const user = await createUser("sessions", "Sessions-Test-2026!");
      await signIn(user.email, "Sessions-Test-2026!");
      const current = await signIn(user.email, "Sessions-Test-2026!");
      const list = await security.listUserSessions(prisma, user.id, current.sessionId);
      expect(list.length).toBe(2);
      expect(list[0]).toMatchObject({ id: current.sessionId, current: true });
      expect(JSON.stringify(list)).not.toMatch(/token/i);
    });

    it("on ne peut révoquer que ses propres sessions", async () => {
      const alice = await createUser("alice", "Alice-Test-2026!!");
      const bob = await createUser("bob", "Bob-Test-2026!!!");
      const aliceSession = await signIn(alice.email, "Alice-Test-2026!!");
      const bobSession = await signIn(bob.email, "Bob-Test-2026!!!");

      expect(await security.revokeUserSession(prisma, alice.id, bobSession.sessionId)).toBe(false);
      expect(await auth.api.getSession({ headers: headersWithCookie(bobSession.cookie) })).not.toBeNull();

      expect(await security.revokeUserSession(prisma, alice.id, aliceSession.sessionId)).toBe(true);
      expect(await auth.api.getSession({ headers: headersWithCookie(aliceSession.cookie) })).toBeNull();
      expect(await prisma.auditLog.count({ where: { action: "auth.session.revoked", targetId: aliceSession.sessionId } })).toBe(1);
    });

    it("« déconnecter les autres sessions » garde la session courante", async () => {
      const user = await createUser("others", "Others-Test-2026!");
      const a = await signIn(user.email, "Others-Test-2026!");
      const b = await signIn(user.email, "Others-Test-2026!");
      const current = await signIn(user.email, "Others-Test-2026!");
      expect(await security.revokeOtherUserSessions(prisma, user.id, current.sessionId)).toBe(2);
      expect(await auth.api.getSession({ headers: headersWithCookie(a.cookie) })).toBeNull();
      expect(await auth.api.getSession({ headers: headersWithCookie(b.cookie) })).toBeNull();
      expect(await auth.api.getSession({ headers: headersWithCookie(current.cookie) })).not.toBeNull();
    });

    it("l'entreprise active ne peut pas être modifiée via /update-session", async () => {
      const user = await createUser("update-session", "Update-Session-2026!");
      const { cookie, sessionId } = await signIn(user.email, "Update-Session-2026!");
      await expect(
        auth.api.updateSession({ body: { activeOrganizationId: "org-pirate" } as never, headers: headersWithCookie(cookie) }),
      ).rejects.toThrow();
      expect((await prisma.session.findUniqueOrThrow({ where: { id: sessionId } })).activeOrganizationId).toBeNull();
    });
  });

  describe("Mot de passe", () => {
    it("modification : ancien mot de passe exigé, autres sessions fermées, notification et audit", async () => {
      const user = await createUser("change", "Ancien-Change-2026!");
      const other = await signIn(user.email, "Ancien-Change-2026!");
      const current = await signIn(user.email, "Ancien-Change-2026!");

      await expect(
        auth.api.changePassword({
          body: { currentPassword: "Mauvais-Mot-De-Passe-1", newPassword: "Nouveau-Change-2026!", revokeOtherSessions: true },
          headers: headersWithCookie(current.cookie),
        }),
      ).rejects.toThrow();

      await auth.api.changePassword({
        body: { currentPassword: "Ancien-Change-2026!", newPassword: "Nouveau-Change-2026!", revokeOtherSessions: true },
        headers: headersWithCookie(current.cookie),
      });
      expect(await auth.api.getSession({ headers: headersWithCookie(other.cookie) })).toBeNull();
      await expect(auth.api.signInEmail({ body: { email: user.email, password: "Nouveau-Change-2026!" } })).resolves.toBeTruthy();

      await waitForEmail(user.email, "mot de passe ORKESTRA a été modifié");
      expect(await prisma.auditLog.count({ where: { action: "auth.password.changed", targetId: user.id } })).toBe(1);
    });
  });

  describe("Double authentification (compte client)", () => {
    const password = "Client-2FA-Test-2026!";
    let user: { id: string; email: string };
    let cookie = "";
    let secret = "";

    beforeAll(async () => {
      user = await createUser("client-2fa", password);
      ({ cookie } = await signIn(user.email, password));
      const enabled = await auth.api.enableTwoFactor({ body: { password }, headers: headersWithCookie(cookie) });
      if (enabled.method !== "totp") throw new Error("TOTP attendu");
      secret = secretFromTotpUri(enabled.totpURI);
      // L'activation remplace la session : on reprend le nouveau cookie, comme le ferait un navigateur.
      const verified = await auth.api.verifyTOTP({ body: { code: totpCode(secret) }, headers: headersWithCookie(cookie), returnHeaders: true });
      cookie = cookieHeaderFrom(verified.headers, cookie);
    });

    it("régénérer les codes exige le mot de passe et invalide les anciens codes", async () => {
      await expect(
        auth.api.generateBackupCodes({ body: { password: "Mauvais-Mot-De-Passe-1" }, headers: headersWithCookie(cookie) }),
      ).rejects.toThrow();

      const first = await auth.api.generateBackupCodes({ body: { password }, headers: headersWithCookie(cookie) });
      const second = await auth.api.generateBackupCodes({ body: { password }, headers: headersWithCookie(cookie) });
      const oldCode = first.backupCodes[0]!;
      const newCode = second.backupCodes[0]!;

      const attempt1 = await auth.api.signInEmail({ body: { email: user.email, password }, returnHeaders: true });
      await expect(
        auth.api.verifyBackupCode({ body: { code: oldCode }, headers: headersWithCookie(cookieHeaderFrom(attempt1.headers)) }),
      ).rejects.toThrow();
      const attempt2 = await auth.api.signInEmail({ body: { email: user.email, password }, returnHeaders: true });
      await expect(
        auth.api.verifyBackupCode({ body: { code: newCode }, headers: headersWithCookie(cookieHeaderFrom(attempt2.headers)) }),
      ).resolves.toBeTruthy();

      await waitForEmail(user.email, "Nouveaux codes de récupération");
      expect(await prisma.auditLog.count({ where: { action: "auth.2fa.backup_codes_regenerated", targetId: user.id } })).toBeGreaterThanOrEqual(2);
    });

    it("un client peut désactiver sa 2FA avec son mot de passe ; il est notifié", async () => {
      await auth.api.disableTwoFactor({ body: { password }, headers: headersWithCookie(cookie) });
      expect((await prisma.user.findUniqueOrThrow({ where: { id: user.id } })).twoFactorEnabled).toBe(false);
      await waitForEmail(user.email, "Double authentification désactivée");
      expect(await prisma.auditLog.count({ where: { action: "auth.2fa.disabled", targetId: user.id } })).toBe(1);
    });
  });

  describe("Méthodes de connexion", () => {
    it("retirer Google : autorisé s'il reste une méthode ; la dernière méthode ne peut pas être retirée", async () => {
      const password = "Methodes-Test-2026!";
      const user = await createUser("methods", password);
      const googleAccountId = randomBytes(16).toString("hex");
      await prisma.account.create({ data: { id: googleAccountId, accountId: `g-${suffix}`, providerId: "google", userId: user.id } });

      expect(await security.listLoginMethods(prisma, user.id)).toEqual({ password: true, google: true, microsoft: false, count: 2 });

      const { cookie } = await signIn(user.email, password);
      await auth.api.unlinkAccount({ body: { accountId: googleAccountId }, headers: headersWithCookie(cookie) });
      expect(await security.listLoginMethods(prisma, user.id)).toMatchObject({ google: false, count: 1 });
      await waitForEmail(user.email, "Méthode de connexion retirée");
      expect(await prisma.auditLog.count({ where: { action: "auth.account.unlinked", targetId: user.id } })).toBe(1);

      const credential = await prisma.account.findFirstOrThrow({ where: { userId: user.id, providerId: "credential" } });
      await expect(auth.api.unlinkAccount({ body: { accountId: credential.id }, headers: headersWithCookie(cookie) })).rejects.toThrow();
      expect(await security.listLoginMethods(prisma, user.id)).toMatchObject({ password: true, count: 1 });
    });
  });

  describe("Description des appareils", () => {
    it("reconnaît les navigateurs et systèmes courants", () => {
      expect(security.describeUserAgent("Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/159.0 Safari/537.36")).toBe("Chrome sur Windows");
      expect(security.describeUserAgent("Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1")).toBe("Safari sur iOS");
      expect(security.describeUserAgent(null)).toBe("Appareil inconnu");
    });
  });
});
