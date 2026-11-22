import { prisma } from "@orkestra/database";
import type { Metadata } from "next";
import Link from "next/link";
import { ADMIN_NAV } from "@/components/app/nav";
import { Panel, SimpleShell } from "@/components/app/simple-shell";
import { CreateOrganizationForm } from "@/components/invitations/invitation-forms";
import { requireSuperAdmin } from "@/lib/auth/guards";
import { createOrganizationAction } from "@/lib/invitations/actions";

export const metadata: Metadata = { title: "Entreprises" };
export const dynamic = "force-dynamic";

export default async function OrganizationsPage() {
  const session = await requireSuperAdmin();
  const organizations = await prisma.organization.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, name: true, slug: true, createdAt: true, _count: { select: { members: true } } },
  });

  return (
    <SimpleShell title="Entreprises clientes" subtitle="Administration ORKESTRA" email={session.user.email} nav={ADMIN_NAV}>
      <div className="grid gap-6">
        <Panel
          title="Nouvelle entreprise"
          description="Crée l'espace de l'entreprise et invite son administrateur (CLIENT_ADMIN). Il pourra ensuite inviter son équipe."
        >
          <CreateOrganizationForm action={createOrganizationAction} />
        </Panel>

        <Panel title={`Entreprises (${organizations.length})`}>
          {organizations.length === 0 ? (
            <p className="text-sm text-muted-foreground">Aucune entreprise pour l&apos;instant.</p>
          ) : (
            <ul className="divide-y">
              {organizations.map((org) => (
                <li key={org.id}>
                  <Link href={`/admin/organizations/${org.id}`} className="flex items-center justify-between gap-4 py-3 text-sm hover:bg-mist/60">
                    <div>
                      <p className="font-medium text-navy">{org.name}</p>
                      <p className="text-muted-foreground">
                        Créée le {org.createdAt.toLocaleDateString("fr-BE", { timeZone: "Europe/Brussels" })}
                      </p>
                    </div>
                    <span className="text-muted-foreground">
                      {org._count.members} membre{org._count.members > 1 ? "s" : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </SimpleShell>
  );
}
