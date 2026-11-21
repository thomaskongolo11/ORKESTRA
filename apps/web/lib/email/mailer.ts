/**
 * Envoi des e-mails transactionnels ORKESTRA.
 *
 *  - Le mode (simulé ou Resend) vient de EMAIL_MODE ; la clé Resend reste côté serveur.
 *  - Chaque tentative est suivie dans EmailLog avec le statut RÉEL : SIMULATED, ACCEPTED
 *    (identifiant Resend reçu) ou FAILED. Le contenu n'est jamais stocké (il peut contenir
 *    des liens d'invitation ou de réinitialisation).
 *  - Clé d'idempotence : un même e-mail n'est jamais envoyé deux fois.
 *  - sendEmail ne lève pas d'exception en cas d'échec d'envoi : il renvoie FAILED.
 *    L'appelant décide quoi afficher, sans jamais prétendre que l'e-mail est parti.
 */
import { createHash } from "node:crypto";
import { prisma, type PrismaClient } from "@orkestra/database";
import { getEmailEnv } from "./env";
import { resendProviderFromKey, simulatedProvider, type EmailProvider, type ProviderResult } from "./providers";
import { renderEmail, type EmailTemplateData, type EmailTemplateName } from "./templates";

export type SendEmailInput<T extends EmailTemplateName> = {
  template: T;
  to: string;
  data: EmailTemplateData[T];
  /** Identifiant stable de CET e-mail (ex. "reset-password:<hash du jeton>"). */
  idempotencyKey: string;
  userId?: string | null;
  organizationId?: string | null;
};

export type SendEmailResult = ProviderResult & { emailLogId: string; deduplicated: boolean };

let providerOverride: EmailProvider | undefined;

/** Pour les tests : remplacer le fournisseur (ex. faux client Resend). */
export function setEmailProviderForTests(provider: EmailProvider | undefined): void {
  providerOverride = provider;
}

function currentProvider(): EmailProvider {
  if (providerOverride) return providerOverride;
  const env = getEmailEnv();
  if (env.EMAIL_MODE === "resend") return resendProviderFromKey(env.RESEND_API_KEY as string);
  return simulatedProvider;
}

/** Hache une valeur sensible (jeton) pour l'utiliser dans une clé d'idempotence. */
export function hashForKey(value: string): string {
  return createHash("sha256").update(value).digest("hex").slice(0, 32);
}

export async function sendEmail<T extends EmailTemplateName>(
  input: SendEmailInput<T>,
  db: PrismaClient = prisma,
): Promise<SendEmailResult> {
  const env = getEmailEnv();
  const provider = currentProvider();
  const to = input.to.trim().toLowerCase();

  // Déjà envoyé (ou simulé) avec la même clé : on ne renvoie pas.
  const existing = await db.emailLog.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing && existing.status !== "FAILED") {
    const previous: ProviderResult =
      existing.status === "SIMULATED"
        ? { status: "SIMULATED" }
        : { status: "ACCEPTED", providerMessageId: existing.providerMessageId ?? "" };
    return { ...previous, emailLogId: existing.id, deduplicated: true };
  }

  const rendered = await renderEmail(input.template, input.data);
  const result = await provider.send({
    from: env.EMAIL_FROM,
    to,
    subject: rendered.subject,
    html: rendered.html,
    text: rendered.text,
    replyTo: env.EMAIL_REPLY_TO,
    idempotencyKey: input.idempotencyKey,
  });

  const record = {
    template: input.template,
    toEmail: to,
    subject: rendered.subject,
    status: result.status,
    provider: provider.name,
    providerMessageId: result.status === "ACCEPTED" ? result.providerMessageId : null,
    error: result.status === "FAILED" ? result.error.slice(0, 1000) : null,
    userId: input.userId ?? null,
    organizationId: input.organizationId ?? null,
  };

  const log = await db.emailLog.upsert({
    where: { idempotencyKey: input.idempotencyKey },
    create: { ...record, idempotencyKey: input.idempotencyKey },
    update: record,
  });

  if (result.status === "FAILED") {
    console.error(`[email] Échec d'envoi (${input.template}) via ${provider.name} : ${result.error}`);
  }

  return { ...result, emailLogId: log.id, deduplicated: false };
}
