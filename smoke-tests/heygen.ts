import "dotenv/config";

// HeyGen smoke test:
// 1) Auth check via GET /v2/voices (free, read-only)
// 2) Surface a few candidate "narrator" voices for our channel
// Standalone TTS audio generation will be tested in Phase 1.

interface HeyGenVoice {
  voice_id: string;
  language: string;
  gender: string;
  name: string;
  preview_audio?: string;
  support_pause?: boolean;
  emotion_support?: boolean;
}

interface HeyGenVoicesResponse {
  error: string | null;
  data?: { voices: HeyGenVoice[] };
}

export async function testHeygen(): Promise<{ ok: boolean; detail: string }> {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) return { ok: false, detail: "HEYGEN_API_KEY missing in .env" };

  const res = await fetch("https://api.heygen.com/v2/voices", {
    method: "GET",
    headers: { "x-api-key": key, accept: "application/json" },
  });

  if (!res.ok) {
    const body = await res.text();
    return {
      ok: false,
      detail: `HeyGen HTTP ${res.status}: ${body.slice(0, 200)}`,
    };
  }

  const json = (await res.json()) as HeyGenVoicesResponse;
  const voices = json.data?.voices ?? [];
  if (voices.length === 0) {
    return { ok: false, detail: `No voices returned. error="${json.error}"` };
  }

  const englishMale = voices.filter(
    (v) =>
      v.language?.toLowerCase().includes("english") &&
      v.gender?.toLowerCase() === "male"
  );

  const sample = englishMale.slice(0, 5).map((v) => ({
    name: v.name,
    id: v.voice_id,
    emotion: v.emotion_support ?? false,
  }));

  return {
    ok: true,
    detail:
      `HeyGen OK — ${voices.length} total voices, ${englishMale.length} English male.\n` +
      `   Top candidates for narrator:\n` +
      sample
        .map((s) => `     • ${s.name} (${s.id})${s.emotion ? " [emotion]" : ""}`)
        .join("\n"),
  };
}

if (import.meta.url === `file://${process.argv[1]}`) {
  testHeygen()
    .then((r) => {
      console.log(r.ok ? "✅" : "❌", r.detail);
      process.exit(r.ok ? 0 : 1);
    })
    .catch((e) => {
      console.error("❌ HeyGen error:", e?.message ?? e);
      process.exit(1);
    });
}
