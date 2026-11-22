/**
 * Invitations ORKESTRA (logique serveur, sans dépendance à Next.js).
 *
 * Règles :
 *  - SUPER_ADMIN : crée les entreprises et invite leur CLIENT_ADMIN.
 *  - CLIENT_ADMIN : invite des MANAGER et EMPLOYEE dans SA propre entreprise.
 *  - MANAGER, EMPLOYEE : ne peuvent pas inviter.
 *  - Aucune invitation ne peut créer un SUPER_ADMIN (code, Zod et base de données).
 *  - Jeton aléatoire de 256 bits, stocké haché, valable 72 h, usage unique (garanti par
 *    une mise à jour conditionnelle atomique), révocable, lié à une entreprise et à une adresse.
 *
 * Les droits de l'acteur sont TOUJOURS relus en base : aucun rôle ne vient du navigateur.
 */
import { randomBytes } from "node:crypto";
import type { PrismaClient } from "@orkestra/database";
import { writeAuditLog } from "../auth/audit";
import { assignableRoles, isOrgRole, type OrgRole, type PlatformRole } from "../auth/roles";
import { sendEmail, type SendEmailResult } from "../email/mailer";
import { generateInvitationToken, hashInvitationToken, looksLikeInvitationToken } from "./tokens";

export const INVITATION_TTL_HOURS = 72;
/** Limite anti-abus : invitations créées par un même acteur sur une heure glissante. */
export const INVITATIONS_PER_HOUR_LIMIT = 30;

export const ROLE_LABELS: Record<OrgRole, string> = {
  CLIENT_ADMIN: "Administrateur",
  MANAGER: "Manager",
  EMPLOYEE: "Collaborateur",
};

export type InvitationErrorCode =
  | "FORBIDDEN"
  | "ROLE_NOT_ALLOWED"
  | "ORGANIZATION_NOT_FOUND"
  | "INVALID_EMAIL"
  | "ALREADY_MEMBER"
  | "PLATFORM_ADMIN_EMAIL"
  | "RATE_LIMITED"
  | "INVALID_NAME"
  | "INVALID"
  | "EXPIRED"
  | "USED"
  | "REVOKED"
  | "EMAIL_MISMATCH"
  | "ACCOUNT_EXISTS"
  | "WEAK_PASSWORD";

export class InvitationError extends Error {
  constructor(
    public readonly code: InvitationErrorCode,
    message: string,
  ) {
    super(message);
  }
}

export type Actor = { userId: string };

type ActorFacts = { userId: string; name: string; platformRole: PlatformRole | null };

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

async function loadActor(db: PrismaClient, actor: Actor): Promise<ActorFacts> {
  const user = await db.user.findUnique({ where: { id: actor.userId }, select: { id: true, name: true, platformRole: true } });
  if (!user) throw new InvitationError("FORBIDDEN", "Utilisateur inconnu.");
  return { userId: user.id, name: user.name, platformRole: (user.platformRole ?? null) as PlatformRole | null };
}

async function orgRoleOf(db: PrismaClient, userId: string, organizationId: string): Promise<OrgRole | null> {
  const member = await db.member.findUnique({
    where: { organizationId_userId: { organizationId, userId } },
    select: { role: true },
  });
  return member && isOrgRole(member.role) ? member.role : null;
}

/** L'acteur peut-il gérer les invitations de cette entreprise ? */
async function assertCanManage(db: PrismaClient, actor: ActorFacts, organizationId: string): Promise<OrgRole | null> {
  if (actor.platformRole === "SUPER_ADMIN") return null;
  const role = await orgRoleOf(db, actor.userId, organizationId);
  if (role !== "CLIENT_ADMIN") throw new InvitationError("FORBIDDEN", "Vous ne pouvez pas gérer les invitations de cette entreprise.");
  return role;
}

// ─── Entreprises ─────────────────────────────────────────────────────────────

export function slugify(name: string): string {
  return (
    name
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "entreprise"
  );
}

/** Création d'une entreprise : SUPER_ADMIN uniquement. */
export async function createOrganization(db: PrismaClient, actor: Actor, input: { name: string }) {
  const facts = await loadActor(db, actor);
  if (facts.platformRole !== "SUPER_ADMIN") throw new InvitationError("FORBIDDEN", "Seul un administrateur ORKESTRA peut créer une entreprise.");
  const name = input.name.trim();
  if (name.length < 2 || name.length > 120) throw new InvitationError("INVALID_NAME", "Le nom de l'entreprise doit contenir entre 2 et 120 caractères.");

  const base = slugify(name);
  let slug = base;
  for (let i = 0; await db.organization.findUnique({ where: { slug }, select: { id: true } }); i++) {
    slug = `${base}-${randomBytes(2).toString("hex")}`;
    if (i > 5) throw new InvitationError("INVALID_NAME", "Impossible de générer un identifiant unique.");
  }

  const organization = await db.organization.create({
    data: { id: randomBytes(16).toString("hex"), name, slug, createdAt: new Date() },
  });
  await writeAuditLog(db, {
    action: "org.created",
    actorUserId: facts.userId,
    organizationId: organization.id,
    targetType: "organization",
    targetId: organization.id,
    metadata: { name },
  });
  return organization;
}

// ─── Création et envoi ───────────────────────────────────────────────────────

export type CreateInvitationResult = {
  invitationId: string;
  /** Jeton en clair : uniquement pour construire le lien. Jamais stocké, jamais journalisé. */
  token: string;
  url: string;
  expiresAt: Date;
  email: SendEmailResult;
};

export async function createInvitation(
  db: PrismaClient,
  actor: Actor,
  input: { organizationId: string; email: string; role: string },
  options: { baseUrl: string },
): Promise<CreateInvitationResult> {
  const facts = await loadActor(db, actor);

  if (!isOrgRole(input.role)) throw new InvitationError("ROLE_NOT_ALLOWED", "Rôle non autorisé.");
  const role = input.role;

  const organization = await db.organization.findUnique({ where: { id: input.organizationId }, select: { id: true, name: true } });
  if (!organization) throw new InvitationError("ORGANIZATION_NOT_FOUND", "Entreprise introuvable.");

  const actorOrgRole = await assertCanManage(db, facts, organization.id);
  if (!assignableRoles({ platformRole: facts.platformRole, orgRole: actorOrgRole }).includes(role)) {
    throw new InvitationError("ROLE_NOT_ALLOWED", "Vous ne pouvez pas attribuer ce rôle.");
  }

  const email = normalizeEmail(input.email);
  if (!EMAIL_PATTERN.test(email) || email.length > 254) throw new InvitationError("INVALID_EMAIL", "Adresse e-mail invalide.");

  const existingUser = await db.user.findUnique({ where: { email }, select: { id: true, platformRole: true } });
  if (existingUser?.platformRole === "SUPER_ADMIN") {
    throw new InvitationError("PLATFORM_ADMIN_EMAIL", "Cette adresse appartient à un administrateur ORKESTRA.");
  }
  if (existingUser && (await orgRoleOf(db, existingUser.id, organization.id))) {
    throw new InvitationError("ALREADY_MEMBER", "Cette personne fait déjà partie de l'entreprise.");
  }

  const recent = await db.invitation.count({
    where: { createdById: facts.userId, createdAt: { gt: new Date(Date.now() - 3_600_000) } },
  });
  if (recent >= INVITATIONS_PER_HOUR_LIMIT) throw new InvitationError("RATE_LIMITED", "Trop d'invitations envoyées. Réessayez dans une heure.");

  const token = generateInvitationToken();
  const expiresAt = new Date(Date.now() + INVITATION_TTL_HOURS * 3_600_000);
  const now = new Date();

  // Une seule invitation en attente par adresse et par entreprise : la précédente est révoquée.
  const invitation = await db.$transaction(async (tx) => {
    await tx.invitation.updateMany({
      where: { organizationId: organization.id, email, acceptedAt: null, revokedAt: null, expiresAt: { gt: now } },
      data: { revokedAt: now, revokedById: facts.userId },
    });
    return tx.invitation.create({
      data: { organizationId: organization.id, email, role, tokenHash: hashInvitationToken(token), expiresAt, createdById: facts.userId },
    });
  });

  await writeAuditLog(db, {
    action: "invitation.created",
    actorUserId: facts.userId,
    organizationId: organization.id,
    targetType: "invitation",
    targetId: invitation.id,
    metadata: { email, role },
  });

  const url = `${options.baseUrl.replace(/\/$/, "")}/invite/accept?token=${token}`;
  const emailResult = await sendEmail(
    {
      template: "invitation",
      to: email,
      data: { inviterName: facts.name, organizationName: organization.name, roleLabel: ROLE_LABELS[role], url, expiresAt },
      idempotencyKey: `invitation:${invitation.id}`,
      userId: facts.userId,
      organizationId: organization.id,
    },
    db,
  );

  return { invitationId: invitation.id, token, url, expiresAt, email: emailResult };
}

// ─── Consultation, révocation ────────────────────────────────────────────────

export type InvitationStatus = "PENDING" | "ACCEPTED" | "REVOKED" | "EXPIRED";

export function invitationStatus(inv: { acceptedAt: Date | null; revokedAt: Date | null; expiresAt: Date }, now = new Date()): InvitationStatus {
  if (inv.revokedAt) return "REVOKED";
  if (inv.acceptedAt) return "ACCEPTED";
  if (inv.expiresAt.getTime() <= now.getTime()) return "EXPIRED";
  return "PENDING";
}

export async function listInvitations(db: PrismaClient, actor: Actor, organizationId: string) {
  const facts = await loadActor(db, actor);
  await assertCanManage(db, facts, organizationId);
  const rows = await db.invitation.findMany({
    where: { organizationId },
    orderBy: { createdAt: "desc" },
    take: 100,
    select: { id: true, email: true, role: true, createdAt: true, expiresAt: true, acceptedAt: true, revokedAt: true, createdBy: { select: { name: true } } },
  });
  return rows.map((r) => ({ ...r, status: invitationStatus(r) }));
}

export async function revokeInvitation(db: PrismaClient, actor: Actor, invitationId: string): Promise<void> {
  const facts = await loadActor(db, actor);
  const invitation = await db.invitation.findUnique({ where: { id: invitationId }, select: { id: true, organizationId: true, email: true } });
  // Même réponse qu'une invitation inexistante si l'acteur n'a pas accès à cette entreprise.
  if (!invitation) throw new InvitationError("INVALID", "Invitation introuvable.");
  try {
    await assertCanManage(db, facts, invitation.organizationId);
  } catch {
    throw new InvitationError("INVALID", "Invitation introuvable.");
  }
  const { count } = await db.invitation.updateMany({
    where: { id: invitation.id, acceptedAt: null, revokedAt: null },
    data: { revokedAt: new Date(), revokedById: facts.userId },
  });
  if (count === 0) throw new InvitationError("USED", "Cette invitation n'est plus en attente.");
  await writeAuditLog(db, {
    action: "invitation.revoked",
    actorUserId: facts.userId,
    organizationId: invitation.organizationId,
    targetType: "invitation",
    targetId: invitation.id,
    metadata: { email: invitation.email },
  });
}

// ─── Acceptation ─────────────────────────────────────────────────────────────

export type InvitationDetails = {
  id: string;
  email: string;
  role: OrgRole;
  roleLabel: string;
  organizationId: string;
  organizationName: string;
  inviterName: string;
  expiresAt: Date;
};

/** Vérifie un jeton et renvoie l'invitation en attente, ou une erreur explicite. */
export async function findValidInvitation(db: PrismaClient, token: unknown): Promise<InvitationDetails> {
  if (!looksLikeInvitationToken(token)) throw new InvitationError("INVALID", "Lien d'invitation invalide.");
  const inv = await db.invitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    select: {
      id: true, email: true, role: true, organizationId: true, expiresAt: true, acceptedAt: true, revokedAt: true,
      organization: { select: { name: true } },
      createdBy: { select: { name: true } },
    },
  });
  if (!inv) throw new InvitationError("INVALID", "Lien d'invitation invalide.");
  const status = invitationStatus(inv);
  if (status === "REVOKED") throw new InvitationError("REVOKED", "Cette invitation a été annulée.");
  if (status === "ACCEPTED") throw new InvitationError("USED", "Cette invitation a déjà été utilisée.");
  if (status === "EXPIRED") throw new InvitationError("EXPIRED", "Cette invitation a expiré.");
  return {
    id: inv.id,
    email: inv.email,
    role: inv.role,
    roleLabel: ROLE_LABELS[inv.role],
    organizationId: inv.organizationId,
    organizationName: inv.organization.name,
    inviterName: inv.createdBy.name,
    expiresAt: inv.expiresAt,
  };
}

type Tx = Parameters<Parameters<PrismaClient["$transaction"]>[0]>[0];

/**
 * Consomme l'invitation (usage unique) et crée l'appartenance, dans la transaction donnée.
 * La mise à jour conditionnelle garantit qu'un jeton ne sert qu'une fois, même en cas
 * de requêtes simultanées.
 */
async function consumeAndJoin(tx: Tx, invitation: InvitationDetails, userId: string): Promise<void> {
  const { count } = await tx.invitation.updateMany({
    where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
    data: { acceptedAt: new Date(), acceptedByUserId: userId },
  });
  if (count !== 1) throw new InvitationError("USED", "Cette invitation a déjà été utilisée.");
  await tx.member.create({
    data: { id: randomBytes(16).toString("hex"), organizationId: invitation.organizationId, userId, role: invitation.role, createdAt: new Date() },
  });
}

async function auditAccepted(db: PrismaClient, invitation: InvitationDetails, userId: string, method: string) {
  await writeAuditLog(db, {
    action: "invitation.accepted",
    actorUserId: userId,
    organizationId: invitation.organizationId,
    targetType: "invitation",
    targetId: invitation.id,
    metadata: { role: invitation.role, method },
  });
}

/**
 * Nouveau compte avec mot de passe. La possession du lien (envoyé à l'adresse invitée)
 * prouve la propriété de l'adresse : le compte est créé avec l'e-mail vérifié.
 */
export async function acceptWithNewPassword(
  db: PrismaClient,
  input: { token: unknown; name: string; password: string },
  hashPassword: (password: string) => Promise<string>,
): Promise<{ userId: string; email: string; organizationId: string }> {
  const invitation = await findValidInvitation(db, input.token);
  const name = input.name.trim();
  if (name.length < 2 || name.length > 100) throw new InvitationError("INVALID_NAME", "Indiquez votre nom (2 caractères minimum).");
  if (input.password.length < 12 || input.password.length > 128) {
    throw new InvitationError("WEAK_PASSWORD", "Le mot de passe doit contenir entre 12 et 128 caractères.");
  }
  if (await db.user.findUnique({ where: { email: invitation.email }, select: { id: true } })) {
    throw new InvitationError("ACCOUNT_EXISTS", "Un compte existe déjà avec cette adresse : connectez-vous pour accepter l'invitation.");
  }

  const userId = randomBytes(16).toString("hex");
  const passwordHash = await hashPassword(input.password);
  await db.$transaction(async (tx) => {
    await tx.user.create({ data: { id: userId, name, email: invitation.email, emailVerified: true } });
    await tx.account.create({
      data: { id: randomBytes(16).toString("hex"), accountId: userId, providerId: "credential", userId, password: passwordHash },
    });
    await consumeAndJoin(tx, invitation, userId);
  });
  await auditAccepted(db, invitation, userId, "password");
  return { userId, email: invitation.email, organizationId: invitation.organizationId };
}

/** Utilisateur déjà connecté (compte existant) : l'adresse du compte doit être celle de l'invitation. */
export async function acceptAsExistingUser(db: PrismaClient, input: { token: unknown; userId: string; method?: string }) {
  const invitation = await findValidInvitation(db, input.token);
  const user = await db.user.findUnique({ where: { id: input.userId }, select: { id: true, email: true, platformRole: true } });
  if (!user) throw new InvitationError("FORBIDDEN", "Utilisateur inconnu.");
  if (user.platformRole === "SUPER_ADMIN") throw new InvitationError("PLATFORM_ADMIN_EMAIL", "Un administrateur ORKESTRA ne peut pas rejoindre une entreprise.");
  if (normalizeEmail(user.email) !== invitation.email) {
    throw new InvitationError("EMAIL_MISMATCH", `Cette invitation est destinée à ${invitation.email}.`);
  }
  if (await orgRoleOf(db, user.id, invitation.organizationId)) throw new InvitationError("ALREADY_MEMBER", "Vous faites déjà partie de cette entreprise.");

  await db.$transaction(async (tx) => {
    await consumeAndJoin(tx, invitation, user.id);
  });
  await auditAccepted(db, invitation, user.id, input.method ?? "existing-account");
  return { userId: user.id, organizationId: invitation.organizationId };
}

/**
 * Contrôle de création d'un compte via Google / Microsoft : autorisé uniquement avec une
 * invitation valide, pour la MÊME adresse, que le fournisseur déclare VÉRIFIÉE.
 */
export async function checkOAuthSignupAllowed(
  db: PrismaClient,
  token: string | null,
  providerUser: { email?: unknown; emailVerified?: unknown },
): Promise<{ allowed: true; invitation: InvitationDetails } | { allowed: false; reason: string }> {
  if (!token) return { allowed: false, reason: "invitation_required" };
  let invitation: InvitationDetails;
  try {
    invitation = await findValidInvitation(db, token);
  } catch {
    return { allowed: false, reason: "invitation_required" };
  }
  if (typeof providerUser.email !== "string" || normalizeEmail(providerUser.email) !== invitation.email) {
    return { allowed: false, reason: "invitation_email_mismatch" };
  }
  if (providerUser.emailVerified !== true) return { allowed: false, reason: "email_not_verified" };
  return { allowed: true, invitation };
}

/** Après création du compte OAuth : consommer l'invitation et rejoindre l'entreprise. */
export async function completeOAuthSignup(db: PrismaClient, token: string, user: { id: string; email: string }, provider: string) {
  const invitation = await findValidInvitation(db, token);
  if (normalizeEmail(user.email) !== invitation.email) throw new InvitationError("EMAIL_MISMATCH", "Adresse différente de l'invitation.");
  await db.$transaction(async (tx) => {
    await consumeAndJoin(tx, invitation, user.id);
  });
  await auditAccepted(db, invitation, user.id, provider);
  return { organizationId: invitation.organizationId };
}
