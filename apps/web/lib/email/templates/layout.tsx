/** @jsxRuntime automatic */
// Transformation JSX explicite : ces modèles sont aussi rendus hors de Next.js (scripts, tests).
import { Body, Container, Head, Hr, Html, Preview, Section, Text } from "@react-email/components";
import type { ReactNode } from "react";

export const colors = {
  navy: "#101827",
  navy700: "#233B5D",
  electric: "#5B8DEF",
  mist: "#F2F4F7",
  muted: "#5B6578",
  border: "#DDE1E8",
};

const font = "Inter, -apple-system, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif";

/** Mise en page commune des e-mails ORKESTRA. */
export function EmailLayout({ preview, children }: { preview: string; children: ReactNode }) {
  return (
    <Html lang="fr">
      <Head />
      <Preview>{preview}</Preview>
      <Body style={{ backgroundColor: colors.mist, margin: 0, padding: "32px 12px", fontFamily: font }}>
        <Container style={{ maxWidth: 520, margin: "0 auto" }}>
          <Section style={{ backgroundColor: colors.navy, borderRadius: "12px 12px 0 0", padding: "20px 28px" }}>
            <Text style={{ color: "#FFFFFF", fontSize: 15, fontWeight: 600, letterSpacing: "0.28em", margin: 0 }}>
              ORKESTRA
            </Text>
          </Section>
          <Section
            style={{
              backgroundColor: "#FFFFFF",
              border: `1px solid ${colors.border}`,
              borderTop: "none",
              borderRadius: "0 0 12px 12px",
              padding: "28px",
            }}
          >
            {children}
          </Section>
          <Hr style={{ borderColor: "transparent", margin: "8px 0" }} />
          <Text style={{ color: colors.muted, fontSize: 12, lineHeight: "18px", textAlign: "center", margin: 0 }}>
            ORKESTRA — Your business. Orchestrated.
            <br />
            E-mail automatique, merci de ne pas y répondre.
          </Text>
        </Container>
      </Body>
    </Html>
  );
}

export const textStyle = { color: colors.navy, fontSize: 15, lineHeight: "24px", margin: "0 0 16px" };
export const mutedStyle = { color: colors.muted, fontSize: 13, lineHeight: "20px", margin: "0 0 12px" };
export const headingStyle = { color: colors.navy, fontSize: 22, fontWeight: 600, lineHeight: "30px", margin: "0 0 16px" };
export const buttonStyle = {
  backgroundColor: colors.navy,
  borderRadius: 8,
  color: "#FFFFFF",
  display: "inline-block",
  fontSize: 15,
  fontWeight: 600,
  padding: "12px 22px",
  textDecoration: "none",
};
