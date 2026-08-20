/* test-perspectives:
正常系: yes
エッジ: yes
異常系: yes
否定: yes
リグレッション: n/a 既知バグなし(発生時に追加)
*/
import { afterEach, describe, expect, it } from "vitest";
import { runHook } from "../src/hook.js";
import { baseConfig, cleanup, makeTree } from "./helpers.js";

function input(filePath: string) {
  return { tool_input: { file_path: filePath } };
}

let root: string;
afterEach(() => cleanup(root));

describe("runHook", () => {
  it("[正常系] 違反のないツリーの .ts 編集ではエラーを返さない", () => {
    root = makeTree({ "src/a.ts": "export const a = 1;\n" });
    expect(runHook(root, baseConfig(), input("/repo/src/a.ts"))).toEqual([]);
  });

  it("[正常系] extraChecks のコマンドが成功すればエラーを返さない", () => {
    root = makeTree({ "styles.css": "body { color: red; }\n" });
    const config = baseConfig({
      extraChecks: [{ pattern: "\\.css$", command: ["node", "-e", "process.exit(0)"] }],
    });
    expect(runHook(root, config, input("/repo/styles.css"))).toEqual([]);
  });

  it("[異常系] .ts 編集で抑制コメント違反があればエラーを返す", () => {
    const directive = ["@ts", "ignore"].join("-");
    root = makeTree({ "src/a.ts": `// ${directive}\nexport const a = 1;\n` });
    const errors = runHook(root, baseConfig(), input("/repo/src/a.ts"));
    expect(errors.some((e) => e.includes(directive))).toBe(true);
  });

  it("[異常系] .test.ts 編集で観点ブロックが無ければエラーを返す", () => {
    root = makeTree({ "test/a.test.ts": 'it("x", () => {});\n' });
    const errors = runHook(root, baseConfig(), input("/repo/test/a.test.ts"));
    expect(errors.some((e) => e.includes("test-perspectives ブロックがありません"))).toBe(true);
  });

  it("[異常系] extraChecks のコマンドが失敗すれば stderr をエラーとして返す", () => {
    root = makeTree({ "styles.css": "body {}\n" });
    const config = baseConfig({
      extraChecks: [
        {
          pattern: "\\.css$",
          command: ["node", "-e", "console.error('design violation'); process.exit(1)"],
        },
      ],
    });
    const errors = runHook(root, config, input("/repo/styles.css"));
    expect(errors.some((e) => e.includes("design violation"))).toBe(true);
  });

  it("[エッジ] filePattern(testFileRe)に従い .spec.ts 編集でも観点チェックが走る", () => {
    root = makeTree({ "test/a.spec.ts": 'it("x", () => {});\n' });
    const config = baseConfig({ testFileRe: /\.spec\.ts$/ });
    const errors = runHook(root, config, input("/repo/test/a.spec.ts"));
    expect(errors.some((e) => e.includes("test-perspectives ブロックがありません"))).toBe(true);
  });

  it("[否定] 対象外の拡張子(.md)ではツリーに違反があっても検査しない", () => {
    const directive = ["@ts", "ignore"].join("-");
    root = makeTree({ "src/a.ts": `// ${directive}\n` });
    expect(runHook(root, baseConfig(), input("/repo/README.md"))).toEqual([]);
  });

  it("[否定] pattern に一致しない extraChecks は実行しない", () => {
    root = makeTree({ "src/a.ts": "export const a = 1;\n" });
    const config = baseConfig({
      extraChecks: [{ pattern: "\\.css$", command: ["node", "-e", "process.exit(1)"] }],
    });
    expect(runHook(root, config, input("/repo/src/a.ts"))).toEqual([]);
  });

  it("[否定] file_path が無い入力では何もしない", () => {
    root = makeTree({});
    expect(runHook(root, baseConfig(), {})).toEqual([]);
    expect(runHook(root, baseConfig(), { tool_input: {} })).toEqual([]);
  });
});
