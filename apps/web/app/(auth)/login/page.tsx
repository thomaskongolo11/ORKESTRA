import type { Metadata } from "next";
import { AuthHeading } from "@/components/auth/auth-card";
import { LoginForm } from "@/components/auth/login-form";
import { authErrorMessage, firstParam, reasonMessage, safeInternalPath } from "@/lib/auth/messages";
import { enabledSocialProviders } from "@/lib/auth/providers";

export const metadata: Metadata = { title: "Connexion" };
export const dynamic = "force-dynamic";

export default async function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const error = firstParam(params.error);

  return (
    <>
      <AuthHeading title="Connexion" description="Accédez à votre espace ORKESTRA." />
      <LoginForm
        providers={enabledSocialProviders()}
        next={safeInternalPath(params.next)}
        initialError={error ? authErrorMessage(error) : null}
        notice={reasonMessage(firstParam(params.reason))}
      />
    </>
  );
}
