// Vide la table rateLimit de la base de TEST. Refuse toute autre base.
export {};
async function main(): Promise<void> {
  if (!process.env.DATABASE_URL?.includes("test")) {
    throw new Error("Refus : DATABASE_URL ne pointe pas vers une base de test.");
  }
  const { prisma } = await import("../../packages/database/client");
  try {
    await prisma.rateLimit.deleteMany({});
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error: unknown) => {
  console.error(error);
  process.exit(1);
});
