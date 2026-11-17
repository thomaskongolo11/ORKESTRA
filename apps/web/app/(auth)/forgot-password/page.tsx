import type { Metadata } from "next";
import { AuthHeading } from "@/components/auth/auth-card";
import { ForgotPasswordForm } from "@/components/auth/forgot-password-form";

export const metadata: Metadata = { title: "Mot de passe oublié" };

export default function ForgotPasswordPage() {
  return (
    <>
      <AuthHeading
        title="Mot de passe oublié"
        description="Indiquez votre adresse e-mail. Si elle correspond à un compte, vous recevrez un lien pour choisir un nouveau mot de passe."
      />
      <ForgotPasswordForm />
    </>
  );
}
