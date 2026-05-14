import { Config } from "@remotion/cli/config";

// Default publicDir is ./public/ — we copy current render's audio there
// before each render (handled by pipeline/build-mvp.ts).

Config.setVideoImageFormat("jpeg");
Config.setOverwriteOutput(true);
Config.setChromiumOpenGlRenderer("angle");
