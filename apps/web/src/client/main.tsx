import { useEffect, useRef, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ApiError,
  createRequestTracker,
  fillActivityDays,
  requestJson,
  type ActivityDay,
} from "./api.js";
import { summarizeConcepts, type Concept } from "./profile.js";
import "./style.css";

type Profile = { derivedAt: string; eventCount: number; concepts: Concept[] };
type Activity = { from: string; to: string; days: ActivityDay[] };

// ログイン・ログアウトは単発リクエスト。応答が返らないまま待ち続けると
// 画面が固まるので、締め切りを設ける（docs/rules/rules.md RULE-001）。
const AUTH_REQUEST_TIMEOUT_MS = 10_000;

const errorText: Record<ApiError["kind"], string> = {
  session_expired: "ログインの有効期限が切れました",
  api_token_invalid: "サーバー側の API トークンが無効です。再ログインでは直りません。",
  rate_limited: "短時間に要求が多すぎます。しばらく待って再読み込みしてください。",
  unavailable: "学習データの取得に失敗しました",
};

function takeLoginRetry(): boolean {
  if (sessionStorage.getItem("web-login-retry") !== "1") return false;
  sessionStorage.removeItem("web-login-retry");
  return true;
}

function ErrorPanel({ error, retry }: { error: ApiError; retry: () => void }) {
  useEffect(() => {
    if (error.kind === "session_expired")
      window.setTimeout(() => {
        window.location.href = "/login";
      }, 500);
  }, [error]);
  return (
    <section className="message error">
      <p>{errorText[error.kind]}</p>
      {error.kind !== "session_expired" && <button onClick={retry}>再試行</button>}
    </section>
  );
}

function Header() {
  return (
    <header>
      <a href="/" className="brand">
        学習装置 <small>Learning Map</small>
      </a>
      <nav>
        <a href="/">マップ</a>
        <a href="/activity">推移</a>
        <button
          onClick={() =>
            fetch("/logout", {
              method: "POST",
              signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
            }).finally(() => {
              window.location.href = "/login";
            })
          }
        >
          ログアウト
        </button>
      </nav>
    </header>
  );
}

function Login() {
  const [passphrase, setPassphrase] = useState("");
  const [error, setError] = useState<string>();
  const [pending, setPending] = useState(false);
  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setPending(true);
    setError(undefined);
    try {
      const response = await fetch("/login", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ passphrase }),
        signal: AbortSignal.timeout(AUTH_REQUEST_TIMEOUT_MS),
      });
      if (!response.ok) {
        setError(
          response.status === 429
            ? "ログインの試行が多すぎます。1分ほど待ってからやり直してください。"
            : "パスフレーズを確認してください。",
        );
        return;
      }
      sessionStorage.setItem("web-login-retry", "1");
      window.location.href = "/";
    } catch {
      setError("ログインに失敗しました。通信状態を確認してください。");
    } finally {
      setPending(false);
    }
  }
  return (
    <main className="login">
      <section className="card">
        <h1>学習装置</h1>
        <p>現在は開発用の単一ユーザーモードです。</p>
        <form onSubmit={submit}>
          <label>
            パスフレーズ
            <input
              type="password"
              value={passphrase}
              onChange={(event) => setPassphrase(event.target.value)}
              autoFocus
              required
            />
          </label>
          {error && <p className="error-text">{error}</p>}
          <button disabled={pending}>{pending ? "確認中…" : "ログイン"}</button>
        </form>
      </section>
    </main>
  );
}

function LearningMap() {
  const [profile, setProfile] = useState<Profile>();
  const [error, setError] = useState<ApiError>();
  const requestTracker = useRef(createRequestTracker());
  const load = () => {
    const isLatest = requestTracker.current.start();
    setError(undefined);
    requestJson<Profile>("/api/v1/learning-profile", fetch, takeLoginRetry())
      .then((value) => {
        if (isLatest()) setProfile(value);
      })
      .catch((value: unknown) => {
        if (isLatest()) setError(value as ApiError);
      });
  };
  useEffect(load, []);
  if (error) return <ErrorPanel error={error} retry={load} />;
  if (!profile) return <p className="message">読み込み中…</p>;
  const summary = summarizeConcepts(profile.concepts);
  if (profile.eventCount === 0)
    return (
      <>
        <section className="message">まだ学習イベントがありません</section>
      </>
    );
  return (
    <>
      <section className="summary">
        <div>
          <strong>{summary.confirmed}</strong>確認済み
        </div>
        <div>
          <strong>{summary.learning}</strong>学習中
        </div>
        <div>
          <strong>{summary.unobserved}</strong>未観測
        </div>
        <button onClick={load}>再読み込み</button>
      </section>
      <section className="concepts">
        {profile.concepts.map((item) => (
          <article className="concept" key={item.conceptId}>
            <div>
              <h2>{item.label ?? item.conceptId}</h2>
              <span className={`status ${item.status}`}>
                {item.status === "confirmed"
                  ? "確認済み"
                  : item.status === "learning"
                    ? "学習中"
                    : "未観測"}
              </span>
            </div>
            <div className="meter">
              <i style={{ width: `${Math.round(item.score * 100)}%` }} />
            </div>
            <b>{Math.round(item.score * 100)}%</b>
            <p>
              自力解決 {item.evidence.solvedIndependentlyCount} 回・ヒント利用{" "}
              {item.evidence.hintUsedCount} 回
            </p>
          </article>
        ))}
      </section>
      <footer>
        {profile.eventCount} 件のイベントから導出 ·{" "}
        {new Date(profile.derivedAt).toLocaleString("ja-JP")}
      </footer>
    </>
  );
}

function Chart({ days }: { days: ActivityDay[] }) {
  const kinds = ["solved_independently", "hint_used", "error_recurred"];
  const max = Math.max(
    1,
    ...days.map((day) => Object.values(day.counts).reduce((sum, count) => sum + count, 0)),
  );
  return (
    <div className="chart">
      {days.map((day) => (
        <div
          className="bar"
          title={`${day.date}: ${Object.values(day.counts).reduce((a, b) => a + b, 0)} 件`}
          key={day.date}
        >
          {kinds.map((kind) => (
            <i
              key={kind}
              className={kind}
              style={{ height: `${((day.counts[kind] ?? 0) / max) * 100}%` }}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

function Activity() {
  const [period, setPeriod] = useState(30);
  const [activity, setActivity] = useState<Activity>();
  const [error, setError] = useState<ApiError>();
  const requestTracker = useRef(createRequestTracker());
  const load = () => {
    const isLatest = requestTracker.current.start();
    setError(undefined);
    requestJson<Activity>(`/api/v1/learning-activity?days=${period}`, fetch, takeLoginRetry())
      .then((value) => {
        if (isLatest()) setActivity(value);
      })
      .catch((value: unknown) => {
        if (isLatest()) setError(value as ApiError);
      });
  };
  useEffect(load, [period]);
  if (error) return <ErrorPanel error={error} retry={load} />;
  if (!activity) return <p className="message">読み込み中…</p>;
  const days = fillActivityDays(activity);
  return (
    <>
      <section className="periods">
        {[7, 30, 90].map((value) => (
          <button
            className={period === value ? "selected" : ""}
            onClick={() => setPeriod(value)}
            key={value}
          >
            {value} 日
          </button>
        ))}
        <button onClick={load}>再読み込み</button>
      </section>
      {activity.days.length === 0 ? (
        <section className="message">まだ学習イベントがありません</section>
      ) : (
        <>
          <Chart days={days} />
          <p className="legend">
            <i className="solved_independently" />
            自力解決 <i className="hint_used" />
            ヒント利用 <i className="error_recurred" />
            エラー再発
          </p>
        </>
      )}
    </>
  );
}

function App() {
  const path = window.location.pathname;
  if (path === "/login") return <Login />;
  return (
    <>
      <Header />
      <main>{path === "/activity" ? <Activity /> : <LearningMap />}</main>
    </>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
