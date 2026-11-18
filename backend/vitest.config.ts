import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 15000,
    // Chaque fichier démarre son propre serveur Colyseus sur le même port :
    // on les exécute l'un après l'autre.
    fileParallelism: false,
    // Authentification des tests (voir `test/helpers/auth.ts`) : les jetons sont signés en local.
    // L'URL ne pointe vers aucun service (port 9 « discard » de la boucle locale) : elle sert
    // seulement à vérifier l'émetteur. Aucun test n'envoie au serveur un jeton asymétrique,
    // le JWKS distant n'est donc jamais téléchargé.
    env: {
      SUPABASE_URL: "http://127.0.0.1:9",
      SUPABASE_JWT_SECRET: "test-only-secret-not-used-anywhere-else-0123456789",
    },
  },
});
