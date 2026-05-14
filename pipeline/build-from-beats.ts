import "dotenv/config";
import { fal } from "@fal-ai/client";
import { readFile, writeFile, mkdir, copyFile, readdir, access } from "node:fs/promises";
import { join, basename } from "node:path";
import { narrateBeats } from "./narrate-beats.ts";
import { narrate } from "./narrate.ts";
import { tightenBeat, regenerateVisualPrompt } from "./generate-script.ts";

interface BeatConfig {
  id: number;
  name: string;
  text: string;
  duration_seconds: number;
  prompt: string;
  key_word?: string;
}

interface ResolvedBeat {
  id: number;
  name: string;
  text: string;
  duration_seconds: number;
  audioFile: string;
  videoFile: string;
  words: { word: string; start: number; end: number }[];
  audioDuration: number;
  key_word?: string;
}

const ROOT = process.cwd();
// Override via env when running for non-Titanic topics:
//   BUILD_TOPIC_ID=apollo-11-fails BUILD_BEATS_CONFIG=output/apollo-11-fails/beats.json npm run build:beats
const TOPIC = process.env.BUILD_TOPIC_ID ?? "titanic-mvp";
const OUT_DIR = join(ROOT, "output", TOPIC);
const BEATS_DIR = join(OUT_DIR, "beats");
const PUBLIC_DIR = join(ROOT, "public");
const BEATS_CONFIG = process.env.BUILD_BEATS_CONFIG
  ? join(ROOT, process.env.BUILD_BEATS_CONFIG)
  : join(ROOT, "config", "beats-titanic.json");

// Narrator speech speed multiplier (HeyGen TTS `speed` parameter).
// Visuals play at natural 1.0x rate. Scene durations are shrunk to match the audio
// (audio_duration + small buffer, capped at MAX_SCENE_SECONDS) so there are no silent tails.
const NARRATION_SPEED = parseFloat(process.env.NARRATION_SPEED ?? "1.3");

// Hard cap on scene display duration. Veo Lite produces 4s clips; we trim each Sequence
// to whichever is smaller: (audio_duration + 0.05s) or this cap.
const MAX_SCENE_SECONDS = parseFloat(process.env.MAX_SCENE_SECONDS ?? "2.0");
const SCENE_TAIL_BUFFER = 0.05; // tiny pad so audio doesn't get clipped at the boundary

fal.config({ credentials: process.env.FAL_KEY! });

// B-roll model: Veo 3.1 Lite via fal.ai
// - duration enum: "4s" | "6s" | "8s"
// - aspect_ratio: "16:9" | "9:16" (we use 9:16 for shorts)
// - resolution: "720p" | "1080p" (1080p only with 8s; we use 720p across all for consistency)
const VEO_MODEL = "fal-ai/veo3.1/lite";

await mkdir(BEATS_DIR, { recursive: true });
await mkdir(PUBLIC_DIR, { recursive: true });

console.log(`=== Beats Pipeline (narration speed = ${NARRATION_SPEED}x) ===\n`);

const beats: BeatConfig[] = JSON.parse(await readFile(BEATS_CONFIG, "utf8"));

// Per-beat narration speed: Hook runs hot for urgency, Reveal runs cool for impact.
// Everything in between uses the default 1.3x.
function speedForBeat(b: { id: number; name?: string }): number {
  if (b.id === 1) return 1.4;       // Hook: urgent
  if (b.id === 10) return 1.0;      // Reveal: dramatic, deliberate
  return NARRATION_SPEED;            // default 1.3
}

// 1) Run TTS for each beat in parallel (per-beat speed)
console.log(`[1/4] Generating ${beats.length} narrations in parallel (variable speed)...`);
const tt0 = Date.now();
const narrations = await narrateBeats(beats, BEATS_DIR, NARRATION_SPEED, speedForBeat);
console.log(`      ✅ TTS done in ${((Date.now() - tt0) / 1000).toFixed(0)}s\n`);

// Phase 1.5: enforce MAX_SCENE_SECONDS via tighten retries, THEN snap each scene
// duration to actual audio length (eliminates silent tails entirely).
const MAX_TIGHTEN_RETRIES = 2;
let beatsConfigDirty = false;

// Hard ceiling: if Claude truly cannot shorten a beat after MAX_TIGHTEN_RETRIES,
// we allow the scene to stretch up to this many seconds rather than clipping the audio
// (better to have an unusual ~2.5s scene than to play "I cann-" cut off).
const FALLBACK_MAX_SCENE_SECONDS = 3.0;

for (const beat of beats) {
  const n = narrations.find((x) => x.id === beat.id)!;
  let retries = 0;
  while (n.duration > MAX_SCENE_SECONDS && retries < MAX_TIGHTEN_RETRIES) {
    const overflow = (n.duration - MAX_SCENE_SECONDS).toFixed(2);
    console.log(
      `      🔧 Beat ${beat.id} ("${beat.name}") audio ${n.duration.toFixed(2)}s > cap ${MAX_SCENE_SECONDS}s (overflow ${overflow}s) — Claude tightening (retry ${retries + 1}/${MAX_TIGHTEN_RETRIES})...`
    );
    const newText = await tightenBeat(
      { ...beat, duration_seconds: MAX_SCENE_SECONDS } as Parameters<typeof tightenBeat>[0],
      n.duration
    );
    if (!newText) {
      console.warn(`      🔧 Tighten gave up on Beat ${beat.id}; keeping original text.`);
      break;
    }
    console.log(`      🔧 New text: "${newText}"`);
    beat.text = newText;
    beatsConfigDirty = true;
    const beatDir = join(BEATS_DIR, String(beat.id));
    const fresh = await narrate(newText, beatDir, { speed: speedForBeat(beat) });
    n.audioPath = fresh.audioPath;
    n.duration = fresh.duration;
    n.words = fresh.words;
    retries++;
  }

  // Determine final scene duration:
  //  - If audio fits inside MAX_SCENE_SECONDS → snap to audio + buffer (≤ cap)
  //  - If audio still doesn't fit → stretch scene up to FALLBACK_MAX_SCENE_SECONDS so audio plays fully
  let snapped: number;
  if (n.duration <= MAX_SCENE_SECONDS) {
    snapped = n.duration + SCENE_TAIL_BUFFER;
  } else if (n.duration <= FALLBACK_MAX_SCENE_SECONDS) {
    snapped = n.duration + SCENE_TAIL_BUFFER;
    console.warn(
      `      ⚠️  Beat ${beat.id} couldn't fit in ${MAX_SCENE_SECONDS}s — stretching scene to ${snapped.toFixed(2)}s so audio plays fully.`
    );
  } else {
    snapped = FALLBACK_MAX_SCENE_SECONDS;
    console.warn(
      `      ⚠️  Beat ${beat.id} audio ${n.duration.toFixed(2)}s exceeds even fallback ${FALLBACK_MAX_SCENE_SECONDS}s — audio will clip.`
    );
  }
  beat.duration_seconds = Number(snapped.toFixed(3));
  beatsConfigDirty = true;

  console.log(
    `      Beat ${beat.id} (${beat.name}): audio ${n.duration.toFixed(2)}s ↦ scene ${beat.duration_seconds}s  (${(beat.duration_seconds - n.duration).toFixed(2)}s buffer, no silent tail)`
  );
}

if (beatsConfigDirty) {
  await writeFile(BEATS_CONFIG, JSON.stringify(beats, null, 2));
  console.log(`      💾 Saved tightened beats + snapped durations back to ${BEATS_CONFIG}`);
}

// 2) Generate Kling clips at ORIGINAL duration (5 or 10) — playbackRate handles the rest.
//    Skip if cached.
console.log(`\n[2/4] Generating ${beats.length} Kling clips sequentially (cached when possible)...`);

async function exists(p: string): Promise<boolean> {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

/**
 * Convert a desired DISPLAY duration into a valid Veo Lite enum value.
 * Veo Lite only accepts 4 / 6 / 8 second clips.
 * If we want a 3s scene, we generate a 4s clip and Remotion trims it.
 */
function veoDurationFor(displaySeconds: number): 4 | 6 | 8 {
  if (displaySeconds <= 4) return 4;
  if (displaySeconds <= 6) return 6;
  return 8;
}

function isVeoModerationError(e: unknown): boolean {
  const err = e as { status?: number; body?: { detail?: Array<{ type?: string }> } };
  if (err?.status !== 422) return false;
  const detail = err.body?.detail;
  if (!Array.isArray(detail)) return false;
  return detail.some((d) => d?.type === "no_media_generated");
}

const MAX_VEO_RETRIES = 2;

async function generateVeo(beat: BeatConfig): Promise<string> {
  const outPath = join(BEATS_DIR, String(beat.id), "video.mp4");
  if (await exists(outPath)) {
    console.log(`      [beat ${beat.id}] ⏭️  cached (display ${beat.duration_seconds}s) — skipping`);
    return outPath;
  }
  const veoSec = veoDurationFor(beat.duration_seconds);
  const note = veoSec === beat.duration_seconds ? "" : ` (Veo Lite min, will trim to ${beat.duration_seconds}s in render)`;
  let currentPrompt = beat.prompt;

  for (let attempt = 0; attempt <= MAX_VEO_RETRIES; attempt++) {
    const tag = attempt === 0 ? "" : ` (retry ${attempt}/${MAX_VEO_RETRIES})`;
    console.log(
      `      [beat ${beat.id}] veo3.1-lite ${veoSec}s${note}${tag} "${currentPrompt.slice(0, 60)}..."`
    );
    const t0 = Date.now();
    try {
      const result = (await fal.subscribe(VEO_MODEL, {
        input: {
          prompt: currentPrompt,
          aspect_ratio: "9:16",
          duration: `${veoSec}s`,
          resolution: "720p",
          generate_audio: false,
        },
        logs: false,
      })) as { data: { video: { url: string } } };
      const url = result.data?.video?.url;
      if (!url) throw new Error(`No video.url for beat ${beat.id}`);
      const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
      await writeFile(outPath, buf);
      console.log(
        `      [beat ${beat.id}] ✅ ${((Date.now() - t0) / 1000).toFixed(0)}s, ${(buf.length / 1024 / 1024).toFixed(1)} MB → ${outPath}`
      );
      if (attempt > 0) {
        beat.prompt = currentPrompt; // persist the prompt that actually worked
      }
      return outPath;
    } catch (e) {
      if (isVeoModerationError(e) && attempt < MAX_VEO_RETRIES) {
        console.warn(
          `      [beat ${beat.id}] 🛡️  Veo refused (moderation). Asking Claude to rewrite the prompt...`
        );
        currentPrompt = await regenerateVisualPrompt(beat.text, currentPrompt);
        continue;
      }
      throw e;
    }
  }
  throw new Error(`Beat ${beat.id}: all Veo retries exhausted`);
}

for (const beat of beats) {
  await generateVeo(beat);
}

// 3) Copy audio + video to public/ with predictable names + build resolved beats
console.log(`\n[3/4] Copying assets to public/...`);
const resolved: ResolvedBeat[] = [];
for (const beat of beats) {
  const narration = narrations.find((n) => n.id === beat.id)!;
  const audioBase = basename(narration.audioPath);
  const audioExt = audioBase.endsWith(".wav") ? "wav" : "mp3";
  const audioPublicName = `narration-${beat.id}.${audioExt}`;
  const videoPublicName = `scene-${beat.id}.mp4`;

  await copyFile(narration.audioPath, join(PUBLIC_DIR, audioPublicName));
  await copyFile(join(BEATS_DIR, String(beat.id), "video.mp4"), join(PUBLIC_DIR, videoPublicName));

  resolved.push({
    id: beat.id,
    name: beat.name,
    text: beat.text,
    duration_seconds: beat.duration_seconds,
    audioFile: audioPublicName,
    videoFile: videoPublicName,
    words: narration.words,
    audioDuration: narration.duration,
    key_word: beat.key_word,
  });
  console.log(
    `      Beat ${beat.id}: ${audioPublicName} + ${videoPublicName}  (scene ${beat.duration_seconds}s natural)`
  );
}

// 4) Pick music + detect optional SFX
console.log(`\n[4/4] Picking background music + SFX...`);
const MUSIC_DIR = join(ROOT, "assets", "music", "dramatic");
let musicFile: string | null = null;
try {
  const tracks = (await readdir(MUSIC_DIR)).filter((f) => /\.(mp3|wav|m4a|aac)$/i.test(f));
  if (tracks.length > 0) {
    const pick = tracks[Math.floor(Math.random() * tracks.length)];
    const dstName = `music-${pick.replace(/\s+/g, "_")}`;
    await copyFile(join(MUSIC_DIR, pick), join(PUBLIC_DIR, dstName));
    musicFile = dstName;
    console.log(`      Music: ${pick} → public/${dstName}`);
  } else {
    console.warn(`      No music tracks found — rendering without music`);
  }
} catch {
  console.warn(`      Music dir missing — rendering without music`);
}

// Optional SFX: assets/sfx/whoosh.* (transition) and assets/sfx/bass-drop.* (climax)
const SFX_DIR = join(ROOT, "assets", "sfx");
async function pickSfx(prefix: string): Promise<string | null> {
  try {
    const files = (await readdir(SFX_DIR)).filter(
      (f) => f.toLowerCase().startsWith(prefix) && /\.(mp3|wav|m4a|aac)$/i.test(f)
    );
    if (!files.length) return null;
    const src = files[0];
    const dst = `sfx-${src.replace(/\s+/g, "_")}`;
    await copyFile(join(SFX_DIR, src), join(PUBLIC_DIR, dst));
    return dst;
  } catch {
    return null;
  }
}
const whooshFile = await pickSfx("whoosh");
const bassDropFile = await pickSfx("bass");
console.log(`      Whoosh:    ${whooshFile ?? "(none)"}`);
console.log(`      Bass drop: ${bassDropFile ?? "(none)"}`);

// 5) Write render-props
const fps = 30;
const totalSeconds = resolved.reduce((a, b) => a + b.duration_seconds, 0);
const durationFrames = Math.ceil(totalSeconds * fps);

const renderProps = {
  beats: resolved,
  musicFile,
  musicVolume: 0.08, // ducked while narrator talks; Short.tsx swells to 25% at climax
  whooshFile,
  bassDropFile,
  narrationSpeed: NARRATION_SPEED,
  fps,
  durationFrames,
  totalSeconds,
};

await writeFile(join(OUT_DIR, "render-props.json"), JSON.stringify(renderProps, null, 2));

console.log(`\n=== Ready to render ===`);
console.log(`Narration speed: ${NARRATION_SPEED}x`);
console.log(`Total duration:  ${totalSeconds.toFixed(2)}s (${durationFrames} frames @ ${fps}fps)`);
console.log(`Beats:           ${resolved.length}`);
console.log(`Music:           ${musicFile ?? "(none)"}`);
console.log(`\nNext step:\n  npm run remotion:render`);
