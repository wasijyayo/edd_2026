import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["node_modules/**", "dist/**", "src/worker/worker-configuration.d.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
];
