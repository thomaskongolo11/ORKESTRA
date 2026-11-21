import { prisma } from "@orkestra/database";
import { Building2, MailX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { ExistingAccountAcceptForm, NewAccountAcceptForm } from "@/components/invitations/accept-invitation";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { getCurrentSession } from "@/lib/auth/guards";
import { authErrorMessage, firstParam } from "@/lib/auth/messages";
import { enabledSocialProviders } from "@/lib/auth/providers";
import { InvitationError, findValidInvitation, normalizeEmail, type InvitationDetails } from "@/lib/invitations/service";

export const metadata: Metadata = { title: "Invitation" };
export const dynamic = "force-dynamic";

export default async function InviteAcceptPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const token = firstParam(params.token) ?? "";
  const error = firstParam(params.error);

  let invitation: InvitationDetails;
  try {
    invitation = await findValidInvitation(prisma, token);
  } catch (e) {
    const message = e instanceof InvitationError ? authErrorMessage(e.code) : authErrorMessage("INVALID");
    return (
      <div className="space-y-7">
        <div className="flex size-12 items-center justify-center rounded-full bg-destructive-soft text-destructive">
          <MailX className="size-6" aria-hidden />
        </div>
        <div>
          <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-navy">Invitation non valable</h1>
          <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{message}</p>
        </div>
        <Button asChild variant="outline" className="w-full">
          <Link href="/login">Aller à la connexion</Link>
        </Button>
      </div>
    );
  }

  const session = await getCurrentSession();
  const accountExists = Boolean(await prisma.user.findUnique({ where: { email: invitation.email }, select: { id: true } }));
  const expiry = invitation.expiresAt.toLocaleString("fr-BE", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Brussels" });

  return (
    <div className="space-y-6">
      <div className="flex size-12 items-center justify-center rounded-full bg-electric/10 text-electric-600">
        <Building2 className="size-6" aria-hidden />
      </div>
      <div>
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-navy">Rejoindre {invitation.organizationName}</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          {invitation.inviterName} vous invite à rejoindre l&apos;espace ORKESTRA de{" "}
          <span className="font-medium text-navy">{invitation.organizationName}</span> en tant que{" "}
          <span className="font-medium text-navy">{invitation.roleLabel}</span>.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">Invitation valable jusqu&apos;au {expiry}.</p>
      </div>

      {error && <Alert variant="error">{authErrorMessage(error)}</Alert>}

      {session ? (
        normalizeEmail(session.user.email) === invitation.email ? (
          <ExistingAccountAcceptForm token={token} />
        ) : (
          <div className="space-y-4">
            <Alert variant="warning">
              Cette invitation est destinée à <strong>{invitation.email}</strong>, mais vous êtes connecté avec{" "}
              <strong>{session.user.email}</strong>. Déconnectez-vous, puis rouvrez le lien d&apos;invitation.
            </Alert>
            <SignOutButton />
          </div>
        )
      ) : accountExists ? (
        <div className="space-y-4">
          <Alert variant="info">
            Un compte ORKESTRA existe déjà pour <strong>{invitation.email}</strong>. Connectez-vous pour accepter
            l&apos;invitation.
          </Alert>
          <Button asChild className="w-full">
            <Link href={`/login?next=${encodeURIComponent(`/invite/accept?token=${token}`)}`}>Se connecter pour accepter</Link>
          </Button>
        </div>
      ) : (
        <NewAccountAcceptForm token={token} email={invitation.email} providers={enabledSocialProviders()} />
      )}
    </div>
  );
}
