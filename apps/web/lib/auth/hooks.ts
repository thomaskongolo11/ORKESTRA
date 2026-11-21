/**
 * Règles de sécurité ORKESTRA branchées sur Better Auth.
 *
 *  1. Inscription sur invitation uniquement : toute création de compte par une
 *     requête est refusée (le lot D autorisera la création liée à une invitation valide).
 *  2. SUPER_ADMIN : e-mail + mot de passe uniquement. Toute connexion ou association
 *     Google / Microsoft est refusée, à trois niveaux (validateUserInfo, création
 *     de compte lié, création de session depuis un retour OAuth).
 *  3. Le rôle de plateforme ne peut jamais être modifié par une requête.
 *  4. Un SUPER_ADMIN ne peut pas désactiver sa 2FA.
 *  5. La session d'un SUPER_ADMIN expire au plus tard 8 h après la connexion.
 */
import type { PrismaClient } from "@orkestra/database";
import { APIError, createAuthMiddleware, getSessionFromCtx } from "better-auth/api";
import { requestMeta, writeAuditLog } from "./audit";
import { SUPER_ADMIN_SESSION_MAX_AGE_SECONDS } from "./roles";

/** Contexte minimal transmis par Better Auth aux hooks (null pour un appel interne). */
type HookContext =
  | {
      path?: string | undefined;
      request?: Request | undefined;
      headers?: Headers | undefined;
      getSignedCookie?: ((name: string, secret: string) => Promise<string | null | false>) | undefined;
      context?: { secret: string; authCookies: { sessionToken: { name: string } } } | undefined;
    }
  | null
  | undefined;

const OAUTH_CALLBACK_PATH = /^\/(oauth2\/)?callback(\/|$)/;

export function isOAuthCallbackPath(path: string | undefined): boolean {
  return typeof path === "string" && OAUTH_CALLBACK_PATH.test(path);
}

function headersOf(ctx: HookContext): Headers | undefined {
  return ctx?.headers ?? ctx?.request?.headers;
}

/** Événements de sécurité signalés au titulaire du compte (e-mail + audit). */
export type SecurityEventHandler = (
  userId: string,
  kind: "two-factor-enabled" | "two-factor-disabled" | "account-linked",
  meta: { detail?: string; ipAddress: string | null; userAgent: string | null },
) => Promise<void>;

export function createAuthHooks(db: PrismaClient, onSecurityEvent?: SecurityEventHandler) {
  async function isSuperAdmin(userId: unknown): Promise<boolean> {
    if (typeof userId !== "string" || userId.length === 0) return false;
    const user = await db.user.findUnique({ where: { id: userId }, select: { platformRole: true } });
    return user?.platformRole === "SUPER_ADMIN";
  }

  /** Point de contrôle officiel de Better Auth : création, association, connexion OAuth. */
  async function validateUserInfo(
    data: { user: Record<string, unknown>; source: { action: string; method: string; oauth?: { providerId: string } | undefined } },
    ctx: HookContext,
  ): Promise<void | { error: string; errorDescription?: string }> {
    const { user, source } = data;
    const meta = requestMeta(headersOf(ctx));

    if (source.action === "create-user") {
      await writeAuditLog(db, {
        action: "auth.signup.blocked",
        targetType: "email",
        targetId: typeof user.email === "string" ? user.email : null,
        ...meta,
        metadata: { method: source.method, provider: source.oauth?.providerId ?? null },
      });
      return {
        error: "invitation_required",
        errorDescription: "La création de compte se fait uniquement sur invitation.",
      };
    }

    if ((source.action === "sign-in" || source.action === "link-account") && source.method !== "email-password") {
      if (await isSuperAdmin(user.id)) {
        await writeAuditLog(db, {
          action: "auth.super_admin.oauth_blocked",
          actorUserId: user.id as string,
          targetType: "user",
          targetId: user.id as string,
          ...meta,
          metadata: { action: source.action, method: source.method, provider: source.oauth?.providerId ?? null },
        });
        return {
          error: "super_admin_password_only",
          errorDescription: "Ce compte se connecte uniquement par e-mail et mot de passe.",
        };
      }
    }
  }

  const databaseHooks = {
    user: {
      update: {
        before: async (user: Record<string, unknown>, ctx: HookContext) => {
          if ("platformRole" in user && ctx) {
            await writeAuditLog(db, {
              action: "auth.platform_role.change_blocked",
              targetType: "user",
              targetId: typeof user.id === "string" ? user.id : null,
              ...requestMeta(headersOf(ctx)),
              metadata: { path: ctx.path ?? null },
            });
            throw new APIError("FORBIDDEN", { message: "Le rôle de plateforme ne peut pas être modifié." });
          }
        },
        /** Activation / désactivation de la 2FA : notification au titulaire. */
        after: async (user: Record<string, unknown>, ctx: HookContext) => {
          if (!onSecurityEvent || typeof user.id !== "string") return;
          const meta = requestMeta(headersOf(ctx));
          if (ctx?.path === "/two-factor/verify-totp" && user.twoFactorEnabled === true) {
            await onSecurityEvent(user.id, "two-factor-enabled", meta);
          } else if (ctx?.path === "/two-factor/disable" && user.twoFactorEnabled === false) {
            await onSecurityEvent(user.id, "two-factor-disabled", meta);
          }
        },
      },
    },
    account: {
      create: {
        before: async (account: Record<string, unknown>, ctx: HookContext) => {
          if (account.providerId !== "credential" && (await isSuperAdmin(account.userId))) {
            await writeAuditLog(db, {
              action: "auth.account_link.blocked",
              actorUserId: account.userId as string,
              targetType: "user",
              targetId: account.userId as string,
              ...requestMeta(headersOf(ctx)),
              metadata: { provider: String(account.providerId) },
            });
            throw new APIError("FORBIDDEN", { message: "Ce compte se connecte uniquement par e-mail et mot de passe." });
          }
        },
        /** Nouvelle méthode de connexion associée à un compte existant : notification. */
        after: async (account: Record<string, unknown>, ctx: HookContext) => {
          if (!onSecurityEvent || account.providerId === "credential" || typeof account.userId !== "string") return;
          const owner = await db.user.findUnique({ where: { id: account.userId }, select: { createdAt: true } });
          // Compte créé à l'instant (première connexion) : ce n'est pas une association.
          if (!owner || Date.now() - owner.createdAt.getTime() < 60_000) return;
          const provider = String(account.providerId);
          await onSecurityEvent(account.userId, "account-linked", {
            detail: provider.charAt(0).toUpperCase() + provider.slice(1),
            ...requestMeta(headersOf(ctx)),
          });
        },
      },
    },
    session: {
      create: {
        before: async (session: Record<string, unknown> & { userId: string; expiresAt: Date }, ctx: HookContext) => {
          if (!(await isSuperAdmin(session.userId))) return;

          if (isOAuthCallbackPath(ctx?.path)) {
            await writeAuditLog(db, {
              action: "auth.super_admin.oauth_blocked",
              actorUserId: session.userId,
              targetType: "session",
              ...requestMeta(headersOf(ctx)),
              metadata: { path: ctx?.path ?? null },
            });
            throw new APIError("FORBIDDEN", { message: "Ce compte se connecte uniquement par e-mail et mot de passe." });
          }

          const maxExpiry = new Date(Date.now() + SUPER_ADMIN_SESSION_MAX_AGE_SECONDS * 1000);
          const expiresAt = new Date(session.expiresAt);
          return { data: { ...session, expiresAt: expiresAt < maxExpiry ? expiresAt : maxExpiry } };
        },
      },
      update: {
        /**
         * Better Auth prolonge les sessions actives (updateAge). Pour un SUPER_ADMIN,
         * l'expiration reste plafonnée à 8 h après la connexion, quelle que soit l'activité.
         * Le hook ne reçoit que les champs modifiés : la session est retrouvée par son cookie signé.
         */
        before: async (data: Record<string, unknown>, ctx: HookContext) => {
          if (!data.expiresAt || !ctx?.getSignedCookie || !ctx.context) return;
          const token = await ctx.getSignedCookie(ctx.context.authCookies.sessionToken.name, ctx.context.secret);
          if (!token) return;
          const current = await db.session.findUnique({
            where: { token },
            select: { createdAt: true, user: { select: { platformRole: true } } },
          });
          if (current?.user.platformRole !== "SUPER_ADMIN") return;
          const cap = new Date(current.createdAt.getTime() + SUPER_ADMIN_SESSION_MAX_AGE_SECONDS * 1000);
          const requested = new Date(data.expiresAt as string | Date);
          if (requested > cap) return { data: { ...data, expiresAt: cap } };
        },
      },
    },
  };

  /** Middleware exécuté avant chaque endpoint Better Auth. */
  const before = createAuthMiddleware(async (ctx) => {
    if (ctx.path !== "/two-factor/disable") return;
    const session = await getSessionFromCtx(ctx);
    if (session && (await isSuperAdmin(session.user.id))) {
      await writeAuditLog(db, {
        action: "auth.super_admin.2fa_disable_blocked",
        actorUserId: session.user.id,
        targetType: "user",
        targetId: session.user.id,
        ...requestMeta(ctx.headers),
      });
      throw new APIError("FORBIDDEN", { message: "La double authentification est obligatoire pour ce compte." });
    }
  });

  return { validateUserInfo, databaseHooks, before };
}
