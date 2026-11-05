import { loadFont } from "@remotion/google-fonts/Cairo";

// Cairo supports Arabic + Latin. Must request the "arabic" subset or DZ
// glyphs render as boxes. waitUntilDone() gates the first render frame.
export const { fontFamily: cairo, waitUntilDone } = loadFont("normal", {
  weights: ["400", "600", "700", "900"],
  subsets: ["arabic", "latin"],
});
