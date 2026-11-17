import { defineConfig, devices } from "@playwright/test";
import base from "./playwright.config";

/**
 * Captures d'écran des pages — `pnpm screenshots`.
 * Résultat dans le dossier screenshots/ (non versionné), sur ordinateur et mobile.
 */
export default defineConfig({
  ...base,
  testDir: "tests/screenshots",
  outputDir: "test-results/screenshots",
  projects: [
    { name: "ordinateur", use: { ...devices["Desktop Chrome"], viewport: { width: 1440, height: 900 } } },
    { name: "mobile", use: { ...devices["Pixel 7"] } },
  ],
});
