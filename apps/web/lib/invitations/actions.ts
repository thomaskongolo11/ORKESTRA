"use server";

/**
 * Actions serveur des invitations. Chaque action revérifie la session et les droits
 * en base (via les gardes et le service) ; les champs sont validés avec Zod.
 * Pour un CLIENT_ADMIN, l'entreprise vient TOUJOURS de son contexte serveur,
 * jamais d'un champ de formulaire.
 */
import { prisma } from "@orkestra/database";
import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { auth } from "../auth/auth";
import { getAuthEnv } from "../auth/env";
import { getCurrentSession, requireOrgContext, requireSuperAdmin } from "../auth/guards";
import type { SendEmailResult } from "../email/mailer";
import {
  InvitationError,
  acceptAsExistingUser,
  acceptWithNewPassword,
  createInvitation,
  createOrganization,
  findValidInvitation,
  revokeInvitation,
} from "./service";
import { INVITATION_COOKIE, INVITATION_COOKIE_MAX_AGE_SECONDS } from "./tokens";

export type ActionState = { ok: boolean; message: string; tone: "success" | "info" | "warning" | "error" } | null;

function emailStatusMessage(result: SendEmailResult, email: string): ActionState {
  switch (result.status) {
    case "ACCEPTED":
      return { ok: true, tone: "success", message: `Invitation créée. L'e-mail pour ${email} a été accepté par Resend pour envoi.` };
    case "SIMULATED":
      return {
        ok: true,
        tone: "warning",
        message: `Invitation créée pour ${email}. Mode simulé : aucun e-mail n'a été envoyé (le lien s'affiche dans le terminal du serveur).`,
      };
    case "FAILED":
      return {
        ok: false,
        tone: "error",
        message: `Invitation créée pour ${email}, mais l'e-mail n'a pas pu être envoyé. Utilisez « Renvoyer » pour réessayer.`,
      };
  }
}

function errorState(error: unknown): ActionState {
  if (error instanceof InvitationError) return { ok: false, tone: "error", message: error.message };
  console.error("[invitation] Erreur inattendue", error);
  return { ok: false, tone: "error", message: "Une erreur est survenue. Réessayez." };
}

const emailField = z.string().trim().min(3).max(254);

// ─── SUPER_ADMIN ─────────────────────────────────────────────────────────────

const createOrgSchema = z.object({ name: z.string().trim().min(2).max(120), adminEmail: emailField });

/** Crée une entreprise et invite son CLIENT_ADMIN. */
export async function createOrganizationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSuperAdmin();
  const parsed = createOrgSchema.safeParse({ name: formData.get("name"), adminEmail: formData.get("adminEmail") });
  if (!parsed.success) return { ok: false, tone: "error", message: "Indiquez le nom de l'entreprise et l'e-mail de son administrateur." };
  try {
    const org = await createOrganization(prisma, { userId: session.user.id }, { name: parsed.data.name });
    const result = await createInvitation(
      prisma,
      { userId: session.user.id },
      { organizationId: org.id, email: parsed.data.adminEmail, role: "CLIENT_ADMIN" },
      { baseUrl: getAuthEnv().BETTER_AUTH_URL },
    );
    revalidatePath("/admin/organizations");
    const state = emailStatusMessage(result.email, parsed.data.adminEmail.toLowerCase());
    return state && { ...state, message: `Entreprise « ${org.name} » créée. ${state.message}` };
  } catch (error) {
    return errorState(error);
  }
}

const adminInviteSchema = z.object({ organizationId: z.string().min(1).max(64), email: emailField });

/** SUPER_ADMIN : inviter (ou réinviter) le CLIENT_ADMIN d'une entreprise existante. */
export async function inviteClientAdminAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await requireSuperAdmin();
  const parsed = adminInviteSchema.safeParse({ organizationId: formData.get("organizationId"), email: formData.get("email") });
  if (!parsed.success) return { ok: false, tone: "error", message: "Adresse e-mail invalide." };
  try {
    const result = await createInvitation(prisma, { userId: session.user.id }, { ...parsed.data, role: "CLIENT_ADMIN" }, { baseUrl: getAuthEnv().BETTER_AUTH_URL });
    revalidatePath(`/admin/organizations/${parsed.data.organizationId}`);
    return emailStatusMessage(result.email, parsed.data.email.toLowerCase());
  } catch (error) {
    return errorState(error);
  }
}

// ─── CLIENT_ADMIN ────────────────────────────────────────────────────────────

const memberInviteSchema = z.object({ email: emailField, role: z.enum(["MANAGER", "EMPLOYEE"]) });

/** CLIENT_ADMIN : inviter un MANAGER ou un EMPLOYEE dans SON entreprise. */
export async function inviteMemberAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const ctx = await requireOrgContext(["CLIENT_ADMIN"]);
  const parsed = memberInviteSchema.safeParse({ email: formData.get("email"), role: formData.get("role") });
  if (!parsed.success) return { ok: false, tone: "error", message: "Indiquez une adresse e-mail et un rôle (Manager ou Collaborateur)." };
  try {
    const result = await createInvitation(
      prisma,
      { userId: ctx.session.user.id },
      { organizationId: ctx.organizationId, email: parsed.data.email, role: parsed.data.role },
      { baseUrl: getAuthEnv().BETTER_AUTH_URL },
    );
    revalidatePath("/settings/team");
    return emailStatusMessage(result.email, parsed.data.email.toLowerCase());
  } catch (error) {
    return errorState(error);
  }
}

// ─── Révocation et renvoi (SUPER_ADMIN ou CLIENT_ADMIN de l'entreprise) ─────

export async function revokeInvitationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const id = z.string().min(1).max(64).safeParse(formData.get("invitationId"));
  if (!id.success) return { ok: false, tone: "error", message: "Invitation invalide." };
  try {
    await revokeInvitation(prisma, { userId: session.user.id }, id.data);
    revalidatePath("/settings/team");
    revalidatePath("/admin/organizations", "layout");
    return { ok: true, tone: "success", message: "Invitation annulée. Le lien ne fonctionne plus." };
  } catch (error) {
    return errorState(error);
  }
}

export async function resendInvitationAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  const id = z.string().min(1).max(64).safeParse(formData.get("invitationId"));
  if (!id.success) return { ok: false, tone: "error", message: "Invitation invalide." };
  const previous = await prisma.invitation.findUnique({ where: { id: id.data }, select: { organizationId: true, email: true, role: true } });
  if (!previous) return { ok: false, tone: "error", message: "Invitation introuvable." };
  try {
    // Nouveau jeton ; l'ancien lien est automatiquement révoqué par le service. Droits revérifiés.
    const result = await createInvitation(prisma, { userId: session.user.id }, previous, { baseUrl: getAuthEnv().BETTER_AUTH_URL });
    revalidatePath("/settings/team");
    revalidatePath("/admin/organizations", "layout");
    return emailStatusMessage(result.email, previous.email);
  } catch (error) {
    return errorState(error);
  }
}

// ─── Acceptation ─────────────────────────────────────────────────────────────

const acceptSchema = z
  .object({ token: z.string().min(1).max(100), name: z.string().trim().min(2).max(100), password: z.string().min(12).max(128), confirmation: z.string() })
  .refine((v) => v.password === v.confirmation, { message: "mismatch" });

async function activateOrganization(sessionToken: string, organizationId: string) {
  await prisma.session.updateMany({ where: { token: sessionToken }, data: { activeOrganizationId: organizationId } });
}

/** Nouveau compte avec mot de passe, puis connexion immédiate. */
export async function acceptWithPasswordAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const parsed = acceptSchema.safeParse({
    token: formData.get("token"),
    name: formData.get("name"),
    password: formData.get("password"),
    confirmation: formData.get("confirmation"),
  });
  if (!parsed.success) {
    const mismatch = parsed.error.issues.some((i) => i.message === "mismatch");
    return { ok: false, tone: "error", message: mismatch ? "Les deux mots de passe ne correspondent pas." : "Indiquez votre nom et un mot de passe de 12 caractères minimum." };
  }
  let joined: { email: string; organizationId: string };
  try {
    const ctx = await auth.$context;
    joined = await acceptWithNewPassword(prisma, parsed.data, (p) => ctx.password.hash(p));
  } catch (error) {
    return errorState(error);
  }
  // Connexion : le plugin nextCookies pose le cookie de session dans la réponse.
  const signedIn = await auth.api.signInEmail({ body: { email: joined.email, password: parsed.data.password }, headers: await headers() });
  if (signedIn && "token" in signedIn && typeof signedIn.token === "string") await activateOrganization(signedIn.token, joined.organizationId);
  redirect("/auth/callback");
}

/** Compte existant, déjà connecté avec la bonne adresse. */
export async function acceptAsExistingUserAction(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const session = await getCurrentSession();
  if (!session) redirect("/login");
  let organizationId: string;
  try {
    ({ organizationId } = await acceptAsExistingUser(prisma, { token: formData.get("token"), userId: session.user.id }));
  } catch (error) {
    return errorState(error);
  }
  await activateOrganization(session.session.token, organizationId);
  redirect("/auth/callback");
}

/**
 * Avant une inscription Google / Microsoft : vérifie l'invitation et pose un cookie
 * temporaire (HttpOnly, 15 min) que le contrôle de création de compte relira au retour.
 */
export async function prepareOAuthAcceptAction(token: string): Promise<ActionState> {
  try {
    await findValidInvitation(prisma, token);
  } catch (error) {
    return errorState(error);
  }
  (await cookies()).set(INVITATION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: INVITATION_COOKIE_MAX_AGE_SECONDS,
  });
  return { ok: true, tone: "info", message: "" };
}
