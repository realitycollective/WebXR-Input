# WebXR Input

**`@realitycollective/webxr-input`** describes XR input in plain TypeScript types: where a hand or controller is pointing, what it is touching, and what the device can actually do.

It has no dependency on any 3D engine and no runtime dependencies at all. A test enforces both. That is what lets the Interactions and UI Extensions libraries share one description of input, so an engine adapter is written once and feeds both.

## What it defines

| Piece | Purpose |
| --- | --- |
| `InputCapabilities` + `satisfies`/`unmetRequirements` | What a provider can deliver (rays, pokes, grabs `none/poseOnly/native`, hand joints, pinch, buttons/axes, gaze, 2D pointer, head pose, haptics, presence), derived from the LIVE session - and the negotiation helpers consumers gate behaviour on. |
| `INPUT_CAPABILITY_REQUIREMENTS` | The same requirements as runtime data, with `InputCapabilityRequirement` derived from it. A test checks it against the capability keys, so a capability cannot be added in one place only. |
| `InputSourceSnapshot` | One normalised input source per frame: ray, grip pose, index fingertip, select/squeeze 0..1, optional grip velocities, native-grab flag, haptics availability. `id` is opaque - read `handedness` for the side, never parse the id. |
| `velocityBetween` + `linearVelocity` / `angularVelocity` | Grip velocity for throws and flicks. Providers that report it natively fill the snapshot fields; for the rest, `velocityBetween(prev, next, dtSeconds)` derives metres per second and radians per second from two consecutive grip poses. |
| `InputProvider` | The single interface an engine adapter implements: pull-based `sample()`, capability-change events, optional pre-resolved hit hints (for engines with their own targeting), optional haptic `pulse`, optional `setPresenceVisible`/`setPresenceModality` for showing and hiding the user's own hands and controllers. |
| `inputProviderContractCases()` | The provider conformance suite as data, not as tests. Each case is a `name` plus a `run(provider, driver?)` that throws on failure, so an adapter iterates them with its own test runner and cases needing a driver hook it cannot fake simply pass. |
| `PointerSample` / `PointerInputSource` | Press-move-release pointer streams - structurally identical to the UI Extensions' pointer contract, so one input stack drives both families. |
| Tuples (`Vec3Tuple`, `QuatTuple`, `PoseTuple`, `RayTuple`, `HeadPose`) | Plain-data geometry - no engine types anywhere. |

The conformance suite ships runner-free because every adapter repository already has its own runner. An adapter's test file is a loop:

```ts
for (const contractCase of inputProviderContractCases()) {
  it(contractCase.name, () => contractCase.run(provider, driver));
}
```

## Who consumes it

```
@realitycollective/webxr-input          ← this package (contracts; zero deps)
   ↑                          ↑
webxr-interactions core     webxr-uiextensions core (adoption planned -
   ↑                          replaces its local duplicate pointer/head types)
engine adapters: threejs- / iwsdk- / xrblocks-interactions,
                 iwsdk- / xrblocks-uiextensions
```

Adapters implement `InputProvider`; family cores consume it; **apps never install this package directly** - each family re-exports all of it.

## Rules of the road

- **Types + tiny pure helpers only.** No engine imports (the architecture test fails the build otherwise), no runtime dependencies, ever.
- **Evolve additively.** New capabilities and snapshot fields arrive as optional; breaking changes require checking every consuming family first.
- This is deliberately the **slowest-moving** package in the family.

## Repository layout

The repository root **is** the npm workspace root - `packages/*` holds the publishable libraries, matching [WebXR-Interactions](https://github.com/realitycollective/WebXR-Interactions), [WebXR-UIExtensions](https://github.com/realitycollective/WebXR-UIExtensions) and the [service-framework](https://github.com/realitycollective/com.realitycollective.service-framework.ts).

```text
WebXR-Input/
├── packages/
│   └── webxr-input/         @realitycollective/webxr-input - the contracts
│       ├── src/             types, capabilities, provider, pointer streams
│       └── test/            contract tests + the engine-free architecture gate
├── scripts/                 shared release tooling (set-version, verify-pack)
└── .github/workflows/       ci.yml + publish-npm.yml
```

## Commands

```bash
npm ci
npm test              # contract tests + the engine-free architecture gate (100% coverage gate)
npm run typecheck
npm run build         # tsc → packages/webxr-input/dist/
npm run verify:pack   # pack, install into a clean project and import - the consumer path
```

## Automation (`.github/workflows/`)

The same two workflows, with the same names, ship in every Reality Collective TypeScript repository. In the repos that have a demo, `ci.yml` also carries the deploy jobs. This one has nothing to deploy, so it is a gate only.

| Workflow | Trigger | Does |
| --- | --- | --- |
| `ci.yml` | every PR + push to `main` / `development` | build, typecheck, test with 100% coverage gates, `verify:pack` |
| `publish-npm.yml` | manual dispatch | packs and publishes to **npmjs.com** with provenance. **Defaults to a dry run** |

## Releasing

Work branches off `main`; PRs target `main`. Releases are cut by dispatching the **Publish to npm** workflow, which defaults to a dry run:

| Dispatched from | dist-tag | Then |
| --- | --- | --- |
| `development` | `preview` | bumps the preview counter and pushes it back |
| `main` | `latest` | tags, cuts the GitHub release, re-seeds `development` at the next patch preview |


## Why a separate package

The short version: nothing that already exists is an engine-free contract, and both extension families need one. The long version, with the ecosystem survey and the prior-art comparison, follows.

The fair first question about any new abstraction is the [xkcd-927](https://xkcd.com/927/) one: *doesn't something already do this?* We asked it before writing a line, and again before extracting this package - an ecosystem survey (Aug 2026) and a demand-evidence review are on record. The short version:

**The problem is real and documented upstream.**

WebXR deliberately exposes low-level input (`XRInputSource`, raw `Gamepad`, `select`/`squeeze` events) and leaves semantic abstraction to userland. The gaps that creates are acknowledged in the ecosystem's own trackers: the spec offers no way to query whether an input source has a primary action - Quest hands emit `select`, visionOS hands don't ([immersive-web/webxr#1358](https://github.com/immersive-web/webxr/issues/1358)); Vision Pro's `transient-pointer` shifted input indices and broke index-based assumptions widely enough that the browser vendor published a migration guide ([WebKit, Mar 2024](https://webkit.org/blog/15162/introducing-natural-input-for-webxr-in-apple-vision-pro/)); and addressing controllers by handedness rather than array index has been an open three.js request since 2020 ([three.js#20348](https://github.com/mrdoob/three.js/issues/20348)).

On the accessibility side, W3C's [XR Accessibility User Requirements](https://www.w3.org/TR/xaur/) call for device-independent action and gesture remapping, and the [immersive-web accessibility explainer](https://github.com/immersive-web/webxr/blob/main/accessibility-considerations-explainer.md) states plainly that such support "will most frequently fall to individual libraries" - this is one of those libraries.

**Excellent prior art exists - none of it is reusable as an engine-free contract.** We looked, admire most of it, and use some of it:

| What exists | What it is | Why it can't be this package |
| --- | --- | --- |
| [`@webxr-input-profiles/*`](https://github.com/immersive-web/webxr-input-profiles) (Immersive Web WG) | Controller profile **data** (button layouts, models) + a mapping lib | Data + button mapping only - no sources, capabilities, hands, provider, or haptics; the JS lib has been frozen since 2020 (the data is current). **We recommend it *inside* adapters** for `buttonsAxes` mapping. |
| [`@pmndrs/pointer-events`](https://github.com/pmndrs/xr) | Pointer dispatch over scene graphs | "Framework-agnostic" means React-agnostic - it raycasts and dispatches on three.js `Object3D`s. A great fit *inside* a three.js adapter; not an engine-free contract. |
| [`@pmndrs/xr`](https://github.com/pmndrs/xr) | Input state types + session runtime | Types carry `Object3D` and are inseparable from its store runtime; no capability model. |
| [`@iwsdk/xr-input`](https://developers.meta.com/horizon/documentation/web/iwsdk-concept-xr-input) (Meta, 2025) | The closest relative - profile-keyed buttons, auto connect/disconnect, unified pointers | The strongest validation that this category is needed - and a concrete three.js runtime with a `three >= 0.160` peer dependency, not a contracts layer. It sits *behind* our IWSDK adapter. |
| Babylon.js, A-Frame, PlayCanvas, XR Blocks, Wonderland… | Each maintains its own full input layer (Babylon's `motionController/` alone is ~20 files of per-vendor profiles) | All engine-internal - which is precisely the duplicated effort this contract lets adapter authors stop repeating. |

**Why this is not just another standard.**

This package does not compete with any of the above - it does not replace an engine's input system, render anything, or ask any app to switch. It is ~300 lines of **types the existing systems can be described in**: engine adapters wrap what already exists (three.js WebXR, IWSDK, XR Blocks) and expose it through one contract, so libraries above (interactions, spatial UI, …) are written once instead of once per engine.

The vendors fund neutrality at the data layer (input profiles); nobody's incentives reach the behavioural layer across engines - that unclaimed seam is the whole scope, and the scope is fenced: if an engine-free equivalent emerges upstream, or spec convergence makes the residue trivial, the stated plan is to adopt/retire, not defend (see the validation record's kill criteria).

## What this stack is and is not

The Reality Collective WebXR packages aim at one outcome: an app's logic, input handling, interactions and UI should not care which engine hosts them. Each family ships an engine-free core and thin adapters for Meta IWSDK, plain three.js and WebXR, and Google XR Blocks. When an app still has to reach into the host, either a contract is missing, which is a bug to report, or the app is overreaching.

Portable world-building is not a current promise. Scene content (meshes, prefabs, placement) is built by the app, ideally behind a factory interface the app owns, so that a second host can implement the same factories. A shared content descriptor, following the shape of the UI family's `SceneDescriptor`, will be considered only when a second host is actually targeted. Meta's `iwsdk.scene.v1` format is an acceptable authoring interchange in the meantime.

Position recorded on 2026-09-03 from the Pale Signal client's gaps report.
