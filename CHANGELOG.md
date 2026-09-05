# Changelog

Change log for the Reality Collective WebXR Input contracts. The version below is the one carried by the `v<version>` release tag.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Preview builds are not listed separately. The entry for a version accumulates while its previews are published, and is dated when that version is released.

## [0.1.2]

### Added

- A converse presence case in `inputProviderContractCases()`: a provider whose `setPresenceVisible()` reports that presence is available must declare `capabilities.presence`. The existing case only asserted the forward implication, so a provider that implemented both methods and declared nothing passed. That is the drift an adapter actually hit. The case probes with the `"none"` target, which names no side and so changes nothing, and it reads the answer rather than the existence of the method, so a provider whose presence depends on the app registering a visual first still passes while it reports false.

## [0.1.1] 2026-09-04

### Added

- Optional `linearVelocity` / `angularVelocity` on `InputSourceSnapshot` - grip velocity in metres per second and radians per second, for throws and flicks.
- `velocityBetween(prev, next, dtSeconds)` - a pure helper that derives both velocities from two consecutive grip poses, along the shortest arc, returning zeros for a zero, negative or non-finite time step.
- `presence` capability, `PresenceModality` (`hands | controllers | auto`), and the optional `setPresenceVisible` / `setPresenceModality` provider methods for showing and hiding the user's own hands and controllers. Both return false when the request could not be delivered, exactly as `pulse` does.
- `INPUT_CAPABILITY_REQUIREMENTS` - the requirement list as runtime data, with `InputCapabilityRequirement` derived from it and a test that checks it against the capability keys, so a capability can no longer be added in one place only.
- `inputProviderContractCases()` with `InputProviderContractCase` and `InputProviderContractDriver` - the provider conformance suite as data, for adapters to iterate with their own test runner.
- Documented that `InputSourceSnapshot.id` is opaque: consumers read `handedness` for the side and never parse the id.

## [0.1.0] - 2026-08-20

### Added

- `InputCapabilities` with `GrabCapability` (`none | poseOnly | native`), `NO_CAPABILITIES` default, and the `satisfies` / `unmetRequirements` negotiation helpers.
- `InputSourceSnapshot` (normalised per-frame source: ray, grip pose, index fingertip, select/squeeze scalars, native-grab and haptics flags) with shared select press/release hysteresis thresholds.
- `InputProvider` - pull-based `sample()`, capability/source change subscriptions, optional pre-resolved `InputHitHint`s, optional haptic `pulse`.
- `PointerSample` / `PointerInputSource` press-move-release streams, structurally compatible with `@realitycollective/webxr-uiextensions`.
- Plain-data geometry tuples (`Vec3Tuple`, `QuatTuple`, `PoseTuple`, `RayTuple`, `HeadPose`/`HeadPoseSource`).
- Architecture test: zero runtime dependencies, no engine imports.

[0.1.2]: https://github.com/realitycollective/WebXR-Input/commits/main
[0.1.1]: https://github.com/realitycollective/WebXR-Input/releases/tag/v0.1.1
[0.1.0]: https://github.com/realitycollective/WebXR-Input/releases/tag/v0.1.0
