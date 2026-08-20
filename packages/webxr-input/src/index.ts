/**
 * @realitycollective/webxr-input - shared, engine-free input contracts.
 *
 * The single vocabulary every Reality Collective extension family speaks:
 * the Interactions core consumes these to drive behaviours, engine adapters
 * (three.js/WebXR, Meta IWSDK, Google XR Blocks) implement them, and the
 * UI Extensions' pointer streams are structurally compatible so one input
 * stack can drive both libraries in the same project.
 *
 * Everything here is plain data - tuples and records, no engine imports,
 * no runtime dependencies. See the architecture test.
 */
export * from "./types.js";
export * from "./capabilities.js";
export * from "./source.js";
export * from "./provider.js";
export * from "./pointer.js";
