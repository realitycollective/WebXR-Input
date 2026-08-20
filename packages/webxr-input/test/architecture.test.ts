/**
 * Architectural gate: the shared input contracts must stay engine-free
 * with zero runtime dependencies, so BOTH extension families (Interactions
 * and UI Extensions) can depend on them from any engine.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const SRC = fileURLToPath(new URL("../src", import.meta.url));
const FORBIDDEN = [
  "'@iwsdk/",
  '"@iwsdk/',
  "'three'",
  '"three"',
  "'@pmndrs/",
  '"@pmndrs/',
  "'super-three",
  "'xrblocks",
  '"xrblocks',
];

function tsFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return tsFiles(path);
    return entry.name.endsWith(".ts") ? [path] : [];
  });
}

describe("engine-free package", () => {
  it("src/ imports no engine packages anywhere", () => {
    const files = tsFiles(SRC);
    expect(files.length).toBeGreaterThan(0);
    for (const file of files) {
      const source = readFileSync(file, "utf8");
      for (const marker of FORBIDDEN) {
        expect(
          source.includes(`from ${marker}`) || source.includes(`import ${marker}`),
          `${file} must not import ${marker}`,
        ).toBe(false);
      }
    }
  });

  it("package.json declares no runtime dependencies", () => {
    const pkg = JSON.parse(
      readFileSync(fileURLToPath(new URL("../package.json", import.meta.url)), "utf8"),
    ) as { dependencies?: Record<string, string>; peerDependencies?: Record<string, string> };
    expect(pkg.dependencies ?? {}).toEqual({});
    expect(pkg.peerDependencies ?? {}).toEqual({});
  });
});
