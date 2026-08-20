// Claude Code の PostToolUse hook (Edit|Write) から呼ばれるディスパッチャ。
// hook 入力 JSON の編集対象ファイルに応じて、
// - テストファイルならテスト観点チェック
// - ソースファイルなら抑制コメントチェック
// - lint-gate.config.json の hook.extraChecks にマッチすればそのコマンド
// を実行し、違反メッセージの配列を返す(空なら合格)。
import { spawnSync } from "node:child_process";
import { checkSuppressions } from "./check-suppressions.js";
import { checkTestPerspectives, TEST_FILE_RE } from "./check-test-perspectives.js";

const SOURCE_FILE_RE = /\.(ts|tsx|js|jsx|mjs|cjs)$/;

export function runHook(root, config, input) {
  const filePath = input?.tool_input?.file_path ?? "";
  if (typeof filePath !== "string" || filePath === "") return [];
  const errors = [];
  if (TEST_FILE_RE.test(filePath)) {
    errors.push(...checkTestPerspectives(root, config).errors);
  }
  if (SOURCE_FILE_RE.test(filePath)) {
    errors.push(...checkSuppressions(root, config));
  }
  errors.push(...runExtraChecks(root, config, filePath));
  return errors;
}

function runExtraChecks(root, config, filePath) {
  const errors = [];
  for (const { pattern, command } of config.extraChecks) {
    if (!new RegExp(pattern).test(filePath)) continue;
    const [cmd, ...args] = command;
    const result = spawnSync(cmd, args, { cwd: root, encoding: "utf8" });
    if (result.status !== 0) {
      errors.push(result.stderr || result.stdout || `${command.join(" ")} failed`);
    }
  }
  return errors;
}
