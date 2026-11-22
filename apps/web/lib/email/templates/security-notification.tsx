/** @jsxRuntime automatic */
// Transformation JSX explicite : ces modèles sont aussi rendus hors de Next.js (scripts, tests).
import { Section, Text } from "@react-email/components";
import { EmailLayout, colors, headingStyle, mutedStyle, textStyle } from "./layout";

export type SecurityEventKind =
  | "password-changed"
  | "two-factor-enabled"
  | "two-factor-disabled"
  | "backup-codes-regenerated"
  | "account-linked"
  | "account-unlinked";

export type SecurityNotificationProps = {
  kind: SecurityEventKind;
  name: string;
  occurredAt: Date;
  /** Précision affichée, par ex. le fournisseur associé ("Google"). */
  detail?: string | undefined;
};

export const SECURITY_EVENTS: Record<SecurityEventKind, { subject: string; title: string; body: (detail?: string) => string }> = {
  "password-changed": {
    subject: "Votre mot de passe ORKESTRA a été modifié",
    title: "Mot de passe modifié",
    body: () => "Le mot de passe de votre compte ORKESTRA vient d'être modifié. Toutes vos sessions ont été fermées.",
  },
  "two-factor-enabled": {
    subject: "Double authentification activée sur votre compte ORKESTRA",
    title: "Double authentification activée",
    body: () => "La double authentification est désormais active sur votre compte. Un code vous sera demandé à chaque connexion.",
  },
  "two-factor-disabled": {
    subject: "Double authentification désactivée sur votre compte ORKESTRA",
    title: "Double authentification désactivée",
    body: () => "La double authentification vient d'être désactivée sur votre compte.",
  },
  "backup-codes-regenerated": {
    subject: "Nouveaux codes de récupération pour votre compte ORKESTRA",
    title: "Codes de récupération régénérés",
    body: () => "De nouveaux codes de récupération ont été générés. Les anciens codes ne fonctionnent plus.",
  },
  "account-linked": {
    subject: "Nouvelle méthode de connexion sur votre compte ORKESTRA",
    title: "Nouvelle méthode de connexion",
    body: (detail) => `Une nouvelle méthode de connexion${detail ? ` (${detail})` : ""} a été associée à votre compte.`,
  },
  "account-unlinked": {
    subject: "Méthode de connexion retirée de votre compte ORKESTRA",
    title: "Méthode de connexion retirée",
    body: (detail) => `La méthode de connexion${detail ? ` ${detail}` : ""} a été retirée de votre compte.`,
  },
};

export function SecurityNotificationEmail({ kind, name, occurredAt, detail }: SecurityNotificationProps) {
  const event = SECURITY_EVENTS[kind];
  const when = occurredAt.toLocaleString("fr-BE", { dateStyle: "long", timeStyle: "short", timeZone: "Europe/Brussels" });
  return (
    <EmailLayout preview={event.title}>
      <Text style={headingStyle}>{event.title}</Text>
      <Text style={textStyle}>Bonjour {name},</Text>
      <Text style={textStyle}>{event.body(detail)}</Text>
      <Text style={mutedStyle}>Date : {when} (heure de Bruxelles)</Text>
      <Section
        style={{
          backgroundColor: "#FDF6E8",
          border: "1px solid #F1DDB5",
          borderRadius: 8,
          padding: "12px 16px",
          margin: "16px 0 0",
        }}
      >
        <Text style={{ color: colors.navy, fontSize: 14, lineHeight: "22px", margin: 0 }}>
          <strong>Ce n&apos;était pas vous ?</strong> Changez immédiatement votre mot de passe et prévenez
          l&apos;administrateur de votre entreprise.
        </Text>
      </Section>
    </EmailLayout>
  );
}
