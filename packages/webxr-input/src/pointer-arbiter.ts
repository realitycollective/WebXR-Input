/**
 * Pointer arbitration - which pointer owns a source this frame, decided
 * ONCE per source across everything a pointer can reach: registered
 * interactables (the Interactions family) and UI panels (the UI Extensions
 * family) alike. Pure logic, no engine.
 *
 * The template is Meta IWSDK 1.0.0's `MultiPointer` (`@iwsdk/xr-input`
 * `multi-pointer.js`): one per hand, over EVERY pointer-event object in the
 * scene, panels included. Per hand it keeps three pointers, touch (the
 * fingertip), grab (the grip) and ray, each with the nearest thing it
 * reaches; the first of touch, grab, ray with a candidate is the active
 * pointer (`PRIORITY_ORDER`, `pickActiveByPriority`); once the active
 * pointer is selecting it stays active until it releases (the selection
 * lock); the ray visual hides whenever a near pointer owns the hand
 * (`shouldHideRay`); and one shared `CursorVisual` sits at the active
 * pointer's hit, whatever kind of thing it hit.
 *
 * Before 29 September 2026 the core ran two of these per hand: the
 * Interactions runtime over interactables and the UI Extensions hosts over
 * panels, neither knowing the other. So a cursor was never reported on a
 * panel, and a touch on a panel did not retire the ray over an object (Pale
 * Signal handover, G4). This arbiter is the one decision both families
 * share. Each family registers a {@link PointerTargetSet} and offers, per
 * source and per pointer kind, the nearest candidate it found; the arbiter
 * picks per kind the nearest across sets, then the active kind by priority
 * with the selection lock, and publishes {@link PointerVisuals} for the
 * bindings to draw. A family that is used on its own gets an arbiter of its
 * own and behaves exactly as before.
 *
 * Frame protocol: a set offers (or offers null) for every source it saw,
 * every frame, then calls `resolve`. `resolve` is pure over the latest
 * offers and may be called by every set in a frame; the last call in a frame
 * is the frame's decision. Update the Interactions runtime after the UI
 * hosts so it publishes the decision that saw both families' offers.
 *
 * Source keys: every family names a physical source its own way (the
 * Interactions provider's snapshot id, a UI host's controller slot or the
 * native `ui` slice's source id). The Interactions runtime therefore
 * registers each hand's or controller's handedness as an ALIAS of its
 * snapshot id (`alias("left", "left-input")`), and a UI host offers under
 * the handedness or under the same id, whichever it has; both reach the same
 * source. An alias resolves at every call, so a set never needs to know the
 * other family's ids.
 */
import type { Unsubscribe, Vec3Tuple } from "./types.js";

/** The pointer that owns a source this frame. `"gaze"` is the eye-gaze source's own pointer. */
export type ActivePointerKind = "touch" | "grab" | "ray" | "gaze";

/** The three near-and-far pointers a hand or controller carries. */
export type NearPointerKind = "touch" | "grab" | "ray";

/** What a pointer target is: a registered interactable, or a UI panel. */
export type PointerTargetKind = "object" | "panel";

/** IWSDK's order: the first with a candidate wins. `multi-pointer.js` `PRIORITY_ORDER`. */
export const POINTER_PRIORITY: readonly NearPointerKind[] = Object.freeze(["touch", "grab", "ray"]);

/** A candidate one pointer found: the target and the point the cursor sits at. */
export interface PointerCandidate {
  targetId: string;
  /** World-space point: the ray's hit, or the closest point of a near target. */
  point: readonly [number, number, number];
  /** Metres: the ray parameter for a ray, the surface distance for a near pointer. The nearest across sets wins. */
  distance: number;
}

/** A candidate as one target set offered it. */
export interface PointerOffer extends PointerCandidate {
  /** The target set that offered it. */
  set: string;
  targetKind: PointerTargetKind;
}

/**
 * IWSDK's `pickActiveByPriority` with its selection lock: while the current
 * active pointer is selecting it stays; otherwise the first pointer in
 * `POINTER_PRIORITY` with a candidate wins, or none.
 */
export function pickActivePointer(
  candidates: { touch: boolean; grab: boolean; ray: boolean },
  current: ActivePointerKind | null,
  selecting: boolean,
): ActivePointerKind | null {
  if (selecting && current !== null) return current;
  for (const kind of POINTER_PRIORITY) {
    if (candidates[kind]) return kind;
  }
  return null;
}

/** The arbiter's decision for one source. */
export interface PointerDecision {
  sourceId: string;
  /** The pointer owning the source, or null when none has a candidate. */
  active: ActivePointerKind | null;
  /** The active pointer's candidate, or null. */
  candidate: PointerOffer | null;
}

/**
 * What a binding shows for one source: IWSDK's `shouldHideRay` and the shared
 * cursor from `MultiPointer.update`. A host draws exactly this and decides
 * nothing. The app's pointer display settings (`pointer-display.ts`) are
 * applied on top by `pointerDrawing`.
 */
export interface PointerVisuals {
  /** The source these visuals belong to. */
  sourceId: string;
  /** The pointer owning the source, or null when none has a candidate. */
  activePointer: ActivePointerKind | null;
  /**
   * Draw this source's ray. True while the source has a ray and no near
   * pointer owns it: the ray is active, or nothing is. False while touch or
   * grab owns the hand, while eye gaze has taken the far ray, and for a
   * source with no ray at all.
   */
  ray: boolean;
  /**
   * Draw the cursor disc at `cursorPoint`. True exactly while the active
   * pointer has a candidate: at the ray's hit, or on the surface the
   * fingertip or grip reaches, on an object or on a panel. Never drawn "at
   * every ray hit" regardless of ownership, which is what the September
   * 2026 native contract said.
   */
  cursor: boolean;
  /** World-space cursor position while `cursor` is true, else null. */
  cursorPoint: readonly [number, number, number] | null;
  /** What the active candidate is: an interactable or a panel; null without one. */
  targetKind: PointerTargetKind | null;
  /** The active candidate's id (an interactable id, or a panel id); null without one. */
  targetId: string | null;
  /** The active candidate's distance (the ray parameter, or the surface distance); null without one. Scales the cursor. */
  hitDistance: number | null;
}

/** Build the visuals for one source from its active pointer and that pointer's candidate. */
export function pointerVisualsFor(
  sourceId: string,
  hasRay: boolean,
  active: ActivePointerKind | null,
  candidate: PointerOffer | PointerCandidate | null,
): PointerVisuals {
  const ray = hasRay && (active === null || active === "ray");
  const cursor = active !== null && candidate !== null;
  const targetKind = candidate && "targetKind" in candidate ? candidate.targetKind : "object";
  return {
    sourceId,
    activePointer: active,
    ray,
    cursor,
    cursorPoint: cursor && candidate ? candidate.point : null,
    targetKind: cursor ? targetKind : null,
    targetId: cursor && candidate ? candidate.targetId : null,
    hitDistance: cursor && candidate ? candidate.distance : null,
  };
}

/**
 * One family's view of the arbiter: it offers what its pointers found and
 * asks which of its pointers own a source.
 */
export interface PointerTargetSet {
  readonly id: string;
  readonly kind: PointerTargetKind;
  /** This frame's nearest candidate of this set for `pointer` on `sourceId`, or null for none. Replaces the last offer. */
  offer(sourceId: string, pointer: NearPointerKind, candidate: PointerCandidate | null): void;
  /** This set's `pointer` on `sourceId` is pressing or grabbing (the selection lock holds while true). */
  setSelecting(sourceId: string, pointer: NearPointerKind, selecting: boolean): void;
  /** The last decision made `pointer` active on `sourceId` with THIS set's candidate. */
  owns(sourceId: string, pointer: NearPointerKind): boolean;
  /** The last decision's active pointer for `sourceId` belongs to another set (this set's pointers must stand down). */
  ownedElsewhere(sourceId: string): boolean;
  /** Drop every offer and lock for a source that went away. */
  forget(sourceId: string): void;
  /** Leave the arbiter; its offers are dropped. */
  dispose(): void;
}

interface SetState {
  readonly id: string;
  readonly kind: PointerTargetKind;
  readonly offers: Map<string, Partial<Record<NearPointerKind, PointerOffer | null>>>;
  readonly selecting: Map<string, Partial<Record<NearPointerKind, boolean>>>;
}

export class PointerArbiter {
  private readonly sets = new Map<string, SetState>();
  private readonly decisions = new Map<string, PointerDecision>();
  private readonly listeners = new Set<(decision: PointerDecision) => void>();
  private readonly aliases = new Map<string, string>();

  /**
   * Let `alias` name the same source as `sourceId` in every call (`offer`,
   * `setSelecting`, `owns`, `resolve`, `visuals`, `forget`). The Interactions
   * runtime aliases `"left"` and `"right"` to the snapshot ids of the sources
   * with that handedness, so a UI host can offer by side. An alias equal to
   * its target, or to an id already used as a canonical id, is ignored.
   */
  alias(alias: string, sourceId: string): void {
    if (alias === sourceId) return;
    for (const set of this.sets.values()) {
      if (set.offers.has(alias)) {
        // Offers made under the alias before it was declared move to the source.
        const pending = set.offers.get(alias)!;
        set.offers.delete(alias);
        set.offers.set(sourceId, { ...(set.offers.get(sourceId) ?? {}), ...pending });
        const selecting = set.selecting.get(alias);
        set.selecting.delete(alias);
        if (selecting) set.selecting.set(sourceId, { ...(set.selecting.get(sourceId) ?? {}), ...selecting });
      }
    }
    this.aliases.set(alias, sourceId);
  }

  /** Drop an alias; the source it named is untouched. */
  unalias(alias: string): void {
    this.aliases.delete(alias);
  }

  /** The canonical id `sourceId` names: itself, or the source its alias points at. */
  keyOf(sourceId: string): string {
    return this.aliases.get(sourceId) ?? sourceId;
  }

  /** Register a family's target set. An id already registered replaces the earlier set. */
  registerSet(id: string, kind: PointerTargetKind): PointerTargetSet {
    if (id.length === 0) throw new Error("[webxr-input] a pointer target set needs a non-empty id");
    const state: SetState = { id, kind, offers: new Map(), selecting: new Map() };
    this.sets.set(id, state);
    return {
      id,
      kind,
      offer: (alias, pointer, candidate) => {
        const sourceId = this.keyOf(alias);
        let bySource = state.offers.get(sourceId);
        if (!bySource) {
          bySource = {};
          state.offers.set(sourceId, bySource);
        }
        bySource[pointer] = candidate
          ? { targetId: candidate.targetId, point: candidate.point, distance: candidate.distance, set: id, targetKind: kind }
          : null;
      },
      setSelecting: (alias, pointer, selecting) => {
        const sourceId = this.keyOf(alias);
        let bySource = state.selecting.get(sourceId);
        if (!bySource) {
          bySource = {};
          state.selecting.set(sourceId, bySource);
        }
        bySource[pointer] = selecting;
      },
      owns: (alias, pointer) => {
        const decision = this.decisions.get(this.keyOf(alias));
        return decision !== undefined && decision.active === pointer && decision.candidate?.set === id;
      },
      ownedElsewhere: (alias) => {
        const decision = this.decisions.get(this.keyOf(alias));
        return decision !== undefined && decision.candidate !== null && decision.candidate.set !== id;
      },
      forget: (alias) => {
        const sourceId = this.keyOf(alias);
        state.offers.delete(sourceId);
        state.selecting.delete(sourceId);
      },
      dispose: () => {
        if (this.sets.get(id) === state) this.sets.delete(id);
      },
    };
  }

  /** The registered sets, in registration order. */
  getSets(): readonly { id: string; kind: PointerTargetKind }[] {
    return [...this.sets.values()].map((set) => ({ id: set.id, kind: set.kind }));
  }

  /**
   * Decide for one source from the latest offers of every set: per kind the
   * nearest candidate across sets, then the active kind by priority with the
   * selection lock. While the lock holds, the locked set's own latest
   * candidate stays the decision's (IWSDK updates only the captured
   * pointer's intersection while it selects).
   */
  resolve(alias: string): PointerDecision {
    const sourceId = this.keyOf(alias);
    const previous = this.decisions.get(sourceId);
    const best: Record<NearPointerKind, PointerOffer | null> = { touch: null, grab: null, ray: null };
    for (const set of this.sets.values()) {
      const offers = set.offers.get(sourceId);
      if (!offers) continue;
      for (const kind of POINTER_PRIORITY) {
        const offer = offers[kind];
        const current = best[kind];
        if (offer && (current === null || offer.distance < current.distance)) best[kind] = offer;
      }
    }
    const current = previous?.active ?? null;
    const lockedSet = previous?.candidate?.set ?? null;
    const selecting =
      current !== null &&
      current !== "gaze" &&
      lockedSet !== null &&
      this.sets.get(lockedSet)?.selecting.get(sourceId)?.[current] === true;
    const active = pickActivePointer(
      { touch: best.touch !== null, grab: best.grab !== null, ray: best.ray !== null },
      current,
      selecting,
    );
    let candidate: PointerOffer | null = null;
    if (active !== null && active !== "gaze") {
      candidate = selecting && lockedSet !== null ? (this.sets.get(lockedSet)?.offers.get(sourceId)?.[active] ?? null) : best[active];
    }
    const decision: PointerDecision = { sourceId, active, candidate };
    this.decisions.set(sourceId, decision);
    for (const listener of [...this.listeners]) listener(decision);
    return decision;
  }

  /**
   * Record a decision made elsewhere for a source the near pointers do not
   * serve (the eye-gaze source, decided by the interaction runtime's cone and
   * consensus), so `visuals` and `decision` answer for it too.
   */
  setDecision(decision: PointerDecision): void {
    this.decisions.set(decision.sourceId, decision);
    for (const listener of [...this.listeners]) listener(decision);
  }

  /** The last decision for a source, or undefined before its first `resolve`. */
  decision(sourceId: string): PointerDecision | undefined {
    return this.decisions.get(this.keyOf(sourceId));
  }

  /** The visuals the last decision implies for a source. `hasRay` is whether the source carries a ray this frame. */
  visuals(alias: string, hasRay: boolean): PointerVisuals {
    const sourceId = this.keyOf(alias);
    const decision = this.decisions.get(sourceId);
    return pointerVisualsFor(sourceId, hasRay, decision?.active ?? null, decision?.candidate ?? null);
  }

  /** Every decision made; a decision arrives on each `resolve` and `setDecision`. */
  onDecision(listener: (decision: PointerDecision) => void): Unsubscribe {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Drop everything known about a source (it stopped being tracked). Every set forgets it too. */
  forget(alias: string): void {
    const sourceId = this.keyOf(alias);
    this.decisions.delete(sourceId);
    for (const set of this.sets.values()) {
      set.offers.delete(sourceId);
      set.selecting.delete(sourceId);
    }
    for (const [name, target] of [...this.aliases]) {
      if (target === sourceId) this.aliases.delete(name);
    }
  }

  /** Forget every source. */
  reset(): void {
    this.decisions.clear();
    this.aliases.clear();
    for (const set of this.sets.values()) {
      set.offers.clear();
      set.selecting.clear();
    }
  }
}

/** A world point copied into a fresh tuple. */
export function copyPoint(point: readonly [number, number, number]): Vec3Tuple {
  return [point[0], point[1], point[2]];
}
