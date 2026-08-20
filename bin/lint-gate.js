#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { checkSuppressions } from "../src/check-suppressions.js";
import { checkTestPerspectives } from "../src/check-test-perspectives.js";
import { loadConfig } from "../src/config.js";
import { runHook } from "../src/hook.js";

const USAGE = "usage: lint-gate <suppressions|test-perspectives|hook>";

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
  console.log(`lint-gate test-perspectives: OK(${count} ファイル)`);
}

function runHookCommand(root, config) {
  let input;
  try {
    input = JSON.parse(readFileSync(0, "utf8"));
  } catch {
    process.exit(0); // hook 入力が読めない場合は何もしない(編集自体は妨げない)
  }
  const errors = runHook(root, config, input);
  if (errors.length > 0) {
    for (const e of errors) process.stderr.write(`${e}\n`);
    process.exit(2); // Claude に修正を差し戻す
  }
}

function main() {
  const root = process.cwd();
  const command = process.argv[2];
  const config = loadConfig(root);
  if (command === "suppressions") return runSuppressions(root, config);
  if (command === "test-perspectives") return runTestPerspectives(root, config);
  if (command === "hook") return runHookCommand(root, config);
  console.error(USAGE);
  process.exit(1);
}

main();
