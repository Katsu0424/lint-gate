/* test-perspectives:
正常系: yes
エッジ: yes
異常系: yes
否定: yes
リグレッション: n/a 既知バグなし(発生時に追加)
*/
import { afterEach, describe, expect, it } from "vitest";
import { checkSuppressions } from "../src/check-suppressions.js";
import { baseConfig, cleanup, makeTree } from "./helpers.js";

// 検出対象ディレクティブをテストソース自身が含まないよう、実行時に組み立てる
const DIRECTIVES = [
  ["eslint", "disable"].join("-"),
  ["eslint", "disable-next-line"].join("-"),
  ["eslint", "disable-line"].join("-"),
  ["eslint", "enable"].join("-"),
  ["oxlint", "disable"].join("-"),
  ["oxlint", "disable-next-line"].join("-"),
  ["oxlint", "disable-line"].join("-"),
  ["oxlint", "enable"].join("-"),
  ["biome", "ignore"].join("-"),
  ["@ts", "ignore"].join("-"),
  ["@ts", "nocheck"].join("-"),
  ["@ts", "expect-error"].join("-"),
];

let root: string;
afterEach(() => cleanup(root));

describe("checkSuppressions", () => {
  it("[正常系] 違反のないツリーではエラーを返さない", () => {
    root = makeTree({ "src/a.ts": "export const a = 1;\n" });
    expect(checkSuppressions(root, baseConfig())).toEqual([]);
  });

  it.each(DIRECTIVES)("[正常系] コメント先頭の %s を位置付きで検出する", (directive) => {
    root = makeTree({ "src/a.ts": `// ${directive} 理由\nexport const a = 1;\n` });
    const errors = checkSuppressions(root, baseConfig());
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain("src/a.ts:1");
    expect(errors[0]).toContain(directive);
  });

  it("[エッジ] 対象拡張子のファイルが 1 つもないツリーでは何も報告しない", () => {
    root = makeTree({ "README.md": "# hello\n" });
    expect(checkSuppressions(root, baseConfig())).toEqual([]);
  });

  it("[異常系] allowlist が壊れた JSON なら例外を投げる", () => {
    root = makeTree({
      "src/a.ts": "export const a = 1;\n",
      "suppressions-allowlist.json": "{broken",
    });
    expect(() => checkSuppressions(root, baseConfig())).toThrow();
  });

  it("[否定] 散文中の言及(コメント先頭でない)は検出しない", () => {
    const directive = ["eslint", "disable"].join("-");
    root = makeTree({ "src/a.ts": `export const note = "${directive} は禁止";\n` });
    expect(checkSuppressions(root, baseConfig())).toEqual([]);
  });

  it("[否定] allowlist に登録されたファイルは報告しない", () => {
    const directive = ["@ts", "expect-error"].join("-");
    root = makeTree({
      "src/legacy.ts": `// ${directive} やむを得ない理由\nexport const a = 1;\n`,
      "suppressions-allowlist.json": JSON.stringify([{ path: "src/legacy.ts", reason: "移行中" }]),
    });
    expect(checkSuppressions(root, baseConfig())).toEqual([]);
  });

  it("[否定] skipDirs 配下は走査しない", () => {
    const directive = ["@ts", "ignore"].join("-");
    root = makeTree({ "node_modules/pkg/index.ts": `// ${directive}\n` });
    expect(checkSuppressions(root, baseConfig())).toEqual([]);
  });
});
