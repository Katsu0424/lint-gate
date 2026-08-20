// lint 抑制コメントの検出器。
// インラインの抑制ディレクティブを禁止し、どうしても必要な例外は
// allowlist(JSON: {"path", "reason"} の配列)に登録されたファイルに限って許す。
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { walk } from "./walk.js";

const TARGET_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
// ディレクティブ構文(コメント先頭)だけを検出する。散文中の言及は許す。
const DIRECTIVE_RE =
  /(?:\/\/|\/\*)\s*(eslint-(?:disable|enable)(?:-next-line|-line)?|biome-ignore|@ts-(?:ignore|nocheck|expect-error))\b/;

export function checkSuppressions(root, config) {
  const allowedPaths = loadAllowlist(join(root, config.suppressionsAllowlist));
  const errors = [];
  for (const file of walk(root, config.skipDirs, TARGET_EXT)) {
    const rel = relative(root, file);
    if (allowedPaths.has(rel)) continue;
    const lines = readFileSync(file, "utf8").split("\n");
    for (const [i, line] of lines.entries()) {
      const m = line.match(DIRECTIVE_RE);
      if (m) errors.push(`${rel}:${i + 1} に ${m[1]}`);
    }
  }
  return errors;
}

function loadAllowlist(path) {
  let text;
  try {
    text = readFileSync(path, "utf8");
  } catch {
    return new Set();
  }
  const entries = JSON.parse(text);
  return new Set(entries.map((e) => e.path));
}
