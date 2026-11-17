import "dotenv/config";
import { defineConfig, devices } from "@playwright/test";

/**
 * Tests de bout en bout (navigateur réel) — `pnpm test:e2e`.
 *
 * Utilisent la base de TEST (TEST_DATABASE_URL), jamais la base de développement.
 * Premier lancement sur un PC : `pnpm exec playwright install chromium`.
 */
const PORT = 3100;
const BASE_URL = `http://localhost:${PORT}`;
const testDatabaseUrl = process.env.TEST_DATABASE_URL ?? "";
const chromePath = process.env.PLAYWRIGHT_CHROME_PATH;

// Valeurs partagées par le serveur lancé et par le processus des tests.
process.env.DATABASE_URL = testDatabaseUrl;
process.env.BETTER_AUTH_SECRET = "orkestra-e2e-secret-0123456789-abcdefghijklmnop";
process.env.BETTER_AUTH_URL = BASE_URL;

export default defineConfig({
  testDir: "tests/e2e",
  globalSetup: "./tests/e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 60_000,
  // `next dev` compile chaque route au premier appel : délai plus large pour les vérifications.
  expect: { timeout: 15_000 },
  reporter: [["list"]],
  outputDir: "test-results/e2e",
  use: {
    baseURL: BASE_URL,
    locale: "fr-BE",
    trace: "retain-on-failure",
    ...(chromePath ? { launchOptions: { executablePath: chromePath } } : {}),
  },
  projects: [
    { name: "desktop", use: { ...devices["Desktop Chrome"], viewport: { width: 1280, height: 800 } } },
  ],
  webServer: {
    command: `pnpm --filter @orkestra/web exec next dev -p ${PORT}`,
    url: `${BASE_URL}/login`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      DATABASE_URL: testDatabaseUrl,
      BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
      BETTER_AUTH_URL: BASE_URL,
      // Fournisseurs OAuth volontairement non configurés dans les tests.
      GOOGLE_CLIENT_ID: "",
      GOOGLE_CLIENT_SECRET: "",
      MICROSOFT_CLIENT_ID: "",
      MICROSOFT_CLIENT_SECRET: "",
    },
  },
});
