import { randomUUID } from "node:crypto";
import type { PrismaClient } from "@orkestra/database";
import { writeAuditLog, type AuditAction } from "../auth/audit";
import { sendEmail } from "./mailer";
import type { SecurityEventKind } from "./templates/security-notification";

const AUDIT_ACTIONS: Record<SecurityEventKind, AuditAction> = {
  "password-changed": "auth.password.changed",
  "two-factor-enabled": "auth.2fa.enabled",
  "two-factor-disabled": "auth.2fa.disabled",
  "account-linked": "auth.account.linked",
};

/**
 * Événement de sécurité sur un compte : entrée d'audit + e-mail de notification au titulaire.
 * Ne lève jamais d'exception (une notification ne doit pas faire échouer l'action de l'utilisateur).
 */
export async function notifySecurityEvent(
  db: PrismaClient,
  userId: string,
  kind: SecurityEventKind,
  options: { detail?: string; ipAddress?: string | null; userAgent?: string | null } = {},
): Promise<void> {
  try {
    const user = await db.user.findUnique({ where: { id: userId }, select: { email: true, name: true } });
    if (!user) return;

    await writeAuditLog(db, {
      action: AUDIT_ACTIONS[kind],
      actorUserId: userId,
      targetType: "user",
      targetId: userId,
      ipAddress: options.ipAddress ?? null,
      userAgent: options.userAgent ?? null,
      ...(options.detail ? { metadata: { detail: options.detail } } : {}),
    });

    await sendEmail(
      {
        template: "security-notification",
        to: user.email,
        data: { kind, name: user.name, occurredAt: new Date(), detail: options.detail },
        idempotencyKey: `security:${kind}:${userId}:${randomUUID()}`,
        userId,
      },
      db,
    );
  } catch (error) {
    console.error(`[email] Notification de sécurité impossible (${kind})`, error);
  }
}
