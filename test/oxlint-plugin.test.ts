/* test-perspectives:
正常系: yes
エッジ: yes
異常系: yes
否定: yes
リグレッション: n/a 既知バグなし(発生時に追加)
*/
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, makeTree, oxlintRaw, REPO_ROOT, runOxlint } from "./helpers.js";

const PLUGIN = join(REPO_ROOT, "oxlint-plugin.mjs");
const FIXTURES = join(REPO_ROOT, "test/fixtures/oxlint");
// 固定値の材料(sonarjs との同値性を検証したときの入力)
const COG_TS = readFileSync(join(FIXTURES, "cog.ts"), "utf8");
const RULES_JS = readFileSync(join(FIXTURES, "rules.js"), "utf8");
const SONAR_RULES = {
  "lint-gate/no-identical-functions": "error",
  "lint-gate/no-all-duplicated-branches": "error",
  "lint-gate/no-element-overwrite": "error",
  "lint-gate/no-invariant-returns": "error",
};

let root: string;
afterEach(() => cleanup(root));

// 組み込みルールを全部切り、自作プラグインの診断だけを受け取る設定
function pluginConfig(rules: Record<string, unknown>): string {
  return JSON.stringify({ jsPlugins: [PLUGIN], categories: { correctness: "off" }, rules });
}

function lint(files: Record<string, string>, rules: Record<string, unknown>) {
  root = makeTree({ ...files, ".oxlintrc.json": pluginConfig(rules) });
  return runOxlint(root, ["-c", ".oxlintrc.json", ...Object.keys(files)]).sort(
    (a, b) => a.line - b.line || a.code.localeCompare(b.code),
  );
}

const lineAndMessage = (d: { line: number; message: string }) => `${d.line}: ${d.message}`;
const codeAndLine = (d: { code: string; line: number }) => `${d.code}:${d.line}`;

describe("lint-gate/cognitive-complexity", () => {
  it("[正常系] 固定値: cog.ts の各関数が sonarjs と同じ値になる(cog = 76 / branches = 2 / invariant = 1)", () => {
    const diags = lint({ "cog.ts": COG_TS }, { "lint-gate/cognitive-complexity": ["error", 0] });
    expect(diags.map(lineAndMessage)).toEqual([
      "1: cognitive complexity 76 > 0",
      "7: cognitive complexity 2 > 0",
      "8: cognitive complexity 1 > 0",
    ]);
  });

  it("[正常系] 閾値未指定なら 15 を上限にする", () => {
    const diags = lint({ "cog.ts": COG_TS }, { "lint-gate/cognitive-complexity": "error" });
    expect(diags.map(lineAndMessage)).toEqual(["1: cognitive complexity 76 > 15"]);
  });

  it.each([
    [75, 1],
    [76, 0],
  ])("[エッジ] 閾値 %i のとき cog(76)の報告は %i 件(上限ちょうどは許す)", (max, count) => {
    const diags = lint({ "cog.ts": COG_TS }, { "lint-gate/cognitive-complexity": ["error", max] });
    expect(diags).toHaveLength(count);
  });

  it("[否定] 入れ子関数の複雑度は親に加算せず、入れ子関数自身に報告する", () => {
    const src = [
      "export function outer() {",
      "  const inner = (a, b, c) => { if (a) { if (b) { if (c) { return 1; } } } return 0; };",
      "  return inner;",
      "}",
      "",
    ].join("\n");
    const diags = lint({ "nested.js": src }, { "lint-gate/cognitive-complexity": ["error", 0] });
    expect(diags.map(lineAndMessage)).toEqual(["2: cognitive complexity 6 > 0"]);
  });

  it("[異常系] 閾値が整数でなければ設定エラーとして失敗し、診断を出さない", () => {
    root = makeTree({
      "a.js": "export const a = 1;\n",
      ".oxlintrc.json": pluginConfig({ "lint-gate/cognitive-complexity": ["error", "loose"] }),
    });
    const result = oxlintRaw(root, ["-c", ".oxlintrc.json", "--format", "json", "a.js"]);
    expect(result.status).not.toBe(0);
    expect(`${result.stdout}${result.stderr}`).toContain("lint-gate/cognitive-complexity");
    expect(result.stdout.trimStart().startsWith("{")).toBe(false);
  });
});

describe("sonarjs 相当 4 ルール", () => {
  it("[正常系] rules.js の検知 8 件を報告する", () => {
    const diags = lint({ "rules.js": RULES_JS }, SONAR_RULES);
    expect(diags.map(codeAndLine)).toEqual([
      "lint-gate(no-identical-functions):6",
      "lint-gate(no-all-duplicated-branches):11",
      "lint-gate(no-all-duplicated-branches):12",
      "lint-gate(no-all-duplicated-branches):13",
      "lint-gate(no-element-overwrite):14",
      "lint-gate(no-element-overwrite):14",
      "lint-gate(no-invariant-returns):15",
      "lint-gate(no-invariant-returns):16",
    ]);
  });

  it("[正常系] メッセージに重複元の行とキーを含む", () => {
    const messages = lint({ "rules.js": RULES_JS }, SONAR_RULES).map((d) => d.message);
    expect(messages).toContain("identical to the function on line 1");
    expect(messages).toContain('"0" was already set on line 14');
    expect(messages).toContain('"k" was already set on line 14');
  });

  it("[否定] 非検知 4 件(notInvariant / implicitEnd / sideEffect / 自己参照の再代入)は報告しない", () => {
    const diags = lint({ "rules.js": RULES_JS }, SONAR_RULES);
    expect(diags.filter((d) => d.line >= 17)).toEqual([]);
    expect(diags.some((d) => d.message.includes('"1"'))).toBe(false);
  });

  it("[エッジ] 本体 2 行以下の同一関数は no-identical-functions の対象外", () => {
    const src = [
      "export function a(x) {",
      "  return x * 2;",
      "}",
      "export function b(x) {",
      "  return x * 2;",
      "}",
      "",
    ].join("\n");
    expect(lint({ "short.js": src }, SONAR_RULES)).toEqual([]);
  });

  it("[否定] else で終わらない if チェーンは分岐が同一でも報告しない", () => {
    const src = "export function f(x) { if (x > 0) { doIt(1); } else if (x < 0) { doIt(1); } }\n";
    expect(lint({ "open.js": src }, SONAR_RULES)).toEqual([]);
  });
});
