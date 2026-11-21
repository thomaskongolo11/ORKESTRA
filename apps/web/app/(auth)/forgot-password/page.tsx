import type { Metadata } from "next";
import { AuthHeading } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";
import { getEmailEnv } from "@/lib/email/env";

export const metadata: Metadata = { title: "Mot de passe oublié" };
export const dynamic = "force-dynamic";

export default function ForgotPasswordPage() {
  // Mode simulé (développement uniquement : il est refusé en production).
  const simulated = getEmailEnv().EMAIL_MODE === "simulated";
  return (
    <>
      <AuthHeading
        title="Mot de passe oublié"
        description="Indiquez votre adresse e-mail. Si elle correspond à un compte, vous recevrez un lien pour choisir un nouveau mot de passe."
      />
      <ForgotPasswordForm simulated={simulated} />
    </>
  );
}
