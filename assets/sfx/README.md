# SFX folder

The pipeline auto-detects SFX files in this folder and adds them to the rendered video. **Drop files here; they'll be used on the next render.**

## Required filenames

- `whoosh.*` — short transition swoosh played at each beat cut (~0.3-0.6s)
- `bass-drop.*` — heavy thump played at the start of the final beat (the reveal/CTA, ~1-2s)

Extension can be `.mp3`, `.wav`, `.m4a`, or `.aac`. The first matching file wins.

## Where to download (free, no signup required)

### Pixabay Sound Effects (recommended — direct download)
- Whoosh search: https://pixabay.com/sound-effects/search/whoosh/
- Bass drop search: https://pixabay.com/sound-effects/search/bass-drop/
- Each result page has a green Download button → free MP3, no signup

### Mixkit (also great, no signup)
- https://mixkit.co/free-sound-effects/whoosh/
- https://mixkit.co/free-sound-effects/transition/

### YouTube Audio Library (requires Google login)
- https://studio.youtube.com → Audio Library → Sound Effects

## Pick guidance

- **Whoosh**: short and crisp. 0.3-0.6 seconds. Avoid epic 2-second whooshes — they'll bleed across beats.
- **Bass drop**: deep low-frequency punch. Ideally with a small reverb tail. Used once at the climax/CTA.

## After dropping files

Just re-render: `npm run remotion:render` (uses cached audio/video, only re-renders the video composition).

No daily run needed — SFX integrate at render time.
