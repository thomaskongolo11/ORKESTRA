import { getAuthEnv } from "./env";

export type SocialProvider = "google" | "microsoft";

/** Fournisseurs OAuth réellement configurés (identifiants présents côté serveur). */
export function enabledSocialProviders(): Record<SocialProvider, boolean> {
  const env = getAuthEnv();
  return {
    google: Boolean(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET),
    microsoft: Boolean(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET),
  };
}
