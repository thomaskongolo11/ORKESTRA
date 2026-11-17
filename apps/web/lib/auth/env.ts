import { authEnvSchema, readAuthEnv, type AuthEnv } from "@orkestra/validation";

const DEV_PLACEHOLDER_SECRET = "orkestra-dev-only-secret-not-for-production-0000";

let cached: AuthEnv | undefined;

/**
 * Variables d'environnement de l'authentification, validées par Zod.
 *
 * - Production (exécution) : toute variable manquante ou invalide arrête le serveur.
 * - Développement et compilation (`next build`) : un secret de développement est
 *   utilisé si BETTER_AUTH_SECRET est absent, avec un avertissement.
 */
export function getAuthEnv(): AuthEnv {
  if (cached) return cached;

  const raw = readAuthEnv(process.env);
  const isBuild = process.env.NEXT_PHASE === "phase-production-build";
  const isProductionRuntime = process.env.NODE_ENV === "production" && !isBuild;

  if (!isProductionRuntime) {
    if (!raw.BETTER_AUTH_SECRET) {
      if (!isBuild) console.warn("[auth] BETTER_AUTH_SECRET absent : secret de développement utilisé. Interdit en production.");
      raw.BETTER_AUTH_SECRET = DEV_PLACEHOLDER_SECRET;
    }
    raw.BETTER_AUTH_URL ??= "http://localhost:3000";
  }

  const parsed = authEnvSchema.safeParse(raw);
  if (!parsed.success) {
    const details = parsed.error.issues.map((issue) => `- ${issue.path.join(".") || "env"} : ${issue.message}`).join("\n");
    throw new Error(`Configuration de l'authentification invalide :\n${details}`);
  }
  if (isProductionRuntime && parsed.data.BETTER_AUTH_SECRET === DEV_PLACEHOLDER_SECRET) {
    throw new Error("Le secret de développement ne peut pas être utilisé en production.");
  }

  cached = parsed.data;
  return cached;
}
