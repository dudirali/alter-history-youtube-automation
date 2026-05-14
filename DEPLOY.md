# Deploying to Railway

This project runs as a daily cron on Railway. Each run:
1. Picks the next unused topic from `config/topic-bank.json`
2. Generates a 10-beat script via Claude
3. Synthesizes narration via HeyGen
4. Generates 10 Veo 3.1 Lite clips via fal.ai
5. Renders the final MP4 via Remotion (Chromium-in-container)
6. Uploads to YouTube as PUBLIC
7. Marks the topic as used in a persistent volume
8. Sends a Discord notification (optional)

---

## Prerequisites

- Railway account (Hobby plan, $5/mo)
- GitHub account
- Working `.env` locally (the keys you've already used)
- Optional: Discord channel with a webhook URL for notifications

---

## Step 1 — Push the project to GitHub

```bash
cd ~/Desktop/alt-history-shorts

# First-time setup
git init
git add -A
git commit -m "Initial commit: alt-history-shorts pipeline"
git branch -M main

# Replace with your repo URL
git remote add origin git@github.com:YOUR-USER/alt-history-shorts.git
git push -u origin main
```

> **IMPORTANT**: `.env` is in `.gitignore` — your API keys do NOT get pushed. You'll set them as Railway env vars instead.

---

## Step 2 — Create a Railway project

1. Go to https://railway.app/new
2. **Deploy from GitHub repo** → pick `alt-history-shorts`
3. Railway auto-detects the `Dockerfile` and starts the first build (5-10 min — installs Chromium + ffmpeg)

---

## Step 3 — Set environment variables

In the Railway service → **Variables**:

| Variable | Value (copy from your local `.env`) |
|---|---|
| `ANTHROPIC_API_KEY` | `sk-ant-...` |
| `HEYGEN_API_KEY` | `sk_V2_hgu_...` |
| `FAL_KEY` | `cd720cef-...:d7c29d...` |
| `YOUTUBE_CLIENT_ID` | `737550143327-...` |
| `YOUTUBE_CLIENT_SECRET` | `GOCSPX-...` |
| `YOUTUBE_REFRESH_TOKEN` | `1//031A...` |
| `DISCORD_WEBHOOK_URL` | (optional) Discord webhook URL for notifications |

---

## Step 4 — Mount a persistent volume for state

The pipeline needs to remember which topics it already published. Railway volumes survive across runs.

In the service → **Settings → Volumes** → **+ Add Volume**:

- **Mount path**: `/data`
- **Size**: 1 GB is plenty (state is a tiny JSON file)

The Dockerfile already sets `STATE_DIR=/data/state`, so the pipeline reads/writes to the volume automatically.

> The first run will fall back to the committed `state/used-topics.json` (the videos you already uploaded) and then start writing to `/data/state` going forward.

---

## Step 5 — Configure cron schedule

Two ways. **Pick ONE.**

### Option A — Railway Cron (recommended)

In the service → **Settings → Cron Schedule**:

```
0 9 * * *
```

(every day at 9:00 UTC. Adjust if you want a different timezone — Railway uses UTC.)

For 9:00 Israel time (UTC+3 winter / UTC+2 summer), use `0 6 * * *` in winter, `0 7 * * *` in summer.

Set **Restart Policy**: `NEVER` (so the service doesn't loop after each run).

### Option B — GitHub Actions trigger

If you'd rather control timing externally, set Railway start command to `npm run daily` and use a GitHub Actions workflow with `schedule:` cron + a Railway webhook to trigger runs.

---

## Step 6 — Trigger a test run

In Railway service → **Deployments** → click **Run** (or push a tiny commit to force a deploy).

Watch the logs. You should see:
```
=== Daily Run — Alt-History Shorts ===
Step 1/7 — Pick next topic
Topic: xxxxx — "What if ..."
Step 2/7 — Generate beats script (Claude)
...
Done in 10-15min — https://youtube.com/shorts/...
```

If you set `DISCORD_WEBHOOK_URL`, you'll also get a notification.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Build fails with `chromium` not found | Make sure `REMOTION_BROWSER_EXECUTABLE=/usr/bin/chromium` env var is set (Dockerfile does this) |
| YouTube upload 401 | `YOUTUBE_REFRESH_TOKEN` expired (happens every ~7 days in Testing mode). Re-run `npm run yt:oauth` locally and update the env var on Railway |
| fal.ai 403 "Exhausted balance" | Top up at fal.ai/dashboard/billing |
| Remotion render OOM | Set `REMOTION_CONCURRENCY=1` env var on Railway |
| Same topic published twice | Volume not mounted at `/data`. Verify in Settings → Volumes |

---

## Costs (monthly, ~30 videos)

| Item | Cost |
|---|---|
| Railway Hobby plan | $5 |
| Railway compute (~15 min × 30 = 7.5 hrs) | ~$0.20 |
| Anthropic (Claude Opus script + Haiku metadata) | ~$15 |
| HeyGen TTS | ~$9 |
| fal.ai Veo 3.1 Lite | ~$180-240 |
| YouTube API | $0 (within free quota) |
| **TOTAL** | **~$210-270 / month** |

The fal.ai (Veo) cost dominates. To cut costs, switch B-roll model to Kling Standard via `config/strategy.json` (would drop to ~$100/mo, at quality tradeoff).
