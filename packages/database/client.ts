// Client Prisma partagé par toute l'application ORKESTRA.
// Prisma 7 se connecte à PostgreSQL via un adaptateur de driver (@prisma/adapter-pg).
// Le client est généré dans ./generated/prisma par `pnpm db:generate` (non versionné).

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export * from "./generated/prisma/client";

function createPrismaClient(): PrismaClient {
  let connectionString = process.env.DATABASE_URL;
  // Pendant `next build`, certains modules inspectent le client sans faire de requête :
  // une adresse factice suffit (aucune connexion n'est ouverte avant la première requête).
  if (!connectionString && process.env.NEXT_PHASE === "phase-production-build") {
    connectionString = "postgresql://build:build@127.0.0.1:1/build";
  }
  if (!connectionString) {
    throw new Error("DATABASE_URL n'est pas définie. Copie .env.example en .env et renseigne-la.");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// En développement, Next.js recharge les modules à chaud : on réutilise une seule
// instance pour ne pas ouvrir une nouvelle connexion à chaque rechargement.
const globalForPrisma = globalThis as unknown as { orkestraPrisma?: PrismaClient };

function getPrismaClient(): PrismaClient {
  if (!globalForPrisma.orkestraPrisma) {
    globalForPrisma.orkestraPrisma = createPrismaClient();
  }
  return globalForPrisma.orkestraPrisma;
}

/**
 * Client créé à la première utilisation (et non à l'import) : `next build` peut ainsi
 * charger les modules serveur sans base de données configurée.
 */
export const prisma: PrismaClient = new Proxy({} as PrismaClient, {
  get(_target, property) {
    const client = getPrismaClient();
    const value = Reflect.get(client, property, client);
    return typeof value === "function" ? value.bind(client) : value;
  },
});
