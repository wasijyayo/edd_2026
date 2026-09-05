import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

export default [
  { ignores: ["node_modules/**", "dist/**", "src/concepts.generated.ts"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
];
