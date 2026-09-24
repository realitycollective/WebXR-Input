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
