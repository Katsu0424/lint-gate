/* test-perspectives:
正常系: yes
エッジ: yes
異常系: yes
否定: yes
リグレッション: n/a 既知バグなし(発生時に追加)
*/
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config.js";
import { runGuard } from "../src/guard.js";
import { cleanup, makeTree } from "./helpers.js";

function editInput(filePath: string, toolName = "Write") {
  return { tool_name: toolName, tool_input: { file_path: filePath } };
}

function bashInput(command: string) {
  return { tool_name: "Bash", tool_input: { command } };
}

let root: string;
afterEach(() => cleanup(root));

function setup(configJson?: object) {
  root = makeTree(configJson ? { "lint-gate.config.json": JSON.stringify(configJson) } : {});
  return loadConfig(root);
}

describe("runGuard", () => {
  it("[正常系] 作業ブランチ上のリポジトリ内編集と通常コマンドは通す", () => {
    const config = setup();
    const ctx = { root, branch: "feature/issue-1-guard" };
    expect(runGuard(editInput(join(root, "src/a.ts")), config, ctx)).toEqual([]);
    expect(runGuard(bashInput("git push -u origin HEAD"), config, ctx)).toEqual([]);
  });

  it("[正常系] guard セクションで保護ブランチを上書きできる", () => {
    const config = setup({ guard: { protectedBranches: ["develop"] } });
    const file = join(root, "src/a.ts");
    expect(runGuard(editInput(file), config, { root, branch: "main" })).toEqual([]);
    expect(runGuard(editInput(file), config, { root, branch: "develop" })).toHaveLength(1);
  });

  it.each(["main", "master"])("[異常系] 保護ブランチ %s 上の編集をブロックする", (branch) => {
    const config = setup();
    const errors = runGuard(editInput(join(root, "src/a.ts")), config, { root, branch });
    expect(errors).toHaveLength(1);
    expect(errors[0]).toContain(branch);
  });

  it("[異常系] 保護ファイル(.env)の編集をブロックする", () => {
    const config = setup();
    const ctx = { root, branch: "feature/issue-1-guard" };
    const errors = runGuard(editInput(join(root, ".env")), config, ctx);
    expect(errors.some((e) => e.includes("保護ファイル"))).toBe(true);
  });

  it.each([
    "git push --force",
    "git push -f origin main",
    "git push --force-with-lease",
    "gh repo delete Katsu0424/lint-gate",
  ])("[異常系] 禁止コマンド %s をブロックする", (command) => {
    const config = setup();
    const errors = runGuard(bashInput(command), config, { root, branch: "feature/issue-1-x" });
    expect(errors).toHaveLength(1);
  });

  it("[異常系] branchPattern 設定時、規約外ブランチでの編集をブロックする", () => {
    const config = setup({ guard: { branchPattern: "^feature/issue-\\d+-" } });
    const file = join(root, "src/a.ts");
    expect(runGuard(editInput(file), config, { root, branch: "fix-typo" })).toHaveLength(1);
    expect(runGuard(editInput(file), config, { root, branch: "feature/issue-1-guard" })).toEqual(
      [],
    );
  });

  it.each([[null], ["HEAD"]])(
    "[エッジ] ブランチが取れない(%s)ときはブランチ系ガードをスキップする",
    (branch) => {
      const config = setup({ guard: { branchPattern: "^feature/issue-\\d+-" } });
      expect(runGuard(editInput(join(root, "src/a.ts")), config, { root, branch })).toEqual([]);
    },
  );

  it("[エッジ] 相対パスの file_path はリポジトリ内として扱う", () => {
    const config = setup();
    expect(runGuard(editInput("src/a.ts"), config, { root, branch: "main" })).toHaveLength(1);
  });

  it("[否定] 保護ブランチ上でもリポジトリ外パスへの書込は妨げない", () => {
    const config = setup();
    const errors = runGuard(editInput("/tmp/scratch/note.md"), config, { root, branch: "main" });
    expect(errors).toEqual([]);
  });

  it("[否定] 別コマンドの -f には誤発火しない", () => {
    const config = setup();
    const ctx = { root, branch: "feature/issue-1-x" };
    expect(runGuard(bashInput("git push && rm -f tmp.txt"), config, ctx)).toEqual([]);
  });

  it("[否定] 対象外の tool_name や file_path 無しの入力には何もしない", () => {
    const config = setup();
    const ctx = { root, branch: "main" };
    expect(
      runGuard({ tool_name: "Read", tool_input: { file_path: join(root, "a.ts") } }, config, ctx),
    ).toEqual([]);
    expect(runGuard({ tool_name: "Write", tool_input: {} }, config, ctx)).toEqual([]);
    expect(runGuard({}, config, ctx)).toEqual([]);
  });
});
