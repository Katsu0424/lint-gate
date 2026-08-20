// 利用側リポジトリのルート(cwd)に置かれた lint-gate.config.json を読む。
// ファイルが無ければ全項目デフォルトで動く。壊れた JSON は黙殺せずエラーで落とす。
import { readFileSync } from "node:fs";
import { join } from "node:path";

const BASE_SKIP_DIRS = [
  "node_modules",
  ".git",
  ".claude",
  "dist",
  "build",
  "coverage",
  "storybook-static",
];

const DEFAULT_PROTECTED_BRANCHES = ["main", "master"];
const DEFAULT_PROTECTED_FILES = ["(^|/)\\.env$"];
// force push(--force / -f / --force-with-lease)とリポジトリ削除。
// [^&|;]* で区切りを跨がず、`git push && rm -f x` のような別コマンドの -f に誤発火しない
const DEFAULT_DENY_COMMANDS = [
  "git\\s+push\\b[^&|;]*(--force\\b|\\s-f\\b)",
  "gh\\s+repo\\s+delete\\b",
];

export function loadConfig(root) {
  const raw = readConfigFile(join(root, "lint-gate.config.json"));
  return {
    skipDirs: new Set([...BASE_SKIP_DIRS, ...(raw.skipDirs ?? [])]),
    suppressionsAllowlist: raw.suppressions?.allowlist ?? "suppressions-allowlist.json",
    fullPathPatterns: (raw.testPerspectives?.fullPathPatterns ?? ["(^|/)test/domain/"]).map(
      (p) => new RegExp(p),
    ),
    extraChecks: raw.hook?.extraChecks ?? [],
    guard: guardConfig(raw.guard ?? {}),
  };
}

function guardConfig(raw) {
  return {
    protectedBranches: raw.protectedBranches ?? DEFAULT_PROTECTED_BRANCHES,
    branchPattern: raw.branchPattern ? new RegExp(raw.branchPattern) : null,
    protectedFiles: (raw.protectedFiles ?? DEFAULT_PROTECTED_FILES).map((p) => new RegExp(p)),
    denyCommands: (raw.denyCommands ?? DEFAULT_DENY_COMMANDS).map((p) => new RegExp(p)),
  };
}

function readConfigFile(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return {};
  }
  const parsed = JSON.parse(text);
  if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) {
    throw new Error("lint-gate.config.json はオブジェクトである必要があります");
  }
  return parsed;
}
