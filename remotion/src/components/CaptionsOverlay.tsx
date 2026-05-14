import React, { useMemo } from "react";
import { useCurrentFrame, useVideoConfig, interpolate, spring } from "remotion";
import { loadFont } from "@remotion/google-fonts/Anton";

const { fontFamily } = loadFont();

interface Word {
  word: string;
  start: number;
  end: number;
}

interface Chunk {
  text: string;
  words: Word[];
  start: number;
  end: number;
}

interface Props {
  words: Word[];
  /** Optional key word from the beat — rendered larger + accented if it appears in active chunk. */
  keyWord?: string;
}

const MAX_WORDS_PER_CHUNK = 3;
const HIGHLIGHT_COLOR = "#FFD60A"; // viral yellow for active word
const KEY_WORD_COLOR = "#FF3B30"; // bright red for emphasis word

function groupIntoChunks(words: Word[]): Chunk[] {
  const chunks: Chunk[] = [];
  let current: Word[] = [];

  const flush = () => {
    if (!current.length) return;
    chunks.push({
      text: current.map((w) => w.word).join(" "),
      words: current,
      start: current[0].start,
      end: current[current.length - 1].end,
    });
    current = [];
  };

  for (const w of words) {
    current.push(w);
    const endsWithStrongPunct = /[.!?]$/.test(w.word);
    const endsWithSoftPunct = /[,;:]$/.test(w.word);
    if (endsWithStrongPunct || current.length >= MAX_WORDS_PER_CHUNK || endsWithSoftPunct) {
      flush();
    }
  }
  flush();

  for (let i = 0; i < chunks.length - 1; i++) {
    chunks[i].end = chunks[i + 1].start;
  }
  return chunks;
}

function isKeyWord(word: string, keyWord?: string): boolean {
  if (!keyWord) return false;
  const stripped = (s: string) => s.toLowerCase().replace(/[.,!?'":;]/g, "");
  return stripped(word) === stripped(keyWord);
}

export const CaptionsOverlay: React.FC<Props> = ({ words, keyWord }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;

  const chunks = useMemo(() => groupIntoChunks(words), [words]);
  const active = chunks.find((c) => t >= c.start && t < c.end);
  if (!active) return null;

  const chunkLocalFrame = Math.max(0, frame - Math.floor(active.start * fps));
  const popIn = spring({
    frame: chunkLocalFrame,
    fps,
    config: { damping: 10, stiffness: 220, mass: 0.55 },
  });
  const scale = interpolate(popIn, [0, 1], [0.7, 1]);
  const opacity = interpolate(popIn, [0, 1], [0, 1]);
  const rotate = interpolate(popIn, [0, 0.6, 1], [-2.5, 1.5, 0]);

  return (
    <div
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        paddingTop: "8%",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          maxWidth: "88%",
          textAlign: "center",
          opacity,
          transform: `scale(${scale}) rotate(${rotate}deg)`,
        }}
      >
        <div
          style={{
            fontFamily,
            fontSize: 138,
            fontWeight: 400,
            lineHeight: 1.0,
            letterSpacing: "0.01em",
            textTransform: "uppercase",
            color: "#FFFFFF",
            textShadow: [
              "0 0 1px #000",
              "3px 3px 0 #000",
              "-3px -3px 0 #000",
              "3px -3px 0 #000",
              "-3px 3px 0 #000",
              "0 8px 24px rgba(0,0,0,0.95)",
              "0 0 32px rgba(255,214,10,0.18)",
            ].join(", "),
            WebkitTextStroke: "10px #000",
            paintOrder: "stroke fill" as React.CSSProperties["paintOrder"],
          }}
        >
          {active.words.map((w, i) => {
            const isActive = t >= w.start && t < w.end;
            const isKey = isKeyWord(w.word, keyWord);
            const color = isKey
              ? KEY_WORD_COLOR
              : isActive
              ? HIGHLIGHT_COLOR
              : "#FFFFFF";
            const sizeScale = isKey ? 1.35 : isActive ? 1.08 : 1.0;
            const translateY = isActive ? -6 : isKey ? -10 : 0;
            return (
              <span
                key={i}
                style={{
                  display: "inline-block",
                  margin: "0 0.18em",
                  color,
                  fontSize: `${100 * sizeScale}%`,
                  transform: `translateY(${translateY}px) scale(${isActive || isKey ? 1.0 : 1.0})`,
                }}
              >
                {w.word}
              </span>
            );
          })}
        </div>
      </div>
    </div>
  );
};
