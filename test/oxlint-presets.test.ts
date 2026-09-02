/* test-perspectives:
正常系: yes
エッジ: n/a 静的な配布物と dogfood 設定の検証で、入力の境界値がない
異常系: yes
否定: yes
リグレッション: n/a 既知バグなし(発生時に追加)
*/
import { spawnSync } from "node:child_process";
import { readFileSync, symlinkSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { cleanup, makeTree, oxlintRaw, REPO_ROOT, runOxlint } from "./helpers.js";

const PRESET = join(REPO_ROOT, "oxlintrc.json");
const readJson = (rel: string) =>
  JSON.parse(readFileSync(join(REPO_ROOT, rel), "utf8")) as Record<string, unknown>;

// 一時ディレクトリを作らないテストもあるので、作ったときだけ片付ける
let root = "";
afterEach(() => {
  if (root !== "") cleanup(root);
  root = "";
});

// 利用側リポジトリ相当: プリセットを extends する .oxlintrc.json だけを置く
function consumer(files: Record<string, string>): void {
  root = makeTree({
    ...files,
    ".oxlintrc.json": JSON.stringify({ extends: [PRESET], ignorePatterns: ["**/node_modules/**"] }),
  });
}

const codes = (diags: { code: string }[]) => [...new Set(diags.map((d) => d.code))].sort();

describe("oxlintrc.json(プリセット)", () => {
  it("[正常系] pinned oxlint の --print-config を通り、jsPlugins と上限ルールを含む", () => {
    const result = oxlintRaw(REPO_ROOT, ["-c", "oxlintrc.json", "--print-config"]);
    expect(result.status).toBe(0);
    const config = JSON.parse(result.stdout) as {
      jsPlugins: string[];
      rules: Record<string, unknown>;
    };
    expect(config.jsPlugins).toEqual(["./oxlint-plugin.mjs"]);
    for (const rule of [
      "complexity",
      "max-params",
      "max-lines-per-function",
      "typescript/no-floating-promises",
      "vitest/no-focused-tests",
    ]) {
      expect(config.rules).toHaveProperty(rule);
    }
  });

  it("[正常系] 利用側から extends すると自作ルールと組み込みルールの両方が効く", () => {
    consumer({
      "src/cog.ts": readFileSync(join(REPO_ROOT, "test/fixtures/oxlint/cog.ts"), "utf8"),
    });
    const found = codes(runOxlint(root, ["src"]));
    expect(found).toContain("lint-gate(cognitive-complexity)");
    expect(found).toContain("eslint(complexity)");
    expect(found).toContain("eslint(max-depth)");
  });

  it("[異常系] 型情報ルール: 放置された Promise を拒否する(--type-aware)", () => {
    consumer({
      "tsconfig.json": JSON.stringify({
        compilerOptions: { strict: true, noEmit: true },
        include: ["src"],
      }),
      "src/p.ts": [
        "export async function f(): Promise<number> {",
        "  return 1;",
        "}",
        "export function g(): void {",
        "  f();",
        "}",
        "",
      ].join("\n"),
    });
    // oxlint は cwd の node_modules から oxlint-tsgolint を探すので、pinned 版を参照させる
    symlinkSync(join(REPO_ROOT, "node_modules"), join(root, "node_modules"), "dir");
    expect(codes(runOxlint(root, ["--type-aware", "src"]))).toEqual([
      "typescript(no-floating-promises)",
    ]);
  });

  it("[異常系] focused テストと assertion の無いテストを拒否する", () => {
    consumer({
      "test/a.test.ts": [
        'import { expect, it } from "vitest";',
        'it.only("x", () => {',
        "  expect(1).toBe(1);",
        "});",
        'it("y", () => {',
        '  console.log("no assertion");',
        "});",
        "",
      ].join("\n"),
    });
    expect(codes(runOxlint(root, ["test"]))).toEqual([
      "vitest(expect-expect)",
      "vitest(no-focused-tests)",
    ]);
  });

  it("[異常系] domain 層の I/O と外側の層への依存を拒否する", () => {
    consumer({
      "src/domain/pure.ts": [
        'import { readFileSync } from "node:fs";',
        'import { x } from "../adapter/x";',
        'export const d = readFileSync("a", "utf8") + x;',
        "",
      ].join("\n"),
    });
    const diags = runOxlint(root, ["src"]);
    expect(diags.map((d) => d.code)).toEqual([
      "eslint(no-restricted-imports)",
      "eslint(no-restricted-imports)",
    ]);
  });

  it("[否定] domain 層以外の node:* import は許す", () => {
    consumer({
      "src/app/io.ts":
        'import { readFileSync } from "node:fs";\nexport const a = readFileSync("a", "utf8");\n',
    });
    expect(runOxlint(root, ["src"])).toEqual([]);
  });

  it("[否定] テストファイルでは行数系の上限を緩める(ソースでは緩めない)", () => {
    const longFn = [
      "export function long(): number {",
      "  let n = 0;",
      ...Array.from({ length: 85 }, () => "  n += 1;"),
      "  return n;",
      "}",
      "",
    ].join("\n");
    consumer({ "src/long.ts": longFn, "test/long.test.ts": longFn });
    const diags = runOxlint(root, ["src", "test"]);
    expect(diags.map((d) => `${d.file}:${d.code}`).sort()).toEqual([
      "src/long.ts:eslint(max-lines-per-function)",
      "src/long.ts:eslint(max-statements)",
    ]);
  });
});

describe("dogfood 設定とプリセットの同期", () => {
  it("[正常系] .oxlintrc.json はプリセットを extends し、node_modules とフィクスチャを除外する", () => {
    const dogfood = readJson(".oxlintrc.json");
    expect(dogfood.extends).toEqual(["./oxlintrc.json"]);
    expect(dogfood.ignorePatterns).toContain("**/node_modules/**");
    expect(dogfood.ignorePatterns).toContain("test/fixtures/**");
  });

  it("[正常系] .oxfmtrc.json は oxfmtrc.json(プリセット)の全キーを同じ値で含む(oxfmt は extends を持たない)", () => {
    const preset = readJson("oxfmtrc.json");
    const dogfood = readJson(".oxfmtrc.json");
    expect(Object.keys(preset).length).toBeGreaterThan(0);
    for (const [k, v] of Object.entries(preset)) expect(dogfood[k]).toEqual(v);
  });

  it("[正常系] oxfmtrc.json は pinned oxfmt で読める", () => {
    const result = spawnSync(
      join(REPO_ROOT, "node_modules/.bin/oxfmt"),
      ["-c", "oxfmtrc.json", "--check", "oxlint-plugin.mjs"],
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    expect(result.status).toBe(0);
  });
});
