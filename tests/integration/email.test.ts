// Tests d'intégration du module e-mail (lot C), sur PostgreSQL et le vrai Better Auth.
// Le mode simulé est utilisé : aucun e-mail réel n'est envoyé.
import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { cookieHeaderFrom, headersWithCookie, secretFromTotpUri, totpCode, uniqueSuffix } from "./helpers";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)("E-mails transactionnels (lot C)", () => {
  let auth: typeof import("../../apps/web/lib/auth/auth").auth;
  let prisma: typeof import("../../packages/database/client").prisma;
  let mailer: typeof import("../../apps/web/lib/email/mailer");
  let providers: typeof import("../../apps/web/lib/email/providers");
  const suffix = uniqueSuffix();
  const createdUserIds: string[] = [];

  async function createRegularUser(email: string, password: string): Promise<string> {
    const ctx = await auth.$context;
    const id = randomBytes(16).toString("hex");
    await prisma.user.create({ data: { id, name: "Marie Test", email, emailVerified: true } });
    await prisma.account.create({
      data: { id: randomBytes(16).toString("hex"), accountId: id, providerId: "credential", userId: id, password: await ctx.password.hash(password) },
    });
    createdUserIds.push(id);
    return id;
  }

  /** Attend un e-mail simulé (les envois de Better Auth partent en arrière-plan). */
  async function waitForEmail(to: string, subjectPart: string, timeoutMs = 5000) {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      const found = providers.simulatedOutbox().find((m) => m.to === to && m.subject.includes(subjectPart));
      if (found) return found;
      await new Promise((r) => setTimeout(r, 50));
    }
    throw new Error(`Aucun e-mail « ${subjectPart} » pour ${to}`);
  }

  beforeAll(async () => {
    ({ auth } = await import("../../apps/web/lib/auth/auth"));
    ({ prisma } = await import("../../packages/database/client"));
    mailer = await import("../../apps/web/lib/email/mailer");
    providers = await import("../../apps/web/lib/email/providers");
  });

  beforeEach(() => {
    mailer.setEmailProviderForTests(undefined);
  });

  afterAll(async () => {
    mailer.setEmailProviderForTests(undefined);
    await prisma.user.deleteMany({ where: { id: { in: createdUserIds } } });
    await prisma.$disconnect();
  });

  describe("Suivi des envois (EmailLog)", () => {
    const data = { name: "Marie", url: "https://exemple.be/x", expiresInMinutes: 60 };

    it("mode simulé : statut SIMULATED, e-mail dans la boîte simulée", async () => {
      const key = `test:simulated:${suffix}`;
      const result = await mailer.sendEmail({ template: "reset-password", to: `Sim-${suffix}@Orkestra.test`, data, idempotencyKey: key });
      expect(result.status).toBe("SIMULATED");
      const log = await prisma.emailLog.findUniqueOrThrow({ where: { idempotencyKey: key } });
      expect(log).toMatchObject({ status: "SIMULATED", provider: "simulated", toEmail: `sim-${suffix}@orkestra.test` });
      expect(log.providerMessageId).toBeNull();
    });

    it("même clé d'idempotence : pas de second envoi", async () => {
      const key = `test:idem:${suffix}`;
      const to = `idem-${suffix}@orkestra.test`;
      await mailer.sendEmail({ template: "reset-password", to, data, idempotencyKey: key });
      const second = await mailer.sendEmail({ template: "reset-password", to, data, idempotencyKey: key });
      expect(second.deduplicated).toBe(true);
      expect(providers.simulatedOutbox().filter((m) => m.idempotencyKey === key)).toHaveLength(1);
      expect(await prisma.emailLog.count({ where: { idempotencyKey: key } })).toBe(1);
    });

    it("Resend : ACCEPTED avec identifiant, FAILED avec l'erreur, nouvel essai possible après un échec", async () => {
      const key = `test:resend:${suffix}`;
      const to = `resend-${suffix}@orkestra.test`;

      mailer.setEmailProviderForTests(
        providers.createResendProvider({ emails: { send: async () => ({ data: null, error: { name: "rate_limit_exceeded", message: "Trop d'envois" } }) } }),
      );
      const failed = await mailer.sendEmail({ template: "reset-password", to, data, idempotencyKey: key });
      expect(failed.status).toBe("FAILED");
      expect(await prisma.emailLog.findUniqueOrThrow({ where: { idempotencyKey: key } })).toMatchObject({
        status: "FAILED",
        provider: "resend",
        error: "rate_limit_exceeded: Trop d'envois",
      });

      mailer.setEmailProviderForTests(
        providers.createResendProvider({ emails: { send: async () => ({ data: { id: `msg_${suffix}` }, error: null }) } }),
      );
      const accepted = await mailer.sendEmail({ template: "reset-password", to, data, idempotencyKey: key });
      expect(accepted).toMatchObject({ status: "ACCEPTED", providerMessageId: `msg_${suffix}`, deduplicated: false });
      expect(await prisma.emailLog.findUniqueOrThrow({ where: { idempotencyKey: key } })).toMatchObject({
        status: "ACCEPTED",
        providerMessageId: `msg_${suffix}`,
        error: null,
      });
    });
  });

  describe("Réinitialisation du mot de passe", () => {
    const email = `reset-${suffix}@orkestra.test`;
    const oldPassword = "Ancien-Mot-De-Passe-2026";
    const newPassword = "Nouveau-Mot-De-Passe-2026";
    let userId = "";
    let token = "";

    beforeAll(async () => {
      userId = await createRegularUser(email, oldPassword);
    });

    it("envoie un lien ; le jeton est stocké haché en base", async () => {
      await auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" } });
      const message = await waitForEmail(email, "Réinitialisation");
      const url = message.text.match(/https?:\/\/\S*reset-password\/[^\s?]+/)?.[0];
      expect(url).toBeDefined();
      token = url!.split("/reset-password/")[1]!;
      expect(token.length).toBeGreaterThan(10);

      const rows = await prisma.verification.findMany({ where: { value: userId } });
      expect(rows.length).toBeGreaterThan(0);
      for (const row of rows) expect(row.identifier).not.toContain(token);

      expect(await prisma.emailLog.count({ where: { toEmail: email, template: "reset-password", status: "SIMULATED" } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { action: "auth.password.reset_requested", targetId: userId } })).toBe(1);
    });

    it("même réponse pour une adresse inconnue, et aucun e-mail envoyé", async () => {
      const unknown = `inconnu-${suffix}@orkestra.test`;
      const known = await auth.api.requestPasswordReset({ body: { email, redirectTo: "/reset-password" } });
      const notKnown = await auth.api.requestPasswordReset({ body: { email: unknown, redirectTo: "/reset-password" } });
      expect(notKnown).toEqual(known);
      await new Promise((r) => setTimeout(r, 300));
      expect(providers.simulatedOutbox().some((m) => m.to === unknown)).toBe(false);
    });

    it("change le mot de passe, ferme les sessions, notifie le titulaire ; le lien ne sert qu'une fois", async () => {
      const { headers } = await auth.api.signInEmail({ body: { email, password: oldPassword }, returnHeaders: true });
      const oldCookie = cookieHeaderFrom(headers);
      expect(await auth.api.getSession({ headers: headersWithCookie(oldCookie) })).not.toBeNull();

      await auth.api.resetPassword({ body: { newPassword, token } });

      expect(await auth.api.getSession({ headers: headersWithCookie(oldCookie) })).toBeNull();
      await expect(auth.api.signInEmail({ body: { email, password: oldPassword } })).rejects.toThrow();
      await expect(auth.api.signInEmail({ body: { email, password: newPassword } })).resolves.toBeTruthy();

      await waitForEmail(email, "mot de passe ORKESTRA a été modifié");
      expect(await prisma.auditLog.count({ where: { action: "auth.password.changed", targetId: userId } })).toBe(1);

      await expect(auth.api.resetPassword({ body: { newPassword: "Encore-Un-Autre-2026", token } })).rejects.toThrow();
    });
  });

  describe("Notifications de sécurité", () => {
    it("activation de la 2FA : e-mail au titulaire et entrée d'audit", async () => {
      const { createSuperAdmin } = await import("../../apps/web/lib/auth/super-admin");
      const email = `notif-${suffix}@orkestra.test`;
      const password = "Notification-Test-2026!";
      const { userId } = await createSuperAdmin({ email, name: "Admin Notif", password });
      createdUserIds.push(userId);

      const { headers } = await auth.api.signInEmail({ body: { email, password }, returnHeaders: true });
      const cookie = cookieHeaderFrom(headers);
      const enabled = await auth.api.enableTwoFactor({ body: { password }, headers: headersWithCookie(cookie) });
      if (enabled.method !== "totp") throw new Error("TOTP attendu");
      await auth.api.verifyTOTP({ body: { code: totpCode(secretFromTotpUri(enabled.totpURI)) }, headers: headersWithCookie(cookie) });

      await waitForEmail(email, "Double authentification activée");
      expect(await prisma.auditLog.count({ where: { action: "auth.2fa.enabled", targetId: userId } })).toBe(1);
    });
  });
});
