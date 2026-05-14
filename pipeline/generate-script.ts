import "dotenv/config";
import Anthropic from "@anthropic-ai/sdk";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { Topic } from "./pick-topic.ts";

export interface Beat {
  id: number;
  name: string;
  text: string;
  duration_seconds: number; // max scene cap (2). Build pipeline shrinks to actual audio length.
  prompt: string;
  /** Single most important word from `text` for caption emphasis (larger size + colored). */
  key_word?: string;
}

/**
 * Generate a 10-beat script via Claude Opus.
 * Each beat is at most 2 seconds (DISPLAY). Veo Lite generates 4s clips and
 * Remotion trims each Sequence down to (audio_duration + 0.05s), capped at 2s.
 *
 * Word budget: 3-5 words per beat (prefer 4), MAX 25 chars, NO commas.
 * At HeyGen speed=1.3 we get ~3 words/sec, so 4 words ≈ 1.4s of audio — fits 2s with margin.
 */
export async function generateScript(topic: Topic): Promise<Beat[]> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const systemPrompt = `You are a viral YouTube Shorts scriptwriter for an alternate-history channel.
Output a 10-beat script + visual prompts. Pacing is TELEGRAM-SHORT — each beat is a single hammer-strike phrase, max 2 seconds.

HeyGen TTS at speed=1.3 reads ~3 words/sec. A 2-second beat fits 3-5 short words ONLY.
Commas add 200ms pauses each and WILL push audio past 2s. Avoid them entirely.

WORD/CHAR RULES — STRICT (going over WILL audio-clip and break the flow):
  • 3-5 words per beat (PREFER 4)
  • MAX 25 characters per beat including spaces
  • NO COMMAS inside the spoken text
  • NO em-dashes, NO semicolons
  • Single-syllable words preferred: "ship" not "vessel", "die" not "perish", "burn" not "incinerate"
  • Use periods to separate ideas (periods are short)
  • Punchy active verbs, vivid nouns
  • Skip articles when you can: "Skies burn" not "The skies burn"

BEAT STRUCTURE (10 beats, telegram pacing):
  Beat 1 (HOOK): "What if..." question. 3-5 words. MUST feel urgent and high-stakes.
  Beat 2 (SETUP A): Brief context. 3-5 words.
  Beat 3 (SETUP B): The moment. 3-5 words.
  Beat 4 (PIVOT): The decision/change. 3-5 words.
  Beat 5 (IMMEDIATE): First effect. 3-5 words.
  Beat 6 (RIPPLE A): One ripple. 3-5 words.
  Beat 7 (RIPPLE B): Another ripple. 3-5 words.
  Beat 8 (ESCALATE): Deeper change. 3-5 words.
  Beat 9 (CLIMAX): New world. 3-5 words.
  Beat 10 (REVEAL → CTA): A DIRECT QUESTION TO THE VIEWER inviting comments. NOT a statement. 3-5 words.

CTA EXAMPLES for Beat 10 (use this style — comment-bait questions):
  "Would you trade your phone?" ← Rome topic
  "Best history hack ever?" ← any topic
  "Could you press the button?" ← moral choice
  "Who do you blame?" ← controversial twist
  "Worth the trade?" ← simple
NEVER end on a flat statement. ALWAYS end on a question that invites a comment.

KEY_WORD field:
  Per beat, identify the SINGLE most punchy word from the text for visual emphasis.
  This word will render LARGER + colored in the caption overlay.
  Choose nouns, numbers, or surprising verbs. Skip articles/prepositions.

  Examples:
    text: "What if Rome never fell?" → key_word: "Rome"
    text: "Aqueducts carry power." → key_word: "power"
    text: "1912 changed everything." → key_word: "1912"
    text: "Cities burn to ash." → key_word: "burn"

GOOD examples (fit in 2s comfortably):
  "What if Rome never fell?" (5w, 24c)
  "Aqueducts carry power." (3w, 22c)
  "Caesars rule the stars." (4w, 22c)
  "Cities burn to ash." (4w, 19c)
  "We froze in 1983." (4w, 17c)

BAD examples (will overflow 2s):
  "Aqueducts now carry power across worlds." (6w, 38c — too long)
  "Sarajevo June 1914." (3w but "Sarajevo" alone ≈1.3s of TTS + "nineteen fourteen" ≈1.3s = 2.6s)
  "Constantine's heirs crush every rival." (5w, 38c — too many chars)

DANGER WORDS (long TTS time even when short on paper):
  • Multi-syllable place names: Sarajevo, Tutankhamun, Mesopotamia, Constantinople, Petersburg, Babylon
  • Full year readings: "Nineteen twelve", "Eighteen sixty-five" — say "1912" minimally or skip the year
  • Long proper nouns: Hitler, Stalin, Roosevelt, Khrushchev, Bonaparte
  • Multi-syllable abstractions: civilization, philosophical, technological, devastation

If a beat MUST reference a long word, balance with very short surrounding words ("Rome falls", not "Constantinople falls").

VISUAL PROMPTS:
  • 30-50 words each, cinematic, vertical 9:16
  • Period-accurate to the era
  • Specify lighting (golden hour, blue moonlight, neon glow, candlelight, etc.)
  • Specify camera (close-up, dolly, wide, slow push, etc.)
  • Film grain / anamorphic for retro
  • Visual MUST match the beat's narration
  • AVOID: real political figures by name (Reagan, Putin, etc.) — use "leaders" / "officials" / silhouettes
  • AVOID: real-person likenesses, identifiable celebrities

Return ONLY a valid JSON array of 10 objects. No markdown fences. No commentary.

[
  {"id": 1, "name": "Hook", "text": "...", "key_word": "...", "duration_seconds": 2, "prompt": "..."},
  ...
  {"id": 10, "name": "Reveal", "text": "...", "key_word": "...", "duration_seconds": 2, "prompt": "..."}
]`;

  const userPrompt = `Topic: ${topic.title}

Premise: ${topic.premise}

Era: ${topic.era}
Category: ${topic.category}
Visual tone guidance: ${topic.visual_tone}

Generate 10 telegram-fast beats. STRICTLY 3-5 words each, no commas, max 25 chars.
No real political figures by name in the visual prompts.

Return ONLY the JSON array.`;

  console.log(`[script] generating 10×≤2s beats for "${topic.title}"...`);
  const t0 = Date.now();

  const res = await client.messages.create({
    model: "claude-opus-4-7",
    max_tokens: 3500,
    system: systemPrompt,
    messages: [{ role: "user", content: userPrompt }],
  });

  const text = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");

  const cleaned = text
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```\s*$/, "")
    .trim();

  let beats: Beat[];
  try {
    beats = JSON.parse(cleaned);
  } catch {
    throw new Error(`Claude returned unparseable JSON:\n${text.slice(0, 800)}`);
  }

  if (!Array.isArray(beats) || beats.length !== 10) {
    throw new Error(`Expected 10 beats, got ${(beats as unknown[])?.length ?? "non-array"}`);
  }

  for (const b of beats) {
    if (b.duration_seconds > 2) {
      throw new Error(`Beat ${b.id}: duration_seconds must be ≤2, got ${b.duration_seconds}`);
    }
    const wc = b.text.trim().split(/\s+/).length;
    const cc = b.text.length;
    const commas = (b.text.match(/,/g) ?? []).length;
    if (wc > 5) console.warn(`[script] ⚠️  Beat ${b.id} has ${wc} words (>5). Likely to clip.`);
    if (cc > 25) console.warn(`[script] ⚠️  Beat ${b.id} has ${cc} chars (>25). Likely to clip.`);
    if (commas > 0) console.warn(`[script] ⚠️  Beat ${b.id} has ${commas} comma(s). Each adds ~200ms pause.`);
    // Validate key_word actually appears in the beat text
    if (b.key_word) {
      const stripped = b.text.toLowerCase().replace(/[.,!?]/g, "");
      if (!stripped.split(/\s+/).some((w) => w === b.key_word!.toLowerCase())) {
        console.warn(
          `[script] ⚠️  Beat ${b.id} key_word "${b.key_word}" not found in text "${b.text}" — emphasis will fall back to last word.`
        );
      }
    }
  }

  console.log(
    `[script] ✅ generated in ${((Date.now() - t0) / 1000).toFixed(0)}s — ` +
      `in/out tokens: ${res.usage.input_tokens}/${res.usage.output_tokens}`
  );
  return beats;
}

/**
 * Rewrite a visual prompt after Veo refuses it (content moderation).
 */
export async function regenerateVisualPrompt(
  beatText: string,
  originalPrompt: string
): Promise<string> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const prompt = `Veo refused to generate this prompt (content moderation rejection).
Rewrite it to be safer while keeping the same visual concept, era, and cinematic feel.

REMOVE / REPLACE:
  • Names of real political figures (Reagan, Putin, Trump, Brezhnev, etc.) → generic "leaders", "officials", "men in suits"
  • Identifiable real people → abstract or fictional silhouettes
  • Specific religious imagery → generic spiritual symbols
  • Graphic violence → atmospheric aftermath (smoke, ash, empty streets)
  • Children in danger → empty objects (a forgotten toy, abandoned bike)
  • Specific brand names / logos → generic equivalents

KEEP:
  • Era and time period
  • Visual tone (cinematic, vertical 9:16, period accurate)
  • Lighting and camera direction
  • Length 30-50 words

The narration line this visual goes with: "${beatText}"

Original (rejected) prompt: "${originalPrompt}"

Return ONLY the rewritten visual prompt. No quotes. No commentary. No prefix.`;

  const res = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 250,
    messages: [{ role: "user", content: prompt }],
  });

  return res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .replace(/^["']|["']$/g, "");
}

/**
 * Validate that a tightenBeat / regenerate response is an actual narration line
 * (not a refusal, meta-comment, or apology).
 */
function looksLikeMetaCommentary(text: string): boolean {
  const lc = text.toLowerCase();
  // First-person pronouns are a strong signal — narration is third-person.
  if (/\b(i need|i can|i'm|i am|i cannot|i can't|i'll|i would|i should|i must)\b/i.test(text)) return true;
  if (/\bsorry|apolog|unfortunately|note that|please note|already|impossible|physically|cannot be\b/i.test(lc)) return true;
  // Multiple sentences spanning many chars = probably explanation, not punchy beat
  if (text.length > 60) return true;
  // Quoted original text within response (it's commenting on it)
  if (text.includes('"') && text.length > 25) return true;
  return false;
}

/**
 * Rewrite a single beat's text to fit within its scene duration.
 * Returns null if Claude couldn't produce a valid shorter line (caller should keep original).
 */
export async function tightenBeat(
  beat: Beat,
  actualDuration: number
): Promise<string | null> {
  const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

  const overflowBy = (actualDuration - beat.duration_seconds).toFixed(2);
  const currentWords = beat.text.trim().split(/\s+/).length;
  // ≈3 words/sec at speed=1.3; target 70% of capacity
  const targetMaxWords = Math.max(2, Math.floor(beat.duration_seconds * 3 * 0.7));
  const targetMaxChars = Math.max(15, beat.duration_seconds * 12);

  const prompt = `Rewrite a YouTube Shorts narration line so it fits inside a ${beat.duration_seconds}-second scene.
The current line "${beat.text}" produced ${actualDuration.toFixed(2)}s of TTS audio (${overflowBy}s overflow).

You MUST produce a NEW shorter sentence that conveys the SAME idea. You may completely rephrase or simplify — synonyms, restructure, drop specifics.

RULES:
  • MAX ${targetMaxWords} words (current is ${currentWords})
  • MAX ${targetMaxChars} characters
  • NO commas
  • NO em-dashes
  • Single-syllable words preferred
  • NEVER mention being unable / impossible / already short — just write a new line
  • NEVER respond in first person
  • NEVER explain — output is the new line and ONLY the new line

Beat role: ${beat.name}
Original meaning to preserve: "${beat.text}"

Output: just the new sentence. No quotes. No prefix.`;

  const res = await client.messages.create({
    model: "claude-haiku-4-5-20251001",
    max_tokens: 60,
    messages: [{ role: "user", content: prompt }],
  });

  const raw = res.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("")
    .trim()
    .replace(/^["']|["']$/g, "");

  if (looksLikeMetaCommentary(raw)) {
    console.warn(`[tightenBeat] Claude returned meta-commentary instead of a line; rejecting. Got: "${raw.slice(0, 100)}..."`);
    return null;
  }
  return raw;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const { loadTopics, pickNextTopic } = await import("./pick-topic.ts");
  const arg = process.argv[2] ?? "next";
  const outPath = process.argv[3] ?? join(process.cwd(), "config", "beats-generated.json");

  let topic;
  if (arg === "next") {
    topic = await pickNextTopic();
  } else {
    const all = await loadTopics();
    const match = all.find((t) => t.id === arg);
    if (!match) throw new Error(`No topic with id="${arg}" in topic-bank.json`);
    topic = match;
  }

  console.log(`[script] Topic: ${topic.title}`);
  const beats = await generateScript(topic);
  await writeFile(outPath, JSON.stringify(beats, null, 2));
  console.log(`[script] Saved to ${outPath}\n`);
  console.log("Generated beats:");
  for (const b of beats) {
    const wc = b.text.split(/\s+/).length;
    const cc = b.text.length;
    console.log(`  ${b.id}. ${b.text}  [${wc}w / ${cc}c]`);
  }
}
