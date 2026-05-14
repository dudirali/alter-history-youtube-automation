import "dotenv/config";
import { writeFile, mkdir, copyFile, readFile, access, readdir } from "node:fs/promises";
import { join, basename } from "node:path";
import { narrate } from "./narrate.ts";

interface Scene {
  id: number;
  start: number;
  end: number;
  duration_seconds: number;
  generator: string;
  narration_segment: string;
  prompt: string;
}

const TITANIC_NARRATION =
  "What if the Titanic never sank? This one decision changed history forever. " +
  "April 14th, 1912 — the lookout spots the iceberg thirty seconds earlier. " +
  "The wheel turns. The ship misses it by inches. " +
  "She arrives in New York to a hero's welcome. " +
  "The world falls in love with ocean liners. Air travel? Delayed by decades. " +
  "The Roaring Twenties roared at sea, not in the sky. " +
  "Every history book... rewritten.";

const ROOT = process.cwd();
const OUT_DIR = join(ROOT, "output", "titanic-mvp");
const BROLL_DIR = join(OUT_DIR, "broll");
const PUBLIC_DIR = join(ROOT, "public");
const SCENES_PATH = join(ROOT, "config", "scenes-titanic.json");

await mkdir(OUT_DIR, { recursive: true });
await mkdir(PUBLIC_DIR, { recursive: true });

console.log("=== Phase 1 MVP — Build (narration + B-roll wiring) ===");
console.log(`Output: ${OUT_DIR}\n`);

// Step 1: narration
const narration = await narrate(TITANIC_NARRATION, OUT_DIR);

// Step 2: copy audio to public/
const publicAudioPath = join(PUBLIC_DIR, basename(narration.audioPath));
await copyFile(narration.audioPath, publicAudioPath);
console.log(`[build-mvp] Copied audio → ${publicAudioPath}`);

// Step 3: copy B-roll clips to public/ (skip missing — useful before all clips generated)
const scenes: Scene[] = JSON.parse(await readFile(SCENES_PATH, "utf8"));
const sceneEntries: { id: number; start: number; duration_seconds: number; file: string }[] = [];
let missing = 0;
for (const s of scenes) {
  const srcPath = join(BROLL_DIR, `scene-${s.id}.mp4`);
  try {
    await access(srcPath);
  } catch {
    console.warn(`[build-mvp] ⚠️  Missing B-roll: ${srcPath}`);
    missing++;
    continue;
  }
  const dstName = `scene-${s.id}.mp4`;
  await copyFile(srcPath, join(PUBLIC_DIR, dstName));
  sceneEntries.push({
    id: s.id,
    start: s.start,
    duration_seconds: s.duration_seconds,
    file: dstName,
  });
}
console.log(`[build-mvp] Copied ${sceneEntries.length}/${scenes.length} B-roll clips to public/`);
if (missing > 0) {
  console.warn(`[build-mvp] ⚠️  ${missing} clip(s) missing — render will show black where they're absent`);
}

// Step 4: pick a music track (if any exist in assets/music/dramatic/)
const MUSIC_DIR = join(ROOT, "assets", "music", "dramatic");
let musicFile: string | null = null;
try {
  const tracks = (await readdir(MUSIC_DIR)).filter((f) => /\.(mp3|wav|m4a|aac)$/i.test(f));
  if (tracks.length > 0) {
    const pick = tracks[Math.floor(Math.random() * tracks.length)];
    const srcPath = join(MUSIC_DIR, pick);
    const dstName = `music-${pick}`;
    await copyFile(srcPath, join(PUBLIC_DIR, dstName));
    musicFile = dstName;
    console.log(`[build-mvp] Music track: ${pick} → public/${dstName}`);
  } else {
    console.warn(`[build-mvp] ⚠️  No music tracks in ${MUSIC_DIR} — rendering without music`);
  }
} catch {
  console.warn(`[build-mvp] ⚠️  Music dir missing — rendering without music`);
}

// Step 5: build render-props.json
const fps = 30;
const durationFrames = Math.ceil((narration.duration + 0.5) * fps);

const renderProps = {
  audioFile: basename(narration.audioPath),
  words: narration.words,
  scenes: sceneEntries,
  musicFile,
  musicVolume: 0.12,
  durationSeconds: narration.duration,
  fps,
  durationFrames,
};

await writeFile(join(OUT_DIR, "render-props.json"), JSON.stringify(renderProps, null, 2));

console.log("\n=== Ready to render ===");
console.log(`Duration: ${narration.duration.toFixed(2)}s (${durationFrames} frames @ ${fps}fps)`);
console.log(`Words:    ${narration.words.length}`);
console.log(`Scenes:   ${sceneEntries.length}`);
console.log(`Music:    ${musicFile ?? "(none)"}`);
console.log(`\nNext step:\n  npm run remotion:render`);
