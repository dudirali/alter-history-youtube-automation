import "dotenv/config";
import { google } from "googleapis";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";

export interface YouTubeUploadOptions {
  videoPath: string;
  title: string;
  description: string;
  tags?: string[];
  /** YouTube category enum (string). "24" = Entertainment, "27" = Education. Default 24. */
  categoryId?: string;
  /** "private" | "unlisted" | "public". Default "private" for safety. */
  privacyStatus?: "private" | "unlisted" | "public";
  /** Required by YouTube COPPA policy. Default false (not for kids). */
  madeForKids?: boolean;
}

export interface YouTubeUploadResult {
  videoId: string;
  url: string;
  studioUrl: string;
}

function makeOAuth2Client() {
  const { YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET, YOUTUBE_REFRESH_TOKEN } = process.env;
  if (!YOUTUBE_CLIENT_ID || !YOUTUBE_CLIENT_SECRET || !YOUTUBE_REFRESH_TOKEN) {
    throw new Error(
      "Missing YOUTUBE_CLIENT_ID / YOUTUBE_CLIENT_SECRET / YOUTUBE_REFRESH_TOKEN in .env. Run `npm run yt:oauth` first."
    );
  }
  const client = new google.auth.OAuth2(
    YOUTUBE_CLIENT_ID,
    YOUTUBE_CLIENT_SECRET,
    "http://localhost:3030/callback"
  );
  client.setCredentials({ refresh_token: YOUTUBE_REFRESH_TOKEN });
  return client;
}

/**
 * Upload a video file to YouTube. Returns the video ID + watch URL.
 * Title and description should contain `#Shorts` so YouTube classifies it correctly.
 */
export async function uploadToYouTube(opts: YouTubeUploadOptions): Promise<YouTubeUploadResult> {
  const stats = await stat(opts.videoPath);
  const fileSizeBytes = stats.size;
  console.log(`[upload] file=${opts.videoPath}  size=${(fileSizeBytes / 1024 / 1024).toFixed(1)}MB`);
  console.log(`[upload] title="${opts.title}"`);
  console.log(`[upload] privacy=${opts.privacyStatus ?? "private"}`);

  const auth = makeOAuth2Client();
  const youtube = google.youtube({ version: "v3", auth });

  const t0 = Date.now();
  const res = await youtube.videos.insert(
    {
      part: ["snippet", "status"],
      requestBody: {
        snippet: {
          title: opts.title,
          description: opts.description,
          tags: opts.tags ?? [],
          categoryId: opts.categoryId ?? "24", // Entertainment
        },
        status: {
          privacyStatus: opts.privacyStatus ?? "private",
          selfDeclaredMadeForKids: opts.madeForKids ?? false,
        },
      },
      media: {
        body: createReadStream(opts.videoPath),
      },
    },
    {
      onUploadProgress: (evt) => {
        const pct = ((evt.bytesRead / fileSizeBytes) * 100).toFixed(1);
        process.stdout.write(`\r[upload] ${pct}%  (${(evt.bytesRead / 1024 / 1024).toFixed(1)}MB)`);
      },
    }
  );
  console.log(); // newline after progress

  const videoId = res.data.id;
  if (!videoId) throw new Error(`YouTube returned no video id. Response: ${JSON.stringify(res.data)}`);

  const elapsed = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`[upload] ✅ done in ${elapsed}s`);

  return {
    videoId,
    url: `https://youtube.com/shorts/${videoId}`,
    studioUrl: `https://studio.youtube.com/video/${videoId}/edit`,
  };
}

// ---------- CLI ----------
// Usage: tsx pipeline/youtube-upload.ts [videoPath] [--privacy=private|unlisted|public]

if (import.meta.url === `file://${process.argv[1]}`) {
  const args = process.argv.slice(2);
  const videoPath = args.find((a) => !a.startsWith("--")) ?? "output/titanic-mvp/final.mp4";
  const privacyArg = args.find((a) => a.startsWith("--privacy="));
  const privacy = (privacyArg?.split("=")[1] ?? "private") as "private" | "unlisted" | "public";

  uploadToYouTube({
    videoPath,
    title: "What if the Titanic never sank? 🚢 #shorts",
    description: [
      "What if one small decision rewrote all of history?",
      "",
      "In 1912, the Titanic's lookout spotted the iceberg thirty seconds earlier...",
      "and the entire 20th century unfolded differently.",
      "",
      "Follow for daily alternate-history shorts.",
      "",
      "#shorts #althistory #alternatehistory #titanic #whatif #history",
    ].join("\n"),
    tags: [
      "alternate history",
      "alt history",
      "what if",
      "titanic",
      "what if scenarios",
      "history",
      "history shorts",
      "shorts",
      "althistory",
    ],
    privacyStatus: privacy,
  })
    .then((r) => {
      console.log(`\n=== Upload complete ===`);
      console.log(`Watch:   ${r.url}`);
      console.log(`Studio:  ${r.studioUrl}`);
      console.log(`\n💡 Video is set to ${privacy.toUpperCase()}. Edit metadata or publish from Studio.`);
    })
    .catch((e: unknown) => {
      const err = e as { errors?: { reason: string; message: string }[]; message?: string };
      console.error(`\n❌ Upload failed:`, err.message ?? e);
      if (err.errors) {
        for (const sub of err.errors) console.error(`   ${sub.reason}: ${sub.message}`);
      }
      process.exit(1);
    });
}
