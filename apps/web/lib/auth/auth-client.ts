"use client";

/**
 * Client Better Auth pour les composants React (navigateur).
 * Ne contient aucun secret : il appelle uniquement /api/auth/* sur le même domaine.
 */
import { organizationClient, twoFactorClient } from "better-auth/client/plugins";
import { createAuthClient } from "better-auth/react";

export const authClient = createAuthClient({
  plugins: [
    twoFactorClient({
      // Mot de passe correct mais 2FA activée : la vérification TOTP est demandée.
      onTwoFactorRedirect() {
        window.location.href = "/two-factor";
      },
    }),
    organizationClient(),
  ],
});
