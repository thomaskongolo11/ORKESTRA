"use client";

import { Laptop, ShieldCheck, ShieldOff } from "lucide-react";
import { useActionState, useState, type FormEvent } from "react";
import { BackupCodesList } from "@/components/auth/backup-codes";
import { GoogleIcon, MicrosoftIcon } from "@/components/auth/provider-icons";
import { TwoFactorSetup } from "@/components/auth/two-factor-setup";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { authClient } from "@/lib/auth/auth-client";
import { authErrorMessage } from "@/lib/auth/messages";
import { revokeOtherSessionsAction, revokeSessionAction, unlinkProviderAction } from "@/lib/security/actions";
import { cn } from "@/lib/utils";

// ─── Mot de passe ────────────────────────────────────────────────────────────

export function ChangePasswordForm() {
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirmation, setConfirmation] = useState("");
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ ok: boolean; message: string } | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (next.length < 12) return setResult({ ok: false, message: "Le nouveau mot de passe doit contenir au moins 12 caractères." });
    if (next !== confirmation) return setResult({ ok: false, message: "Les deux mots de passe ne correspondent pas." });
    setLoading(true);
    setResult(null);
    const { error } = await authClient.changePassword({ currentPassword: current, newPassword: next, revokeOtherSessions: true });
    setLoading(false);
    if (error) return setResult({ ok: false, message: authErrorMessage(error) });
    setCurrent("");
    setNext("");
    setConfirmation("");
    setResult({ ok: true, message: "Mot de passe modifié. Vos autres sessions ont été déconnectées." });
  }

  return (
    <form onSubmit={onSubmit} className="max-w-md space-y-4">
      {result && <Alert variant={result.ok ? "success" : "error"}>{result.message}</Alert>}
      <div className="space-y-2">
        <Label htmlFor="current-password">Mot de passe actuel</Label>
        <Input id="current-password" type="password" autoComplete="current-password" required value={current} onChange={(e) => setCurrent(e.target.value)} />
      </div>
      <div className="space-y-2">
        <Label htmlFor="new-password">Nouveau mot de passe</Label>
        <Input id="new-password" type="password" autoComplete="new-password" required value={next} onChange={(e) => setNext(e.target.value)} />
        <p className="text-sm text-muted-foreground">12 caractères minimum.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="confirm-password">Confirmation</Label>
        <Input id="confirm-password" type="password" autoComplete="new-password" required value={confirmation} onChange={(e) => setConfirmation(e.target.value)} />
      </div>
      <Button type="submit" loading={loading} disabled={!current || !next || !confirmation}>
        Modifier le mot de passe
      </Button>
    </form>
  );
}

// ─── Double authentification ─────────────────────────────────────────────────

function PasswordConfirmForm({
  label,
  buttonLabel,
  variant = "outline",
  onConfirm,
}: {
  label: string;
  buttonLabel: string;
  variant?: "outline" | "destructive";
  onConfirm: (password: string) => Promise<string | null>;
}) {
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const id = `pw-${buttonLabel.replace(/\W+/g, "-").toLowerCase()}`;

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setError(null);
    const problem = await onConfirm(password);
    setLoading(false);
    if (problem) setError(problem);
    else setPassword("");
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3">
      {error && <Alert variant="error">{error}</Alert>}
      <div className="space-y-2">
        <Label htmlFor={id}>{label}</Label>
        <Input id={id} type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} />
      </div>
      <Button type="submit" variant={variant} loading={loading} disabled={!password}>
        {buttonLabel}
      </Button>
    </form>
  );
}

export function TwoFactorPanel({ enabled, mandatory }: { enabled: boolean; mandatory: boolean }) {
  const [settingUp, setSettingUp] = useState(false);
  const [codes, setCodes] = useState<string[] | null>(null);
  const [action, setAction] = useState<"codes" | "disable" | null>(null);

  if (!enabled) {
    if (settingUp) return <TwoFactorSetup required={false} finishHref="/settings/security" />;
    return (
      <div className="space-y-4">
        <div className="flex items-center gap-3 text-sm">
          <ShieldOff className="size-5 text-muted-foreground" aria-hidden />
          <span className="text-navy">La double authentification n&apos;est pas activée sur votre compte.</span>
        </div>
        <Button type="button" onClick={() => setSettingUp(true)}>
          Activer la double authentification
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3 text-sm">
        <ShieldCheck className="size-5 text-success" aria-hidden />
        <span className="font-medium text-navy">Double authentification activée.</span>
        {mandatory && <span className="text-muted-foreground">Obligatoire pour votre compte.</span>}
      </div>

      {codes ? (
        <div className="space-y-3">
          <Alert variant="success">
            Nouveaux codes générés. Les anciens ne fonctionnent plus. <strong>Ils ne seront plus affichés.</strong>
          </Alert>
          <BackupCodesList codes={codes} />
          <Button type="button" variant="ghost" onClick={() => setCodes(null)}>
            J&apos;ai conservé mes codes
          </Button>
        </div>
      ) : (
        <div className="flex flex-wrap gap-3">
          <Button type="button" variant="outline" onClick={() => setAction(action === "codes" ? null : "codes")}>
            Régénérer les codes de récupération
          </Button>
          {!mandatory && (
            <Button type="button" variant="ghost" className="text-destructive" onClick={() => setAction(action === "disable" ? null : "disable")}>
              Désactiver
            </Button>
          )}
        </div>
      )}

      {action === "codes" && !codes && (
        <div className="max-w-md rounded-lg border bg-mist/50 p-4">
          <PasswordConfirmForm
            label="Confirmez votre mot de passe"
            buttonLabel="Générer de nouveaux codes"
            onConfirm={async (password) => {
              const { data, error } = await authClient.twoFactor.generateBackupCodes({ password });
              if (error || !data) return authErrorMessage(error);
              setCodes(data.backupCodes);
              setAction(null);
              return null;
            }}
          />
        </div>
      )}

      {action === "disable" && !mandatory && (
        <div className="max-w-md rounded-lg border border-destructive/20 bg-destructive-soft/40 p-4">
          <PasswordConfirmForm
            label="Confirmez votre mot de passe pour désactiver"
            buttonLabel="Désactiver la double authentification"
            variant="destructive"
            onConfirm={async (password) => {
              const { error } = await authClient.twoFactor.disable({ password });
              if (error) return authErrorMessage(error);
              window.location.reload();
              return null;
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Méthodes de connexion ───────────────────────────────────────────────────

type Provider = "google" | "microsoft";

function UnlinkButton({ provider }: { provider: Provider }) {
  const [state, formAction, pending] = useActionState(unlinkProviderAction, null);
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="providerId" value={provider} />
      <Button type="submit" size="sm" variant="ghost" className="text-destructive" loading={pending}>
        Retirer
      </Button>
      {state && !state.ok && <p className="max-w-56 text-right text-xs text-destructive">{state.message}</p>}
    </form>
  );
}

export function LoginMethodsPanel({
  methods,
  configured,
  passwordOnly,
}: {
  methods: { password: boolean; google: boolean; microsoft: boolean; count: number };
  configured: Record<Provider, boolean>;
  passwordOnly: boolean;
}) {
  const [linking, setLinking] = useState<Provider | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function link(provider: Provider) {
    setError(null);
    setLinking(provider);
    const { error: linkError } = await authClient.linkSocial({ provider, callbackURL: "/settings/security", errorCallbackURL: "/settings/security" });
    if (linkError) {
      setError(authErrorMessage(linkError));
      setLinking(null);
    }
  }

  const rows: { id: "password" | Provider; label: string; icon: React.ReactNode; linked: boolean }[] = [
    { id: "password", label: "E-mail et mot de passe", icon: <Laptop className="size-4 text-navy-700" />, linked: methods.password },
    { id: "google", label: "Google", icon: <GoogleIcon />, linked: methods.google },
    { id: "microsoft", label: "Microsoft", icon: <MicrosoftIcon />, linked: methods.microsoft },
  ];

  return (
    <div className="space-y-4">
      {error && <Alert variant="error">{error}</Alert>}
      {passwordOnly && <Alert variant="info">Pour des raisons de sécurité, ce compte se connecte uniquement par e-mail et mot de passe.</Alert>}
      <ul className="divide-y">
        {rows.map((row) => (
          <li key={row.id} className="flex items-center justify-between gap-4 py-3 text-sm">
            <div className="flex items-center gap-3 [&_svg]:size-4">
              {row.icon}
              <span className="font-medium text-navy">{row.label}</span>
              <span className={cn("rounded-full px-2 py-0.5 text-xs", row.linked ? "bg-success-soft text-success" : "bg-muted text-muted-foreground")}>
                {row.linked ? "Associée" : "Non associée"}
              </span>
            </div>
            {row.id !== "password" && !passwordOnly && (
              row.linked ? (
                methods.count > 1 ? <UnlinkButton provider={row.id} /> : <span className="text-xs text-muted-foreground">Dernière méthode</span>
              ) : configured[row.id] ? (
                <Button type="button" size="sm" variant="outline" onClick={() => link(row.id as Provider)} loading={linking === row.id} disabled={linking !== null}>
                  Associer
                </Button>
              ) : (
                <span className="text-xs text-muted-foreground">Pas encore configurée</span>
              )
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}

// ─── Sessions ────────────────────────────────────────────────────────────────

export type SessionRow = { id: string; current: boolean; device: string; ipAddress: string | null; lastActiveAt: string; createdAt: string };

function RevokeSessionButton({ sessionId }: { sessionId: string }) {
  const [state, formAction, pending] = useActionState(revokeSessionAction, null);
  return (
    <form action={formAction} className="flex flex-col items-end gap-1">
      <input type="hidden" name="sessionId" value={sessionId} />
      <Button type="submit" size="sm" variant="ghost" className="text-destructive" loading={pending}>
        Déconnecter
      </Button>
      {state && !state.ok && <p className="text-xs text-destructive">{state.message}</p>}
    </form>
  );
}

export function SessionsPanel({ sessions }: { sessions: SessionRow[] }) {
  const [state, formAction, pending] = useActionState(revokeOtherSessionsAction, null);
  const others = sessions.filter((s) => !s.current).length;
  return (
    <div className="space-y-4">
      {state && <Alert variant={state.ok ? "success" : "error"}>{state.message}</Alert>}
      <ul className="divide-y">
        {sessions.map((s) => (
          <li key={s.id} className="flex items-center justify-between gap-4 py-3 text-sm">
            <div>
              <p className="flex items-center gap-2 font-medium text-navy">
                {s.device}
                {s.current && <span className="rounded-full bg-electric/10 px-2 py-0.5 text-xs font-medium text-navy-700">Cette session</span>}
              </p>
              <p className="text-muted-foreground">
                {s.ipAddress ? `${s.ipAddress} · ` : ""}dernière activité {s.lastActiveAt} · connectée le {s.createdAt}
              </p>
            </div>
            {!s.current && <RevokeSessionButton sessionId={s.id} />}
          </li>
        ))}
      </ul>
      {others > 0 && (
        <form action={formAction}>
          <Button type="submit" variant="outline" loading={pending}>
            Déconnecter toutes les autres sessions
          </Button>
        </form>
      )}
    </div>
  );
}
