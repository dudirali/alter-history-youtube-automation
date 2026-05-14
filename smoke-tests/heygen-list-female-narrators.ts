import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

// List all English Female voices that support the Starfish engine
// (these are the only ones compatible with the new /v3/voices/speech TTS endpoint
//  that returns word-level timestamps).

interface V3Voice {
  voice_id: string;
  name: string;
  gender: string;
  language: string;
  preview_audio_url?: string;
  support_pause?: boolean;
  support_locale?: boolean;
  type?: string;
  emotion_support?: boolean;
  [key: string]: unknown;
}

const key = process.env.HEYGEN_API_KEY!;
const res = await fetch("https://api.heygen.com/v3/voices?engine=starfish", {
  headers: { "x-api-key": key, accept: "application/json" },
});
const json: { data?: V3Voice[] } = await res.json();
const voices = json.data ?? [];

const englishFemale = voices.filter(
  (v) =>
    v.language?.toLowerCase().includes("english") &&
    v.gender?.toLowerCase() === "female"
);

console.log(`Starfish English Female voices: ${englishFemale.length}\n`);

// Dedupe by name (some voices appear multiple times with diff voice_ids)
const seen = new Set<string>();
const unique: V3Voice[] = [];
for (const v of englishFemale) {
  const k = v.name.trim();
  if (!seen.has(k)) {
    seen.add(k);
    unique.push(v);
  }
}

console.log(`Unique names: ${unique.length}\n`);
console.log("idx  name                     voice_id                              preview");
console.log("─".repeat(120));
for (let i = 0; i < unique.length; i++) {
  const v = unique[i];
  console.log(
    `${i.toString().padStart(3)}  ${v.name.trim().padEnd(24)} ${v.voice_id.padEnd(40)} ${v.preview_audio_url ?? "(no preview)"}`
  );
}

// Save full list to disk
const outDir = join(process.cwd(), "output", "voice-picker");
await mkdir(outDir, { recursive: true });
await writeFile(
  join(outDir, "english-female-starfish.json"),
  JSON.stringify(unique, null, 2)
);
console.log(`\n💾 Full list saved to output/voice-picker/english-female-starfish.json`);
