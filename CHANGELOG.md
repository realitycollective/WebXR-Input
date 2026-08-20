# Changelog

Change log for the Reality Collective WebXR Input contracts. The version below is the one carried by the `v<version>` release tag.

The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html). Preview builds are not listed separately. The entry for a version accumulates while its previews are published, and is dated when that version is released.

## [0.1.0]

### Added

- `InputCapabilities` with `GrabCapability` (`none | poseOnly | native`), `NO_CAPABILITIES` default, and the `satisfies` / `unmetRequirements` negotiation helpers.
- `InputSourceSnapshot` (normalised per-frame source: ray, grip pose, index fingertip, select/squeeze scalars, native-grab and haptics flags) with shared select press/release hysteresis thresholds.
- `InputProvider` - pull-based `sample()`, capability/source change subscriptions, optional pre-resolved `InputHitHint`s, optional haptic `pulse`.
- `PointerSample` / `PointerInputSource` press-move-release streams, structurally compatible with `@realitycollective/webxr-uiextensions`.
- Plain-data geometry tuples (`Vec3Tuple`, `QuatTuple`, `PoseTuple`, `RayTuple`, `HeadPose`/`HeadPoseSource`).
- Architecture test: zero runtime dependencies, no engine imports.

[0.1.0]: https://github.com/realitycollective/WebXR-Input/commits/main
