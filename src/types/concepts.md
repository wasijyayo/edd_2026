# Go の Concept 一覧

このファイルは Concept 一覧の**正典**である。
`concepts.generated.ts` はここから機械的に書き出したものなので、
編集したら `npm run gen:concepts` を実行する。

命名規則・追加手順・習熟度の更新ルールは [`docs/concepts.md`](../../docs/concepts.md) を参照。

MVP の対象は Go のみ。Skill Tree の自動生成は行わず、ここで手で定義する。
`prerequisites` は Skill Tree の辺にあたる。定義順は学習の推奨順を兼ねる。

| ID                        | 表示名                       | 前提                      |
| ------------------------- | ---------------------------- | ------------------------- |
| `go.variable_declaration` | 変数宣言と `:=`              | —                         |
| `go.basic_types`          | 基本型とゼロ値               | `go.variable_declaration` |
| `go.control_flow`         | if / for / switch            | `go.variable_declaration` |
| `go.function_basics`      | 関数と複数戻り値             | `go.basic_types`          |
| `go.error_handling`       | error 型と `if err != nil`   | `go.function_basics`      |
| `go.slice_basics`         | Slice の生成と参照           | `go.basic_types`          |
| `go.slice_append`         | `append` と再割り当て        | `go.slice_basics`         |
| `go.map_basics`           | Map と comma-ok              | `go.basic_types`          |
| `go.struct_basics`        | struct の定義と埋め込み      | `go.basic_types`          |
| `go.pointer_basics`       | ポインタと `&` / `*`         | `go.struct_basics`        |
| `go.pointer_receiver`     | 値レシーバとポインタレシーバ | `go.pointer_basics`       |
| `go.interface_basics`     | interface の暗黙実装         | `go.struct_basics`        |
| `go.goroutine`            | goroutine の起動             | `go.function_basics`      |
| `go.channel`              | channel の送受信             | `go.goroutine`            |
| `go.select`               | `select` による多重化        | `go.channel`              |
| `go.context`              | `context` によるキャンセル   | `go.channel`              |
| `go.defer`                | `defer` の実行順序           | `go.function_basics`      |
| `go.package_visibility`   | パッケージと公開/非公開      | `go.function_basics`      |
| `go.module_dependency`    | go.mod と依存管理            | `go.package_visibility`   |
| `go.testing_basics`       | `testing` パッケージ         | `go.function_basics`      |

MVP 時点ではすべて `source.kind` が `manual` である。
