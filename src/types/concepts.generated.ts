// このファイルは自動生成される。直接編集しない。
// 一覧の正典は src/types/concepts.md。編集したら npm run gen:concepts を実行する。

import type { Concept, ConceptId } from "./profile";

/** docs/concepts.md で定義された Concept の一覧。定義順は学習の推奨順を兼ねる。 */
export const CONCEPTS: readonly Concept[] = [
  {
    id: "go.variable_declaration",
    label: "変数宣言と :=",
    language: "go",
    prerequisites: [],
    source: { kind: "manual" },
  },
  {
    id: "go.basic_types",
    label: "基本型とゼロ値",
    language: "go",
    prerequisites: ["go.variable_declaration"],
    source: { kind: "manual" },
  },
  {
    id: "go.control_flow",
    label: "if / for / switch",
    language: "go",
    prerequisites: ["go.variable_declaration"],
    source: { kind: "manual" },
  },
  {
    id: "go.function_basics",
    label: "関数と複数戻り値",
    language: "go",
    prerequisites: ["go.basic_types"],
    source: { kind: "manual" },
  },
  {
    id: "go.error_handling",
    label: "error 型と if err != nil",
    language: "go",
    prerequisites: ["go.function_basics"],
    source: { kind: "manual" },
  },
  {
    id: "go.slice_basics",
    label: "Slice の生成と参照",
    language: "go",
    prerequisites: ["go.basic_types"],
    source: { kind: "manual" },
  },
  {
    id: "go.slice_append",
    label: "append と再割り当て",
    language: "go",
    prerequisites: ["go.slice_basics"],
    source: { kind: "manual" },
  },
  {
    id: "go.map_basics",
    label: "Map と comma-ok",
    language: "go",
    prerequisites: ["go.basic_types"],
    source: { kind: "manual" },
  },
  {
    id: "go.struct_basics",
    label: "struct の定義と埋め込み",
    language: "go",
    prerequisites: ["go.basic_types"],
    source: { kind: "manual" },
  },
  {
    id: "go.pointer_basics",
    label: "ポインタと & / *",
    language: "go",
    prerequisites: ["go.struct_basics"],
    source: { kind: "manual" },
  },
  {
    id: "go.pointer_receiver",
    label: "値レシーバとポインタレシーバ",
    language: "go",
    prerequisites: ["go.pointer_basics"],
    source: { kind: "manual" },
  },
  {
    id: "go.interface_basics",
    label: "interface の暗黙実装",
    language: "go",
    prerequisites: ["go.struct_basics"],
    source: { kind: "manual" },
  },
  {
    id: "go.goroutine",
    label: "goroutine の起動",
    language: "go",
    prerequisites: ["go.function_basics"],
    source: { kind: "manual" },
  },
  {
    id: "go.channel",
    label: "channel の送受信",
    language: "go",
    prerequisites: ["go.goroutine"],
    source: { kind: "manual" },
  },
  {
    id: "go.select",
    label: "select による多重化",
    language: "go",
    prerequisites: ["go.channel"],
    source: { kind: "manual" },
  },
  {
    id: "go.context",
    label: "context によるキャンセル",
    language: "go",
    prerequisites: ["go.channel"],
    source: { kind: "manual" },
  },
  {
    id: "go.defer",
    label: "defer の実行順序",
    language: "go",
    prerequisites: ["go.function_basics"],
    source: { kind: "manual" },
  },
  {
    id: "go.package_visibility",
    label: "パッケージと公開/非公開",
    language: "go",
    prerequisites: ["go.function_basics"],
    source: { kind: "manual" },
  },
  {
    id: "go.module_dependency",
    label: "go.mod と依存管理",
    language: "go",
    prerequisites: ["go.package_visibility"],
    source: { kind: "manual" },
  },
  {
    id: "go.testing_basics",
    label: "testing パッケージ",
    language: "go",
    prerequisites: ["go.function_basics"],
    source: { kind: "manual" },
  },
];

/** Concept ID から定義を引く。未知の ID では undefined を返す。 */
export const CONCEPT_BY_ID: ReadonlyMap<ConceptId, Concept> = new Map(
  CONCEPTS.map((concept) => [concept.id, concept]),
);
