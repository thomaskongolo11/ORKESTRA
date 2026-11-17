import { prisma } from "@orkestra/database";
import { redirect } from "next/navigation";
import { getCurrentSession } from "@/lib/auth/guards";
import { firstParam, safeInternalPath } from "@/lib/auth/messages";
import { homePathFor, type PlatformRole } from "@/lib/auth/roles";

export const dynamic = "force-dynamic";

/**
 * Aiguillage après une authentification (mot de passe, 2FA, Google, Microsoft).
 * La destination dépend des permissions RÉELLES relues en base, jamais du navigateur.
 */
export default async function AuthCallbackPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const error = firstParam(params.error);
  if (error) redirect(`/login?error=${encodeURIComponent(error)}`);

  const session = await getCurrentSession();
  if (!session) redirect("/login");

  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { platformRole: true, twoFactorEnabled: true },
  });
  if (!user) redirect("/login");

  const facts = { platformRole: (user.platformRole ?? null) as PlatformRole | null, twoFactorEnabled: Boolean(user.twoFactorEnabled) };
  if (facts.platformRole === "SUPER_ADMIN" && !facts.twoFactorEnabled) redirect("/two-factor/setup");

  const home = homePathFor(facts);
  const next = safeInternalPath(params.next);
  // La page demandée n'est suivie que si elle appartient à l'espace autorisé de l'utilisateur.
  const allowed =
    next !== null && (facts.platformRole === "SUPER_ADMIN" ? next.startsWith("/admin") : !next.startsWith("/admin"));
  redirect(allowed ? next : home);
}
