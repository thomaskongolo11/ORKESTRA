// Charge .env pour que TEST_DATABASE_URL soit disponible dans les tests d'intégration.
// Une variable déjà définie dans le terminal reste prioritaire (dotenv ne l'écrase pas).
import "dotenv/config";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@/": fileURLToPath(new URL("./apps/web/", import.meta.url)),
    },
  },
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    passWithNoTests: true,
    setupFiles: ["tests/setup-env.ts"],
    // Les tests d'intégration partagent une base : exécution séquentielle des fichiers.
    fileParallelism: false,
  },
});
