/**
 * Création des données de test e2e, lancée par `tsx` dans un processus séparé
 * (le chargeur de Playwright ne sait pas importer Better Auth directement).
 *
 *   tsx tests/e2e/seed.ts super-admin <email> <password>
 *   tsx tests/e2e/seed.ts org-user <email> <password> <CLIENT_ADMIN|MANAGER|EMPLOYEE>
 *
 * N'utilise que DATABASE_URL, que playwright.config.ts fait pointer vers la base de TEST.
 */
import { randomBytes } from "node:crypto";

async function main(): Promise<void> {
  const [command, email, password, role] = process.argv.slice(2);
  if (!command || !email || !password) throw new Error("Arguments manquants.");
  if (!process.env.DATABASE_URL?.includes("test")) {
    throw new Error("Refus : DATABASE_URL ne pointe pas vers une base de test.");
  }

  const { prisma } = await import("../../packages/database/client");
  try {
    if (command === "super-admin") {
      const { createSuperAdmin } = await import("../../apps/web/lib/auth/super-admin");
      const { userId } = await createSuperAdmin({ email, name: "Admin E2E", password });
      console.log(JSON.stringify({ userId }));
      return;
    }

    if (command === "org-user") {
      if (role !== "CLIENT_ADMIN" && role !== "MANAGER" && role !== "EMPLOYEE") throw new Error("Rôle invalide.");
      const { auth } = await import("../../apps/web/lib/auth/auth");
      const ctx = await auth.$context;
      const userId = randomBytes(16).toString("hex");
      const orgId = `org_${randomBytes(4).toString("hex")}`;
      await prisma.user.create({ data: { id: userId, name: "Utilisateur E2E", email, emailVerified: true } });
      await prisma.account.create({
        data: {
          id: randomBytes(16).toString("hex"),
          accountId: userId,
          providerId: "credential",
          userId,
          password: await ctx.password.hash(password),
        },
      });
      await prisma.organization.create({
        data: { id: orgId, name: "Plomberie Dupont", slug: orgId.replace("_", "-"), createdAt: new Date() },
      });
      await prisma.member.create({
        data: { id: randomBytes(8).toString("hex"), organizationId: orgId, userId, role, createdAt: new Date() },
      });
      console.log(JSON.stringify({ userId, orgId }));
      return;
    }

    throw new Error(`Commande inconnue : ${command}`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
