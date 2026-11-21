// Tests d'intégration sur une vraie base PostgreSQL.
// Lancés uniquement si TEST_DATABASE_URL est définie (base dédiée aux tests, jamais la base de dev).
// Préparer la base : appliquer les migrations sur TEST_DATABASE_URL avant de lancer les tests.

import { randomBytes } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

const TEST_DATABASE_URL = process.env.TEST_DATABASE_URL;

describe.skipIf(!TEST_DATABASE_URL)("Protections de la base de données", () => {
  // Import dynamique : le client lit DATABASE_URL au chargement.
  let db: typeof import("../../packages/database/client");
  const suffix = randomBytes(4).toString("hex");
  const userId = `user_${suffix}`;
  const orgId = `org_${suffix}`;

  beforeAll(async () => {
    process.env.DATABASE_URL = TEST_DATABASE_URL;
    db = await import("../../packages/database/client");
    await db.prisma.user.create({
      data: { id: userId, name: "Test", email: `test-${suffix}@orkestra.test` },
    });
    await db.prisma.organization.create({
      data: { id: orgId, name: "Org test", slug: `org-${suffix}`, createdAt: new Date() },
    });
  });

  afterAll(async () => {
    await db.prisma.invitation.deleteMany({ where: { organizationId: orgId } });
    await db.prisma.organization.delete({ where: { id: orgId } });
    await db.prisma.user.delete({ where: { id: userId } });
    await db.prisma.$disconnect();
  });

  it("refuse SUPER_ADMIN comme rôle d'organisation (contrainte CHECK)", async () => {
    await expect(
      db.prisma.member.create({
        data: {
          id: `m_${suffix}`,
          organizationId: orgId,
          userId,
          role: "SUPER_ADMIN",
          createdAt: new Date(),
        },
      }),
    ).rejects.toThrow();
  });

  it("accepte les rôles d'organisation autorisés", async () => {
    const member = await db.prisma.member.create({
      data: { id: `m2_${suffix}`, organizationId: orgId, userId, role: "MANAGER", createdAt: new Date() },
    });
    expect(member.role).toBe("MANAGER");
    await db.prisma.member.delete({ where: { id: member.id } });
  });

  it("refuse SUPER_ADMIN comme rôle d'invitation (enum OrgRole)", async () => {
    await expect(
      db.prisma.invitation.create({
        data: {
          organizationId: orgId,
          email: "x@orkestra.test",
          // @ts-expect-error — SUPER_ADMIN n'existe pas dans OrgRole, c'est le but du test
          role: "SUPER_ADMIN",
          tokenHash: randomBytes(32).toString("hex"),
          expiresAt: new Date(Date.now() + 3_600_000),
          createdById: userId,
        },
      }),
    ).rejects.toThrow();
  });

  it("refuse deux invitations avec le même hash de jeton", async () => {
    const tokenHash = randomBytes(32).toString("hex");
    const base = {
      organizationId: orgId,
      email: "y@orkestra.test",
      role: "EMPLOYEE" as const,
      tokenHash,
      expiresAt: new Date(Date.now() + 3_600_000),
      createdById: userId,
    };
    await db.prisma.invitation.create({ data: base });
    await expect(db.prisma.invitation.create({ data: base })).rejects.toThrow();
  });

  it("empêche toute modification ou suppression du journal d'audit", async () => {
    const entry = await db.prisma.auditLog.create({
      data: { action: "test.audit", actorUserId: userId, metadata: { test: true } },
    });
    await expect(
      db.prisma.auditLog.update({ where: { id: entry.id }, data: { action: "falsifié" } }),
    ).rejects.toThrow(/ajout seul/);
    await expect(db.prisma.auditLog.delete({ where: { id: entry.id } })).rejects.toThrow(/ajout seul/);
  });
});
