"use server";

/**
 * Actions serveur des paramètres de sécurité. Chaque action revérifie la session ;
 * une session ne peut être révoquée que par son propriétaire.
 */
import { prisma } from "@orkestra/database";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "../auth/auth";
import { requireUser } from "../auth/guards";
import { authErrorMessage } from "../auth/messages";
import { revokeOtherUserSessions, revokeUserSession } from "./service";

export type SecurityActionState = { ok: boolean; message: string } | null;

const idSchema = z.string().min(1).max(64);

export async function revokeSessionAction(_prev: SecurityActionState, formData: FormData): Promise<SecurityActionState> {
  const session = await requireUser();
  const id = idSchema.safeParse(formData.get("sessionId"));
  if (!id.success) return { ok: false, message: "Session invalide." };
  const revoked = await revokeUserSession(prisma, session.user.id, id.data);
  if (!revoked) return { ok: false, message: "Session introuvable." };
  if (id.data === session.session.id) redirect("/login?reason=signed-out");
  revalidatePath("/settings/security");
  return { ok: true, message: "Session déconnectée." };
}

export async function revokeOtherSessionsAction(_prev: SecurityActionState): Promise<SecurityActionState> {
  const session = await requireUser();
  const count = await revokeOtherUserSessions(prisma, session.user.id, session.session.id);
  revalidatePath("/settings/security");
  return {
    ok: true,
    message: count === 0 ? "Aucune autre session ouverte." : `${count} autre${count > 1 ? "s" : ""} session${count > 1 ? "s" : ""} déconnectée${count > 1 ? "s" : ""}.`,
  };
}

const providerSchema = z.enum(["google", "microsoft"]);

/** Retire une méthode de connexion Google / Microsoft (jamais la dernière : vérifié par Better Auth). */
export async function unlinkProviderAction(_prev: SecurityActionState, formData: FormData): Promise<SecurityActionState> {
  const session = await requireUser();
  const provider = providerSchema.safeParse(formData.get("providerId"));
  if (!provider.success) return { ok: false, message: "Méthode de connexion invalide." };
  const account = await prisma.account.findFirst({ where: { userId: session.user.id, providerId: provider.data }, select: { id: true } });
  if (!account) return { ok: false, message: "Cette méthode n'est pas associée à votre compte." };
  try {
    await auth.api.unlinkAccount({ body: { accountId: account.id }, headers: await headers() });
  } catch (error) {
    const err = error as { body?: { code?: string }; status?: number; statusCode?: number };
    const code = err.body?.code;
    if (code === "FAILED_TO_UNLINK_LAST_ACCOUNT") return { ok: false, message: "Impossible de retirer votre dernière méthode de connexion." };
    if (code === "SESSION_NOT_FRESH") return { ok: false, message: "Pour cette action, reconnectez-vous d'abord (connexion de moins de 10 minutes)." };
    return { ok: false, message: authErrorMessage({ code }) };
  }
  revalidatePath("/settings/security");
  return { ok: true, message: "Méthode de connexion retirée." };
}
