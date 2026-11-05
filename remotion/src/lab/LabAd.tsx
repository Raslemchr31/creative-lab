import React, { useEffect, useMemo, useRef, useState } from "react";
import { AbsoluteFill, Audio, cancelRender, continueRender, delayRender, interpolate, Sequence, staticFile } from "remotion";
import { cairo, waitUntilDone } from "../sirine/font";
import { clamp, EdlContext, StillContext } from "./context";
import { EndCard } from "./endcard";
import { normalizeEdl } from "./normalize";
import { Rail } from "./rail";
import { SegmentPicture } from "./segment";
import { SegmentTexts } from "./texts";
import type { LabEdl } from "./types";

export { calculateLabMetadata } from "./normalize";
export { LAB_DEMO_4X5, LAB_DEMO_9X16 } from "./demo";

// ─────────────────────────────────────────────────────────────────────────────
// LAB AD — one generic, JSON-driven SIRINE ad. The props ARE a Lab EDL v1
// (creative-lab ARCHITECTURE.md §4.2); `calculateLabMetadata` takes width / height /
// fps / durationInFrames from them. z-order: segment pictures (in `from` order, later
// on top) → all texts → offer rail → end card. Audio = optional bed only.
// Nothing renders until Cairo (arabic + latin subsets) is loaded — text is measured
// with it — and a font failure fails the render instead of shipping a fallback face.
// ─────────────────────────────────────────────────────────────────────────────

const useCairo = (): boolean => {
  const handle = useRef<number | null>(null);
  if (handle.current === null) handle.current = delayRender("lab: loading Cairo (arabic + latin)");
  const [ready, setReady] = useState(false);
  useEffect(() => {
    let alive = true;
    waitUntilDone()
      .then(() => {
        if (alive) setReady(true);
      })
      .catch((err: unknown) => cancelRender(new Error(`lab: Cairo font failed to load (renders need network for fonts.gstatic.com): ${String(err)}`)));
    return () => {
      alive = false;
    };
  }, []);
  useEffect(() => {
    if (ready && handle.current !== null) {
      continueRender(handle.current);
      handle.current = -1;
    }
  }, [ready]);
  useEffect(
    () => () => {
      if (handle.current !== null && handle.current !== -1) continueRender(handle.current);
    },
    [],
  );
  return ready;
};

const LabRoot: React.FC<{ raw: LabEdl; still: boolean }> = ({ raw, still }) => {
  const edl = useMemo(() => normalizeEdl(raw), [raw]);
  const ready = useCairo();
  const audio = edl.audio;
  return (
    <AbsoluteFill style={{ backgroundColor: edl.theme.ink }}>
      {ready ? (
        <EdlContext.Provider value={edl}>
          <StillContext.Provider value={still}>
            <div lang={edl.lang} dir={edl.dir} style={{ position: "absolute", inset: 0, direction: edl.dir, fontFamily: cairo }}>
              {edl.segments.map((s) => (
                <Sequence key={`p-${s.index}`} from={s.from} durationInFrames={s.life} name={`picture ${s.id}`}>
                  <SegmentPicture seg={s} />
                </Sequence>
              ))}
              {edl.segments
                .filter((s) => s.texts.length > 0)
                .map((s) => (
                  <Sequence key={`t-${s.index}`} from={s.from} durationInFrames={Math.min(s.frames, edl.duration - s.from)} name={`texts ${s.id}`}>
                    <SegmentTexts seg={s} />
                  </Sequence>
                ))}
              {edl.rail && edl.rail.to > edl.rail.from ? (
                <Sequence from={edl.rail.from} durationInFrames={edl.rail.to - edl.rail.from} name="offer rail">
                  <Rail />
                </Sequence>
              ) : null}
              {edl.endCard && edl.endCard.from < edl.duration ? (
                <Sequence from={edl.endCard.from} durationInFrames={Math.min(edl.endCard.frames, edl.duration - edl.endCard.from)} name="end card">
                  <EndCard />
                </Sequence>
              ) : null}
            </div>
            {audio && !still ? (
              <Audio
                src={staticFile(audio.src)}
                volume={(f) =>
                  audio.volume * (audio.fadeOutFrames > 1 ? interpolate(f, [edl.duration - audio.fadeOutFrames, edl.duration - 1], [1, 0], clamp) : 1)
                }
              />
            ) : null}
          </StillContext.Provider>
        </EdlContext.Provider>
      ) : null}
    </AbsoluteFill>
  );
};

/** `lab-ad` — the video. */
export const LabAd: React.FC<LabEdl> = (props) => <LabRoot raw={props} still={false} />;
/** `lab-still` — the same component; every element on at the chosen frame is shown settled. */
export const LabStill: React.FC<LabEdl> = (props) => <LabRoot raw={props} still />;
