import { describe, expect, it } from "vitest";
import {
  MemoryInputProvider,
  inputProviderContractCases,
  type InputCapabilities,
} from "@realitycollective/webxr-input";

describe("MemoryInputProvider against inputProviderContractCases", () => {
  it.each(inputProviderContractCases().map((entry) => [entry.name, entry] as const))(
    "%s",
    (_name, contractCase) => {
      const provider = new MemoryInputProvider();
      contractCase.run(provider, {
        enterSession: () => provider.enterSession(),
        exitSession: () => provider.exitSession(),
      });
    },
  );
});

describe("MemoryInputProvider", () => {
  it("re-publishes its capabilities on each session hook until unsubscribed", () => {
    const provider = new MemoryInputProvider();
    const seen: InputCapabilities[] = [];
    const off = provider.onCapabilitiesChanged((capabilities) => seen.push(capabilities));

    provider.enterSession();
    provider.exitSession();
    off();
    provider.enterSession();

    expect(seen).toEqual([provider.getCapabilities(), provider.getCapabilities()]);
  });

  it("hands over a copy of its capabilities, so a caller cannot change them", () => {
    const provider = new MemoryInputProvider();
    const capabilities = provider.getCapabilities();
    capabilities.rays = false;

    expect(provider.getCapabilities().rays).toBe(true);
  });

  it("returns fresh snapshots on every sample", () => {
    const provider = new MemoryInputProvider();
    const [first] = provider.sample();
    const [again] = provider.sample();

    expect(first).toEqual(again);
    expect(first).not.toBe(again);
    expect(first?.ray).toEqual({ origin: [0, 1.4, 0], direction: [0, 0, -1] });
  });

  it("reports a standing head pose and accepts every pulse", () => {
    const provider = new MemoryInputProvider();

    expect(provider.getHeadPose()).toEqual({ position: [0, 1.6, 0], quaternion: [0, 0, 0, 1] });
    expect(provider.pulse("left-hand", 0.5, 20)).toBe(true);
  });

  it("records presence visibility per side, for both sides, and leaves it alone for none", () => {
    const provider = new MemoryInputProvider();

    expect(provider.setPresenceVisible("left", false)).toBe(true);
    expect([provider.isPresenceVisible("left"), provider.isPresenceVisible("right")]).toEqual([false, true]);

    expect(provider.setPresenceVisible("all", false)).toBe(true);
    expect([provider.isPresenceVisible("left"), provider.isPresenceVisible("right")]).toEqual([false, false]);

    expect(provider.setPresenceVisible("none", true)).toBe(true);
    expect([provider.isPresenceVisible("left"), provider.isPresenceVisible("right")]).toEqual([false, false]);
  });

  it("records the presence modality", () => {
    const provider = new MemoryInputProvider();

    expect(provider.getPresenceModality()).toBe("auto");
    expect(provider.setPresenceModality("controllers")).toBe(true);
    expect(provider.getPresenceModality()).toBe("controllers");
  });

  it("detaches a sources listener", () => {
    const provider = new MemoryInputProvider();
    const off = provider.onSourcesChanged(() => undefined);

    expect(() => off()).not.toThrow();
  });
});

describe("MemoryInputProvider with eye gaze", () => {
  it("passes every contract case, owning far targeting and selecting through a pinch", () => {
    const provider = new MemoryInputProvider({ eyeGaze: true });
    const driver = { enterSession: () => provider.enterSession(), exitSession: () => provider.exitSession() };
    expect(provider.getCapabilities().eyeGaze).toBe(true);
    for (const contractCase of inputProviderContractCases()) contractCase.run(provider, driver);
    // No hand carries a far ray, and the gaze snapshot is there with a ray.
    let sources = provider.sample();
    expect(sources.filter((s) => s.kind === "hand").every((s) => s.ray === undefined)).toBe(true);
    expect(sources.find((s) => s.kind === "gaze")?.ray).toBeDefined();
    // A pinch on the left hand owns the selection and carries its selector pose.
    provider.pinch("left", 1);
    sources = provider.sample();
    const gaze = sources.find((s) => s.kind === "gaze")!;
    expect(gaze.handedness).toBe("left");
    expect(gaze.select).toBe(1);
    expect(gaze.selectorPose).toBeDefined();
    // A blink: the gaze snapshot loses its ray but the hold continues.
    provider.setGazePose(null);
    const blink = provider.sample().find((s) => s.kind === "gaze")!;
    expect(blink.handedness).toBe("left");
    expect(blink.ray).toBeUndefined();
    provider.setGazePose({ position: [0, 1.6, 0], quaternion: [0, 0, 0, 1] });
    // The suite's session cycle ends the session, which forgets the hold.
    for (const contractCase of inputProviderContractCases()) contractCase.run(provider, driver);
    expect(provider.sample().find((s) => s.kind === "gaze")?.handedness).toBe("none");
  });

  it("reports no eye gaze by default", () => {
    const provider = new MemoryInputProvider();
    expect(provider.getCapabilities().eyeGaze).toBe(false);
    expect(provider.sample().some((s) => s.kind === "gaze")).toBe(false);
  });
});
