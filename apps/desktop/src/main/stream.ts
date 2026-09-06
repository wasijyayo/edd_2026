interface OpenAIEvent {
  choices?: Array<{ delta?: { content?: string } }>;
  candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
}

export function parseOpenAIStream(body: string, onDelta: (text: string) => void): void {
  for (const line of body.split(/\r?\n/)) {
    if (!line.startsWith("data: ")) continue;
    const data = line.slice(6);
    if (data === "[DONE]") return;
    let event: OpenAIEvent;
    try {
      event = JSON.parse(data) as OpenAIEvent;
    } catch (error) {
      throw new Error("AI サービスから不正な応答を受信しました", { cause: error });
    }
    const content =
      event.choices?.[0]?.delta?.content ??
      event.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("");
    if (typeof content === "string") onDelta(content);
  }
}
