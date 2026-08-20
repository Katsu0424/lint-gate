/* test-perspectives:
正常系: yes
エッジ: yes
異常系: yes
否定: n/a 設定読み込みに誤発火の観点なし(スキップ検証は各チェッカーのテストが担う)
リグレッション: n/a 既知バグなし(発生時に追加)
*/
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { cleanup, makeTree } from "./helpers.js";

let root: string;
afterEach(() => cleanup(root));

describe("loadConfig", () => {
  it("[正常系] 設定ファイルが無ければ全項目デフォルトで返す", () => {
    root = makeTree({});
    const config = loadConfig(root);
    expect(config.skipDirs.has("node_modules")).toBe(true);
    expect(config.suppressionsAllowlist).toBe("suppressions-allowlist.json");
    expect(config.fullPathPatterns[0].test("test/domain/a.test.ts")).toBe(true);
    expect(config.testFileRe.test("a.test.ts")).toBe(true);
    expect(config.testFileRe.test("a.spec.ts")).toBe(false);
    expect(config.extraChecks).toEqual([]);
  });

  it("[正常系] 設定ファイルの値がデフォルトを上書き・追記する", () => {
    root = makeTree({
      "lint-gate.config.json": JSON.stringify({
        skipDirs: ["fixtures"],
        suppressions: { allowlist: "scripts/suppressions-allowlist.json" },
        testPerspectives: {
          fullPathPatterns: ["(^|/)packages/core/"],
          filePattern: "\\.spec\\.ts$",
        },
        hook: { extraChecks: [{ pattern: "\\.css$", command: ["node", "check.mjs"] }] },
      }),
    });
    const config = loadConfig(root);
    expect(config.skipDirs.has("fixtures")).toBe(true);
    expect(config.skipDirs.has("node_modules")).toBe(true);
    expect(config.suppressionsAllowlist).toBe("scripts/suppressions-allowlist.json");
    expect(config.fullPathPatterns[0].test("packages/core/a.test.ts")).toBe(true);
    expect(config.fullPathPatterns[0].test("test/domain/a.test.ts")).toBe(false);
    expect(config.testFileRe.test("a.spec.ts")).toBe(true);
    expect(config.testFileRe.test("a.test.ts")).toBe(false);
    expect(config.extraChecks).toHaveLength(1);
  });

  it("[エッジ] 空オブジェクトの設定ファイルはデフォルトと同じになる", () => {
    root = makeTree({ "lint-gate.config.json": "{}" });
    const config = loadConfig(root);
    expect(config.skipDirs.has("node_modules")).toBe(true);
    expect(config.suppressionsAllowlist).toBe("suppressions-allowlist.json");
  });

  it.each([
    ["壊れた JSON", "{broken"],
    ["配列", "[]"],
    ["文字列", '"config"'],
  ])("[異常系] %s の設定ファイルは例外を投げる", (_label, content) => {
    root = makeTree({ "lint-gate.config.json": content });
    expect(() => loadConfig(root)).toThrow();
  });
});
