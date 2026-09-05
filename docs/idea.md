# Code Companion

## 概要

VS Code上で使える、プログラミング学習向けAIコンパニオン。

AIにコードを書いてもらうことではなく、

> AIを使うほど、自分でコードを理解・解決できるようになる

ことを目指す。

コードを読んでいて分からない箇所を選択し、ショートカットからその場ですぐ質問できる。
エラーが発生した場合も、現在のコードやDiagnosticsをもとに原因を解説する。

---

## 主な体験

### コードを選択して即質問

```text
コードを選択
↓
ショートカット
↓
「これ何？」「なぜこう書く？」
↓
その場でAIが回答
```

Naniのように、必要なときだけ素早く呼び出せるUXを目指す。

### エラー解説

VS Codeのエラー情報を取得し、

* なぜエラーなのか
* どこを見るべきか
* 次に何を試すべきか

を解説する。

すぐ答えを出すだけでなく、Hint → 自力解決 → Answer のようなLearning Modeも用意する。

---

## Personal Learning

質問内容やエラー、ヒントの利用状況などから、その人の理解度を蓄積する。

```text
Go Skill

Basic Syntax   90%
Slice / Map    78%
Pointer        45%
Interface      30%
Concurrency    20%
```

「何回AIを使ったか」ではなく、

* 何を理解したか
* 何が苦手か
* 最近できるようになったこと
* 次に何を学ぶとよいか

を可視化する。

最終的には、AIへの質問が減ったこと自体を成長として評価する。

---

## 回答のカスタマイズ

ユーザーごとに「どう教えてほしいか」も設定できる。

### Tone

* Standard
* Friendly
* Casual
* Strict
* Concise

### Teaching Style

* Answer First
* Hint First
* Socratic
* Example Heavy
* Deep Explanation

### Companion

「優しい先輩」「厳しめのメンター」「簡潔なAI」などのプリセットに加え、Proでは独自のキャラクターや教え方を設定できる。

単なる口調変更ではなく、

```text
Personality
+
Teaching Style
+
Skill Level
+
Learning History
```

を組み合わせて、自分専用の先生にしていく。

---

## 対象ユーザー

メインターゲットは、

> コードを書きながら、新しい知識・技術を学んでいるDeveloper

特に、

* 若手エンジニア
* 新しい言語/FWを学んでいるエンジニア
* 就活中・駆け出しエンジニア
* 大学生・専門学生

を想定する。

「プログラミング初心者」だけではなく、

> TypeScript経験者がGoを学ぶ

のような特定技術における初心者も対象。

---

## AI

特定のLLMには依存しない。

```text
AI Provider
├─ VS Code Language Model / User's Copilot
├─ Workers AI
├─ BYOK
└─ Local LLM
```

基本はユーザー自身が利用できるAIを優先し、運営側のAIコストを抑える。

学習履歴は最初はローカル保存し、巨大なRAGやVector DBは使わない。

---

## MVP

最初は以下に絞る。

1. コード選択 → ショートカット → AI質問
2. エラー → AI解説
3. Hint Mode
4. 質問から学習Conceptを抽出
5. 基本Skill Map
6. 回答スタイル設定

AI Agentや大規模なコード生成は実装しない。

---

## 収益化

基本は Free + Pro。

### Free

* コードへの質問
* エラー解説
* Hint Mode
* 基本Skill Map
* 基本的な回答カスタマイズ

### Pro

* 長期学習履歴
* 詳細Skill Map
* 過去のつまずきを考慮した回答
* Weekly / Monthly Review
* 学習ロードマップ
* 復習・Personalized Challenge
* Custom Companion
* 詳細なTeaching Style設定
* 複数端末同期

ProではAI利用量そのものではなく、

> Long-term Memory + Personalized Teaching + Custom Companion

に課金する。

---

## コンセプト

一般的なCoding AIは、

> どうすればコードを早く完成できるか

を支援する。

Code Companionは、

> どうすれば次はAIなしでも理解・解決できるようになるか

を支援する。

Copilotはコードを完成させる。
Code Companionは、あなたを成長させる。
