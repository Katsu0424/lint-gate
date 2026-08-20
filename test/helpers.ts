import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

export function makeTree(files: Record<string, string>): string {
  const root = mkdtempSync(join(tmpdir(), "lint-gate-"));
  for (const [rel, content] of Object.entries(files)) {
    const abs = join(root, rel);
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, content);
  }
  return root;
}

export function cleanup(root: string): void {
  rmSync(root, { recursive: true, force: true });
}

export interface TestConfig {
  skipDirs: Set<string>;
  suppressionsAllowlist: string;
  fullPathPatterns: RegExp[];
  extraChecks: { pattern: string; command: string[] }[];
}

export function baseConfig(overrides: Partial<TestConfig> = {}): TestConfig {
  return {
    skipDirs: new Set(["node_modules", ".git"]),
    suppressionsAllowlist: "suppressions-allowlist.json",
    fullPathPatterns: [/(^|\/)test\/domain\//],
    extraChecks: [],
    ...overrides,
  };
}
