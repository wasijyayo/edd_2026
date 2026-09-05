import js from "@eslint/js";
import prettier from "eslint-config-prettier";
import tseslint from "typescript-eslint";

// VS Code の ESLint 拡張は eslint.workingDirectories の auto 検出により、
// モノレポのルートとこのワークスペースの両方を候補にできる。候補が複数あると
// tsconfig の探索先が決まらず、エディタ上でパースエラーになる。
// この設定ファイルがあるディレクトリを明示する（apps/vscode-extension と同じ対処）。
const tsconfigRootDir = import.meta.dirname;

export default [
  {
    ignores: ["node_modules/**", "src/worker-configuration.d.ts"],
    languageOptions: {
      parserOptions: { tsconfigRootDir },
    },
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
];
