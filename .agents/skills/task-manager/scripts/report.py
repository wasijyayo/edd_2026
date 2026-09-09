#!/usr/bin/env python3
"""Project 8 の進捗を MVP 6項目と期限に対して集計する。

達成率は Issue の件数比では出さない。件数比は「TS/JS の Concept 定義」と
「Web 閲覧UIをゼロから作る」を同じ 1 件として数えてしまい、実態と乖離する。
MVP 6項目それぞれの状態を docs/idea.md の定義に照らして持ち、
その加重平均を出す。重みと現在値は下の MVP_ITEMS が正典。

値の更新は手作業である。自動判定できるのは Issue の open/closed だけで、
「Concept 抽出が実際に動くか」はコードを読まないと分からない。
自動化して嘘の 100% を出すより、根拠付きで手で持つ方を選んでいる。
"""
import json
import subprocess
import sys
from datetime import date
from pathlib import Path

HELPER = Path(__file__).with_name("gh-project.sh")

# MVP 6項目。progress は 0.0-1.0。issues は根拠となる Issue 番号。
# 変更するときは根拠(note)も必ず併せて直すこと。
MVP_ITEMS = [
    {"name": "1. コード選択→ショートカット→AI質問", "progress": 0.95,
     "issues": [6, 7, 8, 9, 11, 13, 14, 22],
     "note": "VS Code / Desktop の2クライアントで動作"},
    {"name": "2. エラー→AI解説", "progress": 0.0,
     "issues": [15, 46],
     "note": "src/diagnostics/ が存在しない"},
    {"name": "3. Hint Mode 段階表示", "progress": 0.2,
     "issues": [12, 78],
     "note": "mode==='hint' の単発分岐のみ。段階状態が無い"},
    {"name": "4. 質問からConcept抽出", "progress": 0.3,
     "issues": [75],
     "note": "抽出コードはあるが Concept が Go 20件のみ。TS/JS で空配列"},
    {"name": "5. 基本Personal Learning Map", "progress": 0.8,
     "issues": [42, 53, 23],
     "note": "導出/D1保存/同期に加え、apps/web の閲覧UI(570行)と GET /v1/learning-activity が実装済み"},
    {"name": "6. 回答スタイル設定", "progress": 0.0,
     "issues": [44],
     "note": "tone/teachingStyle の実装なし。#44 は idea.md の仕様と別物"},
]

DEADLINES = [("MVP", date(2026, 9, 13)), ("全体完成", date(2026, 9, 26))]


def status_of(item):
    """Status を文字列で返す。未設定なら None。

    GraphQL は {"name": "Todo"} を返す。生の dict を比較すると
    常に False になり、達成件数が黙って 0 になる。"""
    return (item.get("status") or {}).get("name")


def load_items():
    out = subprocess.run([str(HELPER), "dump"], capture_output=True, text=True, check=True)
    return json.loads(out.stdout)


def main():
    items = load_items()
    today = date.today()

    by_num = {}
    for i in items:
        c = i.get("content") or {}
        if c.get("number"):
            by_num[c["number"]] = i

    print("# Gakushu Sochi 進捗レポート")
    print(f"\n基準日: {today}\n")

    # --- MVP 達成率 ---
    total = sum(m["progress"] for m in MVP_ITEMS) / len(MVP_ITEMS)
    print(f"## MVP 達成率: {total*100:.0f}%\n")
    print("| 項目 | 進捗 | 根拠 |")
    print("|---|---|---|")
    for m in MVP_ITEMS:
        done = [n for n in m["issues"] if status_of(by_num.get(n, {})) == "Done"]
        bar = "#" * round(m["progress"] * 10) + "." * (10 - round(m["progress"] * 10))
        print(f"| {m['name']} | `{bar}` {m['progress']*100:.0f}% | {m['note']}"
              f"（Done {len(done)}/{len(m['issues'])}） |")

    # --- 期限に対する状況 ---
    print("\n## 期限")
    for label, d in DEADLINES:
        days = (d - today).days
        tgt = [i for i in items
               if (i.get("target") or {}).get("date") == d.isoformat()]
        open_ = [i for i in tgt if status_of(i) != "Done"]
        state = f"残り{days}日" if days >= 0 else f"**{-days}日超過**"
        print(f"\n### {label} ({d}) — {state}")
        print(f"未完了 {len(open_)} / {len(tgt)} 件")
        for i in sorted(open_, key=lambda x: x["content"]["number"]):
            c = i["content"]
            st = status_of(i) or "-"
            print(f"  - [ ] #{c['number']} {c['title'][:48]} ({st})")

    # --- 期限なし ---
    orphan = [i for i in items
              if not (i.get("target") or {}).get("date")
              and status_of(i) != "Done"]
    if orphan:
        print(f"\n## 期限未設定 ({len(orphan)}件)")
        for i in sorted(orphan, key=lambda x: x["content"]["number"]):
            c = i["content"]
            print(f"  - #{c['number']} {c['title'][:48]}")


if __name__ == "__main__":
    sys.exit(main())
