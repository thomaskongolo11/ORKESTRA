// Client Prisma partagé par toute l'application ORKESTRA.
// Prisma 7 se connecte à PostgreSQL via un adaptateur de driver (@prisma/adapter-pg).
// Le client est généré dans ./generated/prisma par `pnpm db:generate` (non versionné).

import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "./generated/prisma/client";

export * from "./generated/prisma/client";

function createPrismaClient(): PrismaClient {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) {
    throw new Error("DATABASE_URL n'est pas définie. Copie .env.example en .env et renseigne-la.");
  }
  return new PrismaClient({ adapter: new PrismaPg({ connectionString }) });
}

// En développement, Next.js recharge les modules à chaud : on réutilise une seule
// instance pour ne pas ouvrir une nouvelle connexion à chaque rechargement.
const globalForPrisma = globalThis as unknown as { orkestraPrisma?: PrismaClient };

export const prisma: PrismaClient = globalForPrisma.orkestraPrisma ?? createPrismaClient();

if (process.env.NODE_ENV !== "production") {
  globalForPrisma.orkestraPrisma = prisma;
}
