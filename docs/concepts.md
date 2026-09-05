# Concept と Learner Profile

このドキュメントは Learner Profile に関する**契約**である。
命名規則・追加手順・習熟度の更新ルール・マイグレーション方針についてはこのドキュメントが
正典であり、コードはこれに従う。型定義は `src/types/profile.ts` にある。

Concept 一覧そのものはこのドキュメントには置かず、`src/types/concepts.md` を正典とする。
一覧は実行時にも必要なため、その表から `src/types/concepts.generated.ts` を機械的に
書き出す。生成物は新しい情報を持たず、表と同じ内容を import できる形にしたものである。

```bash
npm run gen:concepts     # 表から生成する
npm run check:concepts   # 表と生成物がズレていないか検査する
```

---

## Concept ID

学習概念には `<language>.<concept>` 形式の ID を付ける。

```text
go.pointer_receiver
go.slice_append
ts.type_narrowing
```

形式は `^[a-z0-9]+\.[a-z0-9_]+$`（`src/types/profile.ts` の `CONCEPT_ID_PATTERN`）。

### 言語をフィールドではなく ID に含める理由

ID 単体で一意になるため、学習イベントやログに ID だけを載せれば意味が確定する。
言語を別フィールドに分けると、イベントを記録するすべての箇所で `conceptId` と
`language` を必ずセットで運ぶ必要があり、片方を落とした瞬間に名寄せ不能なデータが残る。

なお `Concept.language` フィールドも別に持つが、これは ID プレフィックスの
再掲であり、フィルタリング用の冗長な情報である。**ID とプレフィックスが食い違う
Concept を定義してはならない。**

### 「学習元」の扱い

学習元が広がっても Concept ID は変えない。可変なものは2つの直交する軸に逃がす。

| 軸               | 何を表すか                                        | 型                     |
| ---------------- | ------------------------------------------------- | ---------------------- |
| Concept の出所   | roadmap.sh / 教材 / 書籍 のどれを参考にした概念か | `Concept.source`       |
| イベントの観測元 | VS Code / GitHub / Web のどこで詰まったか         | `LearningEvent.origin` |

「roadmap.sh で学ぶ概念に、VS Code で詰まった」のように両者は独立して組み合わさる。
`go.pointer_receiver` という概念自体は、どの教材から来ても、どこで観測しても同じものなので、
ID を安定させ、変わるものだけをこの2フィールドに持たせる。

### なぜ Concept 一覧を自前で持つか

外部ロードマップから一覧を取り込む案を検討した上で、MVP では自前で持つことにした。

roadmap.sh（`nilbuild/developer-roadmap`）の Go ロードマップは、各トピックの
**解説文しか持たない**。「ポインタを学ぶには struct が必要」という前提関係のデータがなく、
`prerequisites` は取り込んでも埋まらない。また粒度が学習単位ではなく、
`break` や `boolean` のような文法要素と `echo` や `bubbletea` のような
ライブラリ名が同列に並ぶ（172件）。そのまま取り込むと大半が永久に `unobserved` になる。

自前で抱えるのは **ID と前提関係だけ**であり、これは Go の言語仕様が変わらない限り
更新が発生しない。重くて変化し続ける解説文は書かず、必要なら
`Concept.source` に外部の参照先を持たせてリンクする。

将来、一覧の管理自体をやめる判断もありうる。その場合は外部から取り込んだ結果を
生成物としてコミットし、実行時に外部へ取りに行かない形にする。
調査時点で上記リポジトリは移管を経験しており、外部の可用性に実行時依存させない。

---

## Go の Concept 一覧

一覧の正典は **[`src/types/concepts.md`](../src/types/concepts.md)** にある。
生成物 `src/types/concepts.generated.ts` の隣に置き、
生成の入力と出力を並べて確認できるようにしている。

MVP の対象は Go のみで、20件を手で定義している。
追加するときは次の手順に従う。

---

## Concept を新規追加する手順

1. **既存の一覧を確認する。** 表記違いの重複（`go.slice` と `go.slice_basics` など）は
   後から名寄せが必要になるため、近い ID がすでにないかを必ず見る。
2. **ID を決める。** `^[a-z0-9]+\.[a-z0-9_]+$` を満たすこと。単数形・スネークケースに揃える。
3. **`src/types/concepts.md` の表に行を追加する。** 前提となる Concept があれば
   `prerequisites` 列に書く。
   前提は既存 ID のみを指し、循環してはならない。
4. **`source` は `manual` になる。** 表に `source` 列はなく、
   `scripts/gen-concepts.mjs` が全件を `{ kind: "manual" }` として書き出す。
   MVP では Concept をすべて手で定義するためである。
   roadmap.sh や教材由来の Concept を登録するには、テーブルに `source` 列を足し、
   生成スクリプトのパーサを合わせて変更する必要がある。型（`ConceptSource`）は
   その日のために先に用意してあるが、**入口はまだ開いていない。**
5. **`npm run gen:concepts` を実行する。** 生成物を表と同時にコミットする。
6. **PR を出す。** Concept の追加で人が編集するのは `src/types/concepts.md` だけであり、
   `src/types/profile.ts` もこのドキュメントも変更不要
   （`ConceptId` が `string` であるため）。

`ConceptId` を literal union にしないのはこの手順のためである。union にすると
Concept を1つ足すたびに型ファイルが変更され、並行して動いている他の実装 PR と衝突する。

`src/types/concepts.generated.ts` を直接編集してはならない。次の生成で失われる。

---

## 習熟度の更新ルール

### 前提

**質問回数を習熟度の根拠として使わない。** 質問が多いことは、理解が浅いことも、
熱心に学んでいることも意味しうるため、単独では判別材料にならない。
同様に、質問が減ったことも「理解した」と「諦めて離脱した」を区別できない。

そのため `questionCount` は `MasteryEvidence` に記録するが、**`score` の計算には
用いない**。表示上の補助情報として扱う。

### status の判定

`status` は `evidence` から導出する。

| status       | 条件                                   |
| ------------ | -------------------------------------- |
| `unobserved` | その Concept のイベントが1件もない     |
| `confirmed`  | 下の2条件をどちらも満たす              |
| `learning`   | 上記以外（観測はあるが根拠が足りない） |

`confirmed` の条件:

1. `solvedIndependentlyCount + checkPassedCount >= 2`
2. `recentTypes` の直近5件に `error_recurred` と `check_failed` が含まれない

条件2を「累積の再発回数が0」にしてはならない。累積カウントは減らないため、
一度でも再発した Concept が二度と `confirmed` に戻れなくなる。
それは「同じエラーの再発減少を根拠にする」という方針と矛盾する。
再発したあとに自力解決を重ねれば回復できる形にする。

`recentTypes` はその Concept の直近 **5件** のイベント種別を古い順に保持し、
超えた分は先頭から捨てる。

`unobserved` のとき `score` は 0 とするが、これは「習熟度が低い」ではなく
「判断材料がない」を意味する。UI で 0% として表示してはならない。

### score の更新

イベント1件ごとに `score` を加減する。範囲は 0.0〜1.0 にクランプする。

| イベント               | score への影響 |
| ---------------------- | -------------- |
| `solved_independently` | +0.25          |
| `check_passed`         | +0.20          |
| `hint_used`            | +0.05          |
| `answer_viewed`        | 0              |
| `check_failed`         | −0.15          |
| `error_recurred`       | −0.20          |
| `question_asked`       | 0              |

`hint_used` をわずかに正とするのは、ヒントで前進した事実は完全な無情報ではないため。
`answer_viewed` を 0 とするのは、答えを見たこと自体は理解を示さないため。

`score` はイベントごとの加減算を積み上げた**保存値**であり、`events` から
再計算はしない。履歴は1000件で切り詰められ、クランプ後の値から元の値も復元できないため、
係数を変えても既存の `score` は変わらず、以後のイベントから新しい係数が効く。

この係数は MVP 時点の暫定値である。デモで挙動を確認した上で調整してよいが、
**`question_asked` を正の値にする変更だけは行わない。** それはこのプロダクトが
否定している「AI を使った回数で理解度を測る」ことそのものになる。

### status と score を矛盾させない

加減したあと、`score` を status ごとの範囲へクランプする
（`src/types/profile.ts` の `MASTERY_SCORE_RANGE`）。

| status       | score の範囲 |
| ------------ | ------------ |
| `unobserved` | 0.0          |
| `learning`   | 0.0 〜 0.69  |
| `confirmed`  | 0.7 〜 1.0   |

順序は **status を先に判定し、そのあと score をクランプする**。
これを省くと「確認済み（45%）」のように status と score が食い違った表示になる。
score は status を補足する数値であり、status を上書きするものではない。

---

## 保存

`ExtensionContext.globalState` に単一キーで保存する。

| 項目 | 値                             |
| ---- | ------------------------------ |
| キー | `codeCompanion.learnerProfile` |
| 値   | `LearnerProfile`               |

Learner Profile はプロジェクトではなく人に紐づくため、`workspaceState` ではなく
`globalState` を使う。別端末との同期は行わない（同期は Pro の Cloud Sync 段階の課題）。

### 型を JSON serializable に保つ

globalState は値を JSON として直列化する。そのため `LearnerProfile` の型に
`Date` や `Map` や `Set` を含めない。日時は ISO 8601 の `string`、
コレクションは配列かプレーンオブジェクトで表現する。

この制約を守っている限り、後から「プロファイルを JSON ファイルへ書き出す」
コマンドを追加するのは値をそのまま出力するだけで済む。

### イベント履歴の上限

`events` は追記のみで増え続けるため、上限を **1000件** とし、
超えた分は古いものから捨てる。捨てる前に、そのイベントの寄与は
`mastery[].evidence` のカウントに積算済みであるため、習熟度は失われない。

---

## マイグレーション方針

`LearnerProfile.version` は `src/types/profile.ts` の `LEARNER_PROFILE_VERSION` に
現在値を持つ。MVP 時点では `1`。

### version を上げる場合・上げない場合

| 変更                                              | version                                |
| ------------------------------------------------- | -------------------------------------- |
| 省略可能フィールドの追加                          | **上げない**                           |
| `ConceptSourceKind` や `EventOrigin` への値の追加 | **上げない**                           |
| Concept 一覧への追加・削除                        | **上げない**（データ構造ではないため） |
| 必須フィールドの追加                              | 上げる                                 |
| フィールドの削除・改名                            | 上げる                                 |
| 既存フィールドの意味や単位の変更                  | 上げる                                 |

省略可能フィールドの追加で上げないのは、読み込み側が `undefined` を扱えるためである。
逆に、**既存データを読んだときに壊れる変更はすべて version を上げる。**

### 読み込み時の処理

```text
保存値なし              → createEmptyProfile() で新規作成する
version === 現在値      → そのまま使う
version < 現在値        → 順にマイグレーション関数を適用する
version > 現在値        → 新しい拡張が書いたデータ。破棄せず読み取りを諦め、
                          警告を出して読み取り専用として扱う
version が無い/不正     → 破損とみなし、新規作成する
```

**古いデータを黙って捨てない。** 学習履歴は再取得できないため、
マイグレーションできない場合も上書きせず、別キーへ退避してから新規作成する。

### マイグレーション関数の置き場所

`src/learning/migrate.ts` に `migrateV1ToV2` のような形で version ごとに1関数ずつ置く。
1つの関数で複数バージョンをまたがない。連鎖適用で任意の古いバージョンから現在値へ上げる。

---

## 関連

- 型定義: `src/types/profile.ts`
- Concept 一覧の正典: `src/types/concepts.md`
- Concept 一覧の生成物（編集しない）: `src/types/concepts.generated.ts`
- 生成スクリプト: `scripts/gen-concepts.mjs`
- 長期構想: `docs/idea.md`
