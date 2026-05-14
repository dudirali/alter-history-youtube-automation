import "dotenv/config";
import { writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { execSync } from "node:child_process";
import { pickNextTopic, markTopicUsed } from "./pick-topic.ts";
import { generateScript } from "./generate-script.ts";
import { generateMetadata } from "./generate-metadata.ts";
import { uploadToYouTube } from "./youtube-upload.ts";

/**
 * Daily orchestrator. Runs the full pipeline for ONE alt-history shorts video,
 * end-to-end, and uploads to YouTube as "unlisted" (safer than "public" until
 * we have analytics on the channel — user manually flips to public from Studio).
 *
 * Pipeline:
 *   1. Pick unused topic from topic-bank.json
 *   2. Generate beats script (Claude Opus)
 *   3. Run build:beats (TTS per beat + Veo 3.1 Lite per beat + music pick + render-props)
 *   4. Run Remotion render → final.mp4
 *   5. Generate YouTube metadata (Claude Haiku)
 *   6. Upload to YouTube as unlisted
 *   7. Mark topic as used in state/used-topics.json
 *   8. Send macOS notification
 *
 * Failures at any stage abort the run. The topic stays unused so the next
 * day's cron can retry. Logs go to logs/<date>.log.
 */

const ROOT = process.cwd();

/**
 * Cross-platform notify:
 *  • If DISCORD_WEBHOOK_URL is set (Railway/cloud): POST a message to Discord
 *  • Else if on macOS (local dev): show a native notification via osascript
 *  • Else: just log to stdout (CI/other Linux)
 */
async function notify(title: string, message: string, isError = false) {
  const webhook = process.env.DISCORD_WEBHOOK_URL;
  if (webhook) {
    try {
      await fetch(webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: "Alt-History Shorts",
          content: `${isError ? "🚨" : "✅"} **${title}**\n${message}`,
        }),
      });
      return;
    } catch (e) {
      console.warn("[notify] Discord webhook failed:", (e as Error).message);
    }
  }
  if (process.platform === "darwin") {
    try {
      const escaped = (s: string) => s.replace(/"/g, '\\"');
      execSync(
        `osascript -e 'display notification "${escaped(message)}" with title "${escaped(title)}" sound name "${isError ? "Sosumi" : "Glass"}"'`
      );
      return;
    } catch {
      // fall through
    }
  }
  console.log(`[notify] ${title} — ${message}`);
}

function logHeader(label: string) {
  const line = "━".repeat(60);
  console.log(`\n${line}\n  ${label}\n${line}`);
}

async function main() {
  const runStart = Date.now();
  logHeader("Daily Run — Alt-History Shorts");
  console.log(`Started at: ${new Date().toISOString()}`);

  // 1) Pick topic
  logHeader("Step 1/7 — Pick next topic");
  const topic = await pickNextTopic();
  console.log(`Topic: ${topic.id} — "${topic.title}"`);

  const TOPIC_OUT_DIR = join(ROOT, "output", topic.id);
  await mkdir(TOPIC_OUT_DIR, { recursive: true });

  // 2) Generate beats script via Claude
  logHeader("Step 2/7 — Generate beats script (Claude)");
  const beats = await generateScript(topic);
  const beatsPath = join(TOPIC_OUT_DIR, "beats.json");
  await writeFile(beatsPath, JSON.stringify(beats, null, 2));
  console.log(`Saved beats → ${beatsPath}`);
  console.log(beats.map((b) => `  Beat ${b.id} (${b.duration_seconds}s): "${b.text}"`).join("\n"));

  // 3) Run build:beats — TTS + Veo + assemble render-props
  logHeader("Step 3/7 — Build pipeline (TTS + Veo + render-props)");
  execSync(`npm run build:beats`, {
    cwd: ROOT,
    stdio: "inherit",
    env: {
      ...process.env,
      BUILD_TOPIC_ID: topic.id,
      // Path relative to ROOT for the build script to resolve
      BUILD_BEATS_CONFIG: `output/${topic.id}/beats.json`,
    },
  });

  // 4) Remotion render
  logHeader("Step 4/7 — Remotion render");
  const finalMp4 = join(TOPIC_OUT_DIR, "final.mp4");
  const propsPath = join(TOPIC_OUT_DIR, "render-props.json");
  execSync(
    `npx remotion render remotion/src/index.ts Short ${finalMp4} --props=${propsPath}`,
    { cwd: ROOT, stdio: "inherit" }
  );
  console.log(`✅ Rendered → ${finalMp4}`);

  // 5) Generate YouTube metadata
  logHeader("Step 5/7 — Generate YouTube metadata (Claude)");
  const metadata = await generateMetadata(topic, beats);
  console.log(`Title:       ${metadata.title}`);
  console.log(`Tags:        ${metadata.tags.join(", ")}`);
  await writeFile(join(TOPIC_OUT_DIR, "metadata.json"), JSON.stringify(metadata, null, 2));

  // 6) Upload to YouTube as PUBLIC (user wants fully automated daily publishing)
  logHeader("Step 6/7 — Upload to YouTube (public)");
  const uploadResult = await uploadToYouTube({
    videoPath: finalMp4,
    title: metadata.title,
    description: metadata.description,
    tags: metadata.tags,
    privacyStatus: "public",
  });
  console.log(`✅ Watch:  ${uploadResult.url}`);
  console.log(`   Studio: ${uploadResult.studioUrl}`);

  // 7) Mark topic as used
  logHeader("Step 7/7 — Mark topic used in state");
  await markTopicUsed({
    id: topic.id,
    videoId: uploadResult.videoId,
    publishedAt: new Date().toISOString(),
    url: uploadResult.url,
  });
  console.log(`✅ ${topic.id} marked as used`);

  const totalMin = ((Date.now() - runStart) / 60_000).toFixed(1);
  logHeader(`Done in ${totalMin}min — ${uploadResult.url}`);

  await notify(
    "Alt-History Short published",
    `${topic.title}\n${uploadResult.url}\n${totalMin}min`
  );
}

main().catch(async (e: unknown) => {
  const err = e as Error;
  console.error("\n❌ Daily run failed:", err.message);
  console.error(err.stack);
  await notify("Alt-History Short FAILED", err.message.slice(0, 300), true);
  process.exit(1);
});
