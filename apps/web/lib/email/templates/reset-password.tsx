/** @jsxRuntime automatic */
// Transformation JSX explicite : ces modèles sont aussi rendus hors de Next.js (scripts, tests).
import { Button, Link, Section, Text } from "@react-email/components";
import { EmailLayout, buttonStyle, colors, headingStyle, mutedStyle, textStyle } from "./layout";

export type ResetPasswordEmailProps = { name: string; url: string; expiresInMinutes: number };

export function ResetPasswordEmail({ name, url, expiresInMinutes }: ResetPasswordEmailProps) {
  return (
    <EmailLayout preview="Réinitialisation de votre mot de passe ORKESTRA">
      <Text style={headingStyle}>Réinitialisation du mot de passe</Text>
      <Text style={textStyle}>Bonjour {name},</Text>
      <Text style={textStyle}>
        Une demande de réinitialisation du mot de passe de votre compte ORKESTRA a été faite. Cliquez sur le bouton
        ci-dessous pour en choisir un nouveau.
      </Text>
      <Section style={{ margin: "8px 0 24px" }}>
        <Button href={url} style={buttonStyle}>
          Choisir un nouveau mot de passe
        </Button>
      </Section>
      <Text style={mutedStyle}>
        Ce lien est valable {expiresInMinutes} minutes et ne fonctionne qu&apos;une seule fois. Après le changement,
        toutes vos sessions ouvertes seront fermées.
      </Text>
      <Text style={mutedStyle}>
        Vous n&apos;êtes pas à l&apos;origine de cette demande ? Ignorez cet e-mail : votre mot de passe ne changera pas.
      </Text>
      <Text style={{ ...mutedStyle, wordBreak: "break-all" }}>
        Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :{" "}
        <Link href={url} style={{ color: colors.electric }}>
          {url}
        </Link>
      </Text>
    </EmailLayout>
  );
}
