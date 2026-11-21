/**
 * Création d'un SUPER_ADMIN. Utilisé UNIQUEMENT par le script local `pnpm admin:create`.
 *
 * Aucune route HTTP n'appelle cette fonction. Le compte est écrit directement en base
 * (le contrôle validateUserInfo de Better Auth refuse toute création par requête),
 * avec la fonction de hachage de Better Auth.
 */
import { randomBytes } from "node:crypto";
import { hostname } from "node:os";
import { prisma } from "@orkestra/database";
import { writeAuditLog } from "./audit";
import { auth } from "./auth";

export class SuperAdminCreationError extends Error {}

export type SuperAdminInput = { email: string; name: string; password: string };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function validateSuperAdminInput(input: SuperAdminInput): string[] {
  const errors: string[] = [];
  if (!EMAIL_PATTERN.test(input.email.trim())) errors.push("Adresse e-mail invalide.");
  if (input.name.trim().length < 2) errors.push("Le nom doit contenir au moins 2 caractères.");
  if (input.password.length < 12) errors.push("Le mot de passe doit contenir au moins 12 caractères.");
  if (input.password.length > 128) errors.push("Le mot de passe doit contenir au plus 128 caractères.");
  const classes = [/[a-z]/, /[A-Z]/, /[0-9]/, /[^A-Za-z0-9]/].filter((re) => re.test(input.password)).length;
  if (classes < 3) errors.push("Le mot de passe doit mélanger au moins 3 types : minuscules, majuscules, chiffres, symboles.");
  return errors;
}

export async function createSuperAdmin(input: SuperAdminInput): Promise<{ userId: string; email: string }> {
  const errors = validateSuperAdminInput(input);
  if (errors.length > 0) throw new SuperAdminCreationError(errors.join(" "));

  const email = input.email.trim().toLowerCase();
  const existing = await prisma.user.findUnique({ where: { email }, select: { id: true } });
  if (existing) throw new SuperAdminCreationError("Un compte existe déjà avec cette adresse e-mail.");

  const ctx = await auth.$context;
  const passwordHash = await ctx.password.hash(input.password);
  const userId = randomBytes(16).toString("hex");

  await prisma.$transaction([
    prisma.user.create({
      data: {
        id: userId,
        name: input.name.trim(),
        email,
        emailVerified: true,
        platformRole: "SUPER_ADMIN",
        twoFactorEnabled: false,
      },
    }),
    prisma.account.create({
      data: {
        id: randomBytes(16).toString("hex"),
        accountId: userId,
        providerId: "credential",
        userId,
        password: passwordHash,
      },
    }),
  ]);

  await writeAuditLog(prisma, {
    action: "auth.super_admin.created",
    actorUserId: null,
    targetType: "user",
    targetId: userId,
    metadata: { via: "local-script", host: hostname() },
  });

  return { userId, email };
}
