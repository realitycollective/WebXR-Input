/**
 * Pointer display - what an app shows for a pointer: the ray line and the
 * cursor disc. App configuration, through the core, on every platform.
 *
 * Every visible element is the app's to configure (the owner's standing
 * rule). On the web these settings lived inside Meta IWSDK's pointer stack
 * (`@iwsdk/xr-input` `RayPointer.rayDisplayMode`, only reachable through the
 * private `ray` member of `MultiPointer`, and `CursorVisual`), where no
 * client could reach them and no other platform could read them. This
 * module restates them as data, with IWSDK 1.0.0's values as the defaults,
 * so a binding on any platform draws the same thing and a native host is
 * handed the drawing already decided.
 *
 * The reference, read from IWSDK 1.0.0 source:
 *
 * - `ray-pointer.js`: the ray is a cylinder 1 m long and 0.001 m in
 *   radius along the ray, colour `0xffffff`, `0x3383e6` while selecting.
 *   `rayDisplayMode` defaults to `VisibleOnIntersection`: shown only while
 *   the ray hits something. Its shader leaves the far part transparent:
 *   with `v = 1 - z` along the 1 m mesh, alpha is 1 between
 *   `endValue = 1.05 - min(0.3, hitDistance)` and 0.97, fades to 0 over
 *   0.05 below `endValue`, and fades out over the last 0.03 at the hand. So
 *   what is drawn is a STUB from 0.03 m in front of the hand out to
 *   `min(0.3, hitDistance)` m, never the far end of the ray. That is why a
 *   1 mm white stub "reads as no ray" on a Quest.
 * - `cursor-visual.js`: one disc per hand, radius 0.008 m, white with a
 *   grey rim, opacity 0.7 (1 while selecting), scale
 *   `(max(0, distance - 0.3) + 1) * (selecting ? 0.8 : 1)`, sitting 0.004 m
 *   off the surface along its normal (plus a per-pointer stagger, an engine
 *   detail not restated), at the ACTIVE pointer's hit.
 * - `multi-pointer.js`: the cursor is shown exactly while the active
 *   pointer has a hit; the ray is hidden while a near pointer owns the hand.
 *   Those two rules are the arbiter's (`pointer-arbiter.ts`); this module
 *   only adds the app's configuration on top of them.
 */
import type { PointerVisuals } from "./pointer-arbiter.js";
import type { Unsubscribe, Vec3Tuple } from "./types.js";

/** A colour as `[r, g, b]`, each 0..1. */
export type RGBTuple = readonly [number, number, number];

/**
 * When the ray line is drawn, given the arbiter allows one at all:
 * `"never"`, `"always"`, or `"whileHitting"` (IWSDK's
 * `VisibleOnIntersection`, the default).
 */
export type RayDisplayMode = "never" | "always" | "whileHitting";

export interface PointerDisplayConfig {
  /** Draw the cursor disc where the active pointer meets a registered interactable. IWSDK: always. */
  cursorOnObjects: boolean;
  /** Draw the cursor disc where the active pointer meets a UI panel. IWSDK: always. */
  cursorOnPanels: boolean;
  /** When the ray line is drawn. IWSDK: `VisibleOnIntersection`. */
  ray: RayDisplayMode;
  /** With `ray: "whileHitting"`, count only panel hits: an object hit draws no ray. IWSDK: off. */
  rayOnlyOnPanels: boolean;
  /** The ray mesh's length, metres. IWSDK: 1. `rayReach` caps what is drawn of it. */
  rayLength: number;
  /** The drawn stub never extends past this, metres, whatever the hit distance. IWSDK: `min(0.3, hitDistance)`. */
  rayReach: number;
  /** Metres over which the stub fades to nothing at its far end. IWSDK: 0.05 of the mesh. */
  rayFade: number;
  /** Metres at the hand over which the stub fades in. IWSDK: 0.03 of the mesh. */
  rayHandFade: number;
  /** Ray cylinder radius, metres. IWSDK: 0.001. */
  rayRadius: number;
  /** Ray colour while not selecting. IWSDK: `0xffffff`. */
  rayColor: RGBTuple;
  /** Ray colour while selecting. IWSDK: `0x3383e6`. */
  raySelectedColor: RGBTuple;
  /** Cursor disc radius at scale 1, metres. IWSDK: 0.008. */
  cursorRadius: number;
  /** Metres the disc sits off the surface along its normal. IWSDK: 0.004. */
  cursorOffset: number;
  /** Disc opacity while not selecting. IWSDK: 0.7. */
  cursorOpacity: number;
  /** Disc opacity while selecting. IWSDK: 1. */
  cursorSelectedOpacity: number;
  /** The disc shrinks by this factor while selecting. IWSDK: 0.8. */
  cursorSelectedScale: number;
  /** Beyond this hit distance, metres, the disc grows by the excess (in metres) so a far cursor stays visible. IWSDK: 0.3. */
  cursorGrowFrom: number;
}

/** IWSDK 1.0.0's pointer look, as `@iwsdk/xr-input` builds it. */
export const POINTER_DISPLAY_DEFAULTS: Readonly<PointerDisplayConfig> = Object.freeze({
  cursorOnObjects: true,
  cursorOnPanels: true,
  ray: "whileHitting",
  rayOnlyOnPanels: false,
  rayLength: 1,
  rayReach: 0.3,
  rayFade: 0.05,
  rayHandFade: 0.03,
  rayRadius: 0.001,
  rayColor: Object.freeze([1, 1, 1] as const),
  raySelectedColor: Object.freeze([0x33 / 255, 0x83 / 255, 0xe6 / 255] as const),
  cursorRadius: 0.008,
  cursorOffset: 0.004,
  cursorOpacity: 0.7,
  cursorSelectedOpacity: 1,
  cursorSelectedScale: 0.8,
  cursorGrowFrom: 0.3,
});

const RAY_MODES: readonly RayDisplayMode[] = ["never", "always", "whileHitting"];
const LENGTH_KEYS = ["rayLength", "rayReach", "rayFade", "rayHandFade", "rayRadius", "cursorRadius", "cursorOffset", "cursorGrowFrom"] as const;
const UNIT_KEYS = ["cursorOpacity", "cursorSelectedOpacity", "cursorSelectedScale"] as const;

/** The defaults with `options` over them, checked. Throws on a value that cannot be drawn. */
export function resolvePointerDisplay(options: Partial<PointerDisplayConfig> = {}): PointerDisplayConfig {
  const resolved: PointerDisplayConfig = { ...POINTER_DISPLAY_DEFAULTS, ...options };
  if (!RAY_MODES.includes(resolved.ray)) {
    throw new Error(
      "[webxr-input] pointer display: ray must be one of " + RAY_MODES.join(", ") + ", got \"" + String(resolved.ray) + "\"",
    );
  }
  for (const key of LENGTH_KEYS) {
    const value = resolved[key];
    if (!Number.isFinite(value) || value < 0) {
      throw new Error("[webxr-input] pointer display: " + key + " must be a finite number >= 0, got " + String(value));
    }
  }
  for (const key of UNIT_KEYS) {
    const value = resolved[key];
    if (!Number.isFinite(value) || value < 0 || value > 1) {
      throw new Error("[webxr-input] pointer display: " + key + " must be within 0..1, got " + String(value));
    }
  }
  return resolved;
}

/**
 * What to draw for one source this frame, resolved from the app's
 * configuration and the arbiter's decision. A binding draws exactly this;
 * a native host is handed it and decides nothing. Fresh each frame.
 */
export interface PointerDrawing {
  sourceId: string;
  /** Draw the ray stub. Already false when the arbiter hides the ray (a near pointer owns the hand, or no ray). */
  ray: boolean;
  /** Metres along the ray from its origin where the stub is fully visible after the hand fade-in. */
  rayFrom: number;
  /** Metres along the ray where the far fade begins. */
  raySolidTo: number;
  /** Metres along the ray where the stub has faded to nothing: `min(rayReach, rayLength, hitDistance)`. */
  rayTo: number;
  /** Ray cylinder radius, metres. */
  rayRadius: number;
  /** Ray colour this frame: the selected colour while the source is selecting. */
  rayColor: RGBTuple;
  /** Draw the cursor disc at `cursorPoint`. */
  cursor: boolean;
  /** World-space disc centre before the surface offset, or null. */
  cursorPoint: Vec3Tuple | null;
  /** Disc radius this frame, metres: `cursorRadius` times IWSDK's distance and selection scale. */
  cursorRadius: number;
  /** Disc opacity this frame. */
  cursorOpacity: number;
  /** Metres the disc sits off the surface along its normal. */
  cursorOffset: number;
}

/**
 * Resolve the drawing for one source: the arbiter's `visuals` (which pointer
 * owns the source, whether a ray may show, where the cursor is) under the
 * app's `config`. `selecting` is whether the source is pressing or grabbing,
 * which recolours the ray and focuses the cursor as IWSDK does.
 */
export function pointerDrawing(config: PointerDisplayConfig, visuals: PointerVisuals, selecting: boolean): PointerDrawing {
  const distance = visuals.hitDistance ?? null;
  const rayHit = visuals.cursor && visuals.activePointer === "ray" && visuals.cursorPoint !== null;
  const countedHit = rayHit && (!config.rayOnlyOnPanels || visuals.targetKind === "panel");
  const ray = visuals.ray && (config.ray === "always" || (config.ray === "whileHitting" && countedHit));
  const reach = Math.min(config.rayReach, config.rayLength, rayHit && distance !== null ? distance : config.rayReach);
  const rayFrom = Math.min(config.rayHandFade, reach);
  const raySolidTo = Math.max(rayFrom, reach - config.rayFade);

  const cursorAllowed = visuals.targetKind === "panel" ? config.cursorOnPanels : config.cursorOnObjects;
  const cursor = visuals.cursor && visuals.cursorPoint !== null && cursorAllowed;
  const grow = Math.max(0, (distance ?? 0) - config.cursorGrowFrom) + 1;
  const scale = grow * (selecting ? config.cursorSelectedScale : 1);
  const point = visuals.cursorPoint;

  return {
    sourceId: visuals.sourceId,
    ray,
    rayFrom,
    raySolidTo,
    rayTo: reach,
    rayRadius: config.rayRadius,
    rayColor: selecting ? config.raySelectedColor : config.rayColor,
    cursor,
    cursorPoint: cursor && point ? [point[0], point[1], point[2]] : null,
    cursorRadius: config.cursorRadius * scale,
    cursorOpacity: selecting ? config.cursorSelectedOpacity : config.cursorOpacity,
    cursorOffset: config.cursorOffset,
  };
}

/**
 * The app's pointer display settings, settable at start-up and at run time.
 * Bindings read `get()` each frame (or subscribe) and apply it; nothing else
 * decides how a pointer looks.
 */
export class PointerDisplay {
  private config: PointerDisplayConfig;
  private readonly listeners = new Set<(config: PointerDisplayConfig) => void>();

  constructor(options: Partial<PointerDisplayConfig> = {}) {
    this.config = resolvePointerDisplay(options);
  }

  /** The settings in force. Read, never write; `set` replaces the object. */
  get(): Readonly<PointerDisplayConfig> {
    return this.config;
  }

  /** Change any settings at run time; unchanged fields keep their value. Listeners hear the result once. */
  set(options: Partial<PointerDisplayConfig>): void {
    this.config = resolvePointerDisplay({ ...this.config, ...options });
    for (const listener of [...this.listeners]) listener(this.config);
  }

  onChange(listener: (config: PointerDisplayConfig) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** The drawing for one source under the settings in force. */
  drawing(visuals: PointerVisuals, selecting: boolean): PointerDrawing {
    return pointerDrawing(this.config, visuals, selecting);
  }
}
