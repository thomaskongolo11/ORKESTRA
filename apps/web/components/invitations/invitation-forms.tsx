"use client";

import { useActionState } from "react";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { ActionState } from "@/lib/invitations/actions";

type Action = (prev: ActionState, formData: FormData) => Promise<ActionState>;

function Feedback({ state }: { state: ActionState }) {
  if (!state || !state.message) return null;
  return <Alert variant={state.tone}>{state.message}</Alert>;
}

const selectClass =
  "flex h-11 w-full rounded-md border border-input bg-card px-3 text-[15px] text-foreground focus-visible:border-electric focus-visible:outline-none focus-visible:ring-3 focus-visible:ring-electric/20";

/** Création d'une entreprise + invitation de son administrateur (SUPER_ADMIN). */
export function CreateOrganizationForm({ action }: { action: Action }) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-4">
      <Feedback state={state} />
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label htmlFor="org-name">Nom de l&apos;entreprise</Label>
          <Input id="org-name" name="name" required minLength={2} placeholder="Plomberie Dupont" disabled={pending} />
        </div>
        <div className="space-y-2">
          <Label htmlFor="org-admin">E-mail de l&apos;administrateur</Label>
          <Input id="org-admin" name="adminEmail" type="email" required placeholder="direction@entreprise.be" disabled={pending} />
        </div>
      </div>
      <Button type="submit" loading={pending}>
        Créer l&apos;entreprise et inviter son administrateur
      </Button>
    </form>
  );
}

/** Invitation d'une personne (rôle fixe ou au choix). */
export function InviteForm({
  action,
  organizationId,
  roles,
  submitLabel = "Envoyer l'invitation",
}: {
  action: Action;
  organizationId?: string;
  roles?: { value: string; label: string }[];
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(action, null);
  return (
    <form action={formAction} className="space-y-4">
      <Feedback state={state} />
      {organizationId && <input type="hidden" name="organizationId" value={organizationId} />}
      <div className={roles ? "grid gap-4 sm:grid-cols-[1fr_200px]" : ""}>
        <div className="space-y-2">
          <Label htmlFor="invite-email">E-mail</Label>
          <Input id="invite-email" name="email" type="email" required placeholder="prenom.nom@entreprise.be" disabled={pending} />
        </div>
        {roles && (
          <div className="space-y-2">
            <Label htmlFor="invite-role">Rôle</Label>
            <select id="invite-role" name="role" className={selectClass} disabled={pending} defaultValue={roles[0]?.value}>
              {roles.map((r) => (
                <option key={r.value} value={r.value}>
                  {r.label}
                </option>
              ))}
            </select>
          </div>
        )}
      </div>
      <Button type="submit" loading={pending}>
        {submitLabel}
      </Button>
    </form>
  );
}

/** Boutons Renvoyer / Annuler d'une invitation en attente. */
export function InvitationRowActions({ invitationId, revoke, resend }: { invitationId: string; revoke: Action; resend: Action }) {
  const [revokeState, revokeAction, revoking] = useActionState(revoke, null);
  const [resendState, resendAction, resending] = useActionState(resend, null);
  const state = resendState ?? revokeState;
  return (
    <div className="flex flex-col items-end gap-2">
      <div className="flex gap-2">
        <form action={resendAction}>
          <input type="hidden" name="invitationId" value={invitationId} />
          <Button type="submit" size="sm" variant="outline" loading={resending} disabled={revoking}>
            Renvoyer
          </Button>
        </form>
        <form action={revokeAction}>
          <input type="hidden" name="invitationId" value={invitationId} />
          <Button type="submit" size="sm" variant="ghost" className="text-destructive" loading={revoking} disabled={resending}>
            Annuler
          </Button>
        </form>
      </div>
      {state?.message && <p className={`max-w-xs text-right text-xs ${state.ok ? "text-muted-foreground" : "text-destructive"}`}>{state.message}</p>}
    </div>
  );
}
