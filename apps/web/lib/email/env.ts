import { emailEnvSchema, readEmailEnv, type EmailEnv } from "@orkestra/validation";

let cached: EmailEnv | undefined;

/** Configuration des e-mails, validée. Le mode simulé est refusé en production. */
export function getEmailEnv(): EmailEnv {
  if (cached) return cached;
  const parsed = emailEnvSchema.safeParse(readEmailEnv(process.env));
  if (!parsed.success) {
    const details = parsed.error.issues.map((i) => `- ${i.path.join(".") || "env"} : ${i.message}`).join("\n");
    throw new Error(`Configuration des e-mails invalide :\n${details}`);
  }
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  if (process.env.NODE_ENV === "production" && !isBuild && parsed.data.EMAIL_MODE === "simulated") {
    throw new Error(
      "EMAIL_MODE=simulated est interdit en production : aucun e-mail ne serait envoyé. Configure Resend (EMAIL_MODE=resend).",
    );
  }
  cached = parsed.data;
  return cached;
}

/** Pour les tests uniquement : relire l'environnement. */
export function resetEmailEnvCache(): void {
  cached = undefined;
}
