import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // ecosystem.config.cjs : configuration pm2 (CommonJS) générée par create-colyseus-app.
  { ignores: ["build", "node_modules", "ecosystem.config.cjs"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
