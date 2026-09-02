/* test-perspectives:
正常系: yes
エッジ: yes
異常系: yes
否定: yes
リグレッション: n/a 既知バグなし(発生時に追加)
*/
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { oxfmtArgs, oxlintArgs, resolveTools } from "../src/check.js";
import { cleanup, makeTree, REPO_ROOT } from "./helpers.js";

const BIN = join(REPO_ROOT, "bin/lint-gate.js");
const PRESET = join(REPO_ROOT, ".oxlintrc.json");

// 利用側リポジトリ相当のツリー。node_modules は置かない
// (同梱ツールと tsgolint の解決が lint-gate 自身の位置で完結することを確かめる)
const CONSUMER = {
  ".oxlintrc.json": `{\n  "extends": ["${PRESET}"],\n  "ignorePatterns": ["**/node_modules/**"]\n}\n`,
  "tsconfig.json":
    '{\n  "compilerOptions": { "strict": true, "noEmit": true },\n  "include": ["src", "test"]\n}\n',
  "src/add.ts": "export function add(a: number, b: number): number {\n  return a + b;\n}\n",
  "test/add.test.ts": [
    "/* test-perspectives:",
    "正常系: yes",
    "異常系: n/a 純関数で契約外入力なし",
    "*/",
    'import { expect, it } from "vitest";',
    'import { add } from "../src/add.js";',
    "",
    'it("[正常系] adds", () => {',
    "  expect(add(1, 2)).toBe(3);",
    "});",
    "",
  ].join("\n"),
};
const TOO_MANY_PARAMS =
  "export function f(a: number, b: number, c: number, d: number, e: number): number {\n  return a + b + c + d + e;\n}\n";
// 検出対象ディレクティブをテストソース自身が含まないよう、実行時に組み立てる
const DISABLE_COMMENT = `// ${["oxlint", "disable-next-line"].join("-")} max-params`;

let root = "";
afterEach(() => {
  if (root !== "") cleanup(root);
  root = "";
});

function check(files: Record<string, string>, paths: string[] = []) {
  root = makeTree(files);
  const result = spawnSync(process.execPath, [BIN, "check", ...paths], {
    cwd: root,
    encoding: "utf8",
  });
  return { status: result.status, out: `${result.stdout}\n${result.stderr}` };
}

describe("resolveTools", () => {
  it("[正常系] 同梱ツールの実体を lint-gate 自身の位置から解決する", () => {
    const tools = resolveTools();
    for (const p of [tools.oxlint, tools.oxfmt, tools.tsgolint]) expect(existsSync(p)).toBe(true);
    expect(tools.tsgolint).toContain("@oxlint-tsgolint/");
  });
});

describe("oxlintArgs / oxfmtArgs", () => {
  it("[エッジ] 利用側に設定が無ければプリセットを -c で渡し、あれば渡さない", () => {
    root = makeTree({});
    expect(oxlintArgs(root, ["."])).toContain("-c");
    expect(oxlintArgs(root, ["."])).toContain(PRESET);
    expect(oxfmtArgs(root, ["."])).toContain(join(REPO_ROOT, ".oxfmtrc.json"));
    cleanup(root);
    root = makeTree({ ".oxlintrc.json": "{}", ".oxfmtrc.jsonc": "{}" });
    expect(oxlintArgs(root, ["."])).not.toContain("-c");
    expect(oxfmtArgs(root, ["."])).toEqual(["--check", "."]);
  });

  it("[正常系] oxlint には常に型情報ルールと node_modules 除外を付ける", () => {
    root = makeTree({});
    const args = oxlintArgs(root, ["src", "test"]);
    expect(args[0]).toBe("--type-aware");
    expect(args).toContain("--ignore-pattern=**/node_modules/**");
    expect(args.slice(-2)).toEqual(["src", "test"]);
  });
});

describe("lint-gate check", () => {
  it("[正常系] 違反のない利用側ツリーでは 4 段すべて通り exit 0 になる", () => {
    const { status, out } = check(CONSUMER);
    expect(status).toBe(0);
    for (const stage of ["oxlint", "oxfmt", "suppressions", "test-perspectives"]) {
      expect(out).toContain(`lint-gate check ▶ ${stage}`);
    }
    expect(out).toContain("lint-gate check: OK");
  });

  it("[正常系] node_modules の無い利用側でも型情報ルール(放置 Promise)が効く", () => {
    const { status, out } = check({
      ...CONSUMER,
      "src/p.ts":
        "export async function f(): Promise<number> {\n  return 1;\n}\nexport function g(): void {\n  f();\n}\n",
    });
    expect(status).not.toBe(0);
    expect(out).toContain("no-floating-promises");
  });

  it.each([
    ["oxlint", { "src/bad.ts": TOO_MANY_PARAMS }],
    ["oxfmt", { "src/ugly.ts": "export const x = {a:1}\n" }],
    ["suppressions", { "src/sup.ts": `${DISABLE_COMMENT}\nexport const s = 1;\n` }],
    [
      "test-perspectives",
      {
        "test/noblock.test.ts":
          'import { expect, it } from "vitest";\n\nit("[正常系] x", () => {\n  expect(1).toBe(1);\n});\n',
      },
    ],
  ])("[異常系] %s の段で失敗すると非ゼロ終了し、どの段かを出力する", (stage, files) => {
    const { status, out } = check({ ...CONSUMER, ...files });
    expect(status).not.toBe(0);
    expect(out).toContain(`lint-gate check: 「${stage}」で失敗しました`);
  });

  it("[否定] 最初の失敗で止まり、後段は実行しない", () => {
    const { out } = check({ ...CONSUMER, "src/bad.ts": TOO_MANY_PARAMS });
    expect(out).toContain("lint-gate check ▶ oxlint");
    expect(out).not.toContain("lint-gate check ▶ oxfmt");
  });

  it("[エッジ] 利用側に .oxlintrc.json / .oxfmtrc.json が無くてもプリセットで検査する", () => {
    const { ".oxlintrc.json": _omitted, ...withoutConfig } = CONSUMER;
    const { status, out } = check({ ...withoutConfig, "src/bad.ts": TOO_MANY_PARAMS });
    expect(status).not.toBe(0);
    expect(out).toContain("max-params");
  });

  it("[正常系] fmt は同梱 oxfmt で整形を書き込み、その後の check が通る", () => {
    root = makeTree({ ...CONSUMER, "src/ugly.ts": "export const x = {a:1}\n" });
    const fmt = spawnSync(process.execPath, [BIN, "fmt"], { cwd: root, encoding: "utf8" });
    expect(fmt.status).toBe(0);
    expect(readFileSync(join(root, "src/ugly.ts"), "utf8")).toBe("export const x = { a: 1 };\n");
    const after = spawnSync(process.execPath, [BIN, "check"], { cwd: root, encoding: "utf8" });
    expect(after.status).toBe(0);
  });

  it("[エッジ] 引数で対象パスを絞れる", () => {
    const { status } = check({ ...CONSUMER, "scripts/bad.ts": TOO_MANY_PARAMS }, ["src", "test"]);
    expect(status).toBe(0);
  });
});
