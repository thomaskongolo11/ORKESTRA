import { MailCheck } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";

export const metadata: Metadata = { title: "Invitation" };

/**
 * Coquille provisoire. La vérification du jeton, la vérification d'identité et
 * la création du compte sont développées au lot D (invitations).
 */
export default function InviteAcceptPage() {
  return (
    <div className="space-y-7">
      <div className="flex size-12 items-center justify-center rounded-full bg-electric/10 text-electric-600">
        <MailCheck className="size-6" aria-hidden />
      </div>
      <div>
        <h1 className="text-[26px] leading-tight font-semibold tracking-tight text-navy">Rejoindre ORKESTRA</h1>
        <p className="mt-2 text-[15px] leading-relaxed text-muted-foreground">
          Cette page permettra d&apos;accepter une invitation de votre entreprise et de choisir votre méthode de
          connexion.
        </p>
      </div>
      <Alert variant="warning">
        L&apos;acceptation des invitations n&apos;est pas encore disponible sur cette version. Aucun compte ne peut être
        créé depuis cette page pour l&apos;instant.
      </Alert>
      <Button asChild variant="outline" className="w-full">
        <Link href="/login">J&apos;ai déjà un compte</Link>
      </Button>
    </div>
  );
}
