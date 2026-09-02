// `lint-gate check`: 同梱した oxlint / oxfmt と自前チェッカーを 1 コマンドで順に実行する。
// 利用側の lint script を "lint-gate check" の 1 語にし、devDependencies を lint-gate 1 つに畳むための入口。
// 同梱ツールの実体は lint-gate 自身の位置から createRequire で解決する
// (PATH / node_modules/.bin / パッケージマネージャ非依存)。
// oxlint は cwd の node_modules から oxlint-tsgolint を探すため pnpm のネスト構造では見つからない。
// そこで実体パスを oxlint 組み込みの環境変数 OXLINT_TSGOLINT_PATH で渡す。
import { spawnSync } from "node:child_process";
import { existsSync, writeSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { checkSuppressions } from "./check-suppressions.js";
import { checkTestPerspectives } from "./check-test-perspectives.js";

const PACKAGE_ROOT = fileURLToPath(new URL("..", import.meta.url));
const require = createRequire(import.meta.url);
const NODE_MODULES_IGNORE = "**/node_modules/**";

function binOf(pkg) {
  const manifestPath = require.resolve(`${pkg}/package.json`);
  return join(dirname(manifestPath), require(manifestPath).bin[pkg]);
}

export function resolveTools() {
  const tsgolintManifest = require.resolve("oxlint-tsgolint/package.json");
  const exe = process.platform === "win32" ? "tsgolint.exe" : "tsgolint";
  return {
    oxlint: binOf("oxlint"),
    oxfmt: binOf("oxfmt"),
    // プラットフォーム別の実体は oxlint-tsgolint の optionalDependencies なので、その位置から解決する
    tsgolint: createRequire(tsgolintManifest).resolve(
      `@oxlint-tsgolint/${process.platform}-${process.arch}/${exe}`,
    ),
  };
}

// 利用側に設定ファイルが無ければ lint-gate のプリセット(lint-gate 自身の dogfood 設定と同じファイル)を -c で渡す
function configArgs(root, ownConfigs, preset) {
  const hasOwn = ownConfigs.some((name) => existsSync(join(root, name)));
  return hasOwn ? [] : ["-c", join(PACKAGE_ROOT, preset)];
}

export function oxlintArgs(root, paths) {
  return [
    "--type-aware",
    `--ignore-pattern=${NODE_MODULES_IGNORE}`,
    ...configArgs(root, [".oxlintrc.json"], ".oxlintrc.json"),
    ...paths,
  ];
}

export function oxfmtArgs(root, paths) {
  return [
    "--check",
    ...configArgs(root, [".oxfmtrc.json", ".oxfmtrc.jsonc"], ".oxfmtrc.json"),
    ...paths,
  ];
}

// 子プロセスの出力(stdio: inherit)と前後関係を崩さないよう、段の見出しは同期書込にする
const say = (text) => writeSync(1, `${text}\n`);
const warn = (text) => writeSync(2, `${text}\n`);

function spawnTool(bin, args, options) {
  const result = spawnSync(process.execPath, [bin, ...args], { stdio: "inherit", ...options });
  if (result.error) throw result.error;
  return result.status ?? 1;
}

function report(errors, headline) {
  warn(headline);
  for (const e of errors) warn(`  - ${e}`);
}

export function suppressionsStage(root, config) {
  const errors = checkSuppressions(root, config);
  if (errors.length > 0) {
    report(
      errors,
      `抑制コメントは禁止です。例外は ${config.suppressionsAllowlist} に理由付きで登録してください:`,
    );
    return 1;
  }
  say("lint-gate suppressions: OK");
  return 0;
}

export function testPerspectivesStage(root, config) {
  const { errors, count } = checkTestPerspectives(root, config);
  if (errors.length > 0) {
    report(errors, "テスト観点チェックに失敗しました:");
    return 1;
  }
  if (count === 0) {
    warn(
      "警告: 対象のテストファイルが 0 件です。ゲートが効いていません(.spec.ts 等を使う場合は lint-gate.config.json の testPerspectives.filePattern を設定してください)",
    );
  }
  say(`lint-gate test-perspectives: OK(${count} ファイル)`);
  return 0;
}

// 同梱 oxfmt で整形を書き込む(check と同じ設定解決)。利用側が oxfmt を別途入れずに済むようにする
export function runFmt(root, paths) {
  const tools = resolveTools();
  return spawnTool(
    tools.oxfmt,
    oxfmtArgs(root, paths).filter((a) => a !== "--check"),
    { cwd: root },
  );
}

// 4 段を順に実行し、最初に失敗した段の exit code を返す(0 なら全段合格)
export function runCheck(root, config, paths) {
  const tools = resolveTools();
  const env = { ...process.env, OXLINT_TSGOLINT_PATH: tools.tsgolint };
  const stages = [
    {
      name: "oxlint",
      run: () => spawnTool(tools.oxlint, oxlintArgs(root, paths), { cwd: root, env }),
    },
    { name: "oxfmt", run: () => spawnTool(tools.oxfmt, oxfmtArgs(root, paths), { cwd: root }) },
    { name: "suppressions", run: () => suppressionsStage(root, config) },
    { name: "test-perspectives", run: () => testPerspectivesStage(root, config) },
  ];
  for (const stage of stages) {
    say(`lint-gate check ▶ ${stage.name}`);
    const status = stage.run();
    if (status !== 0) {
      warn(`lint-gate check: 「${stage.name}」で失敗しました(exit ${status})`);
      return status;
    }
  }
  say("lint-gate check: OK");
  return 0;
}
