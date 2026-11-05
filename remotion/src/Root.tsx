import React from "react";
import { Composition } from "remotion";
import { LabAd, LabStill, calculateLabMetadata, LAB_DEMO_9X16, LAB_DEMO_4X5 } from "./lab/LabAd";

// creative-lab render engine: generic JSON-driven ad. Props = a Lab EDL v1 (see ../ARCHITECTURE.md §4.2).
// Size / fps / duration come from the EDL. Render with tools/render-lab.mjs.
export const RemotionRoot: React.FC = () => (
  <>
    <Composition id="lab-ad" component={LabAd} calculateMetadata={calculateLabMetadata} defaultProps={LAB_DEMO_9X16} />
    <Composition id="lab-still" component={LabStill} calculateMetadata={calculateLabMetadata} defaultProps={LAB_DEMO_4X5} />
  </>
);
