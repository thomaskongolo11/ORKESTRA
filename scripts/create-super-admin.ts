/**
 * ORKESTRA — Création d'un SUPER_ADMIN (script local uniquement).
 *
 *   pnpm admin:create
 *
 * Nécessite un accès direct à la base (DATABASE_URL dans .env).
 * Le mot de passe est saisi sans être affiché. À la première connexion,
 * l'activation de la double authentification (TOTP) sera imposée avant tout accès à /admin.
 */
import "dotenv/config";
import { createInterface } from "node:readline";
import { Writable } from "node:stream";

// Un seul lecteur pour toutes les questions (sinon les réponses déjà saisies sont perdues).
let muted = false;
const output = new Writable({
  write(chunk, _encoding, callback) {
    if (!muted) process.stdout.write(chunk);
    callback();
  },
});
const rl = createInterface({ input: process.stdin, output, terminal: Boolean(process.stdin.isTTY) });
const pendingLines: string[] = [];
const waiting: Array<(line: string) => void> = [];
rl.on("line", (line) => {
  const next = waiting.shift();
  if (next) next(line);
  else pendingLines.push(line);
});

/** Pose une question ; `hidden` masque la saisie (mot de passe). */
function ask(question: string, hidden = false): Promise<string> {
  process.stdout.write(question);
  muted = hidden;
  return new Promise((resolve) => {
    const finish = (line: string) => {
      muted = false;
      if (hidden || !process.stdin.isTTY) process.stdout.write("\n");
      resolve(line);
    };
    const buffered = pendingLines.shift();
    if (buffered !== undefined) finish(buffered);
    else waiting.push(finish);
  });
}

async function main(): Promise<void> {
  console.log("\nORKESTRA — Création d'un compte SUPER_ADMIN\n");
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL n'est pas définie dans .env.");

  // Import après dotenv : la configuration lit les variables d'environnement au chargement.
  const { createSuperAdmin, validateSuperAdminInput, SuperAdminCreationError } = await import(
    "../apps/web/lib/auth/super-admin"
  );
  const { prisma } = await import("../packages/database/client");

  try {
    const email = (await ask("E-mail : ")).trim();
    const name = (await ask("Nom complet : ")).trim();
    const password = await ask("Mot de passe (12 caractères minimum, non affiché) : ", true);
    const confirmation = await ask("Confirme le mot de passe : ", true);

    if (password !== confirmation) throw new SuperAdminCreationError("Les deux mots de passe ne correspondent pas.");
    const errors = validateSuperAdminInput({ email, name, password });
    if (errors.length > 0) throw new SuperAdminCreationError(errors.join("\n"));

    const confirm = (await ask(`Créer le SUPER_ADMIN « ${email} » ? (oui/non) : `)).trim().toLowerCase();
    if (confirm !== "oui") {
      console.log("Annulé. Aucun compte créé.");
      return;
    }

    const result = await createSuperAdmin({ email, name, password });
    console.log(`\n✔ SUPER_ADMIN créé : ${result.email}`);
    console.log("  À la première connexion, l'activation de la double authentification sera obligatoire.");
  } catch (error) {
    if (error instanceof SuperAdminCreationError) {
      console.error(`\n✖ ${error.message}`);
      process.exitCode = 1;
    } else {
      throw error;
    }
  } finally {
    rl.close();
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error("\n✖ Erreur inattendue :", error);
  process.exit(1);
});
