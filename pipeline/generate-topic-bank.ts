import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

/**
 * Generate N new alt-history topics via Claude Opus and APPEND to the existing
 * topic-bank.json. Skips any IDs that already exist.
 */

interface Topic {
  id: string;
  title: string;
  premise: string;
  category: string;
  era: string;
  visual_tone: string;
}

const ROOT = process.cwd();
const BANK_PATH = join(ROOT, "config", "topic-bank.json");

async function main() {
  const target = parseInt(process.argv[2] ?? "100", 10);

  const existing: Topic[] = JSON.parse(await readFile(BANK_PATH, "utf8"));
  const existingIds = new Set(existing.map((t) => t.id));
  const existingTitles = existing.map((t) => t.title).slice(0, 20).join(" | ");

  console.log(`[topic-gen] Existing: ${existing.length} topics. Target: +${target} new.`);

  const client = new Anthropic({
    apiKey: process.env.ANTHROPIC_API_KEY,
    timeout: 600_000, // 10 minutes — generating ~100 topics with prose takes a while
    maxRetries: 2,
  });

  const systemPrompt = `You generate alt-history "What if..." topics for a viral YouTube Shorts channel.
Each topic must:
- Have a real historical event/decision/person as the pivot
- Have a vivid alternate-reality premise that could fill 30 seconds of video
- Be visually distinct (different era, different aesthetic) from the existing bank

Output: JSON array of N topic objects.

Each object has:
  - id: kebab-case slug, unique
  - title: starts with "What if " ends with "?"
  - premise: 1-2 sentence alternate history premise (~25-40 words)
  - category: ONE of [war, disaster, leader, technology, empire, discovery, plague]
  - era: time period (e.g., "ancient", "1900s", "1980s", "medieval", "modern", "prehistoric")
  - visual_tone: 1-line cinematic visual description for the era's aesthetic

DIVERSITY: spread across categories and eras. Avoid clustering 10 topics in one era.

Return ONLY the JSON array. No commentary, no markdown fences.`;

  const userPrompt = `Generate ${target} brand-new alt-history topics for the channel.

AVOID these ${existing.length} existing topics (don't repeat the historical events):
${existing.map((t) => `- ${t.title}`).join("\n")}

Cover variety: ancient empires, medieval crusades, age of exploration, world wars, Cold War, space race, modern internet era, near-future hypotheticals, plagues across centuries, technological "what ifs", religious turning points, economic collapses prevented or worsened, scientific discoveries delayed or accelerated.

Some example great topic premises (style + format guide, don't copy):
  • "What if Genghis Khan converted to Islam?" — Mongol Islamic empire conquers all of Christendom
  • "What if the printing press was invented in China first?" — knowledge revolution starts 400 years early
  • "What if Cleopatra's son survived?" — Ptolemaic Egypt outlasts Rome

Return ONLY a valid JSON array of ${target} objects.`;

  console.log(`[topic-gen] Calling Claude Opus for ${target} topics...`);
  const t0 = Date.now();

  const res = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 16000,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const raw = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const cleaned = raw.replace(/^```(?:json)?\s*/i, "").replace(/\s*```\s*$/, "").trim();
  let newTopics: Topic[];
  try {
    newTopics = JSON.parse(cleaned);
  } catch (e) {
    throw new Error(`Claude returned unparseable JSON:\n${raw.slice(0, 800)}`);
  }

  console.log(
    `[topic-gen] ✅ Claude responded in ${((Date.now() - t0) / 1000).toFixed(0)}s — ${newTopics.length} topics generated.`
  );
  console.log(`[topic-gen] in/out tokens: ${res.usage.input_tokens}/${res.usage.output_tokens}`);

  // Dedupe by id
  const fresh = newTopics.filter((t) => {
    if (existingIds.has(t.id)) {
      console.warn(`  ⏭️  skipping duplicate id: ${t.id}`);
      return false;
    }
    return true;
  });

  const merged = [...existing, ...fresh];
  await writeFile(BANK_PATH, JSON.stringify(merged, null, 2));

  console.log(`[topic-gen] Bank now has ${merged.length} topics (+${fresh.length} new).`);
  console.log(`[topic-gen] Saved to ${BANK_PATH}`);

  // Show sample of new
  console.log(`\nSample of new topics:`);
  fresh.slice(0, 8).forEach((t) => console.log(`  • ${t.title}`));
  if (fresh.length > 8) console.log(`  ...and ${fresh.length - 8} more`);
}

main().catch((e) => {
  console.error("❌", e);
  process.exit(1);
});
