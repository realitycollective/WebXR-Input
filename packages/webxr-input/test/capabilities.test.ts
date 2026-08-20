import { describe, expect, it } from "vitest";
import {
  NO_CAPABILITIES,
  satisfies,
  unmetRequirements,
  type InputCapabilities,
} from "@realitycollective/webxr-input";

const FULL: InputCapabilities = {
  rays: true,
  pokes: true,
  grabs: "native",
  handJoints: true,
  pinch: true,
  buttonsAxes: true,
  gaze: true,
  pointer2d: true,
  headPose: true,
  haptics: true,
};

describe("satisfies", () => {
  it("plain boolean requirements map directly", () => {
    expect(satisfies(FULL, "rays")).toBe(true);
    expect(satisfies(NO_CAPABILITIES, "rays")).toBe(false);
    expect(satisfies(NO_CAPABILITIES, "haptics")).toBe(false);
  });

  it("grabs is satisfied by poseOnly or native", () => {
    expect(satisfies({ ...FULL, grabs: "poseOnly" }, "grabs")).toBe(true);
    expect(satisfies({ ...FULL, grabs: "native" }, "grabs")).toBe(true);
    expect(satisfies({ ...FULL, grabs: "none" }, "grabs")).toBe(false);
  });

  it("grabsNative requires native fulfilment", () => {
    expect(satisfies({ ...FULL, grabs: "poseOnly" }, "grabsNative")).toBe(false);
    expect(satisfies({ ...FULL, grabs: "native" }, "grabsNative")).toBe(true);
  });
});

describe("unmetRequirements", () => {
  it("returns the missing subset in order", () => {
    expect(
      unmetRequirements(NO_CAPABILITIES, ["rays", "pokes", "grabs"]),
    ).toEqual(["rays", "pokes", "grabs"]);
    expect(unmetRequirements(FULL, ["rays", "grabsNative"])).toEqual([]);
  });
});
