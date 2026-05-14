import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";

export async function testAnthropic(): Promise<{ ok: boolean; detail: string }> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) return { ok: false, detail: "ANTHROPIC_API_KEY missing in .env" };

  const client = new Anthropic({ apiKey: key });

  const res = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 20,
    messages: [{ role: "user", content: "Reply with exactly: PONG" }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim();

  const ok = text.toUpperCase().includes("PONG");
  return {
    ok,
    detail: ok
      ? `Anthropic OK — model: ${res.model}, in/out tokens: ${res.usage.input_tokens}/${res.usage.output_tokens}`
      : `Unexpected reply: "${text}"`,
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  testAnthropic()
    .then((r) => {
      console.log(r.ok ? "✅" : "❌", r.detail);
      process.exit(r.ok ? 0 : 1);
    })
    .catch((e) => {
      console.error("❌ Anthropic error:", e?.message ?? e);
      process.exit(1);
    });
}
