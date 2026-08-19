# WebXR Input

**`@realitycollective/webxr-input`** - shared, engine-free input contracts for the Reality Collective WebXR extension families. Zero dependencies, pure TypeScript, enforced by an architecture test.

## Why this exists

The fair first question about any new abstraction is the [xkcd-927](https://xkcd.com/927/) one: *doesn't something already do this?*
We asked it before writing a line, and again before extracting this package - an ecosystem survey (Aug 2026) and a demand-evidence review are on record.
The short version:

**The problem is real and documented upstream.**

WebXR deliberately exposes low-level input (`XRInputSource`, raw `Gamepad`, `select`/`squeeze` events) and leaves semantic abstraction to userland. The gaps that creates are
acknowledged in the ecosystem's own trackers: the spec offers no way to query whether an input source has a primary action - Quest hands emit `select`, visionOS hands don't
([immersive-web/webxr#1358](https://github.com/immersive-web/webxr/issues/1358)); Vision Pro's `transient-pointer` shifted input indices and broke index-based assumptions widely enough that the browser vendor published a migration guide ([WebKit, Mar 2024](https://webkit.org/blog/15162/introducing-natural-input-for-webxr-in-apple-vision-pro/)); and addressing controllers by handedness rather than array index has been an open three.js request since 2020 ([three.js#20348](https://github.com/mrdoob/three.js/issues/20348)).

On the accessibility side, W3C's [XR Accessibility User Requirements](https://www.w3.org/TR/xaur/) call for device-independent action and gesture remapping, and the
[immersive-web accessibility explainer](https://github.com/immersive-web/webxr/blob/main/accessibility-considerations-explainer.md) states plainly that such support "will most frequently fall to individual libraries" - this is one of those libraries.

**Excellent prior art exists - none of it is reusable as an engine-free contract.** We looked, admire most of it, and use some of it:

| What exists | What it is | Why it can't be this package |
| --- | --- | --- |
| [`@webxr-input-profiles/*`](https://github.com/immersive-web/webxr-input-profiles) (Immersive Web WG) | Controller profile **data** (button layouts, models) + a mapping lib | Data + button mapping only - no sources, capabilities, hands, provider, or haptics; the JS lib has been frozen since 2020 (the data is current). **We recommend it *inside* adapters** for `buttonsAxes` mapping. |
| [`@pmndrs/pointer-events`](https://github.com/pmndrs/xr) | First-class pointer dispatch over scene graphs | "Framework-agnostic" means React-agnostic - it raycasts and dispatches on three.js `Object3D`s. A great fit *inside* a three.js adapter; not an engine-free contract. |
| [`@pmndrs/xr`](https://github.com/pmndrs/xr) | Input state types + session runtime | Types carry `Object3D` and are inseparable from its store runtime; no capability model. |
| [`@iwsdk/xr-input`](https://developers.meta.com/horizon/documentation/web/iwsdk-concept-xr-input) (Meta, 2025) | The closest relative - profile-keyed buttons, auto connect/disconnect, unified pointers | The strongest validation that this category is needed - and a concrete three.js runtime with a `three >= 0.160` peer dependency, not a contracts layer. It sits *behind* our IWSDK adapter. |
| Babylon.js, A-Frame, PlayCanvas, XR Blocks, Wonderland… | Each maintains its own full input layer (Babylon's `motionController/` alone is ~20 files of per-vendor profiles) | All engine-internal - which is precisely the duplicated effort this contract lets adapter authors stop repeating. |

**Why this isn't standard №26.**

This package doesn't compete with any of the above - it doesn't replace an engine's input system, render anything, or ask any app to switch. It is ~300 lines of **types the existing systems can be described in**: engine adapters wrap what already exists (three.js WebXR, IWSDK, XR Blocks) and expose it through one contract, so libraries above
(interactions, spatial UI, …) are written once instead of once per engine.

The vendors fund neutrality at the data layer (input profiles); nobody's incentives reach the behavioural layer across engines - that unclaimed seam is the whole scope, and the scope is fenced: if an engine-free equivalent emerges upstream, or spec convergence makes the residue trivial, the stated plan is to adopt/retire, not defend (see the validation record's kill criteria).

## What it defines

| Piece | Purpose |
| --- | --- |
| `InputCapabilities` + `satisfies`/`unmetRequirements` | What a provider can deliver (rays, pokes, grabs `none/poseOnly/native`, hand joints, pinch, buttons/axes, gaze, 2D pointer, head pose, haptics), derived from the LIVE session - and the negotiation helpers consumers gate behaviour on. |
| `InputSourceSnapshot` | One normalised input source per frame: ray, grip pose, index fingertip, select/squeeze 0..1, native-grab flag, haptics availability. |
| `InputProvider` | The single interface an engine adapter implements: pull-based `sample()`, capability-change events, optional pre-resolved hit hints (for engines with their own targeting), optional haptic `pulse`. |
| `PointerSample` / `PointerInputSource` | Press–move–release pointer streams - structurally identical to the UI Extensions' pointer contract, so one input stack drives both families. |
| Tuples (`Vec3Tuple`, `QuatTuple`, `PoseTuple`, `RayTuple`, `HeadPose`) | Plain-data geometry - no engine types anywhere. |

## Who consumes it

```
@realitycollective/webxr-input          ← this package (contracts; zero deps)
   ↑                          ↑
webxr-interactions core     webxr-uiextensions core (adoption planned -
   ↑                          replaces its local duplicate pointer/head types)
engine adapters: threejs- / iwsdk- / xrblocks-interactions,
                 iwsdk- / xrblocks-uiextensions
```

Adapters implement `InputProvider`; family cores consume it; **apps never install this package directly** - every family re-exports it wholesale.

## Rules of the road

- **Types + tiny pure helpers only.** No engine imports (the architecture test fails the build otherwise), no runtime dependencies, ever.
- **Evolve additively.** New capabilities and snapshot fields arrive as optional; breaking changes require checking every consuming family first.
- This is deliberately the **slowest-moving** package in the family.

## Commands

```bash
npm install
npm test          # contract tests + the engine-free architecture gate
npm run typecheck
npm run build     # tsc → dist/
```
