import "dotenv/config";
import { narrate, type WordTimestamp } from "./narrate.ts";
import { join } from "node:path";

export interface BeatNarration {
  id: number;
  audioPath: string;
  words: WordTimestamp[];
  duration: number;
  /** Speed used for THIS beat (may differ from default for hook/reveal emphasis). */
  speed: number;
}

/**
 * Per-beat HeyGen TTS. Each beat can have its own speed for dynamic pacing —
 * Hook beats run hot, Reveal beats run cool.
 *
 * `speedForBeat` is a callback letting the caller decide speed by beat id/name.
 * Falls back to the global `defaultSpeed` when callback returns undefined.
 */
export async function narrateBeats(
  beats: { id: number; name?: string; text: string }[],
  beatsRoot: string,
  defaultSpeed = 1.0,
  speedForBeat?: (beat: { id: number; name?: string }) => number | undefined
): Promise<BeatNarration[]> {
  const tasks = beats.map(async (b) => {
    const speed = speedForBeat?.(b) ?? defaultSpeed;
    const outDir = join(beatsRoot, String(b.id));
    const result = await narrate(b.text, outDir, { speed });
    return {
      id: b.id,
      audioPath: result.audioPath,
      words: result.words,
      duration: result.duration,
      speed,
    };
  });
  return Promise.all(tasks);
}
