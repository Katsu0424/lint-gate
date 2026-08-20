/* test-perspectives:
正常系: yes
エッジ: n/a 静的な配布物 2 ファイルの同期検証のみで入力バリエーションがない
異常系: n/a 契約外入力を受ける関数がない
否定: yes
リグレッション: yes
*/
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function readPreset(name: string): Record<string, unknown> {
  return JSON.parse(readFileSync(new URL(`../${name}`, import.meta.url), "utf8"));
}

const full = readPreset("biome.json");
const lintOnly = readPreset("biome-lint.json");

describe("biome プリセットの同期", () => {
  it.each(["vcs", "files", "linter"])(
    "[正常系] 共通セクション %s が biome.json と biome-lint.json で一致する",
    (section) => {
      expect(full[section]).toEqual(lintOnly[section]);
    },
  );

  it("[正常系] biome.json は formatter 設定を持つ", () => {
    expect(full.formatter).toBeDefined();
    expect(full.javascript).toBeDefined();
  });

  it("[否定] biome-lint.json は formatter 設定を持ち込まない", () => {
    expect(lintOnly.formatter).toBeUndefined();
    expect(lintOnly.javascript).toBeUndefined();
  });

  it("[リグレッション] プリセットは extends 連鎖を持たない(連鎖は利用側で gitignore 済みディレクトリの nested root 誤検出を起こした)", () => {
    expect(full.extends).toBeUndefined();
    expect(lintOnly.extends).toBeUndefined();
  });
});
