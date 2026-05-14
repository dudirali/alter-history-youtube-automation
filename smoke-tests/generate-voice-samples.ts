import "dotenv/config";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

interface V3Voice {
  voice_id: string;
  name: string;
  gender: string;
  language: string;
  preview_audio_url?: string;
}

interface TTSResponse {
  data?: {
    audio_url: string;
    duration: number;
    word_timestamps?: { word: string; start: number; end: number }[] | null;
  };
  error?: any;
}

const TEST_TEXT =
  "On April 14th, 1912, one tiny decision changed the course of history forever. " +
  "What if the Titanic never sank? Let me show you the world that almost was.";

const key = process.env.HEYGEN_API_KEY!;
const voicesPath = join(
  process.cwd(),
  "output",
  "voice-picker",
  "english-male-starfish-full.json"
);
const voices: V3Voice[] = JSON.parse(await readFile(voicesPath, "utf8"));

const outDir = join(process.cwd(), "output", "voice-picker-samples");
await mkdir(outDir, { recursive: true });

console.log(`Generating ${voices.length} samples with text:\n  "${TEST_TEXT}"\n`);

const summary: {
  name: string;
  voice_id: string;
  file: string;
  duration: number;
  ok: boolean;
  error?: string;
}[] = [];

for (const v of voices) {
  const safeName = v.name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-");
  process.stdout.write(`→ ${v.name.trim().padEnd(22)} `);

  try {
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
        voice_id: v.voice_id,
        input_type: "text",
        speed: 1.0,
        locale: "en-US",
      }),
    });
    const body = await res.text();
    if (!res.ok) {
      console.log(`❌ HTTP ${res.status} — ${body.slice(0, 100)}`);
      summary.push({ name: v.name, voice_id: v.voice_id, file: "", duration: 0, ok: false, error: `HTTP ${res.status}` });
      continue;
    }
    const tts = JSON.parse(body) as TTSResponse;
    const data = tts.data;
    if (!data?.audio_url) {
      console.log(`❌ no audio_url`);
      summary.push({ name: v.name, voice_id: v.voice_id, file: "", duration: 0, ok: false, error: "no audio_url" });
      continue;
    }

    const audioRes = await fetch(data.audio_url);
    const ext = data.audio_url.includes(".wav") ? "wav" : "mp3";
    const buf = Buffer.from(await audioRes.arrayBuffer());
    const fname = `${safeName}.${ext}`;
    await writeFile(join(outDir, fname), buf);

    console.log(
      `✅ ${data.duration.toFixed(1)}s, ${(buf.length / 1024).toFixed(0)}KB, ${Date.now() - t0}ms → ${fname}`
    );
    summary.push({
      name: v.name,
      voice_id: v.voice_id,
      file: fname,
      duration: data.duration,
      ok: true,
    });
  } catch (e: any) {
    console.log(`❌ threw: ${e.message}`);
    summary.push({ name: v.name, voice_id: v.voice_id, file: "", duration: 0, ok: false, error: e.message });
  }
}

await writeFile(join(outDir, "_summary.json"), JSON.stringify(summary, null, 2));

console.log(`\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
console.log(`Done. ${summary.filter((s) => s.ok).length}/${summary.length} samples generated.`);
console.log(`Listen to them in: ${outDir}`);
console.log(`Then tell me the WINNER's voice_id.`);
console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);
