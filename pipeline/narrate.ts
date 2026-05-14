import "dotenv/config";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface WordTimestamp {
  word: string;
  start: number;
  end: number;
}

export interface NarrationResult {
  audioPath: string;
  audioRelativePath: string;
  duration: number;
  words: WordTimestamp[];
  voice: { voice_id: string; name: string };
}

interface VoiceConfig {
  narrator_primary: {
    voice_id: string;
    name: string;
    locale?: string;
    endpoint?: string;
  };
}

interface TTSResponse {
  data?: {
    audio_url: string;
    duration: number;
    word_timestamps?: WordTimestamp[] | null;
  };
  error?: unknown;
}

const VOICE_CONFIG_PATH = join(process.cwd(), "config", "voices.json");

/**
 * Generate narration via HeyGen Starfish TTS.
 * Writes:
 *   <outDir>/narration.wav      — raw audio
 *   <outDir>/words.json         — word-level timestamps
 * Filters out the synthetic <start> marker that HeyGen prepends.
 */
export async function narrate(
  text: string,
  outDir: string,
  options: { speed?: number } = {}
): Promise<NarrationResult> {
  const key = process.env.HEYGEN_API_KEY;
  if (!key) throw new Error("HEYGEN_API_KEY missing in .env");

  const voiceCfg: VoiceConfig = JSON.parse(await readFile(VOICE_CONFIG_PATH, "utf8"));
  const v = voiceCfg.narrator_primary;
  const endpoint = v.endpoint ?? "https://api.heygen.com/v3/voices/speech";

  const speed = options.speed ?? 1.0;
  console.log(`[narrate] voice="${v.name}", chars=${text.length}, speed=${speed}`);

  const res = await fetch(endpoint, {
    method: "POST",
    headers: {
      "x-api-key": key,
      "Content-Type": "application/json",
      accept: "application/json",
    },
    body: JSON.stringify({
      text,
      voice_id: v.voice_id,
      input_type: "text",
      speed,
      locale: v.locale ?? "en-US",
    }),
  });

  const body = await res.text();
  if (!res.ok) throw new Error(`HeyGen TTS failed: HTTP ${res.status} — ${body.slice(0, 500)}`);
  const tts = JSON.parse(body) as TTSResponse;
  const data = tts.data;
  if (!data?.audio_url) throw new Error(`No audio_url in TTS response: ${body.slice(0, 300)}`);

  await mkdir(outDir, { recursive: true });

  // Download audio
  const audioRes = await fetch(data.audio_url);
  const buf = Buffer.from(await audioRes.arrayBuffer());
  const ext = data.audio_url.includes(".wav") ? "wav" : "mp3";
  const audioPath = join(outDir, `narration.${ext}`);
  await writeFile(audioPath, buf);

  // Filter out the synthetic <start> marker HeyGen prepends
  const rawWords = data.word_timestamps ?? [];
  const words = rawWords.filter((w) => !w.word.startsWith("<") && !w.word.endsWith(">"));

  await writeFile(join(outDir, "words.json"), JSON.stringify({ duration: data.duration, words }, null, 2));

  console.log(
    `[narrate] ✅ ${(buf.length / 1024).toFixed(0)}KB, ${data.duration.toFixed(1)}s, ${words.length} words → ${audioPath}`
  );

  return {
    audioPath,
    audioRelativePath: join("output", outDir.split("/output/")[1] ?? "", `narration.${ext}`),
    duration: data.duration,
    words,
    voice: { voice_id: v.voice_id, name: v.name },
  };
}

// CLI usage: tsx pipeline/narrate.ts "<text>" <outDir>
if (import.meta.url === `file://${process.argv[1]}`) {
  const text = process.argv[2];
  const outDir = process.argv[3] ?? join(process.cwd(), "output", "ad-hoc-narration");
  if (!text) {
    console.error("Usage: tsx pipeline/narrate.ts \"<text>\" [outDir]");
    process.exit(1);
  }
  narrate(text, outDir).catch((e) => {
    console.error("❌", e);
    process.exit(1);
  });
}
