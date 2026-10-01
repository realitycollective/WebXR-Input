/**
 * Pointer display: IWSDK 1.0.0's defaults, the app's switches, and the
 * drawing resolved from the arbiter's visuals. Each case fails a
 * configuration the reference would not produce.
 */
import { describe, expect, it } from "vitest";
import {
  POINTER_DISPLAY_DEFAULTS,
  PointerDisplay,
  pointerDrawing,
  pointerVisualsFor,
  resolvePointerDisplay,
  type PointerVisuals,
} from "../src/index.js";

const rayHit = (distance: number, targetKind: "object" | "panel" = "object"): PointerVisuals => ({
  ...pointerVisualsFor("s", true, "ray", { targetId: "t", point: [0, 1, -distance], distance, set: "x", targetKind }),
});
const idle: PointerVisuals = pointerVisualsFor("s", true, null, null);

describe("POINTER_DISPLAY_DEFAULTS", () => {
  it("is IWSDK's pointer look: a 1 m, 1 mm ray shown while hitting, drawn as a stub to min(0.3 m, hit), a 0.008 m disc 0.004 m off the surface", () => {
    expect(POINTER_DISPLAY_DEFAULTS).toMatchObject({
      cursorOnObjects: true,
      cursorOnPanels: true,
      ray: "whileHitting",
      rayOnlyOnPanels: false,
      rayLength: 1,
      rayReach: 0.3,
      rayFade: 0.05,
      rayHandFade: 0.03,
      rayRadius: 0.001,
      rayColor: [1, 1, 1],
      cursorRadius: 0.008,
      cursorOffset: 0.004,
      cursorOpacity: 0.7,
      cursorSelectedOpacity: 1,
      cursorSelectedScale: 0.8,
      cursorGrowFrom: 0.3,
    });
    expect(POINTER_DISPLAY_DEFAULTS.raySelectedColor.map((c) => Math.round(c * 255))).toEqual([0x33, 0x83, 0xe6]);
  });

  it("rejects settings that cannot be drawn", () => {
    expect(() => resolvePointerDisplay({ ray: "sometimes" as never })).toThrow(/ray must be one of/);
    expect(() => resolvePointerDisplay({ rayLength: -1 })).toThrow(/rayLength/);
    expect(() => resolvePointerDisplay({ cursorOpacity: 2 })).toThrow(/cursorOpacity/);
    expect(resolvePointerDisplay({ ray: "never" }).ray).toBe("never");
  });
});

describe("pointerDrawing", () => {
  it("whileHitting: draws the ray only while the ray owns the source and hits something", () => {
    const config = resolvePointerDisplay();
    expect(pointerDrawing(config, idle, false).ray).toBe(false);
    expect(pointerDrawing(config, rayHit(1.5), false).ray).toBe(true);
    const touching = pointerVisualsFor("s", true, "touch", { targetId: "t", point: [0, 0, 0], distance: 0.01 });
    expect(pointerDrawing(config, touching, false).ray).toBe(false);
  });

  it("draws IWSDK's stub: fully visible from 0.03 m to min(0.3, hit) - 0.05 m, gone at min(0.3, hit)", () => {
    const config = resolvePointerDisplay();
    const far = pointerDrawing(config, rayHit(1.5), false);
    expect(far.rayFrom).toBeCloseTo(0.03);
    expect(far.raySolidTo).toBeCloseTo(0.25);
    expect(far.rayTo).toBeCloseTo(0.3);
    const near = pointerDrawing(config, rayHit(0.1), false);
    expect(near.rayTo).toBeCloseTo(0.1);
    expect(near.raySolidTo).toBeCloseTo(0.05);
    // A ray shorter than the reach caps the stub.
    expect(pointerDrawing(resolvePointerDisplay({ rayLength: 0.2 }), rayHit(1.5), false).rayTo).toBeCloseTo(0.2);
  });

  it("never and always: the ray follows the switch, but never shows while a near pointer owns the hand", () => {
    expect(pointerDrawing(resolvePointerDisplay({ ray: "never" }), rayHit(1), false).ray).toBe(false);
    const always = resolvePointerDisplay({ ray: "always" });
    expect(pointerDrawing(always, idle, false).ray).toBe(true);
    expect(pointerDrawing(always, idle, false).rayTo).toBeCloseTo(0.3);
    const grabbing = pointerVisualsFor("s", true, "grab", { targetId: "t", point: [0, 0, 0], distance: 0.01 });
    expect(pointerDrawing(always, grabbing, false).ray).toBe(false);
    expect(pointerDrawing(always, pointerVisualsFor("s", false, null, null), false).ray).toBe(false);
  });

  it("rayOnlyOnPanels: an object hit draws no ray, a panel hit does", () => {
    const config = resolvePointerDisplay({ rayOnlyOnPanels: true });
    expect(pointerDrawing(config, rayHit(1, "object"), false).ray).toBe(false);
    expect(pointerDrawing(config, rayHit(1, "panel"), false).ray).toBe(true);
  });

  it("cursor switches per target kind, with the point copied fresh", () => {
    const config = resolvePointerDisplay({ cursorOnObjects: false });
    expect(pointerDrawing(config, rayHit(1, "object"), false).cursor).toBe(false);
    const onPanel = pointerDrawing(config, rayHit(1, "panel"), false);
    expect(onPanel.cursor).toBe(true);
    expect(onPanel.cursorPoint).toEqual([0, 1, -1]);
    expect(onPanel.cursorPoint).not.toBe(rayHit(1, "panel").cursorPoint);
    expect(pointerDrawing(resolvePointerDisplay({ cursorOnPanels: false }), rayHit(1, "panel"), false).cursor).toBe(false);
    expect(pointerDrawing(config, idle, false).cursorPoint).toBeNull();
  });

  it("scales and recolours as IWSDK does: the disc grows past 0.3 m, shrinks to 0.8 and goes opaque while selecting, the ray turns blue", () => {
    const config = resolvePointerDisplay();
    const near = pointerDrawing(config, rayHit(0.2), false);
    expect(near.cursorRadius).toBeCloseTo(0.008);
    expect(near.cursorOpacity).toBe(0.7);
    expect(near.rayColor).toEqual([1, 1, 1]);
    const far = pointerDrawing(config, rayHit(1.3), false);
    expect(far.cursorRadius).toBeCloseTo(0.008 * 2);
    const selected = pointerDrawing(config, rayHit(1.3), true);
    expect(selected.cursorRadius).toBeCloseTo(0.008 * 2 * 0.8);
    expect(selected.cursorOpacity).toBe(1);
    expect(selected.rayColor).toBe(config.raySelectedColor);
    expect(selected.cursorOffset).toBe(0.004);
    expect(selected.rayRadius).toBe(0.001);
  });
});

describe("PointerDisplay", () => {
  it("starts from the defaults, changes at run time and tells listeners once per change", () => {
    const display = new PointerDisplay({ ray: "never" });
    expect(display.get().ray).toBe("never");
    expect(display.get().cursorOnPanels).toBe(true);
    const heard: string[] = [];
    const off = display.onChange((config) => heard.push(config.ray));
    display.set({ ray: "always" });
    expect(display.get().ray).toBe("always");
    expect(heard).toEqual(["always"]);
    expect(display.drawing(idle, false).ray).toBe(true);
    off();
    display.set({ ray: "whileHitting" });
    expect(heard).toEqual(["always"]);
    expect(() => display.set({ rayRadius: Number.NaN })).toThrow(/rayRadius/);
  });
});
