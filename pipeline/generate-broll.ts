import "dotenv/config";
import { fal } from "@fal-ai/client";
import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";

export interface Scene {
  id: number;
  start: number;
  end: number;
  duration_seconds: number;
  generator: "veo3" | "kling-master";
  narration_segment: string;
  prompt: string;
}

const FAL_MODELS = {
  veo3: "fal-ai/veo3",
  "kling-master": "fal-ai/kling-video/v2.1/master/text-to-video",
} as const;

fal.config({ credentials: process.env.FAL_KEY! });

async function generateScene(scene: Scene, outDir: string): Promise<string> {
  const model = FAL_MODELS[scene.generator];

  const input: Record<string, unknown> = {
    prompt: scene.prompt,
    aspect_ratio: "9:16",
  };

  if (scene.generator === "veo3") {
    // Veo: duration enum is "4s" | "6s" | "8s"
    input.duration = `${scene.duration_seconds}s`;
    input.resolution = "1080p";
    input.generate_audio = false; // we have our own narration
  } else {
    // Kling: duration is "5" | "10" (seconds as string)
    input.duration = String(scene.duration_seconds);
  }

  const shortPrompt = scene.prompt.slice(0, 65);
  console.log(`[scene ${scene.id}] start  ${scene.generator}  ${scene.duration_seconds}s  "${shortPrompt}..."`);

  const t0 = Date.now();
  const result = (await fal.subscribe(model, {
    input,
    logs: false,
  })) as { data: { video: { url: string } } };
  const url = result.data?.video?.url;
  if (!url) {
    throw new Error(`Scene ${scene.id}: no video.url in result`);
  }
  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);

  const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
  const filePath = join(outDir, `scene-${scene.id}.mp4`);
  await writeFile(filePath, buf);

  console.log(`[scene ${scene.id}] ✅ ${elapsed}s, ${(buf.length / 1024 / 1024).toFixed(1)} MB → ${filePath}`);
  return filePath;
}

async function main() {
  const scenesPath = process.argv[2] ?? join(process.cwd(), "config", "scenes-titanic.json");
  const outDir = process.argv[3] ?? join(process.cwd(), "output", "titanic-mvp", "broll");
  const onlyIds = process.argv[4] ? process.argv[4].split(",").map((n) => parseInt(n, 10)) : null;

  let scenes: Scene[] = JSON.parse(await readFile(scenesPath, "utf8"));
  if (onlyIds) {
    scenes = scenes.filter((s) => onlyIds.includes(s.id));
    console.log(`Filtering to scenes: ${onlyIds.join(", ")}`);
  }
  await mkdir(outDir, { recursive: true });

  // Print plan + cost estimate
  console.log(`\n=== B-roll generation plan ===`);
  const veoSeconds = scenes
    .filter((s) => s.generator === "veo3")
    .reduce((a, s) => a + s.duration_seconds, 0);
  const klingSeconds = scenes
    .filter((s) => s.generator === "kling-master")
    .reduce((a, s) => a + s.duration_seconds, 0);
  for (const s of scenes) {
    console.log(`  scene ${s.id}: ${s.generator.padEnd(13)} ${s.duration_seconds}s`);
  }
  console.log(`  TOTAL: Veo3 ${veoSeconds}s + Kling-Master ${klingSeconds}s`);
  console.log(`  Estimated cost: ~$${(veoSeconds * 0.5 + klingSeconds * 0.3).toFixed(2)} (rough)\n`);

  console.log(`Running ${scenes.length} scenes in parallel...`);
  const t0 = Date.now();
  const results = await Promise.allSettled(scenes.map((s) => generateScene(s, outDir)));
  const totalSec = ((Date.now() - t0) / 1000).toFixed(0);

  console.log(`\n=== Results in ${totalSec}s ===`);
  results.forEach((r, i) => {
    if (r.status === "fulfilled") {
      console.log(`  ✅ scene ${scenes[i].id}: ${r.value}`);
    } else {
      console.log(`  ❌ scene ${scenes[i].id}: ${r.reason?.message ?? r.reason}`);
    }
  });
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
