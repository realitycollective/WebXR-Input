import type { Unsubscribe, Vec3Tuple } from "./types.js";

/**
 * One pointer/ray interaction stream, engine-normalised.
 *
 * Structurally identical to the `PointerSample`/`PointerInputSource` pair
 * in `@realitycollective/webxr-uiextensions`, so a single object can drive
 * BOTH the UI Extensions windowing and anything else that consumes pointer
 * streams - the coexistence contract between the two families.
 */
export interface PointerSample {
  /** Pointer world position (ray origin or touch point). */
  origin: Vec3Tuple;
  /** Normalised pointing direction. */
  direction: Vec3Tuple;
}

/** Delivers press-move-release for one interaction source. */
export interface PointerInputSource {
  onPress(listener: (sample: PointerSample) => void): Unsubscribe;
  onMove(listener: (sample: PointerSample) => void): Unsubscribe;
  onRelease(listener: (sample: PointerSample) => void): Unsubscribe;
}
