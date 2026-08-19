# Changelog - @realitycollective/webxr-input

## 0.1.0 (unreleased)

Initial contract set, extracted from the WebXR-Interactions incubation in
`PrivateResearchBucket` (developed against the Pale Signal research findings):

- `InputCapabilities` with `GrabCapability` (`none | poseOnly | native`),
  `NO_CAPABILITIES` default, and the `satisfies` / `unmetRequirements`
  negotiation helpers.
- `InputSourceSnapshot` (normalised per-frame source: ray, grip pose, index
  fingertip, select/squeeze scalars, native-grab and haptics flags) with
  shared select press/release hysteresis thresholds.
- `InputProvider` - pull-based `sample()`, capability/source change
  subscriptions, optional pre-resolved `InputHitHint`s, optional haptic
  `pulse`.
- `PointerSample` / `PointerInputSource` press–move–release streams,
  structurally compatible with `@realitycollective/webxr-uiextensions`.
- Plain-data geometry tuples (`Vec3Tuple`, `QuatTuple`, `PoseTuple`,
  `RayTuple`, `HeadPose`/`HeadPoseSource`).
- Architecture test: zero runtime dependencies, no engine imports.
