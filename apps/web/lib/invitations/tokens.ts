import { createHash, randomBytes } from "node:crypto";

/** Jeton d'invitation : 32 octets aléatoires (256 bits), encodés pour une URL. */
export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

/** Seul ce hash est stocké en base. Le jeton en clair n'existe que dans le lien envoyé. */
export function hashInvitationToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** Format attendu d'un jeton (évite toute requête pour une valeur manifestement invalide). */
export function looksLikeInvitationToken(value: unknown): value is string {
  return typeof value === "string" && /^[A-Za-z0-9_-]{43}$/.test(value);
}

/** Cookie temporaire qui relie un retour Google / Microsoft à l'invitation acceptée. */
export const INVITATION_COOKIE = "orkestra_invitation";
export const INVITATION_COOKIE_MAX_AGE_SECONDS = 15 * 60;

export function readInvitationCookie(headers: Headers | undefined | null): string | null {
  const cookie = headers?.get("cookie");
  if (!cookie) return null;
  for (const part of cookie.split(";")) {
    const [name, ...rest] = part.trim().split("=");
    if (name === INVITATION_COOKIE) {
      const value = decodeURIComponent(rest.join("="));
      return looksLikeInvitationToken(value) ? value : null;
    }
  }
  return null;
}
