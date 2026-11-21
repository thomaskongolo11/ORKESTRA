/** @jsxRuntime automatic */
// Transformation JSX explicite : ces modèles sont aussi rendus hors de Next.js (scripts, tests).
import { Button, Link, Section, Text } from "@react-email/components";
import { EmailLayout, buttonStyle, colors, headingStyle, mutedStyle, textStyle } from "./layout";

export type InvitationEmailProps = {
  inviterName: string;
  organizationName: string;
  roleLabel: string;
  url: string;
  expiresAt: Date;
};

export function InvitationEmail({ inviterName, organizationName, roleLabel, url, expiresAt }: InvitationEmailProps) {
  const expiry = expiresAt.toLocaleString("fr-BE", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Brussels" });
  return (
    <EmailLayout preview={`${inviterName} vous invite à rejoindre ${organizationName} sur ORKESTRA`}>
      <Text style={headingStyle}>Vous êtes invité sur ORKESTRA</Text>
      <Text style={textStyle}>
        <strong>{inviterName}</strong> vous invite à rejoindre l&apos;espace <strong>{organizationName}</strong> en tant
        que <strong>{roleLabel}</strong>.
      </Text>
      <Text style={textStyle}>
        ORKESTRA aide votre entreprise à confier ses tâches administratives répétitives à des agents IA, sous votre
        contrôle.
      </Text>
      <Section style={{ margin: "8px 0 24px" }}>
        <Button href={url} style={buttonStyle}>
          Accepter l&apos;invitation
        </Button>
      </Section>
      <Text style={mutedStyle}>
        Cette invitation est personnelle et ne fonctionne qu&apos;une seule fois. Elle expire le {expiry}.
      </Text>
      <Text style={mutedStyle}>Vous ne vous attendiez pas à cette invitation ? Ignorez simplement cet e-mail.</Text>
      <Text style={{ ...mutedStyle, wordBreak: "break-all" }}>
        Si le bouton ne fonctionne pas, copiez ce lien dans votre navigateur :{" "}
        <Link href={url} style={{ color: colors.electric }}>
          {url}
        </Link>
      </Text>
    </EmailLayout>
  );
}
