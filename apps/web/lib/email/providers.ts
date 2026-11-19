/**
 * Fournisseurs d'envoi.
 *
 * Règle ORKESTRA : un e-mail n'est considéré « accepté » QUE si le fournisseur a
 * renvoyé un identifiant de message. Accepté ne veut pas dire livré : la livraison
 * ne peut être confirmée que par un webhook Resend (statut DELIVERED, à brancher).
 */
import { Resend } from "resend";

export type OutgoingEmail = {
  from: string;
  to: string;
  subject: string;
  html: string;
  text: string;
  replyTo?: string | undefined;
  idempotencyKey: string;
};

export type ProviderResult =
  | { status: "SIMULATED" }
  | { status: "ACCEPTED"; providerMessageId: string }
  | { status: "FAILED"; error: string };

export interface EmailProvider {
  readonly name: "simulated" | "resend";
  send(email: OutgoingEmail): Promise<ProviderResult>;
}

// ─── Mode simulé ─────────────────────────────────────────────────────────────

export type SimulatedEmail = OutgoingEmail & { sentAt: Date };

const globalOutbox = globalThis as unknown as { orkestraSimulatedOutbox?: SimulatedEmail[] };

/** Derniers e-mails simulés (mémoire du processus, hors production). Utile en développement et en test. */
export function simulatedOutbox(): SimulatedEmail[] {
  if (process.env.NODE_ENV === "production") return [];
  globalOutbox.orkestraSimulatedOutbox ??= [];
  return globalOutbox.orkestraSimulatedOutbox;
}

export const simulatedProvider: EmailProvider = {
  name: "simulated",
  async send(email) {
    const outbox = simulatedOutbox();
    outbox.push({ ...email, sentAt: new Date() });
    if (outbox.length > 50) outbox.splice(0, outbox.length - 50);

    if (process.env.NODE_ENV === "development") {
      const links = [...email.text.matchAll(/https?:\/\/\S+/g)].map((m) => m[0]);
      console.info(
        [
          "",
          "┌─ E-MAIL SIMULÉ (aucun envoi réel) ─────────────────────────",
          `│ À       : ${email.to}`,
          `│ Sujet   : ${email.subject}`,
          ...links.map((link) => `│ Lien    : ${link}`),
          "└────────────────────────────────────────────────────────────",
        ].join("\n"),
      );
    }
    return { status: "SIMULATED" };
  },
};

// ─── Resend ──────────────────────────────────────────────────────────────────

/** Interface minimale du client Resend utilisée (permet de le remplacer dans les tests). */
export type ResendLike = {
  emails: {
    send: (
      payload: { from: string; to: string; subject: string; html: string; text: string; replyTo?: string },
      options?: { idempotencyKey?: string },
    ) => Promise<{ data: { id: string } | null; error: { message: string; name?: string } | null }>;
  };
};

export function createResendProvider(client: ResendLike): EmailProvider {
  return {
    name: "resend",
    async send(email) {
      try {
        const { data, error } = await client.emails.send(
          {
            from: email.from,
            to: email.to,
            subject: email.subject,
            html: email.html,
            text: email.text,
            ...(email.replyTo ? { replyTo: email.replyTo } : {}),
          },
          { idempotencyKey: email.idempotencyKey },
        );
        if (error) return { status: "FAILED", error: `${error.name ?? "resend_error"}: ${error.message}` };
        if (!data?.id) return { status: "FAILED", error: "Réponse Resend sans identifiant de message." };
        return { status: "ACCEPTED", providerMessageId: data.id };
      } catch (error) {
        return { status: "FAILED", error: error instanceof Error ? error.message : String(error) };
      }
    },
  };
}

export function resendProviderFromKey(apiKey: string): EmailProvider {
  return createResendProvider(new Resend(apiKey) as unknown as ResendLike);
}
