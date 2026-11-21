"use client";

import { useActionState, useState } from "react";
import { GoogleIcon, MicrosoftIcon } from "@/components/auth/provider-icons";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/auth-client";
import { authErrorMessage } from "@/lib/auth/messages";
import { acceptAsExistingUserAction, acceptWithPasswordAction, prepareOAuthAcceptAction } from "@/lib/invitations/actions";

/** Nouveau compte : mot de passe, Google ou Microsoft. */
export function NewAccountAcceptForm({
  token,
  email,
  providers,
}: {
  token: string;
  email: string;
  providers: { google: boolean; microsoft: boolean };
}) {
  const [state, formAction, pending] = useActionState(acceptWithPasswordAction, null);
  const [oauthPending, setOauthPending] = useState<"google" | "microsoft" | null>(null);
  const [oauthError, setOauthError] = useState<string | null>(null);

  async function withProvider(provider: "google" | "microsoft") {
    setOauthError(null);
    setOauthPending(provider);
    const prepared = await prepareOAuthAcceptAction(token);
    if (!prepared?.ok) {
      setOauthError(prepared?.message ?? "Invitation invalide.");
      setOauthPending(null);
      return;
    }
    const { error } = await authClient.signIn.social({
      provider,
      requestSignUp: true,
      callbackURL: "/invite/complete",
      errorCallbackURL: `/invite/accept?token=${token}`,
    });
    if (error) {
      setOauthError(authErrorMessage(error));
      setOauthPending(null);
    }
  }

  const busy = pending || oauthPending !== null;

  return (
    <div className="space-y-6">
      {state && !state.ok && <Alert variant="error">{state.message}</Alert>}
      {oauthError && <Alert variant="error">{oauthError}</Alert>}

      <form action={formAction} className="space-y-4">
        <input type="hidden" name="token" value={token} />
        <div className="space-y-2">
          <Label htmlFor="invite-email">E-mail</Label>
          <Input id="invite-email" value={email} disabled readOnly />
        </div>
        <div className="space-y-2">
          <Label htmlFor="name">Nom complet</Label>
          <Input id="name" name="name" autoComplete="name" required minLength={2} disabled={busy} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="password">Mot de passe</Label>
          <Input id="password" name="password" type="password" autoComplete="new-password" required minLength={12} disabled={busy} />
          <p className="text-sm text-muted-foreground">12 caractères minimum.</p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmation">Confirmation</Label>
          <Input id="confirmation" name="confirmation" type="password" autoComplete="new-password" required disabled={busy} />
        </div>
        <Button type="submit" className="w-full" loading={pending} disabled={busy}>
          Créer mon compte et rejoindre
        </Button>
      </form>

      {(providers.google || providers.microsoft) && (
        <>
          <div className="flex items-center gap-3 text-xs tracking-wide text-muted-foreground uppercase">
            <span className="h-px flex-1 bg-border" />
            ou
            <span className="h-px flex-1 bg-border" />
          </div>
          <div className="grid gap-3">
            {providers.google && (
              <Button type="button" variant="outline" onClick={() => withProvider("google")} loading={oauthPending === "google"} disabled={busy}>
                {oauthPending !== "google" && <GoogleIcon />}
                Continuer avec Google
              </Button>
            )}
            {providers.microsoft && (
              <Button type="button" variant="outline" onClick={() => withProvider("microsoft")} loading={oauthPending === "microsoft"} disabled={busy}>
                {oauthPending !== "microsoft" && <MicrosoftIcon />}
                Continuer avec Microsoft
              </Button>
            )}
            <p className="text-center text-xs text-muted-foreground">
              Le compte Google ou Microsoft doit utiliser l&apos;adresse {email}.
            </p>
          </div>
        </>
      )}
    </div>
  );
}

/** Compte existant, connecté avec la bonne adresse. */
export function ExistingAccountAcceptForm({ token }: { token: string }) {
  const [state, formAction, pending] = useActionState(acceptAsExistingUserAction, null);
  return (
    <form action={formAction} className="space-y-4">
      {state && !state.ok && <Alert variant="error">{state.message}</Alert>}
      <input type="hidden" name="token" value={token} />
      <Button type="submit" className="w-full" loading={pending}>
        Rejoindre l&apos;entreprise
      </Button>
    </form>
  );
}
