import {
  AbsoluteFill,
  Easing,
  interpolate,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";

// ----- Cinematic texture: vignette + animated film grain (crisp SVG turbulence)
export const Texture: React.FC<{ grain?: number; vignette?: number }> = ({
  grain = 0.06,
  vignette = 0.55,
}) => {
  const frame = useCurrentFrame();
  // shift the turbulence seed slowly so the grain shimmers like film
  const seed = 1 + (frame % 8);
  return (
    <AbsoluteFill style={{ pointerEvents: "none" }}>
      <AbsoluteFill
        style={{
          background: `radial-gradient(120% 85% at 50% 42%, transparent 52%, rgba(0,0,0,${vignette}) 100%)`,
        }}
      />
      <svg width="100%" height="100%" style={{ opacity: grain, mixBlendMode: "soft-light" }}>
        <filter id="grain">
          <feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves={2} seed={seed} stitchTiles="stitch" />
        </filter>
        <rect width="100%" height="100%" filter="url(#grain)" />
      </svg>
    </AbsoluteFill>
  );
};

// ----- Animated gloss sweep that travels across its parent (premium shine)
export const ShineSweep: React.FC<{
  periodFrames?: number;
  delay?: number;
  width?: number;
  angle?: number;
}> = ({ periodFrames = 90, delay = 0, width = 38, angle = 20 }) => {
  const frame = useCurrentFrame();
  const t = ((frame - delay) % periodFrames) / periodFrames;
  const x = interpolate(t, [0, 1], [-130, 230]);
  return (
    <div
      style={{
        position: "absolute",
        inset: 0,
        overflow: "hidden",
        borderRadius: "inherit",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          position: "absolute",
          top: "-30%",
          bottom: "-30%",
          left: `${x}%`,
          width: `${width}%`,
          transform: `rotate(${angle}deg)`,
          background:
            "linear-gradient(90deg, transparent, rgba(255,255,255,0.55), transparent)",
          filter: "blur(2px)",
        }}
      />
    </div>
  );
};

// ----- Mask reveal: wipe content in behind a moving clip (text/badges)
export const useReveal = (startFrame = 0, duration = 18) => {
  const frame = useCurrentFrame();
  const p = interpolate(frame - startFrame, [0, duration], [0, 1], {
    extrapolateLeft: "clamp",
    extrapolateRight: "clamp",
    easing: Easing.bezier(0.16, 1, 0.3, 1), // expo-out: premium ease
  });
  return {
    progress: p,
    clipPath: `inset(0 ${(1 - p) * 100}% 0 0)`,
    opacity: interpolate(p, [0, 0.15, 1], [0, 1, 1]),
    translateY: interpolate(p, [0, 1], [22, 0]),
  };
};

// premium spring presets
export const SPRING = {
  snappy: { damping: 14, mass: 0.6, stiffness: 120 },
  smooth: { damping: 200, mass: 1, stiffness: 100 },
  pop: { damping: 11, mass: 0.5, stiffness: 140 },
  gentle: { damping: 18, mass: 0.9 },
};

export const useSafeArea = () => {
  const { height } = useVideoConfig();
  return { bottomPx: height * 0.12, topPx: height * 0.06 };
};
