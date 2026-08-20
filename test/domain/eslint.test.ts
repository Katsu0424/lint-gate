/* test-perspectives:
正常系: yes
エッジ: yes
異常系: yes
否定: yes
リグレッション: n/a 既知バグなし(発生時に追加)
*/
import { describe, expect, it } from "vitest";
import { createConfig } from "../../src/eslint.js";

interface Block {
  files?: string[];
  ignores?: string[];
  rules?: Record<string, unknown>;
  languageOptions?: { parserOptions?: { tsconfigRootDir?: string } };
}

function findLayerBlock(config: Block[]): Block | undefined {
  return config.find((b) => b.rules && "no-restricted-imports" in b.rules);
}

describe("createConfig", () => {
  it("[正常系] ignores・本体・テスト緩和の 3 ブロックを生成し主要ルールを含む", () => {
    const config = createConfig({ tsconfigRootDir: "/repo" }) as Block[];
    expect(config).toHaveLength(3);
    expect(config[0].ignores).toContain("**/node_modules/**");
    const main = config[1];
    expect(main.rules?.complexity).toEqual(["error", 10]);
    expect(main.rules?.["max-lines-per-function"]).toEqual([
      "error",
      { max: 80, skipBlankLines: true, skipComments: true },
    ]);
    expect(main.rules?.["@typescript-eslint/no-floating-promises"]).toBe("error");
    expect(main.languageOptions?.parserOptions?.tsconfigRootDir).toBe("/repo");
    const relax = config[2];
    expect(relax.files).toContain("**/*.test.ts");
    expect(relax.rules?.["max-lines"]).toBe("off");
  });

  it("[エッジ] extraIgnores が既定の ignores に追記される", () => {
    const config = createConfig({
      tsconfigRootDir: "/repo",
      extraIgnores: ["**/gen/**"],
    }) as Block[];
    expect(config[0].ignores).toContain("**/gen/**");
    expect(config[0].ignores).toContain("**/*.js");
  });

  it("[エッジ] layers: {} は既定の domain 層ブロックを生成する", () => {
    const config = createConfig({ tsconfigRootDir: "/repo", layers: {} }) as Block[];
    const layer = findLayerBlock(config);
    expect(layer?.files).toEqual(["**/src/domain/**/*.ts"]);
  });

  it("[エッジ] layers の files / forbidden を差し替えられる", () => {
    const config = createConfig({
      tsconfigRootDir: "/repo",
      layers: { files: ["**/core/**/*.ts"], forbidden: ["**/infra/**"] },
    }) as Block[];
    const layer = findLayerBlock(config);
    expect(layer?.files).toEqual(["**/core/**/*.ts"]);
    const rule = layer?.rules?.["no-restricted-imports"] as [
      string,
      { patterns: { group: string[] }[] },
    ];
    expect(rule[1].patterns[1].group).toEqual(["**/infra/**"]);
  });

  it("[エッジ] testFiles を差し替えるとテスト緩和の対象が変わる", () => {
    const config = createConfig({ tsconfigRootDir: "/repo", testFiles: ["**/spec/**"] }) as Block[];
    expect(config.at(-1)?.files).toEqual(["**/spec/**"]);
  });

  it.each([[{}], [undefined]])("[異常系] tsconfigRootDir が無ければ例外を投げる(%o)", (options) => {
    expect(() => createConfig(options as Parameters<typeof createConfig>[0])).toThrow(
      "tsconfigRootDir",
    );
  });

  it("[否定] layers 未指定なら no-restricted-imports のブロックを含まない", () => {
    const config = createConfig({ tsconfigRootDir: "/repo" }) as Block[];
    expect(findLayerBlock(config)).toBeUndefined();
  });
});
