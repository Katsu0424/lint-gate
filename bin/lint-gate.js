#!/usr/bin/env node
import { readFileSync } from "node:fs";
import { runCheck, runFmt, suppressionsStage, testPerspectivesStage } from "../src/check.js";
import { loadConfig } from "../src/config.js";
import { currentBranch, runGuard } from "../src/guard.js";
import { runHook } from "../src/hook.js";

const USAGE =
  "usage: lint-gate <check [paths...]|fmt [paths...]|suppressions|test-perspectives|hook|guard>";

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
  const [command, ...args] = process.argv.slice(2);
  const config = loadConfig(root);
  // 段の結果は exitCode で返し、stdout の書き残しを process.exit で失わないようにする
  const paths = args.length > 0 ? args : ["."];
  if (command === "check") {
    process.exitCode = runCheck(root, config, paths);
    return;
  }
  if (command === "fmt") {
    process.exitCode = runFmt(root, paths);
    return;
  }
  if (command === "suppressions") {
    process.exitCode = suppressionsStage(root, config);
    return;
  }
  if (command === "test-perspectives") {
    process.exitCode = testPerspectivesStage(root, config);
    return;
  }
  if (command === "hook") return runHookCommand(root, config);
  if (command === "guard") return runGuardCommand(root, config);
  console.error(USAGE);
  process.exit(1);
}

main();
