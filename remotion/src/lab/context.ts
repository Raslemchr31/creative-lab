import { createContext, useContext } from "react";
import { Easing, interpolate, spring } from "remotion";
import { SPRING } from "../sirine/primitives";
import type { NEdl } from "./normalize";

export const EdlContext = createContext<NEdl | null>(null);
export const useEdl = (): NEdl => {
  const e = useContext(EdlContext);
  if (!e) throw new Error("lab: component rendered outside <LabAd>");
  return e;
};

/** true inside `lab-still`: every element that is on at this frame is shown fully settled. */
export const StillContext = createContext(false);
export const useStill = () => useContext(StillContext);

export const clamp = { extrapolateLeft: "clamp" as const, extrapolateRight: "clamp" as const };
export const ease = Easing.inOut(Easing.cubic);
/** eased 0→1 progress of f across [a, b] */
export const prog = (f: number, a: number, b: number, e: (x: number) => number = ease) =>
  b <= a ? (f >= a ? 1 : 0) : e(interpolate(f, [a, b], [0, 1], clamp));
/** 0→1→0 over [a, b] */
export const bell = (f: number, a: number, b: number) => (b <= a ? 0 : Math.sin(Math.PI * interpolate(f, [a, b], [0, 1], clamp)));
/** house entrance: gentle spring, no overshoot worth seeing */
export const rise = (f: number, fps: number, at: number, dur = 18) => spring({ frame: f - at, fps, config: SPRING.gentle, durationInFrames: dur });

/**
 * Where an incoming picture STARTS, as a unit offset (× W, × H). `dir` is the direction it travels:
 * "L" moves left, so it starts at +1 (off the right edge); the outgoing picture leaves towards -1.
 */
export const travel = (dir: "L" | "R" | "U" | "D"): [number, number] =>
  dir === "L" ? [1, 0] : dir === "R" ? [-1, 0] : dir === "U" ? [0, 1] : [0, -1];
