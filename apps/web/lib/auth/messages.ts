/**
 * Messages d'erreur affichés à l'utilisateur, en français.
 * Volontairement génériques quand une précision permettrait de deviner
 * si un compte existe (protection contre l'énumération).
 */
const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "E-mail ou mot de passe incorrect.",
  EMAIL_NOT_VERIFIED: "Votre adresse e-mail n'est pas encore vérifiée.",
  INVALID_CODE: "Code incorrect. Vérifiez l'heure de votre téléphone et réessayez.",
  INVALID_BACKUP_CODE: "Code de récupération incorrect ou déjà utilisé.",
  INVALID_TWO_FACTOR_COOKIE: "La vérification a expiré. Reconnectez-vous.",
  ACCOUNT_TEMPORARILY_LOCKED: "Trop de codes incorrects. Le compte est verrouillé temporairement, réessayez dans 15 minutes.",
  INVALID_PASSWORD: "Mot de passe incorrect.",
  PASSWORD_TOO_SHORT: "Le mot de passe doit contenir au moins 12 caractères.",
  PASSWORD_TOO_LONG: "Le mot de passe est trop long (128 caractères maximum).",
  INVALID_TOKEN: "Ce lien n'est plus valide. Demandez-en un nouveau.",
  RESET_PASSWORD_DISABLED: "La réinitialisation par e-mail n'est pas encore disponible.",
  SESSION_EXPIRED: "Votre session a expiré. Reconnectez-vous.",
  // Codes renvoyés par les règles ORKESTRA (lib/auth/hooks.ts)
  invitation_required: "Aucun compte ORKESTRA n'est associé à cette identité. L'accès se fait uniquement sur invitation.",
  super_admin_password_only: "Ce compte se connecte uniquement par e-mail et mot de passe.",
  // Erreurs OAuth fréquentes
  access_denied: "La connexion a été annulée.",
  account_not_linked: "Cette méthode de connexion n'est pas associée à votre compte. Connectez-vous d'abord, puis associez-la depuis vos paramètres de sécurité.",
  signup_disabled: "Aucun compte ORKESTRA n'est associé à cette identité. L'accès se fait uniquement sur invitation.",
};

const REASONS: Record<string, string> = {
  "session-expired": "Votre session a expiré. Reconnectez-vous.",
  reauthenticate: "Pour cette action sensible, confirmez votre identité en vous reconnectant.",
  "signed-out": "Vous êtes déconnecté.",
  "password-reset": "Mot de passe modifié. Vous pouvez vous connecter.",
};

export type AuthErrorLike = { code?: string | undefined; status?: number | undefined; message?: string | undefined } | null | undefined;

export function authErrorMessage(error: AuthErrorLike | string): string {
  if (typeof error === "string") return MESSAGES[error] ?? MESSAGES[error.toUpperCase()] ?? "La connexion n'a pas abouti. Réessayez.";
  if (!error) return "Une erreur est survenue. Réessayez.";
  if (error.status === 429) return "Trop de tentatives. Patientez une minute avant de réessayer.";
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code]!;
  return "Une erreur est survenue. Réessayez.";
}

export function reasonMessage(reason: string | undefined): string | null {
  return reason ? (REASONS[reason] ?? null) : null;
}

/**
 * N'accepte qu'un chemin interne ("/admin", "/overview?x=1") : empêche les redirections
 * ouvertes vers un autre site (//exemple.com, https://...).
 */
export function safeInternalPath(value: string | string[] | undefined): string | null {
  const path = Array.isArray(value) ? value[0] : value;
  if (!path || !path.startsWith("/") || path.startsWith("//") || path.startsWith("/\\")) return null;
  return path;
}

export function firstParam(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
