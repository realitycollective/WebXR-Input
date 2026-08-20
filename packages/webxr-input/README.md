# @realitycollective/webxr-input

Plain TypeScript types describing XR input: where a hand or controller is pointing, what it is touching, and what the device can actually do.

No dependency on any 3D engine, and no runtime dependencies at all. A test enforces both.

```sh
npm install @realitycollective/webxr-input
```

## What it is

A shared vocabulary for input. It lets an interaction library, a UI library and an engine adapter agree on what "input" means, without any of them importing a 3D engine.

| Concept | What it gives you |
| --- | --- |
| **Input sources** | Normalised rays, pinches, pokes, grips, hand joints, gaze and 2D pointers, addressed by handedness rather than array index |
| **Capabilities** | What the current device can actually do, so a feature can switch itself off and say so rather than failing silently |
| **Provider** | The interface an engine adapter implements once. Consumers ask it for the current state each frame; it never pushes at them |
| **Pointer streams** | Press, move and release events for one input source, with no reference to the engine's scene graph |

It deliberately contains **no** raycasting, no scene-graph types and no session management - those belong to the engine adapters that sit on top.

## Who consumes it

- [`@realitycollective/webxr-interactions`](https://github.com/realitycollective/WebXR-Interactions) - interactables, interactors and behaviours
- [`@realitycollective/webxr-uiextensions`](https://github.com/realitycollective/WebXR-UIExtensions) - spatial windowing, docking and controls

Both families read the same contracts, so one engine adapter feeds both.

## Usage

```ts
import {
  satisfies,
  unmetRequirements,
  NO_CAPABILITIES,
  type InputCapabilities,
  type InputProvider,
} from "@realitycollective/webxr-input";

// Ask what the current runtime supports before enabling a behaviour.
const required: Partial<InputCapabilities> = { rays: true, grabs: "native" };

if (!satisfies(provider.capabilities, required)) {
  console.warn("degraded:", unmetRequirements(provider.capabilities, required));
}
```

## Guarantees

- **No engine imports.** `three`, `@iwsdk/*`, `@pmndrs/*` and `xrblocks` are all forbidden in `src/` and gated by a test that fails the build if one appears.
- **No runtime dependencies.** `dependencies` and `peerDependencies` are asserted empty by the same test, so adding this package can never pull an engine into a consumer's tree.

## Documentation

The full ecosystem survey, the prior-art comparison and the rationale for a separate contracts package live in the [repository README](https://github.com/realitycollective/WebXR-Input#readme).

## License

MIT - see [LICENSE](./LICENSE).
