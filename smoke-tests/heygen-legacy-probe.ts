import "dotenv/config";

const key = process.env.HEYGEN_API_KEY!;
const JAMES_VOICE_ID = "8a8fb6db01a44463a087e68f54d0870b-f4ffc86b-6040-428f-b71f-d1244273c488";

// Probe candidate legacy TTS endpoints with the James voice + tiny text.
// We send a small valid body. Outcomes:
//   404 → endpoint doesn't exist
//   401/403 → auth issue
//   200/202 → success (audio generated)
//   400/422 → endpoint exists, our body shape is wrong → iterate

const candidates: { url: string; body: any }[] = [
  // v2 audio variants
  { url: "https://api.heygen.com/v2/audio.generate", body: { text: "Hi.", voice_id: JAMES_VOICE_ID } },
  { url: "https://api.heygen.com/v2/audio/generate", body: { text: "Hi.", voice_id: JAMES_VOICE_ID } },
  { url: "https://api.heygen.com/v2/voices/audio", body: { text: "Hi.", voice_id: JAMES_VOICE_ID } },
  { url: "https://api.heygen.com/v2/voices/speech", body: { text: "Hi.", voice_id: JAMES_VOICE_ID } },
  { url: "https://api.heygen.com/v2/text_to_speech", body: { text: "Hi.", voice_id: JAMES_VOICE_ID } },
  // v1 audio variants
  { url: "https://api.heygen.com/v1/voice.generate_audio", body: { text: "Hi.", voice_id: JAMES_VOICE_ID } },
  { url: "https://api.heygen.com/v1/audio.generate", body: { text: "Hi.", voice_id: JAMES_VOICE_ID } },
  { url: "https://api.heygen.com/v1/voice/generate_audio", body: { text: "Hi.", voice_id: JAMES_VOICE_ID } },
  { url: "https://api.heygen.com/v1/voice/audio", body: { text: "Hi.", voice_id: JAMES_VOICE_ID } },
  { url: "https://api.heygen.com/v1/voice/preview", body: { text: "Hi.", voice_id: JAMES_VOICE_ID } },
  { url: "https://api.heygen.com/v1/text_to_speech", body: { text: "Hi.", voice_id: JAMES_VOICE_ID } },
  // alternate input shapes
  { url: "https://api.heygen.com/v2/audio.generate", body: { input: "Hi.", voice_id: JAMES_VOICE_ID } },
  { url: "https://api.heygen.com/v1/voice.generate_audio", body: { input_text: "Hi.", voice_id: JAMES_VOICE_ID } },
];

for (const c of candidates) {
  const res = await fetch(c.url, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify(c.body),
  });
  const txt = await res.text();
  const interesting = res.status !== 404;
  const marker = interesting ? "👀" : "  ";
  console.log(`${marker} ${res.status}  ${c.url}`);
  if (interesting) {
    console.log(`     body: ${txt.slice(0, 300)}`);
  }
}
