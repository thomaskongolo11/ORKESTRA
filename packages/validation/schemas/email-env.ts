import { z } from "zod";

/**
 * Variables d'environnement des e-mails transactionnels (côté serveur uniquement).
 *
 * EMAIL_MODE :
 *  - "simulated" : aucun envoi réel. L'e-mail est enregistré avec le statut SIMULATED.
 *    Interdit en production (sinon les utilisateurs ne recevraient rien, sans le savoir).
 *  - "resend"    : envoi réel via Resend. RESEND_API_KEY et EMAIL_FROM sont obligatoires.
 */
export const emailEnvSchema = z
  .object({
    EMAIL_MODE: z.enum(["simulated", "resend"]).default("simulated"),
    EMAIL_FROM: z.string().min(3).default("ORKESTRA <no-reply@orkestra.local>"),
    EMAIL_REPLY_TO: z.email().optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
  })
  .refine((env) => env.EMAIL_MODE !== "resend" || Boolean(env.RESEND_API_KEY), {
    message: "RESEND_API_KEY est obligatoire quand EMAIL_MODE vaut \"resend\".",
    path: ["RESEND_API_KEY"],
  });

export type EmailEnv = z.infer<typeof emailEnvSchema>;

export function readEmailEnv(source: Record<string, string | undefined>): Record<string, string | undefined> {
  const keys = ["EMAIL_MODE", "EMAIL_FROM", "EMAIL_REPLY_TO", "RESEND_API_KEY"] as const;
  const result: Record<string, string | undefined> = {};
  for (const key of keys) {
    const value = source[key]?.trim();
    result[key] = value ? value : undefined;
  }
  return result;
}
