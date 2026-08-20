/* test-perspectives:
正常系: yes
エッジ: yes
異常系: yes
否定: yes
リグレッション: n/a 既知バグなし(発生時に追加)
*/
import { afterEach, describe, expect, it } from "vitest";
import { checkTestPerspectives } from "../src/check-test-perspectives.js";
import { baseConfig, cleanup, makeTree } from "./helpers.js";

const VALID_FILE = [
  "/* test-perspectives:",
  "正常系: yes",
  "異常系: n/a 純関数で契約外入力なし",
  "*/",
  'it("[正常系] works", () => { expect(1).toBe(1); });',
  "",
].join("\n");

let root: string;
afterEach(() => cleanup(root));

describe("checkTestPerspectives", () => {
  it("[正常系] 妥当なブロックとタグを持つファイルは合格し、件数を数える", () => {
    root = makeTree({ "test/a.test.ts": VALID_FILE });
    const result = checkTestPerspectives(root, baseConfig());
    expect(result.errors).toEqual([]);
    expect(result.count).toBe(1);
  });

  it.each([
    ["ブロックなし", 'it("x", () => {});\n', "test-perspectives ブロックがありません"],
    [
      "yes なのにタグなし",
      ["/* test-perspectives:", "正常系: yes", "異常系: n/a 理由あり", "*/", ""].join("\n"),
      "タグ付きのテストがありません",
    ],
    [
      "不正な値",
      ["/* test-perspectives:", "正常系: maybe", "異常系: n/a 理由あり", "*/", ""].join("\n"),
      '"yes" か "n/a <理由>"',
    ],
    [
      "n/a に理由がない",
      ["/* test-perspectives:", "正常系: n/a", "異常系: n/a 理由あり", "*/", ""].join("\n"),
      '"yes" か "n/a <理由>"',
    ],
    [
      "未知の観点",
      [
        "/* test-perspectives:",
        "正常系: yes",
        "異常系: n/a 理由あり",
        "性能: yes",
        "*/",
        'it("[正常系] x", () => { expect(1).toBe(1); });',
        "",
      ].join("\n"),
      "未知の観点「性能」",
    ],
  ])("[異常系] %s はエラーになる", (_label, content, expected) => {
    root = makeTree({ "test/a.test.ts": content });
    const { errors } = checkTestPerspectives(root, baseConfig());
    expect(errors.some((e) => e.includes(expected))).toBe(true);
  });

  it("[エッジ] fullPathPatterns にマッチするパスは全 5 観点の宣言が必須になる", () => {
    root = makeTree({ "test/domain/a.test.ts": VALID_FILE });
    const { errors } = checkTestPerspectives(root, baseConfig());
    expect(errors.some((e) => e.includes("エッジ"))).toBe(true);
    expect(errors.some((e) => e.includes("否定"))).toBe(true);
    expect(errors.some((e) => e.includes("リグレッション"))).toBe(true);
  });

  it("[エッジ] fullPathPatterns を差し替えると濃淡の境界が変わる", () => {
    root = makeTree({ "packages/core/a.test.ts": VALID_FILE });
    const config = baseConfig({ fullPathPatterns: [/(^|\/)packages\/core\//] });
    const { errors } = checkTestPerspectives(root, config);
    expect(errors.length).toBeGreaterThan(0);
  });

  it("[否定] テストファイル以外(.ts)は検査も計数もしない", () => {
    root = makeTree({ "src/a.ts": "export const a = 1;\n" });
    const result = checkTestPerspectives(root, baseConfig());
    expect(result.errors).toEqual([]);
    expect(result.count).toBe(0);
  });
});
