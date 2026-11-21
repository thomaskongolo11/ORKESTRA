import { expect, test } from "@playwright/test";
import { createOrgUser, createSuperAdmin, expectPath, login, totpCode, uniqueEmail } from "./fixtures";

test.skip(!process.env.TEST_DATABASE_URL, "TEST_DATABASE_URL non définie : tests de bout en bout ignorés.");

test.describe("Page de connexion", () => {
  test("affiche l'identité ORKESTRA, les trois méthodes et aucun lien d'inscription", async ({ page }) => {
    await page.goto("/login");
    await expect(page.getByRole("heading", { name: "Connexion" })).toBeVisible();
    await expect(page.getByText("Orchestrated.").first()).toBeVisible();
    await expect(page.getByLabel("E-mail professionnel")).toBeVisible();
    await expect(page.getByLabel("Mot de passe", { exact: true })).toBeVisible();
    await expect(page.getByRole("button", { name: "Se connecter" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continuer avec Google" })).toBeVisible();
    await expect(page.getByRole("button", { name: "Continuer avec Microsoft" })).toBeVisible();
    await expect(page.getByRole("link", { name: "Mot de passe oublié ?" })).toBeVisible();
    await expect(page.getByText(/inscri|créer un compte/i)).toHaveCount(0);
    // Fournisseurs non configurés dans les tests : boutons désactivés et signalés.
    await expect(page.getByRole("button", { name: "Continuer avec Google" })).toBeDisabled();
    await expect(page.getByText("Connexions Google et Microsoft pas encore configurées.")).toBeVisible();
  });

  test("affiche un message clair en cas d'identifiants incorrects", async ({ page }) => {
    await login(page, uniqueEmail("inconnu"), "Mauvais-Mot-De-Passe-1");
    await expect(page.getByText("E-mail ou mot de passe incorrect.")).toBeVisible();
    await expectPath(page, "/login");
  });

  test("une page protégée sans session renvoie vers la connexion", async ({ page }) => {
    await page.goto("/admin");
    await expectPath(page, "/login");
    expect(new URL(page.url()).searchParams.get("next")).toBe("/admin");
  });
});

test.describe("SUPER_ADMIN", () => {
  const email = uniqueEmail("admin-e2e");
  const password = "Orkestra-E2E-Admin-2026!";
  let secret = "";

  test.beforeAll(() => {
    createSuperAdmin(email, password);
  });

  test("première connexion : activation de la 2FA imposée avant /admin", async ({ page, context }) => {
    await login(page, email, password);
    await expectPath(page, "/two-factor/setup");
    await expect(page.getByText("La double authentification est obligatoire")).toBeVisible();

    // /admin reste inaccessible tant que la 2FA n'est pas activée.
    await page.goto("/admin");
    await expectPath(page, "/two-factor/setup");

    await page.getByLabel("Confirmez votre mot de passe").fill(password);
    await page.getByRole("button", { name: "Continuer" }).click();
    await expect(page.getByAltText(/QR code/)).toBeVisible();

    await page.getByText("Saisir la clé manuellement").click();
    secret = ((await page.locator("details code").textContent()) ?? "").replaceAll(" ", "");
    expect(secret.length).toBeGreaterThan(10);

    await page.getByLabel("Code à 6 chiffres").fill(totpCode(secret));
    await page.getByRole("button", { name: "Activer la double authentification" }).click();
    await expect(page.getByText("Vos codes de récupération")).toBeVisible();
    await expect(page.locator("ul li")).toHaveCount(10);

    await expect(page.getByRole("button", { name: "Terminer" })).toBeDisabled();
    await page.getByLabel("J'ai conservé mes codes de récupération en lieu sûr.").check();
    await page.getByRole("button", { name: "Terminer" }).click();
    await expectPath(page, "/admin");
    await expect(page.getByText(email)).toBeVisible();
    await context.clearCookies();
  });

  test("connexion suivante : code TOTP demandé, puis accès à /admin", async ({ page }) => {
    test.skip(!secret, "dépend du test précédent");
    await login(page, email, password);
    await expectPath(page, "/two-factor");
    await page.getByLabel("Code à 6 chiffres").fill("000000");
    await page.getByRole("button", { name: "Vérifier" }).click();
    await expect(page.getByText(/Code incorrect/)).toBeVisible();

    await page.getByLabel("Code à 6 chiffres").fill(totpCode(secret));
    await page.getByRole("button", { name: "Vérifier" }).click();
    await expectPath(page, "/admin");
  });
});

test.describe("Utilisateur d'une entreprise", () => {
  const email = uniqueEmail("client-e2e");
  const password = "Client-E2E-Mot-De-Passe-1";

  test.beforeAll(() => {
    createOrgUser(email, password, "MANAGER");
  });

  test("arrive sur /overview et ne peut pas ouvrir /admin en modifiant l'URL", async ({ page }) => {
    await login(page, email, password);
    await expectPath(page, "/overview");
    await expect(page.getByText("rôle : MANAGER")).toBeVisible();

    await page.goto("/admin");
    await expectPath(page, "/unauthorized");
    await expect(page.getByRole("heading", { name: "Accès refusé" })).toBeVisible();
  });

  test("un paramètre next externe est ignoré (pas de redirection ouverte)", async ({ page, context }) => {
    await context.clearCookies();
    await login(page, email, password, "/login?next=//exemple-malveillant.com");
    await expectPath(page, "/overview");
    expect(new URL(page.url()).host).toBe("localhost:3100");
  });
});
