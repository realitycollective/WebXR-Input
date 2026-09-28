/**
 * Core cases for the eye-gaze rule: the filter, the pose helpers and
 * `EyeGazeInput`, each against the behaviour IWSDK 1.0.0's `GazePointer`
 * and `XRInputManager` show (see `src/eye-gaze.ts`).
 */
import { describe, expect, it } from "vitest";
import {
  EYE_GAZE_DEFAULTS,
  EYE_GAZE_SOURCE_ID,
  EyeGazeFilter,
  EyeGazeInput,
  OneEuroScalar,
  rayFromPose,
  rayPoseFromRay,
  resolveEyeGazeOptions,
  type EyeGazeFrame,
  type InputSourceSnapshot,
  type PoseTuple,
  type RayTuple,
} from "@realitycollective/webxr-input";

const DT = 1 / 60;
const AHEAD: PoseTuple = { position: [0, 1.6, 0], quaternion: [0, 0, 0, 1] };
const LEFT_RAY: RayTuple = { origin: [-0.2, 1.3, -0.2], direction: [0, 0, -1] };
const RIGHT_RAY: RayTuple = { origin: [0.2, 1.3, -0.2], direction: [0, 0, -1] };

function hand(side: "left" | "right", select = 0): InputSourceSnapshot {
  return {
    id: `${side}-hand`,
    kind: "hand",
    handedness: side,
    select,
    squeeze: 0,
    ray: side === "left" ? LEFT_RAY : RIGHT_RAY,
    gripPose: { position: [0, 1.2, -0.3], quaternion: [0, 0, 0, 1] },
    indexTip: [0, 1.2, -0.35],
  };
}

function frame(pose: PoseTuple | null = AHEAD, present = true): EyeGazeFrame {
  return {
    present,
    pose,
    rayPoses: { left: rayPoseFromRay(LEFT_RAY), right: rayPoseFromRay(RIGHT_RAY) },
  };
}

function gazeOf(sources: readonly InputSourceSnapshot[]): InputSourceSnapshot | undefined {
  return sources.find((source) => source.kind === "gaze");
}

function handsOf(sources: readonly InputSourceSnapshot[]): InputSourceSnapshot[] {
  return sources.filter((source) => source.kind === "hand");
}

describe("EYE_GAZE_DEFAULTS", () => {
  it("carries IWSDK 1.0.0's GazeSystem defaults", () => {
    expect(EYE_GAZE_DEFAULTS).toEqual({
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
    expect(resolveEyeGazeOptions({ coneAngleDegrees: 7 })).toEqual({ ...EYE_GAZE_DEFAULTS, coneAngleDegrees: 7 });
  });
});

describe("OneEuroScalar", () => {
  it("passes the first sample and any zero-dt sample through", () => {
    const scalar = new OneEuroScalar();
    expect(scalar.filter(3, DT, 1.5, 0.05, 1)).toBe(3);
    expect(scalar.filter(9, 0, 1.5, 0.05, 1)).toBe(9);
  });

  it("smooths a jittering input toward its mean and follows a fast move", () => {
    const scalar = new OneEuroScalar();
    scalar.filter(0, DT, 1.5, 0.05, 1);
    let last = 0;
    for (let i = 1; i < 60; i++) last = scalar.filter(i % 2 === 0 ? 0.01 : -0.01, DT, 1.5, 0.05, 1);
    expect(Math.abs(last)).toBeLessThan(0.005);
    const fast = new OneEuroScalar();
    fast.filter(0, DT, 1.5, 0.05, 1);
    let value = 0;
    for (let i = 0; i < 30; i++) value = fast.filter(10, DT, 1.5, 0.05, 1);
    expect(value).toBeGreaterThan(9.5);
  });
});

describe("EyeGazeFilter", () => {
  it("returns the first pose unchanged and a fresh object", () => {
    const filter = new EyeGazeFilter();
    const out = filter.filter(AHEAD, DT);
    expect(out).toEqual(AHEAD);
    expect(out).not.toBe(AHEAD);
    expect(out.position).not.toBe(AHEAD.position);
  });

  it("treats q and -q as one rotation: a representation flip does not jump", () => {
    const filter = new EyeGazeFilter();
    const q: PoseTuple["quaternion"] = [0, Math.SQRT1_2, 0, Math.SQRT1_2];
    filter.filter({ position: [0, 0, 0], quaternion: q }, DT);
    const flipped = filter.filter({ position: [0, 0, 0], quaternion: [-q[0], -q[1], -q[2], -q[3]] }, DT);
    const direction = rayFromPose(flipped).direction;
    // Still pointing along -X (a quarter turn about Y of -Z), not through zero.
    expect(direction[0]).toBeCloseTo(-1, 6);
    expect(Math.hypot(...flipped.quaternion)).toBeCloseTo(1, 9);
  });

  it("reset forgets the history", () => {
    const filter = new EyeGazeFilter();
    filter.filter(AHEAD, DT);
    filter.reset();
    const far: PoseTuple = { position: [5, 5, 5], quaternion: [0, 0, 0, 1] };
    expect(filter.filter(far, DT)).toEqual(far);
  });
});

describe("pose helpers", () => {
  it("rayFromPose points along the pose's local -Z", () => {
    expect(rayFromPose(AHEAD)).toEqual({ origin: [0, 1.6, 0], direction: [0, 0, -1] });
    const turned = rayFromPose({ position: [1, 2, 3], quaternion: [0, Math.SQRT1_2, 0, Math.SQRT1_2] });
    expect(turned.direction[0]).toBeCloseTo(-1, 9);
    expect(turned.origin).toEqual([1, 2, 3]);
  });

  it("rayPoseFromRay round-trips a direction, straight up included", () => {
    for (const direction of [
      [0, 0, -1],
      [1, 0, 0],
      [0.6, 0, 0.8],
      [0, 1, 0],
      [0, -1, 0],
    ] as const) {
      const pose = rayPoseFromRay({ origin: [1, 1, 1], direction: [...direction] });
      const back = rayFromPose(pose).direction;
      for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(direction[i]!, 3);
      expect(Math.hypot(...pose.quaternion)).toBeCloseTo(1, 9);
    }
  });
});

describe("EyeGazeInput", () => {
  it("leaves the snapshots alone while no gaze source is present", () => {
    const input = new EyeGazeInput();
    const sources = [hand("left"), hand("right")];
    const out = input.update(frame(null, false), sources, DT);
    expect(out).toBe(sources);
    expect(input.ownsFarTargeting()).toBe(false);
  });

  it("takes far targeting from the first valid pose: hand rays drop, one gaze snapshot appears", () => {
    const input = new EyeGazeInput();
    const out = input.update(frame(), [hand("left"), hand("right")], DT);
    expect(input.ownsFarTargeting()).toBe(true);
    for (const h of handsOf(out)) {
      expect(h.ray).toBeUndefined();
      expect(h.gripPose).toBeDefined();
      expect(h.indexTip).toBeDefined();
    }
    const gaze = gazeOf(out)!;
    expect(gaze).toMatchObject({ id: EYE_GAZE_SOURCE_ID, kind: "gaze", handedness: "none", select: 0, squeeze: 0 });
    expect(gaze.ray).toEqual({ origin: [0, 1.6, 0], direction: [0, 0, -1] });
    expect(gaze.selectorPose).toBeUndefined();
    expect(out.filter((s) => s.kind === "gaze")).toHaveLength(1);
  });

  it("keeps far targeting through the tracking-loss grace, without a ray, then hands it back", () => {
    const input = new EyeGazeInput();
    input.update(frame(), [hand("left")], DT);
    let out = input.update(frame(null), [hand("left")], 4.9);
    expect(input.ownsFarTargeting()).toBe(true);
    expect(handsOf(out)[0]!.ray).toBeUndefined();
    expect(gazeOf(out)!.ray).toBeUndefined();
    out = input.update(frame(null), [hand("left")], 0.2);
    expect(input.ownsFarTargeting()).toBe(false);
    expect(handsOf(out)[0]!.ray).toEqual(LEFT_RAY);
    expect(gazeOf(out)).toBeUndefined();
  });

  it("hands far targeting back at once when the source is removed, grace or not", () => {
    const input = new EyeGazeInput();
    input.update(frame(), [hand("left")], DT);
    const out = input.update(frame(null, false), [hand("left")], DT);
    expect(input.ownsFarTargeting()).toBe(false);
    expect(handsOf(out)[0]!.ray).toEqual(LEFT_RAY);
    // And the grace does not carry over to a new source lifetime.
    const again = input.update(frame(null, true), [hand("left")], DT);
    expect(gazeOf(again)).toBeUndefined();
  });

  it("commits a selection to the hand that pinches, and that hand owns it until release", () => {
    const input = new EyeGazeInput();
    input.update(frame(), [hand("left"), hand("right")], DT);
    let out = input.update(frame(), [hand("left"), hand("right", 1)], DT);
    let gaze = gazeOf(out)!;
    expect(gaze.handedness).toBe("right");
    expect(gaze.select).toBe(1);
    expect(gaze.selectorPose).toEqual(rayPoseFromRay(RIGHT_RAY));
    expect(input.selectingHand()).toBe("right");
    // The other hand's pinch is ignored while the right owns it.
    out = input.update(frame(), [hand("left", 1), hand("right", 1)], DT);
    expect(gazeOf(out)!.handedness).toBe("right");
    // Hysteresis: mid-band keeps the hold.
    out = input.update(frame(), [hand("left", 0), hand("right", 0.5)], DT);
    expect(gazeOf(out)!.select).toBe(0.5);
    expect(input.selectingHand()).toBe("right");
    // Release below the release threshold.
    out = input.update(frame(), [hand("left", 0), hand("right", 0.2)], DT);
    gaze = gazeOf(out)!;
    expect(gaze.handedness).toBe("none");
    expect(gaze.select).toBe(0);
    expect(gaze.selectorPose).toBeUndefined();
  });

  it("gives the left hand priority when both pinches start on the same frame", () => {
    const input = new EyeGazeInput();
    input.update(frame(), [hand("left"), hand("right")], DT);
    const out = input.update(frame(), [hand("left", 1), hand("right", 1)], DT);
    expect(gazeOf(out)!.handedness).toBe("left");
  });

  it("never turns a pinch held from before gaze took over into a gaze click", () => {
    const input = new EyeGazeInput();
    // Pinching before the gaze source has a pose, and still when it gets one.
    input.update(frame(null, false), [hand("right", 1)], DT);
    let out = input.update(frame(), [hand("right", 1)], DT);
    expect(gazeOf(out)!.handedness).toBe("none");
    expect(gazeOf(out)!.select).toBe(0);
    // Released, then pinched again: now it arms and commits.
    input.update(frame(), [hand("right", 0)], DT);
    out = input.update(frame(), [hand("right", 1)], DT);
    expect(gazeOf(out)!.handedness).toBe("right");
  });

  it("needs a valid pose to commit, but a committed hold survives an invalid one", () => {
    const input = new EyeGazeInput();
    input.update(frame(), [hand("right")], DT);
    // A pinch during a blink commits nothing.
    let out = input.update(frame(null), [hand("right", 1)], DT);
    expect(gazeOf(out)!.handedness).toBe("none");
    input.update(frame(), [hand("right", 0)], DT);
    input.update(frame(), [hand("right", 1)], DT);
    // Tracking lost for longer than the grace: the hold continues, far rays return.
    out = input.update(frame(null), [hand("right", 1)], 6);
    expect(input.ownsFarTargeting()).toBe(false);
    expect(handsOf(out)[0]!.ray).toEqual(RIGHT_RAY);
    const gaze = gazeOf(out)!;
    expect(gaze.handedness).toBe("right");
    expect(gaze.select).toBe(1);
    expect(gaze.selectorPose).toBeDefined();
    expect(gaze.ray).toBeUndefined();
  });

  it("ends a hold when the gaze source is removed", () => {
    const input = new EyeGazeInput();
    input.update(frame(), [hand("right")], DT);
    input.update(frame(), [hand("right", 1)], DT);
    const out = input.update(frame(null, false), [hand("right", 1)], DT);
    expect(gazeOf(out)).toBeUndefined();
    expect(input.selectingHand()).toBeNull();
  });

  it("filters the gaze ray over frames and clamps a tiny dt to 1/240 s", () => {
    const input = new EyeGazeInput();
    input.update(frame(), [], DT);
    const turned: PoseTuple = { position: [0, 1.6, 0], quaternion: [0, Math.SQRT1_2, 0, Math.SQRT1_2] };
    const out = input.update(frame(turned), [], 0);
    const direction = gazeOf(out)!.ray!.direction;
    // Smoothed: part way from -Z toward -X, not snapped.
    expect(direction[0]).toBeLessThan(-0.01);
    expect(direction[2]).toBeLessThan(-0.01);
  });

  it("hands over fresh hand snapshots when it strips a ray, and copies the selector pose", () => {
    const input = new EyeGazeInput();
    const left = hand("left");
    const out = input.update(frame(), [left], DT);
    expect(handsOf(out)[0]).not.toBe(left);
    expect(left.ray).toEqual(LEFT_RAY);
    input.update(frame(), [hand("left", 1)], DT);
    const f = frame();
    const gaze = gazeOf(input.update(f, [hand("left", 1)], DT))!;
    expect(gaze.selectorPose).toEqual(f.rayPoses.left);
    expect(gaze.selectorPose).not.toBe(f.rayPoses.left);
  });

  it("reset forgets acquisition, ownership and arming", () => {
    const input = new EyeGazeInput();
    input.update(frame(), [hand("right")], DT);
    input.update(frame(), [hand("right", 1)], DT);
    input.reset();
    expect(input.ownsFarTargeting()).toBe(false);
    expect(input.selectingHand()).toBeNull();
    const out = input.update(frame(), [hand("right", 1)], DT);
    expect(gazeOf(out)!.handedness).toBe("none");
  });
});

describe("edge cases the reference tolerates", () => {
  it("a zero quaternion filters to identity rather than NaN", () => {
    const out = new EyeGazeFilter().filter({ position: [0, 0, 0], quaternion: [0, 0, 0, 0] }, DT);
    expect(out.quaternion).toEqual([0, 0, 0, 1]);
  });

  it("rayPoseFromRay survives a zero direction and a direction parallel to up", () => {
    const zero = rayPoseFromRay({ origin: [0, 0, 0], direction: [0, 0, 0] });
    expect(Math.hypot(...zero.quaternion)).toBeCloseTo(1, 9);
    const alongZ = rayPoseFromRay({ origin: [0, 0, 0], direction: [0, 0, -1] }, [0, 0, 1]);
    expect(Math.hypot(...alongZ.quaternion)).toBeCloseTo(1, 9);
    expect(rayFromPose(alongZ).direction[2]).toBeCloseTo(-1, 3);
  });

  it("rayPoseFromRay handles every quaternion-from-basis branch", () => {
    for (const [direction, up] of [
      [[0, 0, 1], [0, -1, 0]],
      [[0, 0, -1], [0, -1, 0]],
      [[1, 0, 0], [0, -1, 0]],
    ] as const) {
      const pose = rayPoseFromRay({ origin: [0, 0, 0], direction: [...direction] }, [...up]);
      const back = rayFromPose(pose).direction;
      for (let i = 0; i < 3; i++) expect(back[i]).toBeCloseTo(direction[i]!, 3);
    }
  });

  it("strips a controller far ray too, and passes a source with no ray through", () => {
    const input = new EyeGazeInput();
    const controller: InputSourceSnapshot = { id: "c", kind: "controller", handedness: "right", select: 0, squeeze: 0, ray: RIGHT_RAY };
    const bare: InputSourceSnapshot = { id: "b", kind: "hand", handedness: "left", select: 0, squeeze: 0 };
    const out = input.update(frame(), [controller, bare], DT);
    expect(out.find((s) => s.id === "c")!.ray).toBeUndefined();
    expect(out.find((s) => s.id === "b")).toBe(bare);
  });

  it("ignores a source with no handedness when reading the pinches", () => {
    const input = new EyeGazeInput();
    const mouse: InputSourceSnapshot = { id: "mouse", kind: "pointer2d", handedness: "none", select: 1, squeeze: 0, ray: RIGHT_RAY };
    input.update(frame(), [mouse], DT);
    const out = input.update(frame(), [mouse], DT);
    expect(gazeOf(out)!.handedness).toBe("none");
    expect(out.find((s) => s.id === "mouse")!.ray).toEqual(RIGHT_RAY);
  });

  it("omits the selector pose when the frame has no ray pose for the owning hand", () => {
    const input = new EyeGazeInput();
    const noPoses: EyeGazeFrame = { present: true, pose: AHEAD, rayPoses: {} };
    input.update(noPoses, [hand("right")], DT);
    const gaze = gazeOf(input.update(noPoses, [hand("right", 1)], DT))!;
    expect(gaze.handedness).toBe("right");
    expect(gaze.selectorPose).toBeUndefined();
  });
});
