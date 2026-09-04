import type { PoseTuple, QuatTuple, Vec3Tuple } from "./types.js";

/**
 * Grip velocity derived from two consecutive poses - the throw/flick input
 * every physics-flavoured grab needs, for the many providers that report
 * poses but no velocity. Pure and dependency-free: the caller keeps the
 * previous pose, this turns the pair into a velocity.
 *
 * `linear` is metres per second in world space. `angular` is a rotation
 * axis scaled by radians per second, taken along the shortest arc between
 * the two orientations. Both are zero when `dtSeconds` is zero, negative
 * or not a finite number, so a dropped frame can never produce Infinity.
 *
 * The result is shaped to drop straight into
 * `InputSourceSnapshot.linearVelocity` / `.angularVelocity`.
 */
export function velocityBetween(
  prev: PoseTuple,
  next: PoseTuple,
  dtSeconds: number,
): { linear: Vec3Tuple; angular: Vec3Tuple } {
  if (!Number.isFinite(dtSeconds) || dtSeconds <= 0) {
    return { linear: [0, 0, 0], angular: [0, 0, 0] };
  }

  const linear: Vec3Tuple = [
    (next.position[0] - prev.position[0]) / dtSeconds,
    (next.position[1] - prev.position[1]) / dtSeconds,
    (next.position[2] - prev.position[2]) / dtSeconds,
  ];

  // Rotation from prev to next: next * conjugate(prev).
  const delta = multiply(next.quaternion, conjugate(prev.quaternion));
  // q and -q are the same rotation; the one with w >= 0 is the short way.
  const [dx, dy, dz, dw] = delta[3] < 0 ? negate(delta) : delta;

  const angle = 2 * Math.acos(Math.min(1, Math.max(-1, dw)));
  const sinHalf = Math.sin(angle / 2);
  // Below this the axis is numerical noise, so report no rotation at all.
  if (Math.abs(sinHalf) < 1e-8) {
    return { linear, angular: [0, 0, 0] };
  }

  const scale = angle / (sinHalf * dtSeconds);
  return { linear, angular: [dx * scale, dy * scale, dz * scale] };
}

function conjugate(q: QuatTuple): QuatTuple {
  return [-q[0], -q[1], -q[2], q[3]];
}

function negate(q: QuatTuple): QuatTuple {
  return [-q[0], -q[1], -q[2], -q[3]];
}

function multiply(a: QuatTuple, b: QuatTuple): QuatTuple {
  const [ax, ay, az, aw] = a;
  const [bx, by, bz, bw] = b;
  return [
    aw * bx + ax * bw + ay * bz - az * by,
    aw * by - ax * bz + ay * bw + az * bx,
    aw * bz + ax * by - ay * bx + az * bw,
    aw * bw - ax * bx - ay * by - az * bz,
  ];
}
