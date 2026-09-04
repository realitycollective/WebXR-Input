import { NO_CAPABILITIES } from "./capabilities.js";
import type { InputProvider } from "./provider.js";
import type { Handedness, InputSourceKind } from "./source.js";
import type { Unsubscribe } from "./types.js";

/**
 * Optional hooks a contract case can drive. An adapter's test harness
 * supplies whatever it can fake; cases that need a missing hook pass
 * without running, so a partial driver is always safe.
 */
export interface InputProviderContractDriver {
  /** Put the provider into a live XR session. */
  enterSession?(): void;
  /** End the session the driver started. */
  exitSession?(): void;
}

/**
 * One check an {@link InputProvider} implementation must pass. `run`
 * returns silently on success and throws an `Error` describing the
 * failure otherwise, so any test runner can host it.
 */
export interface InputProviderContractCase {
  name: string;
  run(provider: InputProvider, driver?: InputProviderContractDriver): void;
}

/**
 * The shared provider conformance suite, runner-free on purpose: every
 * adapter repository has its own runner, so this ships the checks as data
 * and the adapter iterates them. A typical suite is three lines:
 *
 * ```ts
 * for (const contractCase of inputProviderContractCases()) {
 *   it(contractCase.name, () => contractCase.run(provider, driver));
 * }
 * ```
 */
export function inputProviderContractCases(): readonly InputProviderContractCase[] {
  return CASES;
}

const CAPABILITY_KEYS: readonly string[] = Object.keys(NO_CAPABILITIES).sort();

const KINDS: Readonly<Record<InputSourceKind, true>> = {
  controller: true,
  hand: true,
  gaze: true,
  pointer2d: true,
  other: true,
};

const HANDEDNESS: Readonly<Record<Handedness, true>> = {
  left: true,
  right: true,
  none: true,
};

const CASES: readonly InputProviderContractCase[] = [
  {
    name: "getCapabilities reports exactly the contract capability keys",
    run(provider) {
      const keys = Object.keys(provider.getCapabilities()).sort();
      assert(
        keys.length === CAPABILITY_KEYS.length &&
          keys.every((key, index) => key === CAPABILITY_KEYS[index]),
        `getCapabilities() must return exactly [${CAPABILITY_KEYS.join(", ")}], got [${keys.join(", ")}]`,
      );
    },
  },
  {
    name: "sample returns well-formed snapshots",
    run(provider) {
      const sources = provider.sample();
      assert(Array.isArray(sources), "sample() must return an array");
      for (const source of sources) {
        assert(
          typeof source.id === "string" && source.id.length > 0,
          "every snapshot needs a non-empty string id",
        );
        assert(
          hasKey(KINDS, source.kind),
          `snapshot "${source.id}" has an unknown kind "${String(source.kind)}"`,
        );
        assert(
          hasKey(HANDEDNESS, source.handedness),
          `snapshot "${source.id}" has an unknown handedness "${String(source.handedness)}"`,
        );
        assert(
          isUnitScalar(source.select),
          `snapshot "${source.id}" needs select in 0..1, got ${String(source.select)}`,
        );
        assert(
          isUnitScalar(source.squeeze),
          `snapshot "${source.id}" needs squeeze in 0..1, got ${String(source.squeeze)}`,
        );
      }
    },
  },
  {
    name: "declared capabilities come with the methods that serve them",
    run(provider) {
      const capabilities = provider.getCapabilities();
      if (capabilities.haptics) {
        assert(
          typeof provider.pulse === "function",
          "capabilities.haptics is true, so pulse() must be implemented",
        );
      }
      if (capabilities.presence) {
        assert(
          typeof provider.setPresenceVisible === "function",
          "capabilities.presence is true, so setPresenceVisible() must be implemented",
        );
        assert(
          typeof provider.setPresenceModality === "function",
          "capabilities.presence is true, so setPresenceModality() must be implemented",
        );
      }
    },
  },
  {
    name: "subscriptions return an unsubscribe that can be called",
    run(provider) {
      const offCapabilities = provider.onCapabilitiesChanged(noop);
      assert(
        typeof offCapabilities === "function",
        "onCapabilitiesChanged() must return an unsubscribe function",
      );
      detach(offCapabilities, "onCapabilitiesChanged");

      const offSources = provider.onSourcesChanged(noop);
      assert(
        typeof offSources === "function",
        "onSourcesChanged() must return an unsubscribe function",
      );
      detach(offSources, "onSourcesChanged");
    },
  },
  {
    name: "an unsubscribed listener stays silent across a session cycle",
    run(provider, driver) {
      if (!driver?.enterSession || !driver.exitSession) return;
      let calls = 0;
      const off = provider.onCapabilitiesChanged(() => {
        calls += 1;
      });
      off();
      driver.enterSession();
      driver.exitSession();
      assert(
        calls === 0,
        `a listener unsubscribed before a session cycle must not be called again, it was called ${String(calls)} time(s)`,
      );
    },
  },
];

function assert(condition: boolean, message: string): void {
  if (!condition) throw new Error(message);
}

function hasKey(table: object, key: string): boolean {
  return Object.hasOwn(table, key);
}

function isUnitScalar(value: unknown): boolean {
  return typeof value === "number" && value >= 0 && value <= 1;
}

function noop(): void {
  // Registered only to check the unsubscribe that comes back.
}

function detach(off: Unsubscribe, label: string): void {
  try {
    off();
  } catch (error) {
    throw new Error(
      `the unsubscribe returned by ${label}() threw: ${String(error)}`,
    );
  }
}
