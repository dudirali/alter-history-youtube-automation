import "dotenv/config";

const key = process.env.HEYGEN_API_KEY!;
const JAMES_VOICE_ID = "8a8fb6db01a44463a087e68f54d0870b-f4ffc86b-6040-428f-b71f-d1244273c488";

// Try /v3/voices/speech with various engine specifiers
const enginesToTry = [
  undefined,
  "azure",
  "elevenlabs",
  "11labs",
  "openai",
  "polly",
  "default",
  "legacy",
  "heygen",
];

for (const engine of enginesToTry) {
  const body: any = {
    text: "Hi there.",
    voice_id: JAMES_VOICE_ID,
    input_type: "text",
  };
  if (engine) body.engine = engine;

  const res = await fetch("https://api.heygen.com/v3/voices/speech", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(body),
  });
  const txt = await res.text();
  console.log(`engine=${engine ?? "(none)"}  → status=${res.status}`);
  console.log(`  ${txt.slice(0, 300)}\n`);
}

// Also test GET on the 405 endpoints to see what they actually are
console.log("\n=== GET probes on 405 endpoints ===");
for (const url of [
  "https://api.heygen.com/v2/voices/audio",
  "https://api.heygen.com/v2/voices/speech",
]) {
  const r = await fetch(url, { headers: { "x-api-key": key } });
  const t = await r.text();
  console.log(`GET ${url}  → ${r.status}`);
  console.log(`  ${t.slice(0, 300)}\n`);
}
