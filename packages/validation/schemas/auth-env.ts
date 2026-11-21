import { z } from "zod";

/**
 * Variables d'environnement du module d'authentification.
 * Lues uniquement côté serveur. Aucune ne doit commencer par NEXT_PUBLIC_.
 */
export const authEnvSchema = z
  .object({
    BETTER_AUTH_SECRET: z
      .string()
      .min(32, "BETTER_AUTH_SECRET doit contenir au moins 32 caractères (générer avec : openssl rand -base64 32)"),
    BETTER_AUTH_URL: z.url("BETTER_AUTH_URL doit être une URL complète, par exemple http://localhost:3000"),

    GOOGLE_CLIENT_ID: z.string().min(1).optional(),
    GOOGLE_CLIENT_SECRET: z.string().min(1).optional(),

    MICROSOFT_CLIENT_ID: z.string().min(1).optional(),
    MICROSOFT_CLIENT_SECRET: z.string().min(1).optional(),
    /** "common", "organizations", "consumers" ou l'identifiant d'un tenant Entra précis. */
    MICROSOFT_TENANT_ID: z.string().min(1).optional(),
  })
  .refine((env) => Boolean(env.GOOGLE_CLIENT_ID) === Boolean(env.GOOGLE_CLIENT_SECRET), {
    message: "GOOGLE_CLIENT_ID et GOOGLE_CLIENT_SECRET doivent être définis ensemble.",
  })
  .refine((env) => Boolean(env.MICROSOFT_CLIENT_ID) === Boolean(env.MICROSOFT_CLIENT_SECRET), {
    message: "MICROSOFT_CLIENT_ID et MICROSOFT_CLIENT_SECRET doivent être définis ensemble.",
  });

export type AuthEnv = z.infer<typeof authEnvSchema>;

/** Transforme une chaîne vide en undefined (les lignes vides de .env). */
export function readAuthEnv(source: Record<string, string | undefined>): Record<string, string | undefined> {
  const keys = [
    "BETTER_AUTH_SECRET",
    "BETTER_AUTH_URL",
    "GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_SECRET",
    "MICROSOFT_CLIENT_ID",
    "MICROSOFT_CLIENT_SECRET",
    "MICROSOFT_TENANT_ID",
  ] as const;
  const result: Record<string, string | undefined> = {};
  for (const key of keys) {
    const value = source[key]?.trim();
    result[key] = value ? value : undefined;
  }
  return result;
}
