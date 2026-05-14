import React from "react";
import {
  AbsoluteFill,
  Audio,
  OffthreadVideo,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
  interpolate,
} from "remotion";
import { z } from "zod";
import { CaptionsOverlay } from "./components/CaptionsOverlay";
import { loadFont as loadInter } from "@remotion/google-fonts/Inter";

const { fontFamily: interFontFamily } = loadInter();

export const wordSchema = z.object({
  word: z.string(),
  start: z.number(),
  end: z.number(),
});

export const beatSchema = z.object({
  id: z.number(),
  name: z.string(),
  text: z.string(),
  duration_seconds: z.number(),
  audioFile: z.string(),
  videoFile: z.string(),
  words: z.array(wordSchema),
  audioDuration: z.number(),
  key_word: z.string().optional(),
});

export const shortSchema = z.object({
  beats: z.array(beatSchema),
  musicFile: z.string().nullable().optional(),
  musicVolume: z.number().optional(),
  /** Optional SFX files — auto-detected from public/ by build script. */
  whooshFile: z.string().nullable().optional(),
  bassDropFile: z.string().nullable().optional(),
  fps: z.number(),
  durationFrames: z.number(),
  totalSeconds: z.number().optional(),
});

export type ShortProps = z.infer<typeof shortSchema>;
export type Beat = z.infer<typeof beatSchema>;

export const DEFAULT_PROPS: ShortProps = {
  beats: [],
  musicFile: null,
  musicVolume: 0.08,
  whooshFile: null,
  bassDropFile: null,
  fps: 30,
  durationFrames: 90,
  totalSeconds: 3,
};

const TRANSITION_FRAMES = 2; // 2-frame black flash between beats (~67ms @ 30fps)
const END_SCREEN_SECONDS = 1.5; // last 1.5s shows CTA overlay
const CTA_TEXT = "Comment your answer below";

/**
 * Music volume profile: ducked during dialog, swelling at climax (beats 9-10).
 * Returns a volume value [0, 1] for a given absolute frame.
 */
function makeMusicVolume(
  totalFrames: number,
  swellStartFrame: number,
  baseVolume: number,
  peakVolume: number
) {
  return (frame: number) => {
    if (frame < swellStartFrame) return baseVolume;
    // Smoothly ramp from base to peak over the swell region
    return interpolate(frame, [swellStartFrame, totalFrames], [baseVolume, peakVolume], {
      extrapolateLeft: "clamp",
      extrapolateRight: "clamp",
    });
  };
}

/** End-screen overlay: appears in the last END_SCREEN_SECONDS of the video. */
const EndScreenOverlay: React.FC<{ totalSeconds: number }> = ({ totalSeconds }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();
  const t = frame / fps;
  const start = totalSeconds - END_SCREEN_SECONDS;
  if (t < start) return null;

  const local = t - start;
  const opacity = interpolate(local, [0, 0.3], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });
  const translateY = interpolate(local, [0, 0.3], [30, 0], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
  });

  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        bottom: "11%", // above YouTube Shorts UI band
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
        opacity,
        transform: `translateY(${translateY}px)`,
      }}
    >
      <div
        style={{
          fontFamily: interFontFamily,
          fontSize: 56,
          fontWeight: 900,
          color: "#FFF",
          background: "rgba(0, 0, 0, 0.65)",
          padding: "18px 32px",
          borderRadius: 16,
          border: "3px solid #FFD60A",
          textTransform: "uppercase",
          letterSpacing: "0.04em",
          boxShadow: "0 8px 24px rgba(0,0,0,0.6)",
          textAlign: "center",
        }}
      >
        {CTA_TEXT}
        <div style={{ fontSize: 64, marginTop: 4 }}>↓</div>
      </div>
    </div>
  );
};

export const Short: React.FC<ShortProps> = ({
  beats,
  musicFile,
  musicVolume = 0.08,
  whooshFile,
  bassDropFile,
  fps,
  durationFrames,
  totalSeconds = 0,
}) => {
  let cumulativeFrames = 0;
  const beatStartFrames: number[] = []; // for SFX placement

  // Music: 8% base, swell to 25% over beats 9+10 (last 25% of video)
  const swellStartFrame = Math.floor(durationFrames * 0.75);
  const musicVol = makeMusicVolume(durationFrames, swellStartFrame, musicVolume, 0.25);

  return (
    <AbsoluteFill style={{ backgroundColor: "#000" }}>
      {/* Per-beat sequences */}
      {beats.map((beat, idx) => {
        const fromFrame = cumulativeFrames;
        const durationInFrames = Math.max(1, Math.round(beat.duration_seconds * fps));
        beatStartFrames.push(fromFrame);
        cumulativeFrames += durationInFrames;

        return (
          <Sequence key={beat.id} from={fromFrame} durationInFrames={durationInFrames}>
            <AbsoluteFill>
              <OffthreadVideo
                src={staticFile(beat.videoFile)}
                muted
                style={{ width: "100%", height: "100%", objectFit: "cover" }}
              />
              <Audio src={staticFile(beat.audioFile)} />
              <CaptionsOverlay words={beat.words} keyWord={beat.key_word} />
            </AbsoluteFill>

            {/* Black flash transition at the END of every beat (except the last) */}
            {idx < beats.length - 1 && (
              <Sequence from={durationInFrames - TRANSITION_FRAMES} durationInFrames={TRANSITION_FRAMES}>
                <AbsoluteFill style={{ backgroundColor: "#000" }} />
              </Sequence>
            )}
          </Sequence>
        );
      })}

      {/* Top-level dark vignette for caption legibility */}
      <AbsoluteFill
        style={{
          background:
            "linear-gradient(180deg, rgba(0,0,0,0.45) 0%, rgba(0,0,0,0) 25%, rgba(0,0,0,0) 70%, rgba(0,0,0,0.55) 100%)",
          pointerEvents: "none",
        }}
      />

      {/* Whoosh SFX at the start of every beat after the first */}
      {whooshFile
        ? beatStartFrames.slice(1).map((startFrame, i) => (
            <Sequence key={`whoosh-${i}`} from={Math.max(0, startFrame - 3)} durationInFrames={20}>
              <Audio src={staticFile(whooshFile)} volume={0.6} />
            </Sequence>
          ))
        : null}

      {/* Bass drop at the start of the final beat (the reveal/CTA) */}
      {bassDropFile && beatStartFrames.length >= 1 ? (
        <Sequence
          from={Math.max(0, beatStartFrames[beatStartFrames.length - 1])}
          durationInFrames={Math.min(45, durationFrames - beatStartFrames[beatStartFrames.length - 1])}
        >
          <Audio src={staticFile(bassDropFile)} volume={0.85} />
        </Sequence>
      ) : null}

      {/* Background music with ducked-during-dialog → swell-on-climax volume profile */}
      {musicFile ? <Audio src={staticFile(musicFile)} volume={musicVol} /> : null}

      {/* End-screen CTA overlay (last END_SCREEN_SECONDS) */}
      {totalSeconds > 0 ? <EndScreenOverlay totalSeconds={totalSeconds} /> : null}
    </AbsoluteFill>
  );
};
