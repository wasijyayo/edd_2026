#!/usr/bin/env bash
#
# Gakushu Sochi の GitHub Projects 操作をまとめたヘルパー。
#
# Projects v2 は gh CLI のサブコマンドだけでは足りず、フィールド更新に
# GraphQL を直接叩く必要がある。ID をスキル本文へ散らすと、Project を
# 作り直したときに全箇所を直すことになるため、ここへ集約する。
set -euo pipefail

# --- 定数 -------------------------------------------------------------------
# Project 8「Gakushu Sochi」。所有者はリポジトリ(wasijyayo)と異なり KOU050223。
# 所有者が違うためリポジトリへのリンクと Auto-add workflow は GitHub の仕様上使えない。
# item 追加は所有者が違っても通るので、このスクリプトで補う。
readonly PROJECT_NUMBER=8
readonly PROJECT_OWNER="KOU050223"
readonly PROJECT_ID="PVT_kwHOBS4GPM4Bi6f_"
readonly REPO="wasijyayo/edd_2026"

readonly FIELD_STATUS="PVTSSF_lAHOBS4GPM4Bi6f_zhhwzj8"
readonly FIELD_ITERATION="PVTIF_lAHOBS4GPM4Bi6f_zhhw0DM"
readonly FIELD_START="PVTF_lAHOBS4GPM4Bi6f_zhhw0DU"
readonly FIELD_TARGET="PVTF_lAHOBS4GPM4Bi6f_zhhw0DY"

readonly STATUS_TODO="f75ad846"
readonly STATUS_DOING="47fc9ee4"
readonly STATUS_DONE="98236657"

readonly ITERATION_MVP="381c7c80"      # 既定名 Iteration 1 / MVP 期限 9-13
readonly ITERATION_ALL="54cf5c95"      # 既定名 Iteration 2 / 全体完成 期限 9-26

# --- 事前チェック -----------------------------------------------------------
# project スコープが無いと全ての操作が失敗する。原因が分かりにくいので先に落とす。
require_scope() {
  if ! gh auth status 2>&1 | grep -q "'.*project.*'"; then
    echo "ERROR: gh の token に project スコープがありません。" >&2
    echo "  対話端末で次を実行してください: gh auth refresh -s project" >&2
    exit 1
  fi
}

# --- 参照 -------------------------------------------------------------------
# Issue 番号から Project item ID を引く。存在しなければ空を返す(呼び出し側で判定)。
item_id_for_issue() {
  local num="$1"
  gh project item-list "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" \
    --format json --limit 200 2>/dev/null \
  | python3 -c "
import json,sys
want=int('$num')
for i in json.load(sys.stdin).get('items',[]):
    c=i.get('content') or {}
    if c.get('number')==want:
        print(i['id']); break
"
}

# --- 更新 -------------------------------------------------------------------
# 単一選択フィールド(Status)を更新する。
set_single_select() {
  local item_id="$1" field_id="$2" option_id="$3"
  gh api graphql -f query='
    mutation($p:ID!,$i:ID!,$f:ID!,$v:String!){
      updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,
        value:{singleSelectOptionId:$v}}){ projectV2Item{ id } } }' \
    -f p="$PROJECT_ID" -f i="$item_id" -f f="$field_id" -f v="$option_id" >/dev/null
}

set_iteration() {
  local item_id="$1" iteration_id="$2"
  gh api graphql -f query='
    mutation($p:ID!,$i:ID!,$f:ID!,$v:String!){
      updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,
        value:{iterationId:$v}}){ projectV2Item{ id } } }' \
    -f p="$PROJECT_ID" -f i="$item_id" -f f="$FIELD_ITERATION" -f v="$iteration_id" >/dev/null
}

# 日付フィールドの更新。変数型は String ではなく Date でなければ
# エラーを返さずに黙って無視される。ここを間違えると「成功したのに空のまま」になる。
set_date() {
  local item_id="$1" field_id="$2" date="$3"
  gh api graphql -f query='
    mutation($p:ID!,$i:ID!,$f:ID!,$v:Date!){
      updateProjectV2ItemFieldValue(input:{projectId:$p,itemId:$i,fieldId:$f,
        value:{date:$v}}){ projectV2Item{ id } } }' \
    -f p="$PROJECT_ID" -f i="$item_id" -f f="$field_id" -f v="$date" >/dev/null
}

# Issue を Project へ追加し、item ID を返す。追加済みなら既存の ID を返す。
add_issue() {
  local num="$1"
  local existing
  existing="$(item_id_for_issue "$num")"
  if [ -n "$existing" ]; then echo "$existing"; return 0; fi
  gh project item-add "$PROJECT_NUMBER" --owner "$PROJECT_OWNER" \
    --url "https://github.com/$REPO/issues/$num" --format json 2>/dev/null \
  | python3 -c "import json,sys; print(json.load(sys.stdin)['id'])"
}

# --- 一覧 -------------------------------------------------------------------
# Project の全 item をフィールド付きで JSON 配列として出力する。
# 集計はこれを python 側で加工する前提。
dump_items() {
  gh api graphql -f query='
    query($id:ID!){ node(id:$id){ ... on ProjectV2 { items(first:100){ nodes{
      id
      content{ ... on Issue { number title state url
        labels(first:10){ nodes{ name } } } }
      status:    fieldValueByName(name:"Status"){ ... on ProjectV2ItemFieldSingleSelectValue{ name } }
      iteration: fieldValueByName(name:"Iteration"){ ... on ProjectV2ItemFieldIterationValue{ title startDate duration } }
      start:     fieldValueByName(name:"Start date"){ ... on ProjectV2ItemFieldDateValue{ date } }
      target:    fieldValueByName(name:"Target date"){ ... on ProjectV2ItemFieldDateValue{ date } }
    } } } } }' -f id="$PROJECT_ID" --jq '.data.node.items.nodes'
}

case "${1:-}" in
  require-scope)  require_scope ;;
  item-id)        item_id_for_issue "$2" ;;
  add)            add_issue "$2" ;;
  status)         # status <item_id> <todo|doing|done>
                  case "$3" in
                    todo)  o=$STATUS_TODO ;; doing) o=$STATUS_DOING ;;
                    done)  o=$STATUS_DONE ;; *) echo "unknown status: $3" >&2; exit 1 ;;
                  esac
                  set_single_select "$2" "$FIELD_STATUS" "$o" ;;
  iteration)      # iteration <item_id> <mvp|all>
                  case "$3" in
                    mvp) i=$ITERATION_MVP ;; all) i=$ITERATION_ALL ;;
                    *) echo "unknown iteration: $3" >&2; exit 1 ;;
                  esac
                  set_iteration "$2" "$i" ;;
  start)          set_date "$2" "$FIELD_START"  "$3" ;;
  target)         set_date "$2" "$FIELD_TARGET" "$3" ;;
  dump)           dump_items ;;
  *) echo "usage: gh-project.sh {require-scope|item-id|add|status|iteration|start|target|dump} [args]" >&2; exit 1 ;;
esac
