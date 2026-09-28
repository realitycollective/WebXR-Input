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
 *
 * Ownership: a snapshot, and every tuple inside it, belongs to whoever
 * `sample()` handed it to. A provider builds fresh objects on each call and
 * never writes to a snapshot it has already returned, so a consumer may
 * keep one across frames - the interaction runtime's velocity tracker keeps
 * last frame's grip pose, a drag keeps its press-time ray - without copying.
 * A provider that pools objects must therefore copy on hand-over rather
 * than refill in place. The conformance suite checks this rule.
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
  /**
   * The WebXR GRIP space pose, world space. For a controller, its grip. For
   * a tracked hand, the runtime's grip pose for that hand - WebXR's
   * `inputSource.gripSpace`, OpenXR's `/input/grip/pose` - which is what
   * IWSDK reads for both (`@iwsdk/xr-input` `xr-input-manager.js`, the
   * `gripSpace` update; it falls back to the ray pose when the runtime
   * gives none). It is NOT a hand joint: in the grip frame the origin is the
   * palm centroid, `-Z` points toward the thumb, `+Y` up the arm, and the
   * back of the right hand faces `+X` (the left hand's `-X`), whereas an
   * OpenXR joint such as `XR_HAND_JOINT_PALM_EXT` has `-Y` out of the palm
   * and `-Z` along the fingers. Hand menus and grabs read this frame, so a
   * provider that has only joints must convert before reporting.
   */
  gripPose?: PoseTuple;
  /**
   * Index fingertip world position (poke, hand-driven behaviours). For a
   * hand, the index-finger-tip joint. For a CONTROLLER, the origin of its
   * ray: IWSDK gives a controller an index-tip space equal to its ray space
   * (`xr-input-manager.js`, "fallback indexTipSpace to raySpace"), so a
   * controller's nose pokes buttons and panels exactly as a fingertip does.
   * A provider reports it for every tracked controller and hand.
   */
  indexTip?: Vec3Tuple;
  /**
   * Grip linear velocity in metres per second, world space. Present when
   * the provider supplies it natively or a consumer derived it from
   * consecutive `gripPose` samples (see `velocityBetween`).
   *
   * Who derives velocity is decided per snapshot: a provider that supplies
   * `linearVelocity` and `angularVelocity` has them used as they are, and
   * the interaction runtime's velocity tracker fills in only what a snapshot
   * lacks. There is no capability flag for it, because the snapshot already
   * says so. IWSDK supplies none and the tracker derives it (no smoothing).
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
  /**
   * True while the engine reports this source natively grabbing something.
   * Equivalent to a `grab` hint (`InputHitHint.state === "grab"`) for this
   * source: either one marks the grab active and bypasses the select and
   * squeeze thresholds. A provider supplies one of the two mechanisms, not
   * both; IWSDK sets this flag from its `Grabbed` tag and also reports the
   * tag as a hint, which is the same signal twice, never two grabs.
   */
  nativeGrabbing?: boolean;
  /** Haptics available on this source. */
  hapticsAvailable?: boolean;
  /**
   * Eye gaze only: the ray-space pose, world space, of the hand whose pinch
   * owns the current gaze selection (`-Z` along its ray). Present from the
   * frame the pinch commits until it releases, on the `"gaze"` snapshot
   * whose `handedness` names that hand, and on no other. The interaction
   * runtime aims a ray from it at the gaze hit, so a gaze-started drag
   * follows the hand. IWSDK: `xrOrigin.raySpaces[hand]`, as
   * `GazePointer.processSelector` reads it. See `eye-gaze.ts`.
   */
  selectorPose?: PoseTuple;
}

/** Select threshold used by consumers that need a boolean from `select`. */
export const SELECT_PRESS_THRESHOLD = 0.7;
/** Release threshold (hysteresis below the press threshold). */
export const SELECT_RELEASE_THRESHOLD = 0.3;
