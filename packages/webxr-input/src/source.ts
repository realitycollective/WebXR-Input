import type { PoseTuple, RayTuple, Vec3Tuple } from "./types.js";

export type Handedness = "left" | "right" | "none";

/**
 * Which visuals a provider should present for the user's own body:
 * - "hands"       - hand meshes only.
 * - "controllers" - controller models only.
 * - "auto"        - let the runtime decide from the live session.
 */
export type PresenceModality = "hands" | "controllers" | "auto";

/** What kind of physical thing produced this source. */
export type InputSourceKind =
  | "controller"
  | "hand"
  | "gaze"
  | "pointer2d"
  | "other";

/**
 * One live input source, engine-normalised and sampled once per update.
 * Fields the provider cannot supply are simply absent - consumers gate on
 * {@link InputCapabilities}, not on per-frame presence checks.
 */
export interface InputSourceSnapshot {
  /**
   * Stable per session (e.g. "left-hand", "right-controller", "mouse").
   *
   * Opaque to consumers. The format is NOT part of this contract, so never
   * parse it - reading a side out of it with something like
   * `id.startsWith("left")` breaks the moment a provider changes its naming.
   * Read {@link InputSourceSnapshot.handedness} for the side instead.
   */
  id: string;
  kind: InputSourceKind;
  handedness: Handedness;
  /** Pointing ray (targetRaySpace, hand ray, gaze ray or projected 2D pointer). */
  ray?: RayTuple;
  /** Grip/palm pose. */
  gripPose?: PoseTuple;
  /** Index fingertip world position (poke, hand-driven behaviours). */
  indexTip?: Vec3Tuple;
  /**
   * Grip linear velocity in metres per second, world space. Present when
   * the provider supplies it natively or a consumer derived it from
   * consecutive `gripPose` samples (see `velocityBetween`).
   */
  linearVelocity?: Vec3Tuple;
  /**
   * Grip angular velocity as a rotation axis scaled by radians per second.
   * Present on the same terms as {@link InputSourceSnapshot.linearVelocity}.
   */
  angularVelocity?: Vec3Tuple;
  /** Primary select action 0..1 (trigger, pinch strength, mouse button). */
  select: number;
  /** Secondary squeeze action 0..1 (grip button). */
  squeeze: number;
  /** True while the engine reports this source natively grabbing something. */
  nativeGrabbing?: boolean;
  /** Haptics available on this source. */
  hapticsAvailable?: boolean;
}

/** Select threshold used by consumers that need a boolean from `select`. */
export const SELECT_PRESS_THRESHOLD = 0.7;
/** Release threshold (hysteresis below the press threshold). */
export const SELECT_RELEASE_THRESHOLD = 0.3;
