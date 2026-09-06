-- 学習イベントの正本と、それを書き込む主体（ユーザー・端末）を定義する。
--
-- 習熟度（ConceptMastery）のテーブルはここに作らない。docs/concepts.md の
-- 「サーバー側の導出」の通り、サーバーは習熟度をイベントログから導出し、
-- 累積した保存値を持たない。将来スナップショットを置く場合もキャッシュ扱いとし、
-- このイベントログが正本であることは変えない。

CREATE TABLE users (
  id TEXT PRIMARY KEY,
  created_at_ms INTEGER NOT NULL
);

-- 端末。ユーザーと端末の結びつけは Identity の責務であり、
-- 独立した学習ドメイン API にはしない（docs/architecture.md）。
CREATE TABLE devices (
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  -- 同期リクエストのエンベロープが運ぶ clientId。端末の自己申告であり、
  -- 認証済みの user_id とは別物として扱う。
  client_id TEXT NOT NULL,
  created_at_ms INTEGER NOT NULL,
  last_seen_at_ms INTEGER NOT NULL,

  -- 代理キーを持たず、複合主キーにする。
  --
  -- `user_id || ':' || client_id` のような連結した代理キーは一意なエンコードでは
  -- なく、(user_id="a:b", client_id="c") と (user_id="a", client_id="b:c") が
  -- 同じ値になる。後から同期した端末が主キー制約で弾かれる。
  -- ランダムな代理キーも使わない。ON CONFLICT で既存行へ収束させる upsert が
  -- 書けなくなり、SELECT してから分岐する必要が出る。
  PRIMARY KEY (user_id, client_id)
);

-- 学習イベント。追記のみで、あとから書き換えない。
CREATE TABLE learning_events (
  -- クライアントが生成したイベント ID。
  id TEXT NOT NULL,
  user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- 発生時刻を ISO 8601 文字列と epoch ミリ秒の両方で持つ。
  --
  -- 文字列だけでは並べ替えられない。occurredAt はタイムゾーンオフセットや
  -- 小数秒の桁数がクライアントごとに異なりうるため、辞書順が実時刻順と一致しない
  -- （"2026-09-05T09:00:00+09:00" は "2026-09-05T00:00:00Z" と同時刻だが後ろに並ぶ）。
  -- 数値だけにしないのは、クライアントが送った表現をそのまま残して監査できるようにするため。
  occurred_at TEXT NOT NULL,
  occurred_at_ms INTEGER NOT NULL,

  type TEXT NOT NULL,
  origin TEXT NOT NULL,
  -- ConceptId の配列を JSON 文字列で持つ。1イベントが複数 Concept にまたがるため。
  concept_ids TEXT NOT NULL,

  language TEXT,
  diagnostic_code TEXT,
  session_id TEXT,

  -- どの端末から届いたか。LearningEvent 自体はこのフィールドを持たないが、
  -- 重複の急増を診断するときに送信元を辿れる必要がある。
  client_id TEXT NOT NULL,
  -- サーバーが受理した時刻。occurred_at とは別物で、オフラインキューの
  -- 遅延を測るのに使う。
  received_at_ms INTEGER NOT NULL,

  -- 主キーをユーザー単位にする。
  --
  -- イベント ID はクライアントが生成し、契約上は長さしか制約していない。
  -- グローバルに一意な主キーにすると、あるユーザーの "event-1" が別ユーザーの
  -- "event-1" と衝突し、ON CONFLICT DO NOTHING が他人のイベントを黙って捨てたうえで
  -- 「重複（再送の正常系）」として応答してしまう。冪等性はユーザーの中で成立すれば足りる。
  PRIMARY KEY (user_id, id)
);

-- GET /v1/learning-profile は1ユーザーのログを発生時刻順に読む。
-- 並び順は packages/domain の compareEventOrder（発生時刻の昇順、同時刻は ID 昇順）と
-- 一致させる必要があるため、ID までを索引に含める。
CREATE INDEX idx_learning_events_user_occurred
  ON learning_events (user_id, occurred_at_ms, id);
