import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

interface V3Voice {
  voice_id: string;
  name: string;
  gender: string;
  language: string;
  preview_audio_url?: string;
  support_pause?: boolean;
  support_locale?: boolean;
  type?: string;
  [key: string]: unknown;
}

const key = process.env.HEYGEN_API_KEY!;
const res = await fetch("https://api.heygen.com/v3/voices?engine=starfish", {
  headers: { "x-api-key": key, accept: "application/json" },
});
const json: { data?: V3Voice[] } = await res.json();
const voices = json.data ?? [];

const englishMale = voices.filter(
  (v) =>
    v.language?.toLowerCase().includes("english") &&
    v.gender?.toLowerCase() === "male"
);

// Dedupe by name
const seen = new Set<string>();
const unique: V3Voice[] = [];
for (const v of englishMale) {
  const k = v.name.trim();
  if (!seen.has(k)) {
    seen.add(k);
    unique.push(v);
  }
}

// Score for "dramatic narrator" fit based on tags in name
const dramaticKeywords = [
  "broadcaster",
  "narrator",
  "narration",
  "documentary",
  "cinematic",
  "trailer",
  "movie",
  "deep",
  "dramatic",
  "epic",
  "lifelike",
  "professional",
  "voiceover",
];
function score(v: V3Voice): number {
  const lc = v.name.toLowerCase();
  return dramaticKeywords.reduce((s, k) => s + (lc.includes(k) ? 10 : 0), 0);
}

unique.sort((a, b) => score(b) - score(a));

console.log(`Total starfish English male (unique): ${unique.length}\n`);
console.log("rank score  name                              voice_id");
console.log("─".repeat(110));
for (let i = 0; i < unique.length; i++) {
  const v = unique[i];
  const s = score(v);
  const flag = s > 0 ? "⭐" : "  ";
  console.log(
    `${(i + 1).toString().padStart(4)}  ${s.toString().padStart(3)}  ${flag} ${v.name
      .trim()
      .padEnd(34)} ${v.voice_id}`
  );
  if (s > 0 && v.preview_audio_url) {
    console.log(`              preview: ${v.preview_audio_url}`);
  }
}

const outDir = join(process.cwd(), "output", "voice-picker");
await mkdir(outDir, { recursive: true });
await writeFile(
  join(outDir, "english-male-starfish.json"),
  JSON.stringify(unique, null, 2)
);
console.log(`\n💾 Full list saved to output/voice-picker/english-male-starfish.json`);
