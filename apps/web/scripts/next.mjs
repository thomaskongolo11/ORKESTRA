// Lance Next.js après avoir chargé le fichier .env de la RACINE du monorepo
// (partagé avec Prisma et les tests). Next.js ne lit par défaut que apps/web/.env.
//
// Les variables déjà définies dans le terminal restent prioritaires.
// Usage (via package.json) : node scripts/next.mjs dev | build | start
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const rootEnvFile = fileURLToPath(new URL("../../../.env", import.meta.url));
if (existsSync(rootEnvFile)) {
  const alreadyDefined = new Set(Object.keys(process.env));
  const before = { ...process.env };
  process.loadEnvFile(rootEnvFile);
  // Garantit la priorité des variables du terminal, quelle que soit la version de Node.
  for (const key of alreadyDefined) process.env[key] = before[key];
}

const nextBin = createRequire(import.meta.url).resolve("next/dist/bin/next");
const child = spawn(process.execPath, [nextBin, ...process.argv.slice(2)], {
  stdio: "inherit",
  env: process.env,
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  else process.exit(code ?? 0);
});
