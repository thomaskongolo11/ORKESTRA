"use client";

import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/auth-client";
import { authErrorMessage } from "@/lib/auth/messages";

export function TwoFactorForm() {
  const [mode, setMode] = useState<"totp" | "backup">("totp");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [expired, setExpired] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const value = code.trim();
    const { error: verifyError } =
      mode === "totp"
        ? await authClient.twoFactor.verifyTotp({ code: value })
        : await authClient.twoFactor.verifyBackupCode({ code: value });
    if (verifyError) {
      setError(authErrorMessage(verifyError));
      setExpired(verifyError.code === "INVALID_TWO_FACTOR_COOKIE");
      setLoading(false);
      return;
    }
    window.location.assign("/auth/callback");
  }

  function switchMode() {
    setMode((m) => (m === "totp" ? "backup" : "totp"));
    setCode("");
    setError(null);
  }

  const valid = mode === "totp" ? /^\d{6}$/.test(code) : code.trim().length >= 6;

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="error">
          {error}{" "}
          {expired && (
            <Link href="/login" className="font-medium underline">
              Retour à la connexion
            </Link>
          )}
        </Alert>
      )}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="code">{mode === "totp" ? "Code à 6 chiffres" : "Code de récupération"}</Label>
          {mode === "totp" ? (
            <Input
              id="code"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="\d{6}"
              maxLength={6}
              autoFocus
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="h-14 text-center font-mono text-2xl tracking-[0.5em]"
              disabled={loading}
            />
          ) : (
            <Input
              id="code"
              autoComplete="off"
              autoFocus
              placeholder="XXXXX-XXXXX"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              className="text-center font-mono tracking-widest"
              disabled={loading}
            />
          )}
        </div>
        <Button type="submit" className="w-full" loading={loading} disabled={!valid}>
          Vérifier
        </Button>
      </form>

      <div className="text-center">
        <Button type="button" variant="link" onClick={switchMode}>
          {mode === "totp" ? "Utiliser un code de récupération" : "Utiliser l'application d'authentification"}
        </Button>
      </div>
    </div>
  );
}
