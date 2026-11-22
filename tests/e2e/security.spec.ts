import { expect, test } from "@playwright/test";
import { createOrgUser, expectPath, login, openPage, resetRateLimit, uniqueEmail } from "./fixtures";

test.skip(!process.env.TEST_DATABASE_URL, "TEST_DATABASE_URL non définie : tests de bout en bout ignorés.");

test.beforeEach(() => resetRateLimit());

test("déconnecter un autre appareil depuis la page Sécurité, puis changer de mot de passe", async ({ browser }) => {
  const email = uniqueEmail("e2e-secu");
  const password = "Securite-E2E-2026-A";
  createOrgUser(email, password, "EMPLOYEE");

  // Deux « appareils » connectés au même compte.
  const deviceA = await browser.newContext();
  const deviceB = await browser.newContext();
  const pageA = await deviceA.newPage();
  const pageB = await deviceB.newPage();
  await login(pageB, email, password);
  await expectPath(pageB, "/overview");
  await login(pageA, email, password);
  await expectPath(pageA, "/overview");

  await openPage(pageA, "/settings/security");
  await expect(pageA.getByRole("heading", { name: "Sécurité du compte" })).toBeVisible();
  await expect(pageA.getByText("Sessions actives (2)")).toBeVisible();
  await expect(pageA.getByText("Cette session")).toBeVisible();

  await pageA.getByRole("button", { name: "Déconnecter toutes les autres sessions" }).click();
  await expect(pageA.getByText("1 autre session déconnectée.")).toBeVisible();

  // L'appareil B n'a plus accès à l'espace client.
  await openPage(pageB, "/overview");
  await expectPath(pageB, "/login");

  // Changement de mot de passe depuis l'appareil A.
  await pageA.getByLabel("Mot de passe actuel").fill(password);
  await pageA.getByLabel("Nouveau mot de passe").fill("Securite-E2E-2026-B");
  await pageA.getByLabel("Confirmation").fill("Securite-E2E-2026-B");
  await pageA.getByRole("button", { name: "Modifier le mot de passe" }).click();
  await expect(pageA.getByText("Mot de passe modifié.")).toBeVisible();

  await deviceB.clearCookies();
  await login(pageB, email, "Securite-E2E-2026-B");
  await expectPath(pageB, "/overview");

  await deviceA.close();
  await deviceB.close();
});

test("la page Sécurité exige une connexion", async ({ page }) => {
  await page.goto("/settings/security");
  await expectPath(page, "/login");
});
