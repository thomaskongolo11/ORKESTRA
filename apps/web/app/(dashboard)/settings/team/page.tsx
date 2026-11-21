import { prisma } from "@orkestra/database";
import type { Metadata } from "next";
import { Panel, SimpleShell } from "@/components/app/simple-shell";
import { InviteForm } from "@/components/invitations/invitation-forms";
import { InvitationsTable } from "@/components/invitations/invitations-table";
import { requireOrgContext } from "@/lib/auth/guards";
import { isOrgRole } from "@/lib/auth/roles";
import { inviteMemberAction } from "@/lib/invitations/actions";
import { ROLE_LABELS, listInvitations } from "@/lib/invitations/service";

export const metadata: Metadata = { title: "Équipe" };
export const dynamic = "force-dynamic";

/** Équipe de l'entreprise : réservé au CLIENT_ADMIN (vérifié côté serveur). */
export default async function TeamPage() {
  const ctx = await requireOrgContext(["CLIENT_ADMIN"]);
  const [organization, members, invitations] = await Promise.all([
    prisma.organization.findUniqueOrThrow({ where: { id: ctx.organizationId }, select: { name: true } }),
    prisma.member.findMany({
      where: { organizationId: ctx.organizationId },
      orderBy: { createdAt: "asc" },
      select: { id: true, role: true, createdAt: true, user: { select: { name: true, email: true } } },
    }),
    listInvitations(prisma, { userId: ctx.session.user.id }, ctx.organizationId),
  ]);

  return (
    <SimpleShell
      title="Équipe"
      subtitle={organization.name}
      email={ctx.session.user.email}
      nav={[
        { href: "/overview", label: "Overview" },
        { href: "/settings/team", label: "Équipe" },
      ]}
    >
      <div className="grid gap-6">
        <Panel title="Inviter un collaborateur" description="La personne recevra un lien personnel, valable 72 heures et utilisable une seule fois.">
          <InviteForm
            action={inviteMemberAction}
            roles={[
              { value: "EMPLOYEE", label: ROLE_LABELS.EMPLOYEE },
              { value: "MANAGER", label: ROLE_LABELS.MANAGER },
            ]}
          />
        </Panel>

        <Panel title={`Membres (${members.length})`}>
          <ul className="divide-y">
            {members.map((m) => (
              <li key={m.id} className="flex items-center justify-between gap-4 py-3 text-sm">
                <div>
                  <p className="font-medium text-navy">{m.user.name}</p>
                  <p className="text-muted-foreground">{m.user.email}</p>
                </div>
                <span className="rounded-full bg-mist px-2.5 py-1 text-xs font-medium text-navy-700">
                  {isOrgRole(m.role) ? ROLE_LABELS[m.role] : m.role}
                </span>
              </li>
            ))}
          </ul>
        </Panel>

        <Panel title="Invitations">
          <InvitationsTable rows={invitations} />
        </Panel>
      </div>
    </SimpleShell>
  );
}
