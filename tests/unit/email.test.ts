import { describe, expect, it } from "vitest";
import { createResendProvider, type OutgoingEmail, type ResendLike } from "../../apps/web/lib/email/providers";
import { renderEmail } from "../../apps/web/lib/email/templates";
import { emailEnvSchema } from "../../packages/validation/schemas/email-env";

const email: OutgoingEmail = {
  from: "ORKESTRA <no-reply@orkestra.be>",
  to: "client@exemple.be",
  subject: "Sujet",
  html: "<p>Bonjour</p>",
  text: "Bonjour",
  idempotencyKey: "test:1",
};

function fakeResend(response: Awaited<ReturnType<ResendLike["emails"]["send"]>> | Error) {
  const calls: Array<{ payload: unknown; options: unknown }> = [];
  const client: ResendLike = {
    emails: {
      async send(payload, options) {
        calls.push({ payload, options });
        if (response instanceof Error) throw response;
        return response;
      },
    },
  };
  return { client, calls };
}

describe("Fournisseur Resend : statut honnête", () => {
  it("ACCEPTED uniquement quand Resend renvoie un identifiant", async () => {
    const { client, calls } = fakeResend({ data: { id: "msg_123" }, error: null });
    expect(await createResendProvider(client).send(email)).toEqual({ status: "ACCEPTED", providerMessageId: "msg_123" });
    expect(calls[0]?.options).toEqual({ idempotencyKey: "test:1" });
  });

  it("FAILED si Resend renvoie une erreur", async () => {
    const { client } = fakeResend({ data: null, error: { name: "validation_error", message: "Domaine non vérifié" } });
    expect(await createResendProvider(client).send(email)).toEqual({
      status: "FAILED",
      error: "validation_error: Domaine non vérifié",
    });
  });

  it("FAILED si la réponse ne contient pas d'identifiant", async () => {
    const { client } = fakeResend({ data: null, error: null });
    expect((await createResendProvider(client).send(email)).status).toBe("FAILED");
  });

  it("FAILED si l'appel réseau échoue", async () => {
    const { client } = fakeResend(new Error("ECONNRESET"));
    expect(await createResendProvider(client).send(email)).toEqual({ status: "FAILED", error: "ECONNRESET" });
  });
});

describe("Configuration des e-mails", () => {
  it("mode simulé par défaut", () => {
    expect(emailEnvSchema.parse({}).EMAIL_MODE).toBe("simulated");
  });

  it("le mode resend exige une clé API", () => {
    expect(emailEnvSchema.safeParse({ EMAIL_MODE: "resend" }).success).toBe(false);
    expect(emailEnvSchema.safeParse({ EMAIL_MODE: "resend", RESEND_API_KEY: "re_x" }).success).toBe(true);
  });
});

describe("Modèles d'e-mails", () => {
  const url = "https://app.orkestra.be/api/auth/reset-password/TOKEN123?callbackURL=%2Freset-password";

  it("réinitialisation : sujet, lien en HTML et en texte", async () => {
    const r = await renderEmail("reset-password", { name: "Marie", url, expiresInMinutes: 60 });
    expect(r.subject).toBe("Réinitialisation de votre mot de passe ORKESTRA");
    expect(r.html).toContain("TOKEN123");
    expect(r.text).toContain("TOKEN123");
    expect(r.text).toContain("60 minutes");
  });

  it("invitation : entreprise, rôle et lien", async () => {
    const r = await renderEmail("invitation", {
      inviterName: "Paul Dupont",
      organizationName: "Plomberie Dupont",
      roleLabel: "Manager",
      url: "https://app.orkestra.be/invite/accept?token=abc",
      expiresAt: new Date("2026-11-22T10:00:00Z"),
    });
    expect(r.subject).toBe("Invitation à rejoindre Plomberie Dupont sur ORKESTRA");
    expect(r.text).toContain("Plomberie Dupont");
    expect(r.text).toContain("Manager");
    expect(r.text).toContain("invite/accept?token=abc");
  });

  it("notifications de sécurité : un sujet par événement", async () => {
    const kinds = ["password-changed", "two-factor-enabled", "two-factor-disabled", "account-linked"] as const;
    const subjects = await Promise.all(
      kinds.map(async (kind) => (await renderEmail("security-notification", { kind, name: "Marie", occurredAt: new Date(), detail: "Google" })).subject),
    );
    expect(new Set(subjects).size).toBe(kinds.length);
    const linked = await renderEmail("security-notification", { kind: "account-linked", name: "Marie", occurredAt: new Date(), detail: "Google" });
    expect(linked.text).toContain("Google");
    expect(linked.text).toContain("Ce n'était pas vous");
  });

  it("le nom de l'utilisateur est échappé (pas d'injection HTML)", async () => {
    const r = await renderEmail("reset-password", { name: '<script>alert("x")</script>', url, expiresInMinutes: 60 });
    expect(r.html).not.toContain("<script>");
    expect(r.html).toContain("&lt;script&gt;");
  });
});
