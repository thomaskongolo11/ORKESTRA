import { prisma } from "@orkestra/database";
import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { AuthHeading } from "@/components/auth/auth-card";
import { TwoFactorSetup } from "@/components/auth/two-factor-setup";
import { requireUser } from "@/lib/auth/guards";

export const metadata: Metadata = { title: "Activer la double authentification" };
export const dynamic = "force-dynamic";

export default async function TwoFactorSetupPage() {
  const session = await requireUser();
  const user = await prisma.user.findUnique({
    where: { id: session.user.id },
    select: { platformRole: true, twoFactorEnabled: true },
  });
  if (user?.twoFactorEnabled) redirect("/auth/callback");

  return (
    <>
      <AuthHeading
        title="Double authentification"
        description="Protégez votre compte avec un code temporaire généré par votre téléphone."
      />
      <TwoFactorSetup required={user?.platformRole === "SUPER_ADMIN"} />
    </>
  );
}
