# lint 構成の全体像

lint-gate を入れた利用側リポジトリで「何が、どの順で、どの設定を読んで動くか」をまとめる。導入手順は [README](../README.md)。

## 1 コマンドで動く 4 段

利用側の lint script は `lint-gate check` の 1 語。次の 4 段を順に実行し、最初に失敗した段の名前と exit code を出して止まる。

| 段  | 名前              | 実体                                                      | 読む設定                                                          | 拒否するもの                                                                                   |
| --- | ----------------- | --------------------------------------------------------- | ----------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| 1   | oxlint            | 同梱 oxlint(`--type-aware`、型情報は同梱 oxlint-tsgolint) | 利用側の `.oxlintrc.json`(無ければ lint-gate の `.oxlintrc.json`) | サイズ・複雑度の上限、`@ts-ignore` 系、放置 Promise、テストの形骸化、自作 5 ルール、レイヤ境界 |
| 2   | oxfmt             | 同梱 oxfmt(`--check`)                                     | 利用側の `.oxfmtrc.json`(無ければ lint-gate の `.oxfmtrc.json`)   | 整形差分(JS / TS / JSON / Markdown / YAML)                                                     |
| 3   | suppressions      | lint-gate 内蔵(`src/check-suppressions.js`)               | `lint-gate.config.json` の `suppressions.allowlist`               | `oxlint-disable` / `eslint-disable` / `biome-ignore` / `@ts-ignore` 系の直書き                 |
| 4   | test-perspectives | lint-gate 内蔵(`src/check-test-perspectives.js`)          | `lint-gate.config.json` の `testPerspectives`                     | `test-perspectives` ブロックの欠落・不整合                                                     |

- 対象パスは引数で絞れる(既定 `.`)。oxlint には常に `--ignore-pattern=**/node_modules/**` を付ける
- `lint-gate fmt` は段 2 と同じ設定解決で oxfmt の整形を書き込む
- 個別サブコマンド `lint-gate suppressions` / `lint-gate test-perspectives` は段 3 / 4 を単独で実行する

## ファイルの対応

| 場所      | ファイル                                      | 役割                                                                                                               |
| --------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| lint-gate | `.oxlintrc.json`                              | oxlint プリセット。lint-gate 自身の dogfood 設定を兼ねる(exports `lint-gate/oxlint`)                               |
| lint-gate | `oxlint-plugin.mjs` + `src/oxlint-rules/*.js` | 自作ルール 5 つ(認知的複雑度 + sonarjs 相当 4 ルール)。プリセットの `jsPlugins` から相対参照される                 |
| lint-gate | `.oxfmtrc.json`                               | oxfmt プリセット(printWidth 100 / semi / double quote / 2 spaces)。dogfood 設定を兼ねる(exports `lint-gate/oxfmt`) |
| lint-gate | `bin/lint-gate.js` + `src/check.js`           | `check` / `fmt` の段の実行と同梱ツールの解決                                                                       |
| lint-gate | `package.json` の `dependencies`              | oxlint / oxlint-tsgolint / oxfmt を exact pin で同梱                                                               |
| 利用側    | `.oxlintrc.json`                              | `extends` 1 行 + `ignorePatterns`。無くても動くが、エディタ統合と除外のために置く                                  |
| 利用側    | `tsconfig.json`                               | 型情報ルール(oxlint-tsgolint)が使う                                                                                |
| 利用側    | `.oxfmtrc.json` / `.prettierignore`(任意)     | 整形の除外が要るときだけ。前者はプリセットの 5 キーをコピーして追記、後者は除外パターンのみ                        |
| 利用側    | `lint-gate.config.json`(任意)                 | allowlist / テスト観点の濃淡 / hook の追加チェック / guard の上書き                                                |
| 利用側    | `.claude/settings.json`                       | Claude Code の hook(`lint-gate hook` / `lint-gate guard`)                                                          |

`.oxlintrc.json` の `extends` はパッケージ名を解決しないので相対パス(`./node_modules/lint-gate/.oxlintrc.json`)で書く。`jsPlugins` は extends 先から伝播するが、`ignorePatterns` は伝播しない。

## 同梱ツールの解決(pnpm / npm 非依存)

`lint-gate check` は PATH や `node_modules/.bin` を使わず、lint-gate 自身の位置から `createRequire(import.meta.url).resolve` でツールの実体を解決して `node <bin>` で起動する。pnpm のネスト構造でも npm の hoisting でも同じ経路になる。

- oxlint / oxfmt: `<pkg>/package.json` の `bin` を解決
- oxlint-tsgolint: oxlint は cwd の `node_modules` から tsgolint を探すため、pnpm では同梱版が見つからない。そこでプラットフォーム別パッケージ(`@oxlint-tsgolint/<platform>-<arch>`)の実体を解決し、oxlint 組み込みの環境変数 `OXLINT_TSGOLINT_PATH` で渡す
- 同梱ツールを読み込むのは `check` / `fmt` だけ。`suppressions` / `test-perspectives` / `hook` / `guard` は Node 組み込みのみで動く

## プリセットが拒否するもの

| 分類                        | ルール                                                                                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| サイズ・複雑度              | `complexity` 10 / `lint-gate/cognitive-complexity` 15 / `max-depth` 4 / `max-lines` 400 / `max-lines-per-function` 80 / `max-nested-callbacks` 4 / `max-params` 4 / `max-statements` 30(`test/` と `*.test.ts` では行数系 3 つを off) |
| 型検査のバイパス            | `typescript/ban-ts-comment`(`@ts-ignore` / `@ts-nocheck` / `@ts-expect-error`)                                                                                                                                                        |
| 放置された Promise(型情報)  | `typescript/no-floating-promises` / `no-misused-promises` / `await-thenable`                                                                                                                                                          |
| 例外の握りつぶし・重複分岐  | `no-empty` / `no-dupe-else-if` / `no-duplicate-case` / `no-constant-binary-expression` / `lint-gate/no-identical-functions` / `no-all-duplicated-branches` / `no-element-overwrite` / `no-invariant-returns`                          |
| テストの形骸化              | `vitest/expect-expect` / `no-focused-tests` / `no-disabled-tests`                                                                                                                                                                     |
| レイヤ境界                  | `src/domain/**/*.ts` での `node:*` と adapter / usecase / cli への import(`no-restricted-imports`)                                                                                                                                    |
| 既定の correctness カテゴリ | error に引き上げ(既定の warn では CI が落ちない)。`vitest/require-to-throw-message` だけは雑音なので off                                                                                                                              |

### 自作ルール(`lint-gate/*`)

Biome の認知的複雑度と sonarjs の実装から算出仕様を抽出し、635 ファイルで同値性を確認済み。使う API は Program visitor / `context.report` / `context.options` のみ(oxlint の JS プラグイン API は公式に alpha)。oxlint 更新で算出値がずれたら固定値テスト(`test/oxlint-plugin.test.ts`)で検知する。

- `cognitive-complexity`(閾値オプション、既定 15) — 報告単位は関数ごと。入れ子関数の中身は親に加算せず別途報告する
- `no-identical-functions` — 本体 3 行以上で構造が一致する関数の後出を報告
- `no-all-duplicated-branches` — else で終わる if チェーン / default を含む switch / 三項の全分岐が同一
- `no-element-overwrite` — `x[i] = v` / `x.set(k, v)` / `x.add(k)` の同一キーへの連続書込
- `no-invariant-returns` — 全 return が同じ値。code path とスコープ解析は近似なので、誤検知が出たらこのルールだけ off にしてよい

## 例外の扱い

- インラインの抑制コメントは段 3 が拒否する。どうしても必要なファイルは allowlist に理由付きで登録する
- ルール単位で緩めるなら利用側の `.oxlintrc.json` の `rules` / `overrides` で上書きする。上限値は緩めず分割で解消するのが原則
- レイヤ境界のパスが `src/domain/` でないリポジトリは `overrides` で `no-restricted-imports` を自分のパスに付け替える

## Claude Code hook との関係

- `lint-gate hook`(PostToolUse) — 編集対象がテストなら段 4、ソースなら段 3、`hook.extraChecks` にマッチすればそのコマンドを実行し、違反があれば exit 2 で差し戻す。oxlint / oxfmt は走らせない(全量は `lint-gate check` と CI が担う)
- `lint-gate guard`(PreToolUse) — 品質ではなく行動のガード。保護ブランチ上の編集・規約外ブランチ・保護ファイル・禁止コマンドをブロックする

## 制約・落ちたもの

- CSS の `!important` 禁止は oxlint が CSS 未対応のため対象外。必要なら `hook.extraChecks` で正規表現検査するか、Biome を CSS 専用に残す
- ESLint の `noInlineConfig` 相当は段 3 が担う(oxlint は `oxlint-disable` と `eslint-disable` の両方を効かせるので両方を拒否する)
- oxfmt は 0.x で、JSON / Markdown / YAML も整形し `package.json` のキーも並べ替える(`sortPackageJson` 既定 true)。問題が出たら整形だけ別ツールに戻せる
- 同梱バージョンは exact pin(oxlint 1.80.0 / oxlint-tsgolint 7.0.2001 / oxfmt 0.65.0)。上げるときは `package.json` の `dependencies` を更新し、固定値テストとプリセットのテストで差分を検知する。lint-gate 自身の `pnpm-workspace.yaml` は公開 7 日未満の版を解決しない(`minimumReleaseAge`)
