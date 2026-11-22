import { prisma } from "@orkestra/database";
import type { Metadata } from "next";
import { ADMIN_NAV } from "@/components/app/nav";
import { Panel, SimpleShell } from "@/components/app/simple-shell";
import { ChangePasswordForm, LoginMethodsPanel, SessionsPanel, TwoFactorPanel } from "@/components/security/security-panels";
import { requireUser } from "@/lib/auth/guards";
import { enabledSocialProviders } from "@/lib/auth/providers";
import { listLoginMethods, listUserSessions } from "@/lib/security/service";

export const metadata: Metadata = { title: "Sécurité" };
export const dynamic = "force-dynamic";

const formatDate = (d: Date) =>
  d.toLocaleString("fr-BE", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit", timeZone: "Europe/Brussels" });

/** Paramètres de sécurité du compte connecté (tous les rôles). */
export default async function SecuritySettingsPage() {
  const session = await requireUser();
  const [user, methods, sessions, memberships] = await Promise.all([
    prisma.user.findUniqueOrThrow({ where: { id: session.user.id }, select: { platformRole: true, twoFactorEnabled: true } }),
    listLoginMethods(prisma, session.user.id),
    listUserSessions(prisma, session.user.id, session.session.id),
    prisma.member.findMany({ where: { userId: session.user.id }, select: { role: true } }),
  ]);
  const isSuperAdmin = user.platformRole === "SUPER_ADMIN";
  const isClientAdmin = memberships.some((m) => m.role === "CLIENT_ADMIN");

  const nav = isSuperAdmin
    ? [...ADMIN_NAV, { href: "/settings/security", label: "Sécurité" }]
    : [
        { href: "/overview", label: "Overview" },
        ...(isClientAdmin ? [{ href: "/settings/team", label: "Équipe" }] : []),
        { href: "/settings/security", label: "Sécurité" },
      ];

  return (
    <SimpleShell title="Sécurité du compte" subtitle={session.user.email} email={session.user.email} nav={nav}>
      <div className="grid gap-6">
        <Panel
          title="Double authentification"
          description="Un code temporaire généré par votre téléphone est demandé à chaque connexion, en plus du mot de passe."
        >
          <TwoFactorPanel enabled={Boolean(user.twoFactorEnabled)} mandatory={isSuperAdmin} />
        </Panel>

        <Panel title="Mot de passe" description="Après la modification, vos autres sessions sont déconnectées et vous recevez un e-mail de confirmation.">
          {methods.password ? (
            <ChangePasswordForm />
          ) : (
            <p className="text-sm text-muted-foreground">
              Votre compte n&apos;utilise pas de mot de passe : vous vous connectez avec Google ou Microsoft.
            </p>
          )}
        </Panel>

        <Panel title="Méthodes de connexion" description="Associer Google ou Microsoft se fait uniquement ici, une fois connecté.">
          <LoginMethodsPanel methods={methods} configured={enabledSocialProviders()} passwordOnly={isSuperAdmin} />
        </Panel>

        <Panel title={`Sessions actives (${sessions.length})`} description="Appareils actuellement connectés à votre compte.">
          <SessionsPanel
            sessions={sessions.map((s) => ({
              id: s.id,
              current: s.current,
              device: s.device,
              ipAddress: s.ipAddress,
              lastActiveAt: formatDate(s.lastActiveAt),
              createdAt: formatDate(s.createdAt),
            }))}
          />
        </Panel>
      </div>
    </SimpleShell>
  );
}
