import type { PrismaClient } from "@orkestra/database";

/**
 * Actions de sécurité journalisées. Le journal est en ajout seul (trigger PostgreSQL).
 */
export type AuditAction =
  | "auth.super_admin.created"
  | "auth.super_admin.oauth_blocked"
  | "auth.super_admin.2fa_disable_blocked"
  | "auth.signup.blocked"
  | "auth.platform_role.change_blocked"
  | "auth.account_link.blocked";

export type AuditEntry = {
  action: AuditAction;
  actorUserId?: string | null;
  organizationId?: string | null;
  targetType?: string | null;
  targetId?: string | null;
  ipAddress?: string | null;
  userAgent?: string | null;
  metadata?: Record<string, string | number | boolean | null>;
};

/** Extrait l'adresse IP et le navigateur des en-têtes d'une requête. */
export function requestMeta(headers: Headers | undefined | null): { ipAddress: string | null; userAgent: string | null } {
  if (!headers) return { ipAddress: null, userAgent: null };
  const forwarded = headers.get("x-forwarded-for")?.split(",")[0]?.trim();
  return {
    ipAddress: forwarded || headers.get("x-real-ip") || null,
    userAgent: headers.get("user-agent")?.slice(0, 512) ?? null,
  };
}

/**
 * Écrit une entrée d'audit. Ne doit jamais faire échouer l'opération appelante
 * pour une raison de journalisation : l'erreur est signalée dans les logs serveur.
 */
export async function writeAuditLog(db: PrismaClient, entry: AuditEntry): Promise<void> {
  try {
    await db.auditLog.create({
      data: {
        action: entry.action,
        actorUserId: entry.actorUserId ?? null,
        organizationId: entry.organizationId ?? null,
        targetType: entry.targetType ?? null,
        targetId: entry.targetId ?? null,
        ipAddress: entry.ipAddress ?? null,
        userAgent: entry.userAgent ?? null,
        ...(entry.metadata ? { metadata: entry.metadata } : {}),
      },
    });
  } catch (error) {
    console.error("[audit] Impossible d'écrire l'entrée d'audit", entry.action, error);
  }
}
