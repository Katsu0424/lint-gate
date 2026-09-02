import { spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = fileURLToPath(new URL("..", import.meta.url));

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
  testFileRe: RegExp;
  extraChecks: { pattern: string; command: string[] }[];
}

export function baseConfig(overrides: Partial<TestConfig> = {}): TestConfig {
  return {
    skipDirs: new Set(["node_modules", ".git"]),
    suppressionsAllowlist: "suppressions-allowlist.json",
    fullPathPatterns: [/(^|\/)test\/domain\//],
    testFileRe: /\.test\.(ts|tsx|js|jsx|mjs|cjs)$/,
    extraChecks: [],
    ...overrides,
  };
}

export interface Diagnostic {
  code: string;
  file: string;
  line: number;
  message: string;
}

interface RawDiagnostic {
  code: string;
  filename: string;
  message: string;
  labels?: { span: { line: number } }[];
}

// devDependencies に pinned された oxlint を cwd で実行する
export function oxlintRaw(cwd: string, args: string[]) {
  const result = spawnSync(join(REPO_ROOT, "node_modules/.bin/oxlint"), args, {
    cwd,
    encoding: "utf8",
  });
  if (result.error) throw result.error;
  return result;
}

// 診断を JSON で受け取る。設定エラー等で JSON が出なければ出力ごと例外にする
export function runOxlint(cwd: string, args: string[]): Diagnostic[] {
  const result = oxlintRaw(cwd, ["--format", "json", ...args]);
  if (!result.stdout.trimStart().startsWith("{")) {
    throw new Error(`oxlint failed:\n${result.stdout}\n${result.stderr}`);
  }
  const parsed = JSON.parse(result.stdout) as { diagnostics: RawDiagnostic[] };
  return parsed.diagnostics.map((d) => ({
    code: d.code,
    file: d.filename,
    line: d.labels?.[0]?.span.line ?? 0,
    message: d.message,
  }));
}
