/**
 * Configuration Better Auth d'ORKESTRA (côté serveur uniquement).
 *
 * Choix de sécurité (vérifiés dans le code de better-auth 1.7.25) :
 *  - inscription publique désactivée (e-mail ET fournisseurs OAuth) ;
 *  - jetons de vérification / réinitialisation stockés hachés (défaut : en clair) ;
 *  - aucune association automatique de comptes (uniquement depuis les paramètres, connecté) ;
 *  - cache de session en cookie désactivé : une révocation prend effet immédiatement ;
 *  - limitation des tentatives stockée en base, règles renforcées sur les endpoints sensibles ;
 *  - 2FA TOTP : secret et codes de récupération chiffrés, verrouillage après 5 échecs.
 */
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { prisma } from "@orkestra/database";
import { betterAuth } from "better-auth";
import { nextCookies } from "better-auth/next-js";
import { organization, twoFactor } from "better-auth/plugins";
import { hashForKey, sendEmail } from "../email/mailer";
import { notifySecurityEvent } from "../email/security";
import { ac, orgRoles } from "./access-control";
import { writeAuditLog } from "./audit";
import { getAuthEnv } from "./env";
import { createAuthHooks } from "./hooks";

const env = getAuthEnv();
const hooks = createAuthHooks(prisma, (userId, kind, meta) => notifySecurityEvent(prisma, userId, kind, meta));

/**
 * Lance une tâche sans faire attendre la réponse HTTP. Pour la réinitialisation du
 * mot de passe, c'est aussi une protection : la durée de la réponse ne révèle pas
 * si un compte existe (l'e-mail n'est préparé que pour un compte existant).
 */
function inBackground(task: Promise<unknown>, label: string): void {
  task.catch((error: unknown) => console.error(`[auth] Tâche en arrière-plan échouée (${label})`, error));
}
const isProduction = process.env.NODE_ENV === "production";

const socialProviders = {
  ...(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET
    ? {
        google: {
          clientId: env.GOOGLE_CLIENT_ID,
          clientSecret: env.GOOGLE_CLIENT_SECRET,
          disableImplicitSignUp: true,
        },
      }
    : {}),
  ...(env.MICROSOFT_CLIENT_ID && env.MICROSOFT_CLIENT_SECRET
    ? {
        microsoft: {
          clientId: env.MICROSOFT_CLIENT_ID,
          clientSecret: env.MICROSOFT_CLIENT_SECRET,
          tenantId: env.MICROSOFT_TENANT_ID ?? "common",
          disableImplicitSignUp: true,
        },
      }
    : {}),
};

export const auth = betterAuth({
  appName: "ORKESTRA",
  baseURL: env.BETTER_AUTH_URL,
  secret: env.BETTER_AUTH_SECRET,
  trustedOrigins: [env.BETTER_AUTH_URL],
  database: prismaAdapter(prisma, { provider: "postgresql" }),

  emailAndPassword: {
    enabled: true,
    disableSignUp: true,
    requireEmailVerification: true,
    minPasswordLength: 12,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    resetPasswordTokenExpiresIn: 60 * 60,
    sendResetPassword: async ({ user, url, token }) => {
      inBackground(
        (async () => {
          await writeAuditLog(prisma, {
            action: "auth.password.reset_requested",
            actorUserId: user.id,
            targetType: "user",
            targetId: user.id,
          });
          await sendEmail({
            template: "reset-password",
            to: user.email,
            data: { name: user.name, url, expiresInMinutes: 60 },
            idempotencyKey: `reset-password:${hashForKey(token)}`,
            userId: user.id,
          });
        })(),
        "reset-password",
      );
    },
    onPasswordReset: async ({ user }) => {
      inBackground(notifySecurityEvent(prisma, user.id, "password-changed"), "password-changed");
    },
  },

  socialProviders,

  account: {
    accountLinking: {
      enabled: true,
      disableImplicitLinking: true,
    },
  },

  verification: {
    storeIdentifier: "hashed",
  },

  user: {
    additionalFields: {
      platformRole: {
        type: ["SUPER_ADMIN"],
        required: false,
        input: false,
      },
    },
    validateUserInfo: hooks.validateUserInfo,
  },

  session: {
    expiresIn: 7 * 24 * 60 * 60,
    updateAge: 24 * 60 * 60,
    freshAge: 10 * 60,
    cookieCache: { enabled: false },
  },

  rateLimit: {
    enabled: true,
    storage: "database",
    window: 60,
    max: 100,
    customRules: {
      "/sign-in/email": { window: 60, max: 5 },
      "/sign-in/social": { window: 60, max: 10 },
      "/two-factor/*": { window: 60, max: 5 },
      "/request-password-reset": { window: 15 * 60, max: 3 },
      "/reset-password": { window: 15 * 60, max: 5 },
      "/change-password": { window: 15 * 60, max: 5 },
    },
  },

  advanced: {
    cookiePrefix: "orkestra",
    useSecureCookies: isProduction,
    defaultCookieAttributes: {
      httpOnly: true,
      sameSite: "lax",
      secure: isProduction,
    },
  },

  databaseHooks: hooks.databaseHooks,
  hooks: { before: hooks.before, after: hooks.after },

  plugins: [
    twoFactor({
      issuer: "ORKESTRA",
      accountLockout: { enabled: true, maxFailedAttempts: 5, durationSeconds: 15 * 60 },
    }),
    organization({
      ac,
      roles: orgRoles,
      creatorRole: "CLIENT_ADMIN",
      allowUserToCreateOrganization: false,
      disableOrganizationDeletion: true,
      schema: {
        invitation: { modelName: "betterAuthInvitation" },
      },
    }),
    // Doit rester en dernier : permet aux actions serveur Next.js de poser les cookies.
    nextCookies(),
  ],
});

export type Auth = typeof auth;
export type AuthSession = typeof auth.$Infer.Session;
