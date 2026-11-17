"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/auth-client";
import { authErrorMessage } from "@/lib/auth/messages";

export function ForgotPasswordForm() {
  const [email, setEmail] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(false);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const { error: requestError } = await authClient.requestPasswordReset({
      email: email.trim(),
      redirectTo: "/reset-password",
    });
    setLoading(false);
    if (requestError) {
      // Envoi d'e-mails pas encore branché : on le dit clairement, sans prétendre avoir envoyé quoi que ce soit.
      if (requestError.code === "RESET_PASSWORD_DISABLED") {
        setUnavailable(true);
        return;
      }
      setError(authErrorMessage(requestError));
      return;
    }
    setDone(true);
  }

  if (unavailable) {
    return (
      <div className="space-y-6">
        <Alert variant="warning">
          L&apos;envoi d&apos;e-mails n&apos;est pas encore configuré sur cette installation : aucun lien n&apos;a été
          envoyé. Contactez l&apos;administrateur de votre entreprise.
        </Alert>
        <BackToLogin />
      </div>
    );
  }

  if (done) {
    return (
      <div className="space-y-6">
        <Alert variant="info">
          Si un compte correspond à <strong>{email.trim()}</strong>, une demande de réinitialisation a été prise en
          compte. Le lien reçu est valable 1 heure.
        </Alert>
        <BackToLogin />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {error && <Alert variant="error">{error}</Alert>}
      <form onSubmit={onSubmit} className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="email">E-mail professionnel</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            required
            autoFocus
            placeholder="nom@entreprise.be"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={loading}
          />
        </div>
        <Button type="submit" className="w-full" loading={loading} disabled={!email}>
          Recevoir un lien
        </Button>
      </form>
      <BackToLogin />
    </div>
  );
}

function BackToLogin() {
  return (
    <Link href="/login" className="inline-flex items-center gap-1.5 text-sm font-medium text-electric-600 hover:underline">
      <ArrowLeft className="size-4" />
      Retour à la connexion
    </Link>
  );
}
