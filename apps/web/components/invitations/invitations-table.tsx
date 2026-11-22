import { resendInvitationAction, revokeInvitationAction } from "@/lib/invitations/actions";
import { ROLE_LABELS, type InvitationStatus } from "@/lib/invitations/service";
import type { OrgRole } from "@/lib/auth/roles";
import { cn } from "@/lib/utils";
import { InvitationRowActions } from "./invitation-forms";

const STATUS: Record<InvitationStatus, { label: string; className: string }> = {
  PENDING: { label: "En attente", className: "bg-electric/10 text-navy-700" },
  ACCEPTED: { label: "Acceptée", className: "bg-success-soft text-success" },
  REVOKED: { label: "Annulée", className: "bg-muted text-muted-foreground" },
  EXPIRED: { label: "Expirée", className: "bg-warning-soft text-warning" },
};

export type InvitationRow = {
  id: string;
  email: string;
  role: OrgRole;
  status: InvitationStatus;
  createdAt: Date;
  expiresAt: Date;
};

const date = (d: Date) => d.toLocaleDateString("fr-BE", { day: "numeric", month: "short", year: "numeric", timeZone: "Europe/Brussels" });

export function InvitationsTable({ rows }: { rows: InvitationRow[] }) {
  if (rows.length === 0) return <p className="text-sm text-muted-foreground">Aucune invitation pour l&apos;instant.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full min-w-[640px] text-sm">
        <thead>
          <tr className="border-b text-left text-xs tracking-wide text-muted-foreground uppercase">
            <th className="py-2 pr-4 font-medium">E-mail</th>
            <th className="py-2 pr-4 font-medium">Rôle</th>
            <th className="py-2 pr-4 font-medium">Statut</th>
            <th className="py-2 pr-4 font-medium">Envoyée</th>
            <th className="py-2 font-medium" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} className="border-b last:border-0">
              <td className="py-3 pr-4 font-medium text-navy">{row.email}</td>
              <td className="py-3 pr-4">{ROLE_LABELS[row.role]}</td>
              <td className="py-3 pr-4">
                <span className={cn("rounded-full px-2.5 py-1 text-xs font-medium", STATUS[row.status].className)}>{STATUS[row.status].label}</span>
                {row.status === "PENDING" && <span className="ml-2 text-xs text-muted-foreground">expire le {date(row.expiresAt)}</span>}
              </td>
              <td className="py-3 pr-4 text-muted-foreground">{date(row.createdAt)}</td>
              <td className="py-3 text-right">
                {row.status === "PENDING" && (
                  <InvitationRowActions invitationId={row.id} revoke={revokeInvitationAction} resend={resendInvitationAction} />
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
