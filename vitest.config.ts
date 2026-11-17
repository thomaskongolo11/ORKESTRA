// Charge .env pour que TEST_DATABASE_URL soit disponible dans les tests d'intégration.
// Une variable déjà définie dans le terminal reste prioritaire (dotenv ne l'écrase pas).
import "dotenv/config";
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["tests/unit/**/*.test.ts", "tests/integration/**/*.test.ts"],
    environment: "node",
    passWithNoTests: true,
  },
});
