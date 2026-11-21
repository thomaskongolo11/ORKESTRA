"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/auth-client";
import { authErrorMessage } from "@/lib/auth/messages";

export function ResetPasswordForm({ token }: { token: string }) {
  const [password, setPassword] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = password.length > 0 && password.length < 12;
  const mismatch = confirmation.length > 0 && password !== confirmation;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (password.length < 12 || password !== confirmation) return;
    setError(null);
    setLoading(true);
    const { error: resetError } = await authClient.resetPassword({ newPassword: password, token });
    if (resetError) {
      setError(authErrorMessage(resetError));
      setLoading(false);
      return;
    }
    // Toutes les sessions ont été révoquées (revokeSessionsOnPasswordReset) : nouvelle connexion.
    window.location.assign("/login?reason=password-reset");
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="error">
          {error}{" "}
          <Link href="/forgot-password" className="font-medium underline">
            Nouveau lien
          </Link>
        </Alert>
      )}
      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="password">Nouveau mot de passe</Label>
          <Input
            id="password"
            type="password"
            autoComplete="new-password"
            required
            autoFocus
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            aria-invalid={tooShort || undefined}
            aria-describedby="password-help"
            disabled={loading}
          />
          <p id="password-help" className={tooShort ? "text-sm text-destructive" : "text-sm text-muted-foreground"}>
            12 caractères minimum.
          </p>
        </div>
        <div className="space-y-2">
          <Label htmlFor="confirmation">Confirmation</Label>
          <Input
            id="confirmation"
            type="password"
            autoComplete="new-password"
            required
            value={confirmation}
            onChange={(e) => setConfirmation(e.target.value)}
            aria-invalid={mismatch || undefined}
            disabled={loading}
          />
          {mismatch && <p className="text-sm text-destructive">Les deux mots de passe ne correspondent pas.</p>}
        </div>
        <Button type="submit" className="w-full" loading={loading} disabled={password.length < 12 || password !== confirmation}>
          Enregistrer le mot de passe
        </Button>
      </form>
    </div>
  );
}
