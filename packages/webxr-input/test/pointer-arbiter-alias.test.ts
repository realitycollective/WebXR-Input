import { describe, expect, it } from "vitest";
import { PointerArbiter } from "../src/index.js";

const at = (targetId: string, distance: number) => ({ targetId, point: [0, 1, -distance] as const, distance });

describe("PointerArbiter aliases", () => {
  it("lets a UI host offer by side while the runtime offers by its snapshot id", () => {
    const arbiter = new PointerArbiter();
    const objects = arbiter.registerSet("interactions", "object");
    const panels = arbiter.registerSet("uix", "panel");
    arbiter.alias("right", "right-input");
    objects.offer("right-input", "ray", at("ball", 1.5));
    panels.offer("right", "ray", at("info", 0.7));
    const decision = arbiter.resolve("right-input");
    expect(decision.candidate?.targetId).toBe("info");
    expect(panels.owns("right", "ray")).toBe(true);
    expect(objects.ownedElsewhere("right-input")).toBe(true);
    expect(arbiter.keyOf("right")).toBe("right-input");
    expect(arbiter.decision("right")).toBe(decision);
    expect(arbiter.visuals("right", true).targetId).toBe("info");
    panels.setSelecting("right", "ray", true);
    objects.offer("right-input", "touch", at("ball", 0.01));
    expect(arbiter.resolve("right").active).toBe("ray");
    panels.forget("right");
    expect(arbiter.resolve("right-input").active).toBe("touch");
  });

  it("moves offers made under an alias before it was declared, ignores a self alias, and drops aliases on forget and reset", () => {
    const arbiter = new PointerArbiter();
    const panels = arbiter.registerSet("uix", "panel");
    panels.offer("left", "ray", at("info", 0.7));
    panels.setSelecting("left", "ray", true);
    arbiter.alias("left", "left");
    arbiter.alias("left", "left-input");
    expect(arbiter.resolve("left-input").candidate?.targetId).toBe("info");
    arbiter.alias("left", "left-input");
    arbiter.alias("other", "other-input");
    arbiter.forget("left");
    expect(arbiter.keyOf("left")).toBe("left");
    expect(arbiter.keyOf("other")).toBe("other-input");
    arbiter.alias("left", "left-input");
    arbiter.unalias("left");
    expect(arbiter.keyOf("left")).toBe("left");
    arbiter.alias("left", "left-input");
    arbiter.reset();
    expect(arbiter.keyOf("left")).toBe("left");
    // Offers under an alias with no selection recorded move too.
    panels.offer("far", "ray", at("info", 1));
    arbiter.alias("far", "far-input");
    expect(arbiter.resolve("far-input").candidate?.targetId).toBe("info");
    // An alias declared with no pending offers under it, and a second declaration when offers exist for the target.
    const objects = arbiter.registerSet("interactions", "object");
    objects.offer("right-input", "ray", at("ball", 1));
    arbiter.alias("right", "right-input");
    panels.offer("right", "touch", at("info", 0.01));
    arbiter.alias("right", "right-input");
    expect(arbiter.resolve("right").active).toBe("touch");
  });
});
