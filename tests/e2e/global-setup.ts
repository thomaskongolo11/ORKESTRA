// Avant les tests e2e : remise à zéro des compteurs de limitation des tentatives
// de la base de TEST (tous les tests se connectent depuis la même adresse locale).
import { execFileSync } from "node:child_process";

export default function globalSetup(): void {
  if (!process.env.TEST_DATABASE_URL) return;
  execFileSync("pnpm", ["exec", "tsx", "tests/e2e/reset-rate-limit.ts"], {
    env: { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL },
    stdio: "inherit",
    shell: process.platform === "win32",
  });
}
