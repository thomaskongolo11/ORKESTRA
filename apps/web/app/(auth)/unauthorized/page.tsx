import { ShieldX } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { SignOutButton } from "@/components/auth/sign-out-button";
import { Button } from "@/components/ui/button";
import { firstParam } from "@/lib/auth/messages";
import { getCurrentSession } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Accès refusé" };
export const dynamic = "force-dynamic";

export default async function UnauthorizedPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const reason = firstParam(params.reason);
  const session = await getCurrentSession();

  const message =
    reason === "choose-organization"
      ? "Votre compte est rattaché à plusieurs entreprises. Le choix de l'entreprise active arrive prochainement."
      : "Vous n'avez pas les droits nécessaires pour accéder à cette page. Si vous pensez qu'il s'agit d'une erreur, contactez l'administrateur de votre entreprise.";

  return (
    <div className="space-y-7">
      <div className="flex size-12 items-center justify-center rounded-full bg-destructive-soft text-destructive">
        <ShieldX className="size-6" aria-hidden />
      </div>
      <div>
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-navy">Accès refusé</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">{message}</p>
        {session && (
          <p className="mt-3 text-sm text-muted-foreground">
            Connecté en tant que <span className="font-medium text-navy">{session.user.email}</span>
          </p>
        )}
      </div>
      <div className="grid gap-3">
        <Button asChild>
          <Link href="/auth/callback">Retour à mon espace</Link>
        </Button>
        {session ? (
          <SignOutButton />
        ) : (
          <Button asChild variant="outline">
            <Link href="/login">Se connecter</Link>
          </Button>
        )}
      </div>
    </div>
  );
}
