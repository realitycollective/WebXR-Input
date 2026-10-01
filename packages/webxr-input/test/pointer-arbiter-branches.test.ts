import { describe, expect, it } from "vitest";
import { PointerArbiter } from "../src/index.js";

describe("PointerArbiter edge cases", () => {
  it("a set replaced under the same id: disposing the old handle leaves the new set in place", () => {
    const arbiter = new PointerArbiter();
    const first = arbiter.registerSet("interactions", "object");
    const second = arbiter.registerSet("interactions", "object");
    first.dispose();
    expect(arbiter.getSets()).toEqual([{ id: "interactions", kind: "object" }]);
    second.offer("right", "ray", { targetId: "t", point: [0, 0, -1], distance: 1 });
    expect(arbiter.resolve("right").active).toBe("ray");
  });

  it("visuals for a source decided with no candidate show the ray and no cursor", () => {
    const arbiter = new PointerArbiter();
    const set = arbiter.registerSet("interactions", "object");
    set.offer("right", "ray", null);
    arbiter.resolve("right");
    expect(arbiter.visuals("right", true)).toMatchObject({ activePointer: null, ray: true, cursor: false, cursorPoint: null });
  });

  it("while locked on a set that no longer offers for the source, the decision keeps the kind with no candidate", () => {
    const arbiter = new PointerArbiter();
    const set = arbiter.registerSet("interactions", "object");
    set.offer("right", "ray", { targetId: "t", point: [0, 0, -1], distance: 1 });
    arbiter.resolve("right");
    set.setSelecting("right", "ray", true);
    set.forget("right");
    // The lock state went with the forget, so the next resolve starts afresh.
    expect(arbiter.resolve("right").active).toBeNull();
    set.offer("right", "ray", { targetId: "t", point: [0, 0, -1], distance: 1 });
    arbiter.resolve("right");
    set.setSelecting("right", "ray", true);
    const other = arbiter.registerSet("uix", "panel");
    other.offer("right", "ray", { targetId: "p", point: [0, 0, -0.5], distance: 0.5 });
    // The locked set's offers map exists but its ray offer is replaced by nothing.
    set.offer("right", "grab", null);
    expect(arbiter.resolve("right").candidate?.targetId).toBe("t");
  });
});
