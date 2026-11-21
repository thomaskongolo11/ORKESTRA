// Avant les tests e2e : remise à zéro des compteurs de limitation des tentatives
// de la base de TEST (tous les tests se connectent depuis la même adresse locale).
import { runTsx } from "./fixtures";

export default function globalSetup(): void {
  if (!process.env.TEST_DATABASE_URL) return;
  runTsx("tests/e2e/reset-rate-limit.ts", [], { ...process.env, DATABASE_URL: process.env.TEST_DATABASE_URL });
}
