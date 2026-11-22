// Tests d'intégration des invitations (lot D), sur PostgreSQL et le vrai Better Auth.
import { createHash, randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { uniqueSuffix } from "./helpers";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;
const BASE_URL = "http://localhost:3000";

describe.skipIf(!TEST_DATABASE_URL)("Invitations (lot D)", () => {
  let prisma: typeof import("../../packages/database/client").prisma;
  let auth: typeof import("../../apps/web/lib/auth/auth").auth;
  let svc: typeof import("../../apps/web/lib/invitations/service");
  let providers: typeof import("../../apps/web/lib/email/providers");
  let hooksLib: typeof import("../../apps/web/lib/auth/hooks");
  let hash: (p: string) => Promise<string>;

  const suffix = uniqueSuffix();
  const userIds: string[] = [];
  const orgIds: string[] = [];
  let superAdminId = "";

  const mail = (name: string) => `${name}-${suffix}@orkestra.test`;

  async function newOrg(name: string) {
    const org = await svc.createOrganization(prisma, { userId: superAdminId }, { name: `${name} ${suffix}` });
    orgIds.push(org.id);
    return org;
  }

  async function invite(actorId: string, organizationId: string, email: string, role: string) {
    return svc.createInvitation(prisma, { userId: actorId }, { organizationId, email, role }, { baseUrl: BASE_URL });
  }

  /** Crée un utilisateur membre d'une entreprise via une vraie invitation acceptée. */
  async function memberOf(organizationId: string, role: "CLIENT_ADMIN" | "MANAGER" | "EMPLOYEE", inviterId: string, name: string) {
    const { token } = await invite(inviterId, organizationId, mail(name), role);
    const joined = await svc.acceptWithNewPassword(prisma, { token, name, password: "Mot-De-Passe-Test-2026" }, hash);
    userIds.push(joined.userId);
    return joined.userId;
  }

  beforeAll(async () => {
    ({ prisma } = await import("../../packages/database/client"));
    ({ auth } = await import("../../apps/web/lib/auth/auth"));
    svc = await import("../../apps/web/lib/invitations/service");
    providers = await import("../../apps/web/lib/email/providers");
    hooksLib = await import("../../apps/web/lib/auth/hooks");
    const ctx = await auth.$context;
    hash = (p) => ctx.password.hash(p);
    const { createSuperAdmin } = await import("../../apps/web/lib/auth/super-admin");
    superAdminId = (await createSuperAdmin({ email: mail("sa"), name: "Super Admin", password: "Super-Admin-Test-2026!" })).userId;
    userIds.push(superAdminId);
  });

  afterAll(async () => {
    await prisma.invitation.deleteMany({ where: { organizationId: { in: orgIds } } });
    await prisma.organization.deleteMany({ where: { id: { in: orgIds } } });
    await prisma.user.deleteMany({ where: { id: { in: userIds } } });
    await prisma.$disconnect();
  });

  describe("Création d'entreprise", () => {
    it("SUPER_ADMIN uniquement", async () => {
      const org = await newOrg("Plomberie");
      expect(org.slug).toMatch(/^plomberie/);
      expect(await prisma.auditLog.count({ where: { action: "org.created", targetId: org.id } })).toBe(1);

      const clientAdmin = await memberOf(org.id, "CLIENT_ADMIN", superAdminId, "ca-create");
      await expect(svc.createOrganization(prisma, { userId: clientAdmin }, { name: "Pirate" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    });
  });

  describe("Invitation du CLIENT_ADMIN par le SUPER_ADMIN", () => {
    it("jeton stocké haché, valable 72 h, e-mail simulé contenant le lien", async () => {
      const org = await newOrg("Électricité");
      const email = mail("ca-token");
      const result = await invite(superAdminId, org.id, email, "CLIENT_ADMIN");

      const row = await prisma.invitation.findUniqueOrThrow({ where: { id: result.invitationId } });
      expect(row.tokenHash).toBe(createHash("sha256").update(result.token).digest("hex"));
      expect(JSON.stringify(row)).not.toContain(result.token);
      expect(row.role).toBe("CLIENT_ADMIN");
      const hours = (row.expiresAt.getTime() - row.createdAt.getTime()) / 3_600_000;
      expect(hours).toBeCloseTo(72, 1);

      expect(result.email.status).toBe("SIMULATED");
      const sent = providers.simulatedOutbox().find((m) => m.to === email);
      expect(sent?.text).toContain(`/invite/accept?token=${result.token}`);
      expect(await prisma.emailLog.count({ where: { idempotencyKey: `invitation:${row.id}`, status: "SIMULATED" } })).toBe(1);
      expect(await prisma.auditLog.count({ where: { action: "invitation.created", targetId: row.id } })).toBe(1);
    });

    it("le SUPER_ADMIN n'invite que des CLIENT_ADMIN ; SUPER_ADMIN n'est jamais attribuable", async () => {
      const org = await newOrg("Chauffage");
      await expect(invite(superAdminId, org.id, mail("x1"), "MANAGER")).rejects.toMatchObject({ code: "ROLE_NOT_ALLOWED" });
      await expect(invite(superAdminId, org.id, mail("x2"), "SUPER_ADMIN")).rejects.toMatchObject({ code: "ROLE_NOT_ALLOWED" });
    });

    it("l'adresse d'un administrateur ORKESTRA ne peut pas être invitée", async () => {
      const org = await newOrg("Toiture");
      await expect(invite(superAdminId, org.id, mail("sa"), "CLIENT_ADMIN")).rejects.toMatchObject({ code: "PLATFORM_ADMIN_EMAIL" });
    });
  });

  describe("Acceptation", () => {
    it("crée le compte (e-mail vérifié), rejoint l'entreprise avec le rôle prévu, puis le jeton est inutilisable", async () => {
      const org = await newOrg("Rénovation");
      const email = mail("accept");
      const { token, invitationId } = await invite(superAdminId, org.id, email, "CLIENT_ADMIN");
      const joined = await svc.acceptWithNewPassword(prisma, { token, name: "Paul Dupont", password: "Paul-Dupont-2026!" }, hash);
      userIds.push(joined.userId);

      const user = await prisma.user.findUniqueOrThrow({ where: { id: joined.userId } });
      expect(user).toMatchObject({ email, emailVerified: true, platformRole: null });
      const member = await prisma.member.findFirstOrThrow({ where: { userId: joined.userId, organizationId: org.id } });
      expect(member.role).toBe("CLIENT_ADMIN");
      expect((await prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } })).acceptedByUserId).toBe(joined.userId);
      await expect(auth.api.signInEmail({ body: { email, password: "Paul-Dupont-2026!" } })).resolves.toBeTruthy();

      await expect(svc.findValidInvitation(prisma, token)).rejects.toMatchObject({ code: "USED" });
    });

    it("usage unique même en cas de requêtes simultanées", async () => {
      const org = await newOrg("Course");
      const { token } = await invite(superAdminId, org.id, mail("race"), "CLIENT_ADMIN");
      const results = await Promise.allSettled([
        svc.acceptWithNewPassword(prisma, { token, name: "Un", password: "Course-Test-2026-A" }, hash),
        svc.acceptWithNewPassword(prisma, { token, name: "Deux", password: "Course-Test-2026-B" }, hash),
      ]);
      const ok = results.filter((r) => r.status === "fulfilled");
      expect(ok).toHaveLength(1);
      userIds.push((ok[0] as PromiseFulfilledResult<{ userId: string }>).value.userId);
      expect(await prisma.member.count({ where: { organizationId: org.id } })).toBe(1);
    });

    it("refuse une invitation expirée, révoquée ou un jeton inventé", async () => {
      const org = await newOrg("Refus");
      const expired = await invite(superAdminId, org.id, mail("expired"), "CLIENT_ADMIN");
      await prisma.invitation.update({ where: { id: expired.invitationId }, data: { expiresAt: new Date(Date.now() - 1000) } });
      await expect(svc.acceptWithNewPassword(prisma, { token: expired.token, name: "X Y", password: "Expiree-Test-2026" }, hash)).rejects.toMatchObject({ code: "EXPIRED" });

      const revoked = await invite(superAdminId, org.id, mail("revoked"), "CLIENT_ADMIN");
      await svc.revokeInvitation(prisma, { userId: superAdminId }, revoked.invitationId);
      await expect(svc.findValidInvitation(prisma, revoked.token)).rejects.toMatchObject({ code: "REVOKED" });

      await expect(svc.findValidInvitation(prisma, randomBytes(32).toString("base64url"))).rejects.toMatchObject({ code: "INVALID" });
      await expect(svc.findValidInvitation(prisma, "pas-un-jeton")).rejects.toMatchObject({ code: "INVALID" });
      expect(await prisma.user.count({ where: { email: { in: [mail("expired"), mail("revoked")] } } })).toBe(0);
    });

    it("réinviter la même adresse annule l'invitation précédente", async () => {
      const org = await newOrg("Renvoi");
      const first = await invite(superAdminId, org.id, mail("resend"), "CLIENT_ADMIN");
      const second = await invite(superAdminId, org.id, mail("resend"), "CLIENT_ADMIN");
      await expect(svc.findValidInvitation(prisma, first.token)).rejects.toMatchObject({ code: "REVOKED" });
      await expect(svc.findValidInvitation(prisma, second.token)).resolves.toMatchObject({ email: mail("resend") });
    });

    it("compte existant : uniquement avec la même adresse, pas deux fois dans la même entreprise", async () => {
      const orgA = await newOrg("Existant A");
      const orgB = await newOrg("Existant B");
      const adminA = await memberOf(orgA.id, "CLIENT_ADMIN", superAdminId, "exist-a");
      const other = await memberOf(orgA.id, "EMPLOYEE", adminA, "exist-other");

      const { token } = await invite(superAdminId, orgB.id, mail("exist-a"), "CLIENT_ADMIN");
      await expect(svc.acceptAsExistingUser(prisma, { token, userId: other })).rejects.toMatchObject({ code: "EMAIL_MISMATCH" });
      await svc.acceptAsExistingUser(prisma, { token, userId: adminA });
      expect(await prisma.member.count({ where: { userId: adminA } })).toBe(2);

      await expect(invite(superAdminId, orgB.id, mail("exist-a"), "CLIENT_ADMIN")).rejects.toMatchObject({ code: "ALREADY_MEMBER" });
      await expect(svc.acceptAsExistingUser(prisma, { token, userId: superAdminId })).rejects.toBeDefined();
    });

    it("un compte existant ne peut pas être recréé avec un mot de passe", async () => {
      const orgA = await newOrg("Doublon A");
      const orgB = await newOrg("Doublon B");
      await memberOf(orgA.id, "CLIENT_ADMIN", superAdminId, "dup");
      const { token } = await invite(superAdminId, orgB.id, mail("dup"), "CLIENT_ADMIN");
      await expect(svc.acceptWithNewPassword(prisma, { token, name: "Pirate", password: "Prise-De-Compte-2026" }, hash)).rejects.toMatchObject({ code: "ACCOUNT_EXISTS" });
    });
  });

  describe("Invitations par le CLIENT_ADMIN et isolation entre entreprises", () => {
    let orgA: { id: string };
    let orgB: { id: string };
    let adminA = "";
    let adminB = "";
    let managerA = "";
    let employeeA = "";

    beforeAll(async () => {
      orgA = await newOrg("Isolation A");
      orgB = await newOrg("Isolation B");
      adminA = await memberOf(orgA.id, "CLIENT_ADMIN", superAdminId, "iso-admin-a");
      adminB = await memberOf(orgB.id, "CLIENT_ADMIN", superAdminId, "iso-admin-b");
      managerA = await memberOf(orgA.id, "MANAGER", adminA, "iso-manager-a");
      employeeA = await memberOf(orgA.id, "EMPLOYEE", adminA, "iso-employee-a");
    });

    it("le CLIENT_ADMIN invite des MANAGER et des EMPLOYEE, pas de CLIENT_ADMIN", async () => {
      expect((await prisma.member.findFirstOrThrow({ where: { userId: managerA } })).role).toBe("MANAGER");
      expect((await prisma.member.findFirstOrThrow({ where: { userId: employeeA } })).role).toBe("EMPLOYEE");
      await expect(invite(adminA, orgA.id, mail("iso-x"), "CLIENT_ADMIN")).rejects.toMatchObject({ code: "ROLE_NOT_ALLOWED" });
      await expect(invite(adminA, orgA.id, mail("iso-y"), "SUPER_ADMIN")).rejects.toMatchObject({ code: "ROLE_NOT_ALLOWED" });
    });

    it("MANAGER et EMPLOYEE ne peuvent pas inviter", async () => {
      await expect(invite(managerA, orgA.id, mail("iso-m"), "EMPLOYEE")).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(invite(employeeA, orgA.id, mail("iso-e"), "EMPLOYEE")).rejects.toMatchObject({ code: "FORBIDDEN" });
    });

    it("un CLIENT_ADMIN ne peut ni inviter, ni lister, ni annuler dans une autre entreprise", async () => {
      await expect(invite(adminA, orgB.id, mail("iso-cross"), "EMPLOYEE")).rejects.toMatchObject({ code: "FORBIDDEN" });
      await expect(svc.listInvitations(prisma, { userId: adminA }, orgB.id)).rejects.toMatchObject({ code: "FORBIDDEN" });

      const pendingB = await invite(adminB, orgB.id, mail("iso-pending-b"), "EMPLOYEE");
      await expect(svc.revokeInvitation(prisma, { userId: adminA }, pendingB.invitationId)).rejects.toMatchObject({ code: "INVALID" });
      await expect(svc.revokeInvitation(prisma, { userId: managerA }, pendingB.invitationId)).rejects.toMatchObject({ code: "INVALID" });
      await expect(svc.findValidInvitation(prisma, pendingB.token)).resolves.toBeDefined();
    });
  });

  describe("Inscription par Google / Microsoft", () => {
    it("autorisée seulement avec une invitation valide, la même adresse, vérifiée par le fournisseur", async () => {
      const org = await newOrg("OAuth");
      const email = mail("oauth");
      const { token } = await invite(superAdminId, org.id, email, "CLIENT_ADMIN");

      expect(await svc.checkOAuthSignupAllowed(prisma, null, { email, emailVerified: true })).toEqual({ allowed: false, reason: "invitation_required" });
      expect(await svc.checkOAuthSignupAllowed(prisma, token, { email: mail("autre"), emailVerified: true })).toEqual({ allowed: false, reason: "invitation_email_mismatch" });
      expect(await svc.checkOAuthSignupAllowed(prisma, token, { email, emailVerified: false })).toEqual({ allowed: false, reason: "email_not_verified" });
      expect(await svc.checkOAuthSignupAllowed(prisma, token, { email: email.toUpperCase(), emailVerified: true })).toMatchObject({ allowed: true });
    });

    it("bout en bout dans les hooks Better Auth : contrôle puis rattachement à l'entreprise", async () => {
      const org = await newOrg("OAuth Hooks");
      const email = mail("oauth-hook");
      const { token, invitationId } = await invite(superAdminId, org.id, email, "CLIENT_ADMIN");
      const hooks = hooksLib.createAuthHooks(prisma);
      const ctx = { path: "/callback/google", headers: new Headers({ cookie: `orkestra_invitation=${token}` }) };

      const source = { action: "create-user", method: "oauth", oauth: { providerId: "google" } };
      expect(await hooks.validateUserInfo({ user: { email, emailVerified: true }, source }, ctx)).toBeUndefined();
      expect(await hooks.validateUserInfo({ user: { email, emailVerified: true }, source }, { path: "/callback/google" })).toMatchObject({
        error: "invitation_required",
      });

      // Better Auth crée l'utilisateur, puis le hook « après création » rattache l'entreprise.
      const userId = randomBytes(16).toString("hex");
      await prisma.user.create({ data: { id: userId, name: "OAuth", email, emailVerified: true } });
      userIds.push(userId);
      await hooks.databaseHooks.user.create.after({ id: userId, email }, ctx);

      expect((await prisma.member.findFirstOrThrow({ where: { userId, organizationId: org.id } })).role).toBe("CLIENT_ADMIN");
      expect((await prisma.invitation.findUniqueOrThrow({ where: { id: invitationId } })).acceptedByUserId).toBe(userId);
      expect(await prisma.auditLog.count({ where: { action: "invitation.accepted", targetId: invitationId } })).toBe(1);
    });
  });
});
