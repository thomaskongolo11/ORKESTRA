/** @jsxRuntime automatic */
// Transformation JSX explicite : ces modèles sont aussi rendus hors de Next.js (scripts, tests).
import { render } from "@react-email/components";
import { InvitationEmail, type InvitationEmailProps } from "./invitation";
import { ResetPasswordEmail, type ResetPasswordEmailProps } from "./reset-password";
import { SECURITY_EVENTS, SecurityNotificationEmail, type SecurityNotificationProps } from "./security-notification";

/** Catalogue des e-mails ORKESTRA : chaque modèle a ses données typées. */
export type EmailTemplateData = {
  "reset-password": ResetPasswordEmailProps;
  invitation: InvitationEmailProps;
  "security-notification": SecurityNotificationProps;
};

export type EmailTemplateName = keyof EmailTemplateData;

export type RenderedEmail = { subject: string; html: string; text: string };

export async function renderEmail<T extends EmailTemplateName>(template: T, data: EmailTemplateData[T]): Promise<RenderedEmail> {
  switch (template) {
    case "reset-password": {
      const element = <ResetPasswordEmail {...(data as ResetPasswordEmailProps)} />;
      return { subject: "Réinitialisation de votre mot de passe ORKESTRA", ...(await both(element)) };
    }
    case "invitation": {
      const props = data as InvitationEmailProps;
      const element = <InvitationEmail {...props} />;
      return { subject: `Invitation à rejoindre ${props.organizationName} sur ORKESTRA`, ...(await both(element)) };
    }
    case "security-notification": {
      const props = data as SecurityNotificationProps;
      const element = <SecurityNotificationEmail {...props} />;
      return { subject: SECURITY_EVENTS[props.kind].subject, ...(await both(element)) };
    }
    default:
      throw new Error(`Modèle d'e-mail inconnu : ${String(template)}`);
  }
}

async function both(element: React.ReactElement): Promise<{ html: string; text: string }> {
  const [html, text] = await Promise.all([render(element), render(element, { plainText: true })]);
  return { html, text };
}
