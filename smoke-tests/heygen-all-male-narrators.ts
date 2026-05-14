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

interface V3VoicesResponse {
  data: V3Voice[];
  has_more: boolean;
  next_token: string | null;
}

const key = process.env.HEYGEN_API_KEY!;

async function fetchAllStarfishVoices(): Promise<V3Voice[]> {
  const all: V3Voice[] = [];
  let token: string | null = null;
  let pages = 0;

  while (true) {
    const url = token
      ? `https://api.heygen.com/v3/voices?engine=starfish&next_token=${encodeURIComponent(token)}`
      : `https://api.heygen.com/v3/voices?engine=starfish`;
    const res = await fetch(url, {
      headers: { "x-api-key": key, accept: "application/json" },
    });
    const json = (await res.json()) as V3VoicesResponse;
    pages++;
    all.push(...(json.data ?? []));
    if (!json.has_more || !json.next_token) break;
    token = json.next_token;
    if (pages > 200) {
      console.warn("⚠️  Stopped at 200 pages — safety limit");
      break;
    }
  }
  console.log(`Fetched ${all.length} starfish voices across ${pages} pages`);
  return all;
}

const all = await fetchAllStarfishVoices();

// Filter English male
const englishMale = all.filter(
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

// Score for dramatic narrator fit
const dramaticTags = [
  ["broadcaster", 20],
  ["narrator", 20],
  ["narration", 20],
  ["documentary", 15],
  ["cinematic", 15],
  ["trailer", 15],
  ["movie", 10],
  ["dramatic", 20],
  ["deep", 10],
  ["epic", 10],
  ["voiceover", 15],
  ["voice over", 15],
  ["lifelike", 8],
  ["professional", 5],
] as const;

function score(v: V3Voice): number {
  const lc = v.name.toLowerCase();
  return dramaticTags.reduce((s, [k, pts]) => s + (lc.includes(k) ? pts : 0), 0);
}

unique.sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name));

console.log(`\nTotal unique English Male starfish voices: ${unique.length}\n`);
console.log("rank score  name                                      voice_id");
console.log("─".repeat(120));
for (let i = 0; i < unique.length; i++) {
  const v = unique[i];
  const s = score(v);
  const flag = s >= 15 ? "⭐⭐" : s > 0 ? "⭐ " : "  ";
  console.log(
    `${(i + 1).toString().padStart(4)} ${s.toString().padStart(4)}  ${flag} ${v.name
      .trim()
      .padEnd(40)} ${v.voice_id}`
  );
}

const outDir = join(process.cwd(), "output", "voice-picker");
await mkdir(outDir, { recursive: true });
await writeFile(
  join(outDir, "english-male-starfish-full.json"),
  JSON.stringify(unique, null, 2)
);
console.log(`\n💾 Full list (with preview URLs) saved to output/voice-picker/english-male-starfish-full.json`);

// Print top-10 with preview URLs
console.log(`\n=== Top-scoring dramatic narrator candidates with previews ===`);
for (const v of unique.slice(0, 10)) {
  console.log(`\n  ${v.name}  (${v.voice_id})`);
  if (v.preview_audio_url) console.log(`    ${v.preview_audio_url}`);
}
