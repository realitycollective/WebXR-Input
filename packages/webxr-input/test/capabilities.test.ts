import { describe, expect, it } from "vitest";
import {
  INPUT_CAPABILITY_REQUIREMENTS,
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
  presence: true,
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

describe("INPUT_CAPABILITY_REQUIREMENTS", () => {
  it("covers every capability, with grabs represented twice", () => {
    for (const key of Object.keys(NO_CAPABILITIES)) {
      const expected = key === "grabs" ? ["grabs", "grabsNative"] : [key];
      for (const requirement of expected) {
        expect(
          INPUT_CAPABILITY_REQUIREMENTS.includes(
            requirement as (typeof INPUT_CAPABILITY_REQUIREMENTS)[number],
          ),
          `capability "${key}" has no requirement "${requirement}"`,
        ).toBe(true);
      }
    }
  });

  it("declares no requirement without a capability behind it", () => {
    for (const requirement of INPUT_CAPABILITY_REQUIREMENTS) {
      if (requirement === "grabsNative") continue;
      expect(
        Object.hasOwn(NO_CAPABILITIES, requirement),
        `requirement "${requirement}" is not a capability`,
      ).toBe(true);
    }
  });

  it("lists each requirement once", () => {
    expect(new Set(INPUT_CAPABILITY_REQUIREMENTS).size).toBe(
      INPUT_CAPABILITY_REQUIREMENTS.length,
    );
  });

  it("satisfies every requirement from a fully capable provider", () => {
    expect(unmetRequirements(FULL, INPUT_CAPABILITY_REQUIREMENTS)).toEqual([]);
    expect(unmetRequirements(NO_CAPABILITIES, INPUT_CAPABILITY_REQUIREMENTS)).toEqual([
      ...INPUT_CAPABILITY_REQUIREMENTS,
    ]);
  });
});
