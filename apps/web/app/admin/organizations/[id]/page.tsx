import { prisma } from "@orkestra/database";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { ADMIN_NAV } from "@/components/app/nav";
import { Panel, SimpleShell } from "@/components/app/simple-shell";
import { InviteForm } from "@/components/invitations/invitation-forms";
import { InvitationsTable } from "@/components/invitations/invitations-table";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { isOrgRole } from "@/lib/auth/roles";
import { inviteClientAdminAction } from "@/lib/invitations/actions";
import { ROLE_LABELS, listInvitations } from "@/lib/invitations/service";

export const metadata: Metadata = { title: "Entreprise" };
export const dynamic = "force-dynamic";

export default async function OrganizationDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const session = await requireSuperAdmin();
  const { id } = await params;
  const organization = await prisma.organization.findUnique({
    where: { id },
    select: {
      id: true,
      name: true,
      createdAt: true,
      members: { orderBy: { createdAt: "asc" }, select: { id: true, role: true, user: { select: { name: true, email: true } } } },
    },
  });
  if (!organization) notFound();
  const invitations = await listInvitations(prisma, { userId: session.user.id }, organization.id);

  return (
    <SimpleShell title={organization.name} subtitle="Entreprise cliente" email={session.user.email} nav={ADMIN_NAV}>
      <div className="grid gap-6">
        <Panel
          title="Inviter un administrateur"
          description="Une invitation en attente pour la même adresse est automatiquement remplacée par la nouvelle."
        >
          <InviteForm action={inviteClientAdminAction} organizationId={organization.id} submitLabel="Inviter comme administrateur" />
        </Panel>

        <Panel title={`Membres (${organization.members.length})`}>
          {organization.members.length === 0 ? (
            <p className="text-sm text-muted-foreground">Personne n&apos;a encore rejoint cette entreprise.</p>
          ) : (
            <ul className="divide-y">
              {organization.members.map((m) => (
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
          )}
        </Panel>

        <Panel title="Invitations">
          <InvitationsTable rows={invitations} />
        </Panel>
      </div>
    </SimpleShell>
  );
}
