// Préparation de l'environnement des tests (chargé avant chaque fichier de test).
//
// Les tests n'utilisent JAMAIS la base de développement : si TEST_DATABASE_URL est
// définie, elle remplace DATABASE_URL pour toute la durée des tests.
if (process.env.TEST_DATABASE_URL) {
  process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
}

// Secret et URL dédiés aux tests (jamais ceux de .env).
process.env.BETTER_AUTH_SECRET = "orkestra-test-secret-0123456789-abcdefghijklmnop";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
