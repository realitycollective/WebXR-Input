import { describe, expect, it } from "vitest";
import {
  NO_CAPABILITIES,
  inputProviderContractCases,
  type InputCapabilities,
  type InputProvider,
  type InputProviderContractCase,
  type InputProviderContractDriver,
  type InputSourceSnapshot,
  type Unsubscribe,
} from "@realitycollective/webxr-input";

const SNAPSHOT: InputSourceSnapshot = {
  id: "left-hand",
  kind: "hand",
  handedness: "left",
  select: 0.5,
  squeeze: 0,
};

const FULL_CAPABILITIES: InputCapabilities = {
  ...NO_CAPABILITIES,
  rays: true,
  haptics: true,
  presence: true,
};

/** A provider that meets the contract, with every optional method present. */
function conforming(): InputProvider {
  return {
    getCapabilities: () => FULL_CAPABILITIES,
    onCapabilitiesChanged: () => () => undefined,
    onSourcesChanged: () => () => undefined,
    sample: () => [SNAPSHOT],
    pulse: () => true,
    setPresenceVisible: () => true,
    setPresenceModality: () => true,
  };
}

/** The conforming provider with one member swapped for a broken one. */
function broken(parts: Record<string, unknown>): InputProvider {
  return { ...conforming(), ...parts } as unknown as InputProvider;
}

function providerWithSnapshot(snapshot: Record<string, unknown>): InputProvider {
  return broken({ sample: () => [snapshot] });
}

function contractCase(fragment: string): InputProviderContractCase {
  const found = inputProviderContractCases().find((entry) =>
    entry.name.includes(fragment),
  );
  if (!found) throw new Error(`no contract case matching "${fragment}"`);
  return found;
}

describe("inputProviderContractCases", () => {
  it("names every case", () => {
    const cases = inputProviderContractCases();
    expect(cases.length).toBeGreaterThan(0);
    for (const entry of cases) {
      expect(entry.name.length).toBeGreaterThan(0);
      expect(typeof entry.run).toBe("function");
    }
  });

  it("passes a conforming provider, with and without a driver", () => {
    const driver: InputProviderContractDriver = {
      enterSession: () => undefined,
      exitSession: () => undefined,
    };
    for (const entry of inputProviderContractCases()) {
      expect(() => entry.run(conforming())).not.toThrow();
      expect(() => entry.run(conforming(), driver)).not.toThrow();
    }
  });
});

describe("the capability-keys case", () => {
  const capabilityKeys = contractCase("getCapabilities");

  it("passes the capability-free default", () => {
    expect(() =>
      capabilityKeys.run(broken({ getCapabilities: () => NO_CAPABILITIES })),
    ).not.toThrow();
  });

  it("rejects an extra key", () => {
    const provider = broken({
      getCapabilities: () => ({ ...FULL_CAPABILITIES, teleport: true }),
    });
    expect(() => capabilityKeys.run(provider)).toThrow(/must return exactly/);
  });

  it("rejects a missing key", () => {
    const { presence: _presence, ...rest } = FULL_CAPABILITIES;
    const provider = broken({ getCapabilities: () => rest });
    expect(() => capabilityKeys.run(provider)).toThrow(/must return exactly/);
  });

  it("rejects a renamed key", () => {
    const { haptics: _haptics, ...rest } = FULL_CAPABILITIES;
    const provider = broken({
      getCapabilities: () => ({ ...rest, haptic: true }),
    });
    expect(() => capabilityKeys.run(provider)).toThrow(/must return exactly/);
  });
});

describe("the snapshot case", () => {
  const snapshots = contractCase("sample returns");

  it("passes an empty sample", () => {
    expect(() => snapshots.run(broken({ sample: () => [] }))).not.toThrow();
  });

  it("rejects a sample that is not an array", () => {
    expect(() => snapshots.run(broken({ sample: () => undefined }))).toThrow(
      /must return an array/,
    );
  });

  it("rejects a missing or empty id", () => {
    expect(() =>
      snapshots.run(providerWithSnapshot({ ...SNAPSHOT, id: 7 })),
    ).toThrow(/non-empty string id/);
    expect(() =>
      snapshots.run(providerWithSnapshot({ ...SNAPSHOT, id: "" })),
    ).toThrow(/non-empty string id/);
  });

  it("rejects an unknown kind", () => {
    expect(() =>
      snapshots.run(providerWithSnapshot({ ...SNAPSHOT, kind: "tricorder" })),
    ).toThrow(/unknown kind/);
  });

  it("rejects an unknown handedness", () => {
    expect(() =>
      snapshots.run(providerWithSnapshot({ ...SNAPSHOT, handedness: "port" })),
    ).toThrow(/unknown handedness/);
  });

  it("rejects select or squeeze outside 0..1", () => {
    expect(() =>
      snapshots.run(providerWithSnapshot({ ...SNAPSHOT, select: "on" })),
    ).toThrow(/select in 0\.\.1/);
    expect(() =>
      snapshots.run(providerWithSnapshot({ ...SNAPSHOT, select: -1 })),
    ).toThrow(/select in 0\.\.1/);
    expect(() =>
      snapshots.run(providerWithSnapshot({ ...SNAPSHOT, select: 1.5 })),
    ).toThrow(/select in 0\.\.1/);
    expect(() =>
      snapshots.run(providerWithSnapshot({ ...SNAPSHOT, squeeze: 2 })),
    ).toThrow(/squeeze in 0\.\.1/);
  });
});

describe("the capability-methods case", () => {
  const methods = contractCase("declared capabilities");

  it("asks nothing of a provider that declares neither capability", () => {
    expect(() =>
      methods.run(broken({ getCapabilities: () => NO_CAPABILITIES })),
    ).not.toThrow();
  });

  it("requires pulse when haptics is declared", () => {
    const provider = broken({
      getCapabilities: () => ({ ...NO_CAPABILITIES, haptics: true }),
      pulse: undefined,
    });
    expect(() => methods.run(provider)).toThrow(/pulse\(\) must be implemented/);
  });

  it("requires both presence methods when presence is declared", () => {
    const withoutVisible = broken({
      getCapabilities: () => ({ ...NO_CAPABILITIES, presence: true }),
      setPresenceVisible: undefined,
    });
    expect(() => methods.run(withoutVisible)).toThrow(
      /setPresenceVisible\(\) must be implemented/,
    );

    const withoutModality = broken({
      getCapabilities: () => ({ ...NO_CAPABILITIES, presence: true }),
      setPresenceModality: undefined,
    });
    expect(() => methods.run(withoutModality)).toThrow(
      /setPresenceModality\(\) must be implemented/,
    );
  });
});

describe("the presence-declaration case", () => {
  const declared = contractCase("working presence pathway");

  it("skips a provider that does not implement presence at all", () => {
    const provider = broken({
      getCapabilities: () => NO_CAPABILITIES,
      setPresenceVisible: undefined,
      setPresenceModality: undefined,
    });
    expect(() => declared.run(provider)).not.toThrow();
  });

  it("skips a provider whose presence is implemented but not yet available", () => {
    // The three.js adapter's shape: both methods exist, but nothing is shown
    // until the app registers a hand or controller model, so the probe
    // reports false and `presence` is correctly still false.
    const provider = broken({
      getCapabilities: () => NO_CAPABILITIES,
      setPresenceVisible: () => false,
    });
    expect(() => declared.run(provider)).not.toThrow();
  });

  it("rejects a working presence pathway that is never declared", () => {
    const provider = broken({
      getCapabilities: () => NO_CAPABILITIES,
      setPresenceVisible: () => true,
    });
    expect(() => declared.run(provider)).toThrow(
      /capabilities\.presence must be true/,
    );
  });

  it("rejects a working pathway that is missing setPresenceModality", () => {
    const provider = broken({
      getCapabilities: () => ({ ...NO_CAPABILITIES, presence: true }),
      setPresenceVisible: () => true,
      setPresenceModality: undefined,
    });
    expect(() => declared.run(provider)).toThrow(
      /setPresenceModality\(\) must be implemented/,
    );
  });

  it("probes with a target that changes nothing", () => {
    const seen: Array<[string, boolean]> = [];
    const provider = broken({
      setPresenceVisible: (target: string, visible: boolean) => {
        seen.push([target, visible]);
        return true;
      },
    });
    declared.run(provider);
    expect(seen).toEqual([["none", true]]);
  });
});

describe("the subscription case", () => {
  const subscriptions = contractCase("subscriptions");

  it("passes a provider that notifies on subscribe", () => {
    let capabilityCalls = 0;
    let sourceCalls = 0;
    const provider = broken({
      onCapabilitiesChanged: (listener: (c: InputCapabilities) => void) => {
        listener(FULL_CAPABILITIES);
        capabilityCalls += 1;
        return () => undefined;
      },
      onSourcesChanged: (listener: () => void) => {
        listener();
        sourceCalls += 1;
        return () => undefined;
      },
    });
    expect(() => subscriptions.run(provider)).not.toThrow();
    expect(capabilityCalls).toBe(1);
    expect(sourceCalls).toBe(1);
  });

  it("rejects a subscription that returns no unsubscribe", () => {
    expect(() =>
      subscriptions.run(broken({ onCapabilitiesChanged: () => undefined })),
    ).toThrow(/onCapabilitiesChanged\(\) must return an unsubscribe/);
    expect(() =>
      subscriptions.run(broken({ onSourcesChanged: () => "nope" })),
    ).toThrow(/onSourcesChanged\(\) must return an unsubscribe/);
  });

  it("rejects an unsubscribe that throws", () => {
    const thrower = (): Unsubscribe => () => {
      throw new Error("detached twice");
    };
    expect(() =>
      subscriptions.run(broken({ onCapabilitiesChanged: thrower })),
    ).toThrow(/onCapabilitiesChanged\(\) threw: Error: detached twice/);
    expect(() =>
      subscriptions.run(broken({ onSourcesChanged: thrower })),
    ).toThrow(/onSourcesChanged\(\) threw/);
  });
});

describe("the session-cycle case", () => {
  const sessionCycle = contractCase("session cycle");

  /** A provider whose unsubscribe can be made deliberately ineffective. */
  function listenerFake(honourUnsubscribe: boolean): {
    provider: InputProvider;
    emit: () => void;
  } {
    let listeners: Array<() => void> = [];
    const provider: InputProvider = {
      getCapabilities: () => NO_CAPABILITIES,
      onCapabilitiesChanged(listener) {
        const wrapped = (): void => listener(NO_CAPABILITIES);
        listeners.push(wrapped);
        return () => {
          if (honourUnsubscribe) {
            listeners = listeners.filter((entry) => entry !== wrapped);
          }
        };
      },
      onSourcesChanged: () => () => undefined,
      sample: () => [],
    };
    return { provider, emit: () => listeners.forEach((entry) => entry()) };
  }

  it("skips without a driver, or with half a driver", () => {
    const { provider, emit } = listenerFake(false);
    expect(() => sessionCycle.run(provider)).not.toThrow();
    expect(() => sessionCycle.run(provider, {})).not.toThrow();
    expect(() => sessionCycle.run(provider, { enterSession: emit })).not.toThrow();
    expect(() => sessionCycle.run(provider, { exitSession: emit })).not.toThrow();
  });

  it("passes when the unsubscribe is honoured across the cycle", () => {
    const { provider, emit } = listenerFake(true);
    expect(() =>
      sessionCycle.run(provider, { enterSession: emit, exitSession: emit }),
    ).not.toThrow();
  });

  it("fails when a session cycle revives an unsubscribed listener", () => {
    const { provider, emit } = listenerFake(false);
    expect(() =>
      sessionCycle.run(provider, { enterSession: emit, exitSession: emit }),
    ).toThrow(/must not be called again/);
  });
});
