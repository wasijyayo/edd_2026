# Learning Domain

このパッケージは `Concept`、`LearningEvent`、`ConceptMastery` と習熟度の規則を共有する。

- VS Code、HTTP、データベース、特定AI SDK、環境変数、ファイルシステムに依存してはならない。
- クライアントの表示都合やDatabaseの内部モデルを持ち込まない。
- 習熟度は質問回数だけで上げない。詳細な更新規則は `docs/concepts.md` を正典とする。
- Concept一覧の正典は `concepts.md`。変更後はリポジトリルートで `npm run gen:concepts` と `npm run check:concepts` を実行する。
- 仕様変更には単体テストを追加し、API・Extensionの両方で同じ意味を保つ。
