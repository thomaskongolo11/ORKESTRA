import type { Metadata } from "next";
import { AuthHeading } from "@/components/auth/auth-card";
import { TwoFactorForm } from "@/components/auth/two-factor-form";

export const metadata: Metadata = { title: "Vérification en deux étapes" };

export default function TwoFactorPage() {
  return (
    <>
      <AuthHeading
        title="Vérification en deux étapes"
        description="Saisissez le code affiché dans votre application d'authentification."
      />
      <TwoFactorForm />
    </>
  );
}
