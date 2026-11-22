"use client";

import { Check, ShieldCheck } from "lucide-react";
import QRCode from "qrcode";
import { useEffect, useState, type FormEvent } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/auth-client";
import { authErrorMessage } from "@/lib/auth/messages";
import { BackupCodesList } from "./backup-codes";
import { cn } from "@/lib/utils";

type Step = "password" | "scan" | "codes";
const STEPS: { id: Step; label: string }[] = [
  { id: "password", label: "Identité" },
  { id: "scan", label: "Application" },
  { id: "codes", label: "Codes de secours" },
];

export function TwoFactorSetup({ required, finishHref = "/auth/callback" }: { required: boolean; finishHref?: string }) {
  const [step, setStep] = useState<Step>("password");
  const [password, setPassword] = useState("");
  const [totpURI, setTotpURI] = useState<string | null>(null);
  const [qr, setQr] = useState<string | null>(null);
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (!totpURI) return;
    QRCode.toDataURL(totpURI, { margin: 1, width: 360, color: { dark: "#101827", light: "#FFFFFF" } })
      .then(setQr)
      .catch(() => setQr(null));
  }, [totpURI]);

  const secret = totpURI ? (new URL(totpURI).searchParams.get("secret") ?? "") : "";

  async function onPassword(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const { data, error: enableError } = await authClient.twoFactor.enable({ password });
    setLoading(false);
    if (enableError || !data) {
      setError(authErrorMessage(enableError));
      return;
    }
    if (!("totpURI" in data)) {
      setError("La méthode TOTP n'est pas disponible.");
      return;
    }
    setPassword("");
    setTotpURI(data.totpURI);
    setBackupCodes(data.backupCodes);
    setStep("scan");
  }

  async function onVerify(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setLoading(true);
    const { error: verifyError } = await authClient.twoFactor.verifyTotp({ code });
    setLoading(false);
    if (verifyError) {
      setError(authErrorMessage(verifyError));
      return;
    }
    setStep("codes");
  }

  const currentIndex = STEPS.findIndex((s) => s.id === step);

  return (
    <div className="space-y-6">
      <ol className="flex items-center gap-2" aria-label="Étapes">
        {STEPS.map((s, i) => (
          <li key={s.id} className="flex flex-1 items-center gap-2">
            <span
              className={cn(
                "flex size-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                i < currentIndex && "bg-success text-white",
                i === currentIndex && "bg-navy text-white",
                i > currentIndex && "bg-muted text-muted-foreground",
              )}
              aria-current={i === currentIndex ? "step" : undefined}
            >
              {i < currentIndex ? <Check className="size-3.5" /> : i + 1}
            </span>
            <span className={cn("hidden text-xs sm:inline", i === currentIndex ? "font-medium text-navy" : "text-muted-foreground")}>
              {s.label}
            </span>
            {i < STEPS.length - 1 && <span className="h-px flex-1 bg-border" />}
          </li>
        ))}
      </ol>

      {required && step === "password" && (
        <Alert variant="warning">
          La double authentification est obligatoire pour les administrateurs ORKESTRA. L&apos;administration reste
          inaccessible tant qu&apos;elle n&apos;est pas activée.
        </Alert>
      )}
      {error && <Alert variant="error">{error}</Alert>}

      {step === "password" && (
        <form onSubmit={onPassword} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="password">Confirmez votre mot de passe</Label>
            <Input
              id="password"
              type="password"
              autoComplete="current-password"
              required
              autoFocus
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>
          <Button type="submit" className="w-full" loading={loading} disabled={!password}>
            Continuer
          </Button>
        </form>
      )}

      {step === "scan" && (
        <form onSubmit={onVerify} className="space-y-5">
          <p className="text-[15px] leading-relaxed text-muted-foreground">
            Scannez ce QR code avec une application d&apos;authentification (Google Authenticator, Microsoft
            Authenticator, 1Password…), puis saisissez le code affiché.
          </p>
          <div className="flex justify-center">
            <div className="rounded-lg border bg-white p-3 shadow-xs">
              {qr ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={qr} alt="QR code de configuration de la double authentification" className="size-44" />
              ) : (
                <div className="size-44 animate-pulse rounded bg-muted" />
              )}
            </div>
          </div>
          <details className="rounded-md border bg-card px-3.5 py-2.5 text-sm">
            <summary className="cursor-pointer font-medium text-navy">Saisir la clé manuellement</summary>
            <code className="mt-2 block break-all font-mono text-[13px] tracking-wider text-navy-700">
              {secret.match(/.{1,4}/g)?.join(" ")}
            </code>
          </details>
          <div className="space-y-2">
            <Label htmlFor="totp">Code à 6 chiffres</Label>
            <Input
              id="totp"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))}
              className="h-14 text-center font-mono text-2xl tracking-[0.5em]"
              disabled={loading}
            />
          </div>
          <Button type="submit" className="w-full" loading={loading} disabled={!/^\d{6}$/.test(code)}>
            Activer la double authentification
          </Button>
        </form>
      )}

      {step === "codes" && (
        <div className="space-y-5">
          <Alert variant="success">Double authentification activée.</Alert>
          <div>
            <h2 className="font-semibold text-navy">Vos codes de récupération</h2>
            <p className="mt-1 text-sm leading-relaxed text-muted-foreground">
              Ils permettent de vous connecter si vous perdez votre téléphone. Chaque code ne sert qu&apos;une fois.{" "}
              <strong className="text-navy">Ils ne seront plus jamais affichés.</strong>
            </p>
          </div>
          <BackupCodesList codes={backupCodes} />
          <label className="flex items-start gap-3 text-sm text-navy">
            <input
              type="checkbox"
              className="mt-0.5 size-4 accent-[#101827]"
              checked={saved}
              onChange={(e) => setSaved(e.target.checked)}
            />
            J&apos;ai conservé mes codes de récupération en lieu sûr.
          </label>
          <Button type="button" className="w-full" disabled={!saved} onClick={() => window.location.assign(finishHref)}>
            <ShieldCheck />
            Terminer
          </Button>
        </div>
      )}
    </div>
  );
}
