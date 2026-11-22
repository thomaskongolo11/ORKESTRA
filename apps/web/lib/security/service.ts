/**
 * Paramètres de sécurité d'un compte (logique serveur).
 *
 * Les sessions sont listées et révoquées côté serveur, par identifiant, en vérifiant
 * qu'elles appartiennent à l'utilisateur. Les jetons de session ne sont JAMAIS
 * envoyés au navigateur (contrairement à l'endpoint list-sessions de Better Auth).
 */
import type { PrismaClient } from "@orkestra/database";
import { writeAuditLog } from "../auth/audit";

export type SessionView = {
  id: string;
  current: boolean;
  device: string;
  ipAddress: string | null;
  createdAt: Date;
  lastActiveAt: Date;
  expiresAt: Date;
};

/** Description lisible d'un navigateur à partir de son User-Agent (approximative, indicative). */
export function describeUserAgent(userAgent: string | null | undefined): string {
  if (!userAgent) return "Appareil inconnu";
  const ua = userAgent;
  const browser = /Edg\//.test(ua)
    ? "Edge"
    : /OPR\//.test(ua)
      ? "Opera"
      : /Firefox\//.test(ua)
        ? "Firefox"
        : /Chrome\//.test(ua)
          ? "Chrome"
          : /Safari\//.test(ua)
            ? "Safari"
            : null;
  const os = /Windows/.test(ua)
    ? "Windows"
    : /iPhone|iPad/.test(ua)
      ? "iOS"
      : /Android/.test(ua)
        ? "Android"
        : /Mac OS X/.test(ua)
          ? "macOS"
          : /Linux/.test(ua)
            ? "Linux"
            : null;
  if (browser && os) return `${browser} sur ${os}`;
  return browser ?? os ?? "Appareil inconnu";
}

export async function listUserSessions(db: PrismaClient, userId: string, currentSessionId: string): Promise<SessionView[]> {
  const sessions = await db.session.findMany({
    where: { userId, expiresAt: { gt: new Date() } },
    orderBy: { updatedAt: "desc" },
    select: { id: true, ipAddress: true, userAgent: true, createdAt: true, updatedAt: true, expiresAt: true },
  });
  return sessions
    .map((s) => ({
      id: s.id,
      current: s.id === currentSessionId,
      device: describeUserAgent(s.userAgent),
      ipAddress: s.ipAddress,
      createdAt: s.createdAt,
      lastActiveAt: s.updatedAt,
      expiresAt: s.expiresAt,
    }))
    .sort((a, b) => Number(b.current) - Number(a.current));
}

/** Révoque UNE session de l'utilisateur. Sans effet (false) si la session n'est pas à lui. */
export async function revokeUserSession(db: PrismaClient, userId: string, sessionId: string): Promise<boolean> {
  const { count } = await db.session.deleteMany({ where: { id: sessionId, userId } });
  if (count > 0) {
    await writeAuditLog(db, { action: "auth.session.revoked", actorUserId: userId, targetType: "session", targetId: sessionId });
  }
  return count > 0;
}

/** Révoque toutes les sessions de l'utilisateur sauf la session courante. */
export async function revokeOtherUserSessions(db: PrismaClient, userId: string, currentSessionId: string): Promise<number> {
  const { count } = await db.session.deleteMany({ where: { userId, id: { not: currentSessionId } } });
  if (count > 0) {
    await writeAuditLog(db, {
      action: "auth.session.revoked_others",
      actorUserId: userId,
      targetType: "user",
      targetId: userId,
      metadata: { count },
    });
  }
  return count;
}

export type LoginMethods = {
  password: boolean;
  google: boolean;
  microsoft: boolean;
  /** Nombre total de méthodes : on ne peut pas retirer la dernière. */
  count: number;
};

export async function listLoginMethods(db: PrismaClient, userId: string): Promise<LoginMethods> {
  const accounts = await db.account.findMany({ where: { userId }, select: { providerId: true } });
  const ids = new Set(accounts.map((a) => a.providerId));
  return { password: ids.has("credential"), google: ids.has("google"), microsoft: ids.has("microsoft"), count: accounts.length };
}
