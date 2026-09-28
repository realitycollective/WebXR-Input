/**
 * Eye gaze and pinch - the far-targeting mode Meta IWSDK 1.0.0 switches to
 * when a session grants eye tracking, restated here as pure logic so every
 * provider hands consumers the same snapshots.
 *
 * The reference (`@iwsdk/xr-input` 1.0.0 `GazePointer`, `FilteredEyeGaze`
 * and `XRInputManager.updatePointers`, `@iwsdk/core` `GazeSystem`):
 *
 * - The gaze ray is the `XRInputSource` whose `targetRayMode` is `"gaze"`,
 *   posed each frame. A source can exist while its pose is invalid (a blink,
 *   an uncalibrated headset), so presence and validity are tracked apart.
 * - Gaze OWNS far targeting from the first valid pose, and keeps it through
 *   {@link EyeGazeOptions.trackingLossGraceSeconds} of invalid poses. While
 *   it does, hand and controller far rays are disabled: near touch and grab
 *   stay live. Removing the source hands far targeting back at once.
 * - The pose is smoothed with a one-euro filter (position and quaternion,
 *   component-wise, quaternion hemisphere-aligned and renormalised).
 * - Either hand's pinch commits a selection, and that hand owns it until it
 *   releases (per-hand mutual exclusion). A pinch already held when gaze
 *   takes over never becomes a gaze click: a hand is armed only after it is
 *   seen released.
 * - With {@link EyeGazeOptions.pointerTransformFollowsHand} (the default) a
 *   gaze-started drag follows the pinching hand: the gaze snapshot carries
 *   that hand's ray-space pose as `selectorPose`, and the interaction
 *   runtime aims a ray from it at the gaze hit.
 *
 * {@link EyeGazeInput} applies all of this to a provider's raw snapshots.
 * The targeting half of the rule (the 5 degree cone, the 0.15 s dwell
 * consensus, suppression while a near pointer is active) lives with the
 * interaction runtime, which is where targets are known; the constants for
 * it are here, with the rest, so one table states the reference.
 */
import {
  SELECT_PRESS_THRESHOLD,
  SELECT_RELEASE_THRESHOLD,
  type InputSourceSnapshot,
} from "./source.js";
import type { PoseTuple, QuatTuple, RayTuple, Vec3Tuple } from "./types.js";

/** The id of the one eye-gaze snapshot a provider samples. Opaque to consumers, as every id is. */
export const EYE_GAZE_SOURCE_ID = "eye-gaze";

/** The reference's tuning, `GazeSystem`'s config defaults in IWSDK 1.0.0. */
export interface EyeGazeOptions {
  /** Half-angle of the gaze selection cone, degrees. IWSDK `coneAngle`, default 5. */
  coneAngleDegrees?: number;
  /** Farthest a gaze target may be, metres. IWSDK `maxRayLength`, default 30. */
  maxRayLength?: number;
  /** Dwell consensus window, seconds; 0 disables it. IWSDK `dwellWindowSeconds`, default 0.15. */
  dwellWindowSeconds?: number;
  /** One-euro filter minimum cutoff, Hz. IWSDK `filterMinCutoff`, default 1.5. */
  filterMinCutoff?: number;
  /** One-euro filter speed coefficient. IWSDK `filterBeta`, default 0.05. */
  filterBeta?: number;
  /** One-euro filter derivative cutoff, Hz. IWSDK `FilteredEyeGaze.dCutoff`, default 1. */
  filterDCutoff?: number;
  /** A gaze-started drag follows the pinching hand. IWSDK `pointerTransformFollowsHand`, default true. */
  pointerTransformFollowsHand?: boolean;
  /** Gaze targets nothing while a near touch or grab pointer is hovering or selecting. IWSDK `suppressWhenDirectPointerActive`, default true. */
  suppressWhenDirectPointerActive?: boolean;
  /** Seconds gaze keeps far targeting after its pose goes invalid. IWSDK `trackingLossGraceSeconds`, default 5. */
  trackingLossGraceSeconds?: number;
}

/** IWSDK 1.0.0's defaults (`@iwsdk/core` `dist/gaze/gaze-system.js`). */
export const EYE_GAZE_DEFAULTS: Readonly<Required<EyeGazeOptions>> = Object.freeze({
  coneAngleDegrees: 5,
  maxRayLength: 30,
  dwellWindowSeconds: 0.15,
  filterMinCutoff: 1.5,
  filterBeta: 0.05,
  filterDCutoff: 1,
  pointerTransformFollowsHand: true,
  suppressWhenDirectPointerActive: true,
  trackingLossGraceSeconds: 5,
});

/** Fill every option from the defaults. */
export function resolveEyeGazeOptions(options: EyeGazeOptions = {}): Required<EyeGazeOptions> {
  return {
    coneAngleDegrees: options.coneAngleDegrees ?? EYE_GAZE_DEFAULTS.coneAngleDegrees,
    maxRayLength: options.maxRayLength ?? EYE_GAZE_DEFAULTS.maxRayLength,
    dwellWindowSeconds: options.dwellWindowSeconds ?? EYE_GAZE_DEFAULTS.dwellWindowSeconds,
    filterMinCutoff: options.filterMinCutoff ?? EYE_GAZE_DEFAULTS.filterMinCutoff,
    filterBeta: options.filterBeta ?? EYE_GAZE_DEFAULTS.filterBeta,
    filterDCutoff: options.filterDCutoff ?? EYE_GAZE_DEFAULTS.filterDCutoff,
    pointerTransformFollowsHand:
      options.pointerTransformFollowsHand ?? EYE_GAZE_DEFAULTS.pointerTransformFollowsHand,
    suppressWhenDirectPointerActive:
      options.suppressWhenDirectPointerActive ?? EYE_GAZE_DEFAULTS.suppressWhenDirectPointerActive,
    trackingLossGraceSeconds:
      options.trackingLossGraceSeconds ?? EYE_GAZE_DEFAULTS.trackingLossGraceSeconds,
  };
}

/** The shortest frame the filter integrates over: IWSDK clamps `dt` to 1/240 s. */
export const EYE_GAZE_MIN_FILTER_DT = 1 / 240;

// ---------------------------------------------------------------------------
// One-euro filter (Casiez et al. 2012), as `FilteredEyeGaze` runs it.
// ---------------------------------------------------------------------------

function lowpassAlpha(cutoff: number, dt: number): number {
  const tau = 1 / (2 * Math.PI * cutoff);
  return 1 / (1 + tau / dt);
}

/**
 * One scalar of the one-euro filter: the cutoff rises with the input's
 * speed, so slow motion is smoothed hard and fast motion stays responsive.
 * The first sample, and any sample with `dt <= 0`, passes through.
 */
export class OneEuroScalar {
  private hasPrev = false;
  private prevX = 0;
  private prevFilteredX = 0;
  private prevFilteredDx = 0;

  filter(x: number, dt: number, minCutoff: number, beta: number, dCutoff: number): number {
    if (!this.hasPrev || dt <= 0) {
      this.hasPrev = true;
      this.prevX = x;
      this.prevFilteredX = x;
      this.prevFilteredDx = 0;
      return x;
    }
    const dx = (x - this.prevX) / dt;
    const aDx = lowpassAlpha(dCutoff, dt);
    const filteredDx = aDx * dx + (1 - aDx) * this.prevFilteredDx;
    const cutoff = minCutoff + beta * Math.abs(filteredDx);
    const aX = lowpassAlpha(cutoff, dt);
    const filteredX = aX * x + (1 - aX) * this.prevFilteredX;
    this.prevX = x;
    this.prevFilteredX = filteredX;
    this.prevFilteredDx = filteredDx;
    return filteredX;
  }

  reset(): void {
    this.hasPrev = false;
    this.prevX = 0;
    this.prevFilteredX = 0;
    this.prevFilteredDx = 0;
  }
}

/**
 * The gaze pose smoother: position xyz and quaternion xyzw filtered
 * component-wise, the quaternion aligned to the previous sample's hemisphere
 * first (q and -q are one rotation, and a runtime that flips representation
 * would otherwise make the scalars interpolate through zero) and
 * renormalised after. IWSDK `FilteredEyeGaze`.
 */
export class EyeGazeFilter {
  minCutoff: number;
  beta: number;
  dCutoff: number;
  private readonly px = new OneEuroScalar();
  private readonly py = new OneEuroScalar();
  private readonly pz = new OneEuroScalar();
  private readonly qx = new OneEuroScalar();
  private readonly qy = new OneEuroScalar();
  private readonly qz = new OneEuroScalar();
  private readonly qw = new OneEuroScalar();
  private previous: QuatTuple | null = null;

  constructor(options: Pick<EyeGazeOptions, "filterMinCutoff" | "filterBeta" | "filterDCutoff"> = {}) {
    this.minCutoff = options.filterMinCutoff ?? EYE_GAZE_DEFAULTS.filterMinCutoff;
    this.beta = options.filterBeta ?? EYE_GAZE_DEFAULTS.filterBeta;
    this.dCutoff = options.filterDCutoff ?? EYE_GAZE_DEFAULTS.filterDCutoff;
  }

  /** Smooth `pose` over `dt` seconds. Returns a fresh pose the caller owns. */
  filter(pose: PoseTuple, dt: number): PoseTuple {
    const mc = this.minCutoff;
    const b = this.beta;
    const dc = this.dCutoff;
    const aligned = normalizeQuat(pose.quaternion);
    if (this.previous && quatDot(aligned, this.previous) < 0) {
      aligned[0] = -aligned[0];
      aligned[1] = -aligned[1];
      aligned[2] = -aligned[2];
      aligned[3] = -aligned[3];
    }
    this.previous = aligned;
    const [x, y, z] = pose.position;
    const position: Vec3Tuple = [
      this.px.filter(x, dt, mc, b, dc),
      this.py.filter(y, dt, mc, b, dc),
      this.pz.filter(z, dt, mc, b, dc),
    ];
    const quaternion = normalizeQuat([
      this.qx.filter(aligned[0], dt, mc, b, dc),
      this.qy.filter(aligned[1], dt, mc, b, dc),
      this.qz.filter(aligned[2], dt, mc, b, dc),
      this.qw.filter(aligned[3], dt, mc, b, dc),
    ]);
    return { position, quaternion };
  }

  reset(): void {
    this.px.reset();
    this.py.reset();
    this.pz.reset();
    this.qx.reset();
    this.qy.reset();
    this.qz.reset();
    this.qw.reset();
    this.previous = null;
  }
}

// ---------------------------------------------------------------------------
// Pose and ray helpers, kept here so this package stays dependency-free.
// ---------------------------------------------------------------------------

function quatDot(a: QuatTuple, b: QuatTuple): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2] + a[3] * b[3];
}

function normalizeQuat(q: QuatTuple): QuatTuple {
  const length = Math.hypot(q[0], q[1], q[2], q[3]);
  if (length === 0) return [0, 0, 0, 1];
  return [q[0] / length, q[1] / length, q[2] / length, q[3] / length];
}

function applyQuat(v: Vec3Tuple, q: QuatTuple): Vec3Tuple {
  const [x, y, z] = v;
  const [qx, qy, qz, qw] = q;
  const ix = qw * x + qy * z - qz * y;
  const iy = qw * y + qz * x - qx * z;
  const iz = qw * z + qx * y - qy * x;
  const iw = -qx * x - qy * y - qz * z;
  return [
    ix * qw + iw * -qx + iy * -qz - iz * -qy,
    iy * qw + iw * -qy + iz * -qx - ix * -qz,
    iz * qw + iw * -qz + ix * -qy - iy * -qx,
  ];
}

/** The ray a pose points along: its origin, and its local `-Z` in world space. */
export function rayFromPose(pose: PoseTuple): RayTuple {
  return { origin: [...pose.position], direction: applyQuat([0, 0, -1], pose.quaternion) };
}

/**
 * A pose whose local `-Z` follows `ray.direction`, built the way three.js's
 * `Matrix4.lookAt` builds one (with `up`, world +Y by default). For a
 * provider that has a hand's ray but not its ray-space orientation; the
 * result has no roll about the ray.
 */
export function rayPoseFromRay(ray: RayTuple, up: Vec3Tuple = [0, 1, 0]): PoseTuple {
  let zx = -ray.direction[0];
  let zy = -ray.direction[1];
  let zz = -ray.direction[2];
  let zl = Math.hypot(zx, zy, zz);
  if (zl === 0) {
    zz = 1;
    zl = 1;
  }
  zx /= zl;
  zy /= zl;
  zz /= zl;
  let xx = up[1] * zz - up[2] * zy;
  let xy = up[2] * zx - up[0] * zz;
  let xz = up[0] * zy - up[1] * zx;
  let xl = Math.hypot(xx, xy, xz);
  if (xl === 0) {
    // Parallel to `up`: nudge, as three.js does, so a frame still exists.
    if (Math.abs(up[2]) === 1) zx += 0.0001;
    else zz += 0.0001;
    zl = Math.hypot(zx, zy, zz);
    zx /= zl;
    zy /= zl;
    zz /= zl;
    xx = up[1] * zz - up[2] * zy;
    xy = up[2] * zx - up[0] * zz;
    xz = up[0] * zy - up[1] * zx;
    xl = Math.hypot(xx, xy, xz);
  }
  xx /= xl;
  xy /= xl;
  xz /= xl;
  const yx = zy * xz - zz * xy;
  const yy = zz * xx - zx * xz;
  const yz = zx * xy - zy * xx;
  return { position: [...ray.origin], quaternion: quatFromBasis(xx, xy, xz, yx, yy, yz, zx, zy, zz) };
}

/** three.js `Quaternion.setFromRotationMatrix` over the columns x, y, z. */
function quatFromBasis(
  m11: number, m21: number, m31: number,
  m12: number, m22: number, m32: number,
  m13: number, m23: number, m33: number,
): QuatTuple {
  const trace = m11 + m22 + m33;
  if (trace > 0) {
    const s = 0.5 / Math.sqrt(trace + 1);
    return [(m32 - m23) * s, (m13 - m31) * s, (m21 - m12) * s, 0.25 / s];
  }
  if (m11 > m22 && m11 > m33) {
    const s = 2 * Math.sqrt(1 + m11 - m22 - m33);
    return [0.25 * s, (m12 + m21) / s, (m13 + m31) / s, (m32 - m23) / s];
  }
  if (m22 > m33) {
    const s = 2 * Math.sqrt(1 + m22 - m11 - m33);
    return [(m12 + m21) / s, 0.25 * s, (m23 + m32) / s, (m13 - m31) / s];
  }
  const s = 2 * Math.sqrt(1 + m33 - m11 - m22);
  return [(m13 + m31) / s, (m23 + m32) / s, 0.25 * s, (m21 - m12) / s];
}

// ---------------------------------------------------------------------------
// The provider-side rule.
// ---------------------------------------------------------------------------

export type EyeGazeSide = "left" | "right";
const SIDES: readonly EyeGazeSide[] = ["left", "right"];

/** What a provider reads off its platform each frame for {@link EyeGazeInput}. */
export interface EyeGazeFrame {
  /**
   * An eye-gaze input source exists this frame. WebXR: an `XRInputSource`
   * with `targetRayMode === "gaze"` in `session.inputSources` (or
   * `trackedSources`). OpenXR: the eye gaze action is bound and active.
   */
  present: boolean;
  /**
   * This frame's valid gaze target-ray pose, world space, or null when the
   * runtime posed none (WebXR `frame.getPose(targetRaySpace)` returned null;
   * OpenXR `XrEyeGazeSampleTimeEXT` invalid). Raw: this class filters it.
   */
  pose: PoseTuple | null;
  /**
   * Each hand's ray-space pose, world space, for the pinching hand to take
   * the pointer over (`selectorPose`). IWSDK: `xrOrigin.raySpaces[hand]`. A
   * provider with only a ray builds one with {@link rayPoseFromRay}.
   */
  rayPoses: Partial<Record<EyeGazeSide, PoseTuple>>;
}

/**
 * Applies the eye-gaze rule to one frame of raw snapshots. A provider builds
 * its hand and controller snapshots as it always did, then hands them here
 * with the frame's gaze reading; what comes back is what it samples.
 *
 * While gaze owns far targeting (see the file comment) the hand and
 * controller snapshots come back WITHOUT their `ray`, and one snapshot of
 * kind `"gaze"` (id {@link EYE_GAZE_SOURCE_ID}) is added: its `ray` is the
 * filtered gaze ray (absent while the pose is invalid), its `select` the
 * owning hand's pinch (0 until a hand commits), its `handedness` that hand
 * (`"none"` until then) and its `selectorPose` that hand's ray-space pose.
 * Otherwise the snapshots come back as they were.
 */
export class EyeGazeInput {
  readonly options: Required<EyeGazeOptions>;
  readonly filter: EyeGazeFilter;
  private acquired = false;
  private sinceTracked = Number.POSITIVE_INFINITY;
  private owner: EyeGazeSide | null = null;
  private readonly armed: Record<EyeGazeSide, boolean> = { left: false, right: false };
  private readonly pressed: Record<EyeGazeSide, boolean> = { left: false, right: false };
  private ownsFar = false;

  constructor(options: EyeGazeOptions = {}) {
    this.options = resolveEyeGazeOptions(options);
    this.filter = new EyeGazeFilter(this.options);
  }

  /** Whether gaze owned far targeting on the last `update`. */
  ownsFarTargeting(): boolean {
    return this.ownsFar;
  }

  /** The hand whose pinch owns the current gaze selection, if any. */
  selectingHand(): EyeGazeSide | null {
    return this.owner;
  }

  /** Forget everything: session end, or the gaze source going away. */
  reset(): void {
    this.acquired = false;
    this.sinceTracked = Number.POSITIVE_INFINITY;
    this.owner = null;
    this.ownsFar = false;
    this.armed.left = this.armed.right = false;
    this.pressed.left = this.pressed.right = false;
    this.filter.reset();
  }

  update(frame: EyeGazeFrame, sources: readonly InputSourceSnapshot[], dt: number): readonly InputSourceSnapshot[] {
    const grace = this.options.trackingLossGraceSeconds;
    if (!frame.present) {
      // Grace belongs to one uninterrupted source lifetime.
      this.acquired = false;
      this.sinceTracked = Number.POSITIVE_INFINITY;
    }
    const posed = frame.present && frame.pose !== null;
    if (posed) {
      this.acquired = true;
      this.sinceTracked = 0;
    } else {
      this.sinceTracked += dt;
    }
    const ownsFar = frame.present && (posed || (this.acquired && this.sinceTracked <= grace));
    this.ownsFar = ownsFar;

    // Each side's pinch, with the shared hysteresis, and its edges.
    const select: Record<EyeGazeSide, number> = { left: 0, right: 0 };
    for (const source of sources) {
      if (source.handedness === "left" || source.handedness === "right") {
        select[source.handedness] = Math.max(select[source.handedness], source.select);
      }
    }
    const started: Record<EyeGazeSide, boolean> = { left: false, right: false };
    for (const side of SIDES) {
      const was = this.pressed[side];
      const now = was ? select[side] > SELECT_RELEASE_THRESHOLD : select[side] >= SELECT_PRESS_THRESHOLD;
      this.pressed[side] = now;
      started[side] = now && !was;
      // A hand arms once it is seen released while gaze owns far targeting,
      // so a pinch held from before never turns into a gaze click.
      if (!ownsFar) this.armed[side] = false;
      else if (!this.armed[side] && !now) this.armed[side] = true;
    }

    // Release: the source went away, or the owning pinch ended.
    if (this.owner && (!frame.present || !this.pressed[this.owner])) this.owner = null;
    // Commit: a fresh, armed pinch while a valid pose can target. Left first.
    if (!this.owner && posed) {
      for (const side of SIDES) {
        if (this.armed[side] && started[side]) {
          this.owner = side;
          break;
        }
      }
    }

    if (!ownsFar && !this.owner) {
      this.filter.reset();
      return sources;
    }

    const out: InputSourceSnapshot[] = [];
    for (const source of sources) {
      if (ownsFar && (source.kind === "hand" || source.kind === "controller") && source.ray) {
        const { ray: _ray, ...rest } = source;
        out.push(rest);
      } else {
        out.push(source);
      }
    }
    const gaze: InputSourceSnapshot = {
      id: EYE_GAZE_SOURCE_ID,
      kind: "gaze",
      handedness: this.owner ?? "none",
      select: this.owner ? select[this.owner] : 0,
      squeeze: 0,
    };
    if (posed) {
      const filtered = this.filter.filter(frame.pose!, Math.max(dt, EYE_GAZE_MIN_FILTER_DT));
      gaze.ray = rayFromPose(filtered);
    } else if (!this.owner) {
      this.filter.reset();
    }
    if (this.owner) {
      const pose = frame.rayPoses[this.owner];
      if (pose) gaze.selectorPose = { position: [...pose.position], quaternion: [...pose.quaternion] };
    }
    out.push(gaze);
    return out;
  }
}
