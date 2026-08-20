import type { InputCapabilities } from "./capabilities.js";
import type { InputSourceSnapshot } from "./source.js";
import type { HeadPose, Unsubscribe } from "./types.js";

/**
 * A pre-resolved interaction hint from providers whose engine performs its
 * own targeting (e.g. Meta IWSDK delivers hover/press as ECS tag
 * transitions rather than exposing a raycast query). When a provider
 * supplies hints for a frame, a consumer's binder accepts them IN PLACE of
 * its own hit-testing for the named target - provider power wins when the
 * provider has extended capabilities.
 */
export interface InputHitHint {
  /** The source that produced the hint. */
  sourceId: string;
  /** The consumer-registered target id (e.g. an interactable id). */
  targetId: string;
  /** Hint kind: hovering, pressing (select on target), or grabbing. */
  state: "hover" | "press" | "grab";
}

/**
 * The one interface an engine adapter must implement to feed input into
 * the Reality Collective extension families.
 *
 * Pull-based by design: consumers call {@link sample} (and
 * {@link sampleHints}) exactly once per host frame, so providers never
 * need their own timers and stay trivially testable.
 */
export interface InputProvider {
  /** Current negotiated capabilities (derived from the LIVE session). */
  getCapabilities(): InputCapabilities;
  /** Capability changes: session start/end, hands⇄controllers swap. */
  onCapabilitiesChanged(
    listener: (capabilities: InputCapabilities) => void,
  ): Unsubscribe;
  /** Source connect/disconnect. */
  onSourcesChanged(listener: () => void): Unsubscribe;
  /** Snapshot every live source. Called once per update tick. */
  sample(): readonly InputSourceSnapshot[];
  /** Head pose, when `capabilities.headPose` is true. */
  getHeadPose?(): HeadPose;
  /**
   * Pre-resolved targeting hints for this frame (optional - providers with
   * their own targeting pipelines only). Consumed alongside {@link sample}.
   */
  sampleHints?(): readonly InputHitHint[];
  /**
   * Fire a haptic pulse on a source, when `capabilities.haptics` is true
   * and the source reports `hapticsAvailable`. Returns false when the
   * pulse could not be delivered. Intensity 0..1, duration in ms.
   */
  pulse?(sourceId: string, intensity: number, durationMs: number): boolean;
}
