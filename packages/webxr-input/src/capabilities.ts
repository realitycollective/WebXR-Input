/**
 * What an input provider can deliver - negotiated once at bind time and
 * re-published whenever the live session changes (hands⇄controllers swap,
 * session start/end). Derived from the REAL session, never from requested
 * configuration (the pale-signal capability lesson).
 */

/**
 * How grabbing is fulfilled:
 * - `"none"`      - no grab input at all.
 * - `"poseOnly"`  - the provider reports grab start/end + poses; the consumer
 *                   (or the interactions core) moves the object.
 * - `"native"`    - the engine owns carry/throw (e.g. IWSDK grabbables +
 *                   physics); the provider reports the transitions and
 *                   observed poses only.
 */
export type GrabCapability = "none" | "poseOnly" | "native";

export interface InputCapabilities {
  /** Pointing rays with a select action (controller ray, hand ray). */
  rays: boolean;
  /** Fingertip/proximity press (requires a fingertip position). */
  pokes: boolean;
  /** Grab fulfilment mode. */
  grabs: GrabCapability;
  /** Per-joint hand poses (enables hand-driven behaviours, poke). */
  handJoints: boolean;
  /** Pinch strength 0..1 (hand tracking). */
  pinch: boolean;
  /** Gamepad-style buttons/axes beyond select/squeeze. */
  buttonsAxes: boolean;
  /** Head-gaze usable as a pointer (always derivable from headPose). */
  gaze: boolean;
  /** 2D pointer fallback (mouse/touch) projected into the scene. */
  pointer2d: boolean;
  /** A live head pose is available. */
  headPose: boolean;
  /** Haptic actuators are present on at least one source. */
  haptics: boolean;
}

/** A provider with nothing to give - the safe default before a session. */
export const NO_CAPABILITIES: Readonly<InputCapabilities> = Object.freeze({
  rays: false,
  pokes: false,
  grabs: "none",
  handJoints: false,
  pinch: false,
  buttonsAxes: false,
  gaze: false,
  pointer2d: false,
  headPose: false,
  haptics: false,
});

/**
 * The input requirements a consumer (an interaction behaviour) can declare.
 * Checked against {@link InputCapabilities} by capability negotiation.
 */
export type InputCapabilityRequirement =
  | "rays"
  | "pokes"
  | "grabs" // satisfied by "poseOnly" or "native"
  | "grabsNative" // satisfied only by "native"
  | "handJoints"
  | "pinch"
  | "buttonsAxes"
  | "gaze"
  | "pointer2d"
  | "headPose"
  | "haptics";

/** True when `capabilities` satisfies a single requirement. */
export function satisfies(
  capabilities: InputCapabilities,
  requirement: InputCapabilityRequirement,
): boolean {
  switch (requirement) {
    case "grabs":
      return capabilities.grabs !== "none";
    case "grabsNative":
      return capabilities.grabs === "native";
    default:
      return capabilities[requirement] === true;
  }
}

/** The subset of `requirements` that `capabilities` does NOT satisfy. */
export function unmetRequirements(
  capabilities: InputCapabilities,
  requirements: readonly InputCapabilityRequirement[],
): InputCapabilityRequirement[] {
  return requirements.filter((r) => !satisfies(capabilities, r));
}
