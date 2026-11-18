import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    environment: "node",
    testTimeout: 15000,
    // Chaque fichier démarre son propre serveur Colyseus sur le même port :
    // on les exécute l'un après l'autre.
    fileParallelism: false,
  },
});
