/**
 * Retour après une inscription Google / Microsoft depuis une invitation.
 * Vérifie que l'utilisateur connecté a bien rejoint l'entreprise (sinon finalise),
 * active l'entreprise dans la session, supprime le cookie temporaire, puis aiguille.
 */
import { prisma } from "@orkestra/database";
import { NextResponse, type NextRequest } from "next/server";
import { auth } from "@/lib/auth/auth";
import { InvitationError, acceptAsExistingUser } from "@/lib/invitations/service";
import { INVITATION_COOKIE, hashInvitationToken, readInvitationCookie } from "@/lib/invitations/tokens";

export async function GET(request: NextRequest) {
  const token = readInvitationCookie(request.headers);
  const session = await auth.api.getSession({ headers: request.headers, query: { disableCookieCache: true } });

  const finish = (path: string) => {
    const response = NextResponse.redirect(new URL(path, request.url));
    response.cookies.delete(INVITATION_COOKIE);
    return response;
  };

  if (!session) return finish(token ? `/invite/accept?token=${token}&error=oauth` : "/login");
  if (!token) return finish("/auth/callback");

  const invitation = await prisma.invitation.findUnique({
    where: { tokenHash: hashInvitationToken(token) },
    select: { organizationId: true, acceptedByUserId: true },
  });

  if (invitation && invitation.acceptedByUserId !== session.user.id) {
    // Le hook de création n'a pas pu finaliser (ou compte déjà existant) : on finalise ici.
    try {
      await acceptAsExistingUser(prisma, { token, userId: session.user.id, method: "oauth" });
    } catch (error) {
      const code = error instanceof InvitationError ? error.code : "INVALID";
      return finish(`/invite/accept?token=${token}&error=${code}`);
    }
  }

  if (invitation) {
    await prisma.session.updateMany({ where: { token: session.session.token }, data: { activeOrganizationId: invitation.organizationId } });
  }
  return finish("/auth/callback");
}
