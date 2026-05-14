import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import type { Topic } from "./pick-topic.ts";
import type { Beat } from "./generate-script.ts";

export interface YouTubeMetadata {
  title: string;
  description: string;
  tags: string[];
}

/**
 * Generates YouTube Shorts metadata (title, description, tags) tuned for
 * the alt-history niche. Uses Claude Haiku for cost efficiency.
 */
export async function generateMetadata(topic: Topic, beats: Beat[]): Promise<YouTubeMetadata> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const narrationText = beats.map((b) => b.text).join(" ");

  const systemPrompt = `You generate YouTube Shorts metadata for an alt-history channel.
The video is a faceless 30-40 second short asking "What if..." historical questions.

Constraints:
- title: max 95 chars, ends with " #shorts", catchy + curiosity-driven, no clickbait lies
- description: 2-4 short paragraphs (50-150 words total), ends with 5-8 hashtags
- tags: array of 8-12 strings, lowercase, mix of broad (history, shorts) + specific (titanic, what if)

Return ONLY valid JSON: { "title": "...", "description": "...", "tags": ["..."] }`;

  const userPrompt = `Topic: ${topic.title}
Premise: ${topic.premise}

Narration script (for context):
${narrationText}

Generate the metadata now.`;

  console.log(`[metadata] generating for "${topic.title}"...`);
  const t0 = Date.now();

  const res = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 1500,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  const cleaned = text.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();

  let meta: YouTubeMetadata;
  try {
    meta = JSON.parse(cleaned);
  } catch {
    throw new Error(`Claude returned unparseable JSON for metadata:\n${text.slice(0, 800)}`);
  }

  // Enforce constraints (Title length 95 char limit; tags lowercase)
  if (meta.title.length > 95) meta.title = meta.title.slice(0, 92) + "...";
  if (!meta.title.toLowerCase().includes("#shorts")) meta.title = meta.title.trim() + " #shorts";
  meta.tags = meta.tags.map((t) => t.toLowerCase().trim());

  console.log(
    `[metadata] ✅ in ${((Date.now() - t0) / 1000).toFixed(1)}s — title="${meta.title.slice(0, 60)}..."`
  );
  return meta;
}

// CLI usage: tsx pipeline/generate-metadata.ts (uses next topic)
if (import.meta.url === `file://${process.argv[1]}`) {
  const { pickNextTopic } = await import("./pick-topic.ts");
  const { generateScript } = await import("./generate-script.ts");
  const topic = await pickNextTopic();
  const beats = await generateScript(topic);
  const meta = await generateMetadata(topic, beats);
  console.log("\n=== Metadata ===");
  console.log(JSON.stringify(meta, null, 2));
}
