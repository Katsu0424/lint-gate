#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { checkSuppressions } from "../src/check-suppressions.js";
import { checkTestPerspectives } from "../src/check-test-perspectives.js";
import { loadConfig } from "../src/config.js";
import { currentBranch, runGuard } from "../src/guard.js";
import { runHook } from "../src/hook.js";

const USAGE = "usage: lint-gate <suppressions|test-perspectives|hook|guard>";

function reportAndExit(errors, headline) {
  console.error(headline);
  for (const e of errors) console.error(`  - ${e}`);
  process.exit(1);
}

function runSuppressions(root, config) {
  const errors = checkSuppressions(root, config);
  if (errors.length > 0) {
    reportAndExit(
      errors,
      `抑制コメントは禁止です。例外は ${config.suppressionsAllowlist} に理由付きで登録してください:`,
    );
  }
  console.log("lint-gate suppressions: OK");
}

function runTestPerspectives(root, config) {
  const { errors, count } = checkTestPerspectives(root, config);
  if (errors.length > 0) {
    reportAndExit(errors, "テスト観点チェックに失敗しました:");
  }
  if (count === 0) {
    console.error(
      "警告: 対象のテストファイルが 0 件です。ゲートが効いていません(.spec.ts 等を使う場合は lint-gate.config.json の testPerspectives.filePattern を設定してください)",
    );
  }
  console.log(`lint-gate test-perspectives: OK(${count} ファイル)`);
}

function runHookCommand(root, config) {
  const input = readHookInput();
  const errors = runHook(root, config, input);
  failHook(errors);
}

function runGuardCommand(root, config) {
  const input = readHookInput();
  const errors = runGuard(input, config, { root, branch: currentBranch(root) });
  failHook(errors);
}

function readHookInput() {
  try {
    return JSON.parse(readFileSync(0, "utf8"));
  } catch {
    process.exit(0); // hook 入力が読めない場合は何もしない(操作自体は妨げない)
  }
}

function failHook(errors) {
  if (errors.length > 0) {
    for (const e of errors) process.stderr.write(`${e}\n`);
    process.exit(2); // Claude に差し戻す
  }
}

function main() {
  const root = process.cwd();
  const command = process.argv[2];
  const config = loadConfig(root);
  if (command === "suppressions") return runSuppressions(root, config);
  if (command === "test-perspectives") return runTestPerspectives(root, config);
  if (command === "hook") return runHookCommand(root, config);
  if (command === "guard") return runGuardCommand(root, config);
  console.error(USAGE);
  process.exit(1);
}

main();
