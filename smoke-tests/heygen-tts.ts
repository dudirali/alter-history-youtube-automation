import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

// HeyGen TTS smoke test:
// 1) List voices with starfish engine support (required for /v3/voices/speech)
// 2) Pick an English male voice
// 3) Generate ~5 seconds of audio with word_timestamps
// 4) Save MP3 + word_timestamps JSON to disk for inspection
// Expected cost: a few cents.

interface HeyGenVoice {
  voice_id: string;
  language: string;
  gender: string;
  name: string;
  support_pause?: boolean;
  emotion_support?: boolean;
}

interface VoicesListResponse {
  error: string | null;
  data?: { voices: HeyGenVoice[] };
}

interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

interface GenerateSpeechResponse {
  data?: {
    audio_url: string;
    duration: number;
    request_id?: string | null;
    word_timestamps?: WordTimestamp[] | null;
  };
  error?: string | null;
  message?: string;
}

const TEST_TEXT =
  "On April 14th, 1912, one tiny decision changed the course of history forever.";

async function run() {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error("HEYGEN_API_KEY missing in .env");

  // --- Step 1: find a starfish-compatible English male voice
  console.log("→ Listing starfish-compatible voices...");
  const voicesRes = await fetch(
    "https://api.heygen.com/v2/voices",
    { headers: { "x-api-key": key, accept: "application/json" } }
  );
  if (!voicesRes.ok) {
    throw new Error(`Failed to list voices: HTTP ${voicesRes.status}`);
  }
  const voicesJson = (await voicesRes.json()) as VoicesListResponse;
  const allVoices = voicesJson.data?.voices ?? [];

  // We'll try starfish-filter via query param; fallback to all if endpoint
  // doesn't support filter
  let starfishVoices: HeyGenVoice[] = allVoices;
  const starfishRes = await fetch(
    "https://api.heygen.com/v2/voices?engine=starfish",
    { headers: { "x-api-key": key, accept: "application/json" } }
  );
  if (starfishRes.ok) {
    const j = (await starfishRes.json()) as VoicesListResponse;
    if (j.data?.voices?.length) starfishVoices = j.data.voices;
  }

  // Pick the first English male voice we find
  const candidate = starfishVoices.find(
    (v) =>
      v.language?.toLowerCase().includes("english") &&
      v.gender?.toLowerCase() === "male"
  );
  if (!candidate) throw new Error("No English male voice found");
  console.log(
    `  Selected: "${candidate.name}" (${candidate.voice_id})`
  );

  // --- Step 2: generate speech
  console.log(`→ Generating speech for: "${TEST_TEXT}"`);
  const t0 = Date.now();
  const ttsRes = await fetch("https://api.heygen.com/v3/voices/speech", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      text: TEST_TEXT,
      voice_id: candidate.voice_id,
      input_type: "text",
      speed: 1.0,
    }),
  });

  const ttsBody = await ttsRes.text();
  if (!ttsRes.ok) {
    throw new Error(`TTS failed: HTTP ${ttsRes.status} — ${ttsBody.slice(0, 300)}`);
  }
  const tts = JSON.parse(ttsBody) as GenerateSpeechResponse;
  const data = tts.data;
  if (!data?.audio_url) {
    throw new Error(`No audio_url in response: ${ttsBody.slice(0, 300)}`);
  }
  console.log(`  ✅ Generated in ${Date.now() - t0}ms`);
  console.log(`     audio_url: ${data.audio_url}`);
  console.log(`     duration:  ${data.duration}s`);
  console.log(
    `     word_timestamps: ${
      data.word_timestamps?.length ?? 0
    } words returned`
  );

  // --- Step 3: download MP3 and persist results
  const outDir = join(process.cwd(), "output", "smoke-tts");
  await mkdir(outDir, { recursive: true });

  console.log("→ Downloading MP3...");
  const audioRes = await fetch(data.audio_url);
  const audioBuf = Buffer.from(await audioRes.arrayBuffer());
  await writeFile(join(outDir, "test.mp3"), audioBuf);

  await writeFile(
    join(outDir, "word_timestamps.json"),
    JSON.stringify(
      {
        text: TEST_TEXT,
        voice_id: candidate.voice_id,
        voice_name: candidate.name,
        duration: data.duration,
        word_timestamps: data.word_timestamps ?? [],
      },
      null,
      2
    )
  );

  console.log(`\n✅ Saved to ${outDir}/`);
  console.log(`   • test.mp3 (${(audioBuf.length / 1024).toFixed(1)} KB)`);
  console.log(`   • word_timestamps.json`);

  // Show first 8 word timings as sanity check
  if (data.word_timestamps?.length) {
    console.log("\n   First word timings:");
    for (const w of data.word_timestamps.slice(0, 8)) {
      console.log(
        `     ${w.start.toFixed(2).padStart(5)}s → ${w.end
          .toFixed(2)
          .padStart(5)}s   "${w.word}"`
      );
    }
  } else {
    console.log("\n   ⚠️  word_timestamps was empty/missing — fallback to whisper needed");
  }
}

run().catch((e) => {
  console.error("❌", e?.message ?? e);
  process.exit(1);
});
