import { Hono } from "hono";
import { vValidator } from "@hono/valibot-validator";
import * as v from "valibot";
import type { AuthVariables } from "../auth/middleware.js";

const requestSchema = v.object({
  selection: v.pipe(v.string(), v.minLength(1), v.maxLength(20_000)),
  question: v.pipe(v.string(), v.maxLength(4_000)),
});

const DEFAULT_EXPLANATION_QUESTION = "この選択テキストを初心者にも分かるように解説してください。";

export interface AiDeps {
  apiKey?: string;
  model?: string;
  fetch: typeof fetch;
}

export type AiDepsResolver = (env: CloudflareBindings) => AiDeps;

export function createAiRoute(resolve: AiDepsResolver) {
  const route = new Hono<{ Bindings: CloudflareBindings; Variables: AuthVariables }>();

  route.post("/ai/responses", vValidator("json", requestSchema), async (c) => {
    const { selection, question } = c.req.valid("json");
    const normalizedQuestion = question.trim() || DEFAULT_EXPLANATION_QUESTION;
    const deps = resolve(c.env);
    if (!deps.apiKey) return c.json({ error: "AI service is not configured" }, 503);

    const model = deps.model || "gemini-2.0-flash";
    const upstream = await deps.fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:streamGenerateContent?alt=sse`,
      {
        method: "POST",
        headers: { "x-goog-api-key": deps.apiKey, "Content-Type": "application/json" },
        body: JSON.stringify({
          contents: [
            { parts: [{ text: `選択テキスト:\n${selection}\n\n質問:\n${normalizedQuestion}` }] },
          ],
        }),
      },
    );

    if (!upstream.ok || !upstream.body) {
      return c.json({ error: "AI upstream request failed" }, 502);
    }

    return new Response(upstream.body, {
      status: 200,
      headers: {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        "X-Accel-Buffering": "no",
      },
    });
  });

  return route;
}
