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

const PRESET = join(REPO_ROOT, ".oxlintrc.json");
// #14 で追加したルール(利用側で 0 件を確認済みのもの)
const ADDED_RULES = [
  "import/no-cycle",
  "import/no-self-import",
  "import/no-duplicates",
  "import/named",
  "import/export",
  "typescript/switch-exhaustiveness-check",
  "typescript/only-throw-error",
  "typescript/prefer-promise-reject-errors",
  "typescript/no-explicit-any",
  "promise/no-return-in-finally",
  "promise/no-multiple-resolved",
  "unicorn/no-useless-promise-resolve-reject",
  "unicorn/error-message",
  "unicorn/throw-new-error",
  "unicorn/prefer-node-protocol",
  "oxc/no-accumulating-spread",
  "no-param-reassign",
];
// 組み込みの complexity / max-depth と自作の cognitive-complexity の両方に掛かる関数
const COMPLEX_TS = [
  "export function deep(a: number, b: number, c: number): number {",
  "  let r = 0;",
  "  for (let i = 0; i < a; i++) {",
  "    if (b > 0 || c < 0) {",
  "      if (c > 0) {",
  "        while (r < 10) {",
  "          if (i % 2 === 0) {",
  "            if (r % 3 === 0) {",
  "              r += a && b ? 1 : 2;",
  "            } else if (r % 5 === 0) {",
  "              r += 3;",
  "            } else {",
  "              r += 4;",
  "            }",
  "          }",
  "        }",
  "      }",
  "    }",
  "  }",
  "  return r;",
  "}",
  "",
].join("\n");
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

describe(".oxlintrc.json(プリセット。lint-gate 自身の dogfood 設定を兼ねる)", () => {
  it("[正常系] pinned oxlint の --print-config を通り、jsPlugins と上限ルールを含む", () => {
    const result = oxlintRaw(REPO_ROOT, ["-c", ".oxlintrc.json", "--print-config"]);
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

  it("[正常系] 2026-09 に追加した 16 ルールが --print-config に含まれる", () => {
    const result = oxlintRaw(REPO_ROOT, ["-c", ".oxlintrc.json", "--print-config"]);
    const config = JSON.parse(result.stdout) as { rules: Record<string, unknown> };
    for (const rule of ADDED_RULES) expect(config.rules).toHaveProperty(rule);
    // oxlint は --print-config で off を allow に正規化する
    expect(config.rules["import/default"]).toBe("allow");
  });

  it("[異常系] 循環 import・any の直書き・自己 import を拒否する", () => {
    consumer({
      "src/a.ts": 'import { b } from "./b.js";\nexport const a: number = b + 1;\n',
      "src/b.ts": 'import { a } from "./a.js";\nexport const b: number = a + 1;\n',
      "src/any.ts": "export function f(v: any): string {\n  return String(v);\n}\n",
    });
    const found = codes(runOxlint(root, ["src"]));
    expect(found).toContain("import(no-cycle)");
    expect(found).toContain("typescript(no-explicit-any)");
  });

  it("[異常系] 型情報ルール: union の網羅漏れと Error 以外の throw を拒否する(--type-aware)", () => {
    consumer({
      "tsconfig.json": JSON.stringify({
        compilerOptions: { strict: true, noEmit: true },
        include: ["src"],
      }),
      "src/s.ts": [
        'type Kind = "a" | "b";',
        "export function label(k: Kind): number {",
        "  switch (k) {",
        '    case "a":',
        "      return 1;",
        "  }",
        "  return 0;",
        "}",
        "export function fail(): never {",
        '  throw "not an Error";',
        "}",
        "",
      ].join("\n"),
    });
    symlinkSync(join(REPO_ROOT, "node_modules"), join(root, "node_modules"), "dir");
    const found = codes(runOxlint(root, ["--type-aware", "src"]));
    expect(found).toContain("typescript(switch-exhaustiveness-check)");
    expect(found).toContain("typescript(only-throw-error)");
  });

  it("[正常系] 利用側から extends すると自作ルールと組み込みルールの両方が効く", () => {
    consumer({
      "src/cog.ts": COMPLEX_TS,
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

describe("配布物 = dogfood 設定(1 ファイルずつ)", () => {
  it("[正常系] .oxlintrc.json は extends を持たず、jsPlugins と node_modules 除外を含む", () => {
    const preset = readJson(".oxlintrc.json");
    expect(preset.extends).toBeUndefined();
    expect(preset.jsPlugins).toEqual(["./oxlint-plugin.mjs"]);
    expect(preset.ignorePatterns).toEqual(["**/node_modules/**"]);
  });

  it("[正常系] .oxfmtrc.json は整形オプションだけを持ち、pinned oxfmt で読める", () => {
    const preset = readJson(".oxfmtrc.json");
    expect(Object.keys(preset).sort()).toEqual([
      "printWidth",
      "semi",
      "singleQuote",
      "tabWidth",
      "useTabs",
    ]);
    const result = spawnSync(
      join(REPO_ROOT, "node_modules/.bin/oxfmt"),
      ["-c", ".oxfmtrc.json", "--check", "oxlint-plugin.mjs"],
      { cwd: REPO_ROOT, encoding: "utf8" },
    );
    expect(result.status).toBe(0);
  });
});
