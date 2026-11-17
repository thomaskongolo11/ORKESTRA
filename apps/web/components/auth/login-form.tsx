"use client";

import { Eye, EyeOff } from "lucide-react";
import Link from "next/link";
import { useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/auth-client";
import { authErrorMessage } from "@/lib/auth/messages";
import { GoogleIcon, MicrosoftIcon } from "./provider-icons";

type Props = {
  providers: { google: boolean; microsoft: boolean };
  next: string | null;
  initialError: string | null;
  notice: string | null;
};

type Pending = "password" | "google" | "microsoft" | null;

export function LoginForm({ providers, next, initialError, notice }: Props) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(initialError);
  const [pending, setPending] = useState<Pending>(null);

  const callbackURL = next ? `/auth/callback?next=${encodeURIComponent(next)}` : "/auth/callback";

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!email.trim() || !password) {
      setError("Saisissez votre e-mail et votre mot de passe.");
      return;
    }
    setError(null);
    setPending("password");
    const { data, error: signInError } = await authClient.signIn.email({ email: email.trim(), password });
    if (signInError) {
      setError(authErrorMessage(signInError));
      setPending(null);
      return;
    }
    // 2FA activée : le plugin redirige vers /two-factor (onTwoFactorRedirect).
    if (data && "twoFactorRedirect" in data && data.twoFactorRedirect) return;
    window.location.assign(callbackURL);
  }

  async function signInWith(provider: "google" | "microsoft") {
    setError(null);
    setPending(provider);
    const { error: socialError } = await authClient.signIn.social({
      provider,
      callbackURL,
      errorCallbackURL: "/login",
    });
    if (socialError) {
      setError(authErrorMessage(socialError));
      setPending(null);
    }
  }

  const busy = pending !== null;

  return (
    <div className="space-y-6">
      {notice && <Alert variant="info">{notice}</Alert>}
      {error && <Alert variant="error">{error}</Alert>}

      <form onSubmit={onSubmit} className="space-y-4" noValidate>
        <div className="space-y-2">
          <Label htmlFor="email">E-mail professionnel</Label>
          <Input
            id="email"
            type="email"
            autoComplete="email"
            inputMode="email"
            required
            placeholder="nom@entreprise.be"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={busy}
          />
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <Label htmlFor="password">Mot de passe</Label>
            <Link href="/forgot-password" className="text-sm font-medium text-electric-600 hover:underline">
              Mot de passe oublié ?
            </Link>
          </div>
          <div className="relative">
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="current-password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={busy}
              className="pr-11"
            />
            <button
              type="button"
              onClick={() => setShowPassword((v) => !v)}
              className="absolute inset-y-0 right-0 flex w-11 items-center justify-center rounded-r-md text-muted-foreground hover:text-navy"
              aria-label={showPassword ? "Masquer le mot de passe" : "Afficher le mot de passe"}
            >
              {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </div>

        <Button type="submit" className="w-full" loading={pending === "password"} disabled={busy}>
          Se connecter
        </Button>
      </form>

      <div className="flex items-center gap-3 text-xs tracking-wide text-muted-foreground uppercase">
        <span className="h-px flex-1 bg-border" />
        ou
        <span className="h-px flex-1 bg-border" />
      </div>

      <div className="grid gap-3">
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => signInWith("google")}
          loading={pending === "google"}
          disabled={busy || !providers.google}
          title={providers.google ? undefined : "Connexion Google non configurée"}
        >
          {pending !== "google" && <GoogleIcon />}
          Continuer avec Google
        </Button>
        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={() => signInWith("microsoft")}
          loading={pending === "microsoft"}
          disabled={busy || !providers.microsoft}
          title={providers.microsoft ? undefined : "Connexion Microsoft non configurée"}
        >
          {pending !== "microsoft" && <MicrosoftIcon />}
          Continuer avec Microsoft
        </Button>
        {(!providers.google || !providers.microsoft) && (
          <p className="text-center text-xs text-muted-foreground">
            {!providers.google && !providers.microsoft
              ? "Connexions Google et Microsoft pas encore configurées."
              : !providers.google
                ? "Connexion Google pas encore configurée."
                : "Connexion Microsoft pas encore configurée."}
          </p>
        )}
      </div>

      <p className="text-center text-sm text-muted-foreground">
        L&apos;accès à ORKESTRA se fait sur invitation de votre entreprise.
      </p>
    </div>
  );
}
