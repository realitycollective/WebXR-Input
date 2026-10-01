/**
 * The arbiter: one decision per source across target sets, IWSDK's
 * priority and selection lock, the nearest candidate per kind across sets,
 * and the visuals it implies. Each rule has a case that fails without it.
 */
import { describe, expect, it } from "vitest";
import {
  PointerArbiter,
  POINTER_PRIORITY,
  pickActivePointer,
  pointerVisualsFor,
  type PointerCandidate,
} from "../src/index.js";

const at = (targetId: string, distance: number): PointerCandidate => ({ targetId, point: [0, 0, -distance], distance });

describe("pickActivePointer", () => {
  it("orders touch, grab, ray and takes the first with a candidate", () => {
    expect(POINTER_PRIORITY).toEqual(["touch", "grab", "ray"]);
    expect(pickActivePointer({ touch: false, grab: true, ray: true }, null, false)).toBe("grab");
    expect(pickActivePointer({ touch: true, grab: true, ray: true }, "ray", false)).toBe("touch");
    expect(pickActivePointer({ touch: false, grab: false, ray: false }, "ray", false)).toBeNull();
  });

  it("keeps the current pointer while it is selecting", () => {
    expect(pickActivePointer({ touch: true, grab: false, ray: true }, "ray", true)).toBe("ray");
    expect(pickActivePointer({ touch: true, grab: false, ray: false }, null, true)).toBe("touch");
  });
});

describe("PointerArbiter across two target sets", () => {
  it("picks the nearest candidate per kind across sets, then the active kind by priority", () => {
    const arbiter = new PointerArbiter();
    const objects = arbiter.registerSet("interactions", "object");
    const panels = arbiter.registerSet("uix", "panel");
    objects.offer("right", "ray", at("ball", 1.2));
    panels.offer("right", "ray", at("info", 0.8));
    const decision = arbiter.resolve("right");
    expect(decision.active).toBe("ray");
    expect(decision.candidate).toMatchObject({ targetId: "info", set: "uix", targetKind: "panel", distance: 0.8 });
    expect(panels.owns("right", "ray")).toBe(true);
    expect(objects.owns("right", "ray")).toBe(false);
    expect(objects.ownedElsewhere("right")).toBe(true);
  });

  it("a fingertip touching an object retires the ray that was on a panel (touch beats ray across sets)", () => {
    const arbiter = new PointerArbiter();
    const objects = arbiter.registerSet("interactions", "object");
    const panels = arbiter.registerSet("uix", "panel");
    panels.offer("right", "ray", at("info", 0.8));
    objects.offer("right", "touch", null);
    expect(arbiter.resolve("right").active).toBe("ray");
    objects.offer("right", "touch", at("button", 0.05));
    const decision = arbiter.resolve("right");
    expect(decision.active).toBe("touch");
    expect(decision.candidate?.set).toBe("interactions");
    const visuals = arbiter.visuals("right", true);
    expect(visuals.ray).toBe(false);
    expect(visuals.cursor).toBe(true);
    expect(visuals.targetKind).toBe("object");
    expect(panels.owns("right", "ray")).toBe(false);
    expect(panels.ownedElsewhere("right")).toBe(true);
  });

  it("a fingertip touching a panel retires the ray that was on an object", () => {
    const arbiter = new PointerArbiter();
    const objects = arbiter.registerSet("interactions", "object");
    const panels = arbiter.registerSet("uix", "panel");
    objects.offer("left", "ray", at("ball", 1.0));
    panels.offer("left", "touch", at("info", 0.01));
    const decision = arbiter.resolve("left");
    expect(decision.active).toBe("touch");
    expect(decision.candidate?.targetKind).toBe("panel");
    expect(arbiter.visuals("left", true)).toMatchObject({ ray: false, cursor: true, targetKind: "panel", targetId: "info", hitDistance: 0.01 });
  });

  it("holds the selection lock: a pressing ray on a panel keeps the source when a touch candidate appears", () => {
    const arbiter = new PointerArbiter();
    const objects = arbiter.registerSet("interactions", "object");
    const panels = arbiter.registerSet("uix", "panel");
    panels.offer("right", "ray", at("info", 0.8));
    arbiter.resolve("right");
    panels.setSelecting("right", "ray", true);
    objects.offer("right", "touch", at("button", 0.01));
    const held = arbiter.resolve("right");
    expect(held.active).toBe("ray");
    expect(held.candidate?.set).toBe("uix");
    panels.setSelecting("right", "ray", false);
    expect(arbiter.resolve("right").active).toBe("touch");
  });

  it("while locked, follows the locked set's own latest candidate, even to none", () => {
    const arbiter = new PointerArbiter();
    const objects = arbiter.registerSet("interactions", "object");
    const panels = arbiter.registerSet("uix", "panel");
    objects.offer("right", "ray", at("ball", 1.0));
    arbiter.resolve("right");
    objects.setSelecting("right", "ray", true);
    // A nearer panel appears under the ray while the object press is held: the press keeps its target.
    panels.offer("right", "ray", at("info", 0.5));
    expect(arbiter.resolve("right").candidate?.targetId).toBe("ball");
    objects.offer("right", "ray", null);
    const lost = arbiter.resolve("right");
    expect(lost.active).toBe("ray");
    expect(lost.candidate).toBeNull();
    expect(arbiter.visuals("right", true).cursor).toBe(false);
  });

  it("a set used on its own decides exactly as the near-pointer rule did", () => {
    const arbiter = new PointerArbiter();
    const objects = arbiter.registerSet("interactions", "object");
    objects.offer("right", "grab", at("ball", 0.02));
    objects.offer("right", "ray", at("hoop", 2));
    const decision = arbiter.resolve("right");
    expect(decision.active).toBe("grab");
    expect(arbiter.visuals("right", true)).toMatchObject({ ray: false, cursor: true, cursorPoint: [0, 0, -0.02], targetKind: "object" });
  });

  it("forgets a source on request, in every set", () => {
    const arbiter = new PointerArbiter();
    const objects = arbiter.registerSet("interactions", "object");
    objects.offer("right", "ray", at("ball", 1));
    objects.setSelecting("right", "ray", true);
    arbiter.resolve("right");
    arbiter.forget("right");
    expect(arbiter.decision("right")).toBeUndefined();
    expect(arbiter.resolve("right").active).toBeNull();
    objects.offer("left", "ray", at("ball", 1));
    arbiter.resolve("left");
    objects.forget("left");
    expect(arbiter.resolve("left").active).toBeNull();
    arbiter.reset();
    expect(arbiter.decision("left")).toBeUndefined();
  });

  it("publishes decisions, records an external gaze decision, lists its sets, and drops a disposed set's offers", () => {
    const arbiter = new PointerArbiter();
    const seen: string[] = [];
    arbiter.onDecision((decision) => seen.push(`${decision.sourceId}:${String(decision.active)}`));
    const objects = arbiter.registerSet("interactions", "object");
    const panels = arbiter.registerSet("uix", "panel");
    expect(arbiter.getSets()).toEqual([
      { id: "interactions", kind: "object" },
      { id: "uix", kind: "panel" },
    ]);
    panels.offer("right", "ray", at("info", 1));
    arbiter.resolve("right");
    arbiter.setDecision({ sourceId: "gaze", active: "gaze", candidate: { targetId: "ball", point: [0, 0, -2], distance: 2, set: "interactions", targetKind: "object" } });
    expect(arbiter.visuals("gaze", true)).toMatchObject({ activePointer: "gaze", ray: false, cursor: true, targetId: "ball" });
    panels.dispose();
    expect(arbiter.resolve("right").active).toBeNull();
    expect(seen).toEqual(["right:ray", "gaze:gaze", "right:null"]);
    expect(() => arbiter.registerSet("", "object")).toThrow(/non-empty id/);
    objects.dispose();
    expect(arbiter.getSets()).toEqual([]);
  });
});

describe("pointerVisualsFor", () => {
  it("shows the ray only while the ray owns the source or nothing does, and the cursor only with a candidate", () => {
    expect(pointerVisualsFor("s", true, null, null)).toMatchObject({ ray: true, cursor: false, cursorPoint: null, targetKind: null, targetId: null, hitDistance: null });
    expect(pointerVisualsFor("s", true, "touch", at("b", 0.01))).toMatchObject({ ray: false, cursor: true, targetKind: "object" });
    expect(pointerVisualsFor("s", false, "ray", at("b", 1))).toMatchObject({ ray: false, cursor: true });
    expect(pointerVisualsFor("s", true, "ray", null)).toMatchObject({ ray: true, cursor: false });
  });
});
