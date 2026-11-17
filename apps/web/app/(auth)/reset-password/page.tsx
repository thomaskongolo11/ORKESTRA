import type { Metadata } from "next";
import Link from "next/link";
import { AuthHeading } from "@/components/auth/auth-card";
import { ResetPasswordForm } from "@/components/auth/reset-password-form";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { authErrorMessage, firstParam } from "@/lib/auth/messages";

export const metadata: Metadata = { title: "Nouveau mot de passe" };
export const dynamic = "force-dynamic";

export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const token = firstParam(params.token);
  const error = firstParam(params.error);

  if (!token || error) {
    return (
      <>
        <AuthHeading title="Lien invalide" />
        <div className="space-y-6">
          <Alert variant="error">{authErrorMessage(error ?? "INVALID_TOKEN")}</Alert>
          <Button asChild className="w-full">
            <Link href="/forgot-password">Demander un nouveau lien</Link>
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <AuthHeading title="Nouveau mot de passe" description="Choisissez un mot de passe que vous n'utilisez nulle part ailleurs." />
      <ResetPasswordForm token={token} />
    </>
  );
}
