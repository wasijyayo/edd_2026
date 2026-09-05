import js from "@eslint/js";
import tseslint from "typescript-eslint";
import prettier from "eslint-config-prettier";

export default [
  { ignores: ["out/**", "node_modules/**"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    // ビルドスクリプトはNode上で直接実行する。console / process はNodeのグローバル。
    files: ["scripts/**/*.mjs"],
    languageOptions: {
      globals: { console: "readonly", process: "readonly" },
    },
  },
  {
    // AI層はエディタから独立させる。CodeContext というデータのみを受け取り、
    // vscode に依存させない。将来 VS Code 以外へ展開する余地を機械的に守るためのルール。
    // 基盤/04 (#3) を参照。
    files: ["src/ai/**/*.ts"],
    rules: {
      "@typescript-eslint/no-restricted-imports": [
        "error",
        {
          paths: [
            {
              name: "vscode",
              message:
                "src/ai/ は vscode に依存させない。エディタ固有の情報は CodeContext 経由で受け取ること。",
            },
          ],
        },
      ],
    },
  },
];
