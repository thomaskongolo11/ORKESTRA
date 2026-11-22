import { expect, test } from "@playwright/test";
import { createInvitation, createOrgUser, expectPath, login, openPage, resetRateLimit, uniqueEmail } from "./fixtures";

test.skip(!process.env.TEST_DATABASE_URL, "TEST_DATABASE_URL non définie : tests de bout en bout ignorés.");

test.beforeEach(() => resetRateLimit());

test("le CLIENT_ADMIN invité crée son compte, arrive sur /overview, puis invite et annule une invitation", async ({ page }) => {
  const adminEmail = uniqueEmail("e2e-ca");
  const { token } = createInvitation(adminEmail, "Plomberie E2E");

  await openPage(page, `/invite/accept?token=${token}`);
  await expect(page.getByRole("heading", { name: "Rejoindre Plomberie E2E" })).toBeVisible();
  await expect(page.getByText("en tant que Administrateur", { exact: false })).toBeVisible();
  await page.getByLabel("Nom complet").fill("Paul Dupont");
  await page.getByLabel("Mot de passe", { exact: true }).fill("Paul-Dupont-E2E-2026");
  await page.getByLabel("Confirmation").fill("Paul-Dupont-E2E-2026");
  await page.getByRole("button", { name: "Créer mon compte et rejoindre" }).click();

  await expectPath(page, "/overview");
  await expect(page.getByText("rôle : CLIENT_ADMIN")).toBeVisible();

  await page.getByRole("link", { name: /Gérer l.équipe/ }).click();
  await expectPath(page, "/settings/team");
  await expect(page.getByText("Paul Dupont")).toBeVisible();

  const managerEmail = uniqueEmail("e2e-manager");
  await page.getByLabel("E-mail").fill(managerEmail);
  await page.getByLabel("Rôle").selectOption("MANAGER");
  await page.getByRole("button", { name: "Envoyer l'invitation" }).click();
  // Mode simulé : l'interface le dit clairement, sans prétendre qu'un e-mail est parti.
  await expect(page.getByText(/Mode simulé : aucun e-mail n'a été envoyé/)).toBeVisible();
  const row = page.getByRole("row", { name: new RegExp(managerEmail) });
  await expect(row.getByText("En attente")).toBeVisible();
  await expect(row.getByText("Manager", { exact: true })).toBeVisible();

  await row.getByRole("button", { name: "Annuler" }).click();
  await expect(page.getByRole("row", { name: new RegExp(managerEmail) }).getByText("Annulée")).toBeVisible();

  // Le lien déjà utilisé ne fonctionne plus.
  await page.context().clearCookies();
  await openPage(page, `/invite/accept?token=${token}`);
  await expect(page.getByRole("heading", { name: "Invitation non valable" })).toBeVisible();
  await expect(page.getByText("Cette invitation a déjà été utilisée.")).toBeVisible();
});

test("un lien inventé est refusé", async ({ page }) => {
  await openPage(page, "/invite/accept?token=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA");
  await expect(page.getByRole("heading", { name: "Invitation non valable" })).toBeVisible();
});

test("un MANAGER ne peut pas ouvrir la gestion de l'équipe", async ({ page }) => {
  const email = uniqueEmail("e2e-mgr");
  createOrgUser(email, "Manager-E2E-Mot-De-Passe", "MANAGER");
  await login(page, email, "Manager-E2E-Mot-De-Passe");
  await expectPath(page, "/overview");
  await expect(page.getByRole("link", { name: /Gérer l.équipe/ })).toHaveCount(0);
  await openPage(page, "/settings/team");
  await expectPath(page, "/unauthorized");
});

test("connecté avec une autre adresse : l'invitation n'est pas acceptable", async ({ page }) => {
  const other = uniqueEmail("e2e-other");
  createOrgUser(other, "Autre-Compte-E2E-2026", "EMPLOYEE");
  const { token } = createInvitation(uniqueEmail("e2e-target"), "Cible E2E");
  await login(page, other, "Autre-Compte-E2E-2026");
  await expectPath(page, "/overview");
  await openPage(page, `/invite/accept?token=${token}`);
  await expect(page.getByText(/Cette invitation est destinée à/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Rejoindre l'entreprise" })).toHaveCount(0);
});
