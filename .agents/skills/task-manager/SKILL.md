---
name: task-manager
description: Gakushu Sochi の Issue と GitHub Projects を操作する。Issue の新規作成とProject登録、着手/完了に伴うステータス更新、期限やIterationの一括変更、MVP 6項目に対する進捗レポートに使う。「タスクを追加」「Projectを更新」「進捗を出して」「期限を引き直す」と言われたら起動する。
---

# タスク管理

`wasijyayo/edd_2026` の Issue と Project 8「Gakushu Sochi」を扱う。

## 前提

`scripts/gh-project.sh` に Project ID とフィールド ID を集約してある。
GraphQL を直に書かず、必ずこのスクリプトを経由すること。

```bash
S=.agents/skills/task-manager/scripts/gh-project.sh
$S require-scope          # 最初に必ず実行する
```

`project` スコープが無いと全操作が失敗する。その場合は対話端末で
`gh auth refresh -s project` を実行するようユーザーへ依頼する。
`!` 実行では `--hostname github.com` が要る。

## 知っておくべき制約

**Project 8 の所有者は `KOU050223`、リポジトリは `wasijyayo`。所有者が異なる。**
このため GitHub の仕様上、次の2つは**実現できない**。試して失敗させないこと。

- Project とリポジトリのリンク（`Only projects owned by the same owner...`）
- Project 組み込みの Auto-add workflow（リンクが前提のため）

結果として **新規 Issue は自動では Project に入らない**。作成したら必ず手で追加する。
それがこのスキルの主目的の一つである。

**Iteration の期間・名前は公開 API から変更できない**（`updateProjectV2IterationField` は非公開）。
既定名「Iteration 1 / 2」のままで、実質の期限は Start/Target date が持つ。
期間を変えたい場合は Web UI での手作業をユーザーへ案内する。

## 操作

### 1. Issue を作成して Project へ登録する

Issue 本文は既存の書式に必ず揃える。逸脱すると読み手が探す場所が変わる。

```markdown
## 目的

（なぜ要るか。docs/idea.md や docs/architecture.md の記述と、
実コードの現状を根拠として引く。ファイル:行 で示す）

## 依存

- 領域/連番 (#N): タイトル

## 変更対象

- パス

## 実装計画

1. 手順。決め打ちできない設計判断は「決める」と書いて選択肢を並べる。

## 完了条件

- [ ] 検証可能な条件

## スコープ外

- 他 Issue が持つ範囲
```

タイトルは `領域/連番: 動詞形の要約`（例 `診断/02: 同じエラーの再発を検知する`）。
既存の領域は 基盤 / 設計 / 調査 / 選択 / 質問 / 表示 / AI / 診断 / Web / MVP。
連番はその領域の既存最大値+1。バグや雑務は `fix:` `docs:` `deploy:` を使う。

ラベルは `enhancement` / `bug` / `documentation` / `question` から選ぶ。

```bash
gh issue create --title "..." --label enhancement --body-file /tmp/body.md
$S add <番号>                    # Project へ登録(登録済みなら既存IDを返す)
ID=$($S item-id <番号>)
$S status "$ID" todo
$S iteration "$ID" all           # mvp = 9/13 群, all = 9/26 群
$S start  "$ID" 2026-09-14
$S target "$ID" 2026-09-26
```

**作成前にユーザーへ内容を提示して承認を得る。** Issue 作成は外向きの操作で、
取り消しが面倒なため。既存 Issue と重複していないことも併せて示す。

### 2. ステータスを更新する

```bash
ID=$($S item-id 75)
$S status "$ID" doing     # todo | doing | done
```

完了時は Issue の close と Project の Done を揃える。片方だけ動かすと
レポートの集計が実態とずれる。

```bash
gh issue close 75 --comment "..."
$S status "$($S item-id 75)" done
```

### 3. 期限 / Iteration を一括で変える

リスケジュール時に使う。日付は `Date` 型で渡す必要があり、
`String` で渡すとエラーにならず黙って無視される（helper が吸収済み）。

```bash
for n in 75 78 12; do
  ID=$($S item-id $n)
  $S iteration "$ID" mvp
  $S start  "$ID" 2026-09-09
  $S target "$ID" 2026-09-13
done
```

**一括変更の前に対象一覧をユーザーへ見せて確認を取る。** 範囲を誤ると
数十件の期限が黙って書き換わる。

### 4. 進捗レポートを出す

```bash
.agents/skills/task-manager/scripts/report.py
```

MVP 6項目それぞれの達成度と、期限ごとの未完了 Issue を出力する。

**達成率は Issue の件数比では計算しない。** 件数比は「Concept を1つ足す」と
「Web アプリをゼロから作る」を同じ 1 件として数えるため、実態から乖離する。
`report.py` の `MVP_ITEMS` が各項目の進捗値と根拠を持つ正典であり、
**コードの実状を確認したうえで手で更新する**。

自動判定できるのは Issue の open/closed だけである。「Concept 抽出が実際に
動くか」はコードを読まないと分からない。値を書き換えるときは `note` の根拠も
必ず併せて直す。根拠のない数字を出すくらいなら、古い数字のままの方がよい。

## 現在のスケジュール

| 群       | 期間         | 内容                                                                |
| -------- | ------------ | ------------------------------------------------------------------- |
| MVP      | 〜2026-09-13 | #75, #15, #46, #78, #12, #24（デモ導線）                            |
| 全体完成 | 〜2026-09-26 | 残り23件（Web閲覧, 確認問題, 認証, 課金前提の制限, デプロイ, バグ） |

MVP 6項目のうち **項目5（Web閲覧UI）と項目6（回答スタイル設定）は 9/26 側**にある。
9/13 の「MVP完成」はデモ導線が通る状態を指し、idea.md の 6 項目達成ではない。
ユーザーがこの2つを混同していそうなときは指摘する。
