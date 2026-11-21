// Outils des scénarios de bout en bout (base de TEST uniquement).
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { randomBytes } from "node:crypto";
import { expect, type Page } from "@playwright/test";
import { totpCode } from "../integration/helpers";

export { totpCode };

export const uniqueEmail = (prefix: string) => `${prefix}-${randomBytes(4).toString("hex")}@orkestra.test`;

/** Lance un script TypeScript avec tsx via Node directement (pas de shell, aucun argument interprété). */
export function runTsx(script: string, args: string[] = [], env: NodeJS.ProcessEnv = process.env): string {
  const tsxCli = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");
  return execFileSync(process.execPath, [tsxCli, script, ...args], { env, encoding: "utf8" });
}

function seed(args: string[]): Record<string, string> {
  const output = runTsx("tests/e2e/seed.ts", args);
  const lastLine = output.trim().split(/\r?\n/).at(-1) ?? "{}";
  return JSON.parse(lastLine) as Record<string, string>;
}

/** Remet à zéro les compteurs de limitation des tentatives (base de TEST uniquement). */
export function resetRateLimit(): void {
  runTsx("tests/e2e/reset-rate-limit.ts");
}

export function createSuperAdmin(email: string, password: string): string {
  return seed(["super-admin", email, password]).userId ?? "";
}

export function createOrgUser(email: string, password: string, role: "CLIENT_ADMIN" | "MANAGER" | "EMPLOYEE") {
  return seed(["org-user", email, password, role]);
}

/** Invitation CLIENT_ADMIN prête à accepter (crée un SUPER_ADMIN et une entreprise de test). */
export function createInvitation(email: string, organizationName: string) {
  return seed(["invitation", email, organizationName]);
}

/** Ouvre une page et attend que React soit chargé (sinon le formulaire partirait sans JavaScript). */
export async function openPage(page: Page, path: string) {
  await page.goto(path);
  await page.waitForLoadState("networkidle");
}

export async function login(page: Page, email: string, password: string, path = "/login") {
  await openPage(page, path);
  await page.getByLabel("E-mail professionnel").fill(email);
  await page.getByLabel("Mot de passe", { exact: true }).fill(password);
  await page.getByRole("button", { name: "Se connecter" }).click();
}

export async function expectPath(page: Page, pathname: string) {
  await expect.poll(() => new URL(page.url()).pathname, { timeout: 15_000 }).toBe(pathname);
}
