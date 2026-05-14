import "dotenv/config";
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";

// HeyGen TTS test with the OFFICIAL narrator voice from config/voices.json
// Generates a sample short narration + word timestamps, saves to disk.

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
  "On April 14th, 1912, one tiny decision changed the course of history forever. " +
  "What if the Titanic never sank? Let me show you the world that almost was.";

async function run() {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error("HEYGEN_API_KEY missing in .env");

  // Load narrator config
  const cfgPath = join(process.cwd(), "config", "voices.json");
  const cfg = JSON.parse(await readFile(cfgPath, "utf8"));
  const narrator = cfg.narrator_primary;
  console.log(`→ Using narrator: ${narrator.description}`);
  console.log(`  voice_id: ${narrator.voice_id}`);
  console.log(`→ Text (${TEST_TEXT.length} chars): "${TEST_TEXT.slice(0, 80)}..."`);

  const t0 = Date.now();
  const res = await fetch("https://api.heygen.com/v3/voices/speech", {
    method: "POST",
    headers: {
      "x-api-key": key,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      text: TEST_TEXT,
      voice_id: narrator.voice_id,
      input_type: "text",
      speed: 1.0,
      locale: narrator.locale ?? "en-US",
    }),
  });

  const body = await res.text();
  if (!res.ok) {
    throw new Error(`TTS failed: HTTP ${res.status} — ${body.slice(0, 500)}`);
  }
  const tts = JSON.parse(body) as GenerateSpeechResponse;
  const data = tts.data;
  if (!data?.audio_url) {
    throw new Error(`No audio_url in response: ${body.slice(0, 300)}`);
  }
  console.log(`  ✅ Generated in ${Date.now() - t0}ms`);
  console.log(`     duration:  ${data.duration.toFixed(2)}s`);
  console.log(`     timestamps: ${data.word_timestamps?.length ?? 0} words`);

  // Save artifacts
  const outDir = join(process.cwd(), "output", "smoke-tts-narrator");
  await mkdir(outDir, { recursive: true });

  console.log(`→ Downloading audio...`);
  const audioRes = await fetch(data.audio_url);
  const ext = data.audio_url.includes(".wav") ? "wav" : "mp3";
  const audioBuf = Buffer.from(await audioRes.arrayBuffer());
  const audioPath = join(outDir, `narrator-sample.${ext}`);
  await writeFile(audioPath, audioBuf);

  await writeFile(
    join(outDir, "word_timestamps.json"),
    JSON.stringify(
      {
        text: TEST_TEXT,
        voice_id: narrator.voice_id,
        duration: data.duration,
        word_timestamps: data.word_timestamps ?? [],
      },
      null,
      2
    )
  );

  console.log(`\n✅ Saved:`);
  console.log(`   • ${audioPath} (${(audioBuf.length / 1024).toFixed(0)} KB)`);
  console.log(`   • ${join(outDir, "word_timestamps.json")}`);

  if (data.word_timestamps?.length) {
    console.log(`\n   First word timings:`);
    for (const w of data.word_timestamps.slice(0, 10)) {
      console.log(
        `     ${w.start.toFixed(2).padStart(5)}s → ${w.end
          .toFixed(2)
          .padStart(5)}s   "${w.word}"`
      );
    }
  }
}

run().catch((e) => {
  console.error("❌", e?.message ?? e);
  process.exit(1);
});
