// PreToolUse hook (Write|Edit|NotebookEdit|Bash) から呼ばれる行動ガード。
// 品質ではなく「やってはいけない操作」を止める: 保護ブランチ上の編集、
// 規約外ブランチでの編集、保護ファイルの編集、禁止コマンドの実行。
// 対象はリポジトリ配下のみ(scratchpad 等リポジトリ外への書込は妨げない)。
import { spawnSync } from "node:child_process";
import { isAbsolute, relative, sep } from "node:path";

const EDIT_TOOLS = new Set(["Write", "Edit", "NotebookEdit"]);

export function runGuard(input, config, context) {
  const toolName = input?.tool_name ?? "";
  if (EDIT_TOOLS.has(toolName)) {
    return guardEdit(input?.tool_input?.file_path, config, context);
  }
  if (toolName === "Bash") {
    return guardCommand(input?.tool_input?.command, config);
  }
  return [];
}

function guardEdit(filePath, config, context) {
  if (typeof filePath !== "string" || filePath === "") return [];
  if (isOutsideRepo(filePath, context.root)) return [];
  const errors = branchErrors(config, context.branch);
  for (const re of config.guard.protectedFiles) {
    if (re.test(filePath)) {
      errors.push(`保護ファイル(${re.source})は編集禁止です: ${filePath}`);
    }
  }
  return errors;
}

function branchErrors(config, branch) {
  if (!branch || branch === "HEAD") return []; // git 外・detached HEAD ではスキップ
  if (config.guard.protectedBranches.includes(branch)) {
    return [
      `保護ブランチ ${branch} 上での編集は禁止です。作業ブランチを作ってください(例: git checkout -b feature/issue-<n>-<slug>)。`,
    ];
  }
  const pattern = config.guard.branchPattern;
  if (pattern && !pattern.test(branch)) {
    return [
      `ブランチ名 ${branch} が規約(${pattern.source})に一致しません。issue に紐づく作業ブランチで作業してください。`,
    ];
  }
  return [];
}

function guardCommand(command, config) {
  if (typeof command !== "string" || command === "") return [];
  const errors = [];
  for (const re of config.guard.denyCommands) {
    if (re.test(command)) {
      errors.push(`禁止コマンドパターン(${re.source})に一致するため実行できません。`);
    }
  }
  return errors;
}

function isOutsideRepo(filePath, root) {
  if (!isAbsolute(filePath)) return false;
  const rel = relative(root, filePath);
  return rel === ".." || rel.startsWith(`..${sep}`) || isAbsolute(rel);
}

export function currentBranch(root) {
  const result = spawnSync("git", ["rev-parse", "--abbrev-ref", "HEAD"], {
    cwd: root,
    encoding: "utf8",
  });
  if (result.status !== 0) return null;
  return result.stdout.trim();
}
