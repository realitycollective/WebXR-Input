import { describe, expect, it } from "vitest";
import { velocityBetween, type PoseTuple } from "@realitycollective/webxr-input";

const IDENTITY: PoseTuple = { position: [0, 0, 0], quaternion: [0, 0, 0, 1] };

/** A quaternion for `degrees` about the +Y axis. */
function yaw(degrees: number): PoseTuple {
  const half = (degrees * Math.PI) / 360;
  return {
    position: [0, 0, 0],
    quaternion: [0, Math.sin(half), 0, Math.cos(half)],
  };
}

describe("velocityBetween", () => {
  it("reports no motion between identical poses", () => {
    expect(velocityBetween(IDENTITY, IDENTITY, 0.5)).toEqual({
      linear: [0, 0, 0],
      angular: [0, 0, 0],
    });
  });

  it("divides pure translation by the time step", () => {
    const next: PoseTuple = { position: [1, 2, 3], quaternion: [0, 0, 0, 1] };
    const { linear, angular } = velocityBetween(IDENTITY, next, 0.5);
    expect(linear).toEqual([2, 4, 6]);
    expect(angular).toEqual([0, 0, 0]);
  });

  it("turns 90 degrees about Y in half a second into pi rad/s", () => {
    const { linear, angular } = velocityBetween(IDENTITY, yaw(90), 0.5);
    expect(linear).toEqual([0, 0, 0]);
    expect(angular[0]).toBeCloseTo(0, 10);
    expect(angular[1]).toBeCloseTo(Math.PI, 10);
    expect(angular[2]).toBeCloseTo(0, 10);
  });

  it("takes the shortest arc when the delta quaternion has a negative w", () => {
    // 270 degrees about +Y is 90 degrees about -Y the short way round.
    const { angular } = velocityBetween(IDENTITY, yaw(270), 0.5);
    expect(angular[1]).toBeCloseTo(-Math.PI, 10);
  });

  it("measures rotation from a moving start pose", () => {
    const { angular } = velocityBetween(yaw(30), yaw(120), 0.5);
    expect(angular[1]).toBeCloseTo(Math.PI, 10);
  });

  it("returns zeros for a zero, negative or non-finite time step", () => {
    const moved: PoseTuple = { position: [1, 1, 1], quaternion: [0, 0, 0, 1] };
    const zero = { linear: [0, 0, 0], angular: [0, 0, 0] };
    expect(velocityBetween(IDENTITY, moved, 0)).toEqual(zero);
    expect(velocityBetween(IDENTITY, moved, -0.5)).toEqual(zero);
    expect(velocityBetween(IDENTITY, moved, Number.NaN)).toEqual(zero);
    expect(velocityBetween(IDENTITY, moved, Number.POSITIVE_INFINITY)).toEqual(zero);
  });
});
