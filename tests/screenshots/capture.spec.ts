import { test, type Page } from "@playwright/test";
import { createInvitation, createSuperAdmin, expectPath, login, openPage, resetRateLimit, totpCode, uniqueEmail } from "../e2e/fixtures";

test.skip(!process.env.TEST_DATABASE_URL, "TEST_DATABASE_URL non définie.");

// Chaque scénario se connecte plusieurs fois depuis la même adresse locale.
test.beforeEach(() => resetRateLimit());

async function shot(page: Page, name: string) {
  const project = test.info().project.name;
  await page.waitForLoadState("networkidle");
  await page.screenshot({ path: `screenshots/${project}/${name}.png`, fullPage: true });
}

test("pages publiques", async ({ page }) => {
  await openPage(page, "/login");
  await shot(page, "01-connexion");

  await login(page, uniqueEmail("inconnu"), "Mauvais-Mot-De-Passe-1");
  await page.getByText("E-mail ou mot de passe incorrect.").waitFor();
  await shot(page, "02-connexion-erreur");

  await openPage(page, "/forgot-password");
  await shot(page, "03-mot-de-passe-oublie");

  await openPage(page, "/reset-password?token=exemple");
  await shot(page, "04-nouveau-mot-de-passe");

  await openPage(page, "/reset-password");
  await shot(page, "05-lien-invalide");

  await openPage(page, "/invite/accept");
  await shot(page, "06-invitation");

  await openPage(page, "/unauthorized");
  await shot(page, "07-acces-refuse");
});

test("SUPER_ADMIN : activation de la 2FA puis vérification", async ({ page, context }) => {
  const email = uniqueEmail("admin-captures");
  const password = "Orkestra-Captures-2026!";
  createSuperAdmin(email, password);

  await login(page, email, password);
  await expectPath(page, "/two-factor/setup");
  await shot(page, "08-2fa-etape-1-identite");

  await page.getByLabel("Confirmez votre mot de passe").fill(password);
  await page.getByRole("button", { name: "Continuer" }).click();
  await page.getByAltText(/QR code/).waitFor();
  await page.getByText("Saisir la clé manuellement").click();
  const secret = ((await page.locator("details code").textContent()) ?? "").replaceAll(" ", "");
  await shot(page, "09-2fa-etape-2-qr-code");

  await page.getByLabel("Code à 6 chiffres").fill(totpCode(secret));
  await page.getByRole("button", { name: "Activer la double authentification" }).click();
  await page.getByText("Vos codes de récupération").waitFor();
  await shot(page, "10-2fa-etape-3-codes-de-secours");

  await page.getByLabel("J'ai conservé mes codes de récupération en lieu sûr.").check();
  await page.getByRole("button", { name: "Terminer" }).click();
  await expectPath(page, "/admin");

  await openPage(page, "/admin/organizations");
  await page.getByLabel("Nom de l'entreprise").fill("Chauffage Lambert");
  await page.getByLabel("E-mail de l'administrateur").fill(uniqueEmail("direction"));
  await page.getByRole("button", { name: /Créer l.entreprise/ }).click();
  await page.getByText(/Entreprise « Chauffage Lambert » créée/).waitFor();
  await shot(page, "12-admin-entreprises");
  await page.getByRole("link", { name: /Chauffage Lambert/ }).first().click();
  await page.getByRole("heading", { name: "Chauffage Lambert" }).waitFor();
  await shot(page, "13-admin-entreprise-detail");

  await context.clearCookies();
  await login(page, email, password);
  await expectPath(page, "/two-factor");
  await shot(page, "11-2fa-verification");
});

test("invitation : acceptation puis gestion de l'équipe", async ({ page }) => {
  const { token } = createInvitation(uniqueEmail("captures-ca"), "Plomberie Dupont");
  await openPage(page, `/invite/accept?token=${token}`);
  await shot(page, "14-invitation-accepter");

  await page.getByLabel("Nom complet").fill("Paul Dupont");
  await page.getByLabel("Mot de passe", { exact: true }).fill("Paul-Dupont-Captures-2026");
  await page.getByLabel("Confirmation").fill("Paul-Dupont-Captures-2026");
  await page.getByRole("button", { name: "Créer mon compte et rejoindre" }).click();
  await expectPath(page, "/overview");

  await openPage(page, "/settings/team");
  await page.getByLabel("E-mail").fill("marie.martin@plomberie-dupont.be");
  await page.getByLabel("Rôle").selectOption("MANAGER");
  await page.getByRole("button", { name: "Envoyer l'invitation" }).click();
  await page.getByText(/Mode simulé/).waitFor();
  await shot(page, "15-equipe-client-admin");
});
