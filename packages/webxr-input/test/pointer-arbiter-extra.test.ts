import { describe, expect, it } from "vitest";
import { PointerArbiter, copyPoint } from "../src/index.js";

describe("PointerArbiter subscriptions and copies", () => {
  it("stops telling an unsubscribed listener about decisions", () => {
    const arbiter = new PointerArbiter();
    const set = arbiter.registerSet("interactions", "object");
    let heard = 0;
    const off = arbiter.onDecision(() => {
      heard += 1;
    });
    set.offer("right", "ray", { targetId: "t", point: [0, 0, -1], distance: 1 });
    arbiter.resolve("right");
    off();
    arbiter.resolve("right");
    expect(heard).toBe(1);
  });

  it("copies a point into a fresh tuple", () => {
    const point: readonly [number, number, number] = [1, 2, 3];
    const copy = copyPoint(point);
    expect(copy).toEqual([1, 2, 3]);
    expect(copy).not.toBe(point);
  });
});
