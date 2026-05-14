import React from "react";
import { Composition } from "remotion";
import { Short, shortSchema, DEFAULT_PROPS } from "./Short";

export const Root: React.FC = () => {
  return (
    <Composition
      id="Short"
      component={Short}
      schema={shortSchema}
      defaultProps={DEFAULT_PROPS}
      durationInFrames={DEFAULT_PROPS.durationFrames}
      fps={DEFAULT_PROPS.fps}
      width={1080}
      height={1920}
      calculateMetadata={({ props }) => ({
        durationInFrames: props.durationFrames,
        fps: props.fps,
      })}
    />
  );
};
