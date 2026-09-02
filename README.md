# lint-gate

リポジトリ横断で使う品質・行動の門番。次の 5 つを 1 パッケージで提供する:

1. **oxlint プリセット + 自作ルール** — サイズ・複雑度・構造の上限(`complexity: 10` / 認知的複雑度 15 / `max-lines: 400` / 関数 80 行など)、`@ts-ignore` 系の禁止、放置 Promise の検出(型情報ルール)、focused / skipped テストの禁止、sonarjs 相当 4 ルール(同一関数・全分岐同一・要素上書き・不変 return)、レイヤ境界(`src/domain/` の I/O 禁止)
2. **oxfmt プリセット** — 整形(printWidth 100 / セミコロンあり / ダブルクォート / スペース 2)
3. **抑制コメント検出** — `oxlint-disable` / `eslint-disable` / `biome-ignore` / `@ts-ignore` 系ディレクティブの直書きを拒否(例外は allowlist に理由付きで登録)
4. **テスト観点チェック** — 各テストファイル先頭の `test-perspectives` ブロック(正常系 / エッジ / 異常系 / 否定 / リグレッション)を強制
5. **行動ガード(guard)** — 自律実行させる AI エージェント向けの「やってはいけない操作」の機械的ブロック(保護ブランチ上の編集・規約外ブランチでの編集・保護ファイルの編集・force push 等の禁止コマンド)

思想: 例外はインラインの抑制コメントではなく、設定ファイル・allowlist でのみ管理する(許可リスト管理)。上限に当たったら分割で解消し、緩和しない。lint エンジンは oxlint 1 本(型情報ルールは oxlint-tsgolint、整形は oxfmt)に絞り、2 エンジン並存でルールが重複して片方だけ緩められる事態を防ぐ。

## インストール

```bash
pnpm add -D github:Katsu0424/lint-gate oxlint oxlint-tsgolint oxfmt
```

Node >= 20。`oxlint` は必須 peer(検証済み: 1.80 以上 2 未満)。`oxlint-tsgolint`(型情報ルール)と `oxfmt`(整形)は使う場合だけ入れる。

## 使い方

### oxlint プリセット

リポジトリルートの `.oxlintrc.json`:

```json
{
  "extends": ["./node_modules/lint-gate/oxlintrc.json"],
  "ignorePatterns": ["**/node_modules/**", "**/dist/**"]
}
```

- `extends` はパッケージ名(bare specifier)を解決しないので相対パスで書く。プリセット内の `jsPlugins`(自作ルール)は extends 先から伝播する
- `ignorePatterns` は extends 先から伝播しないので利用側に書く。git リポジトリ内なら `.gitignore` は尊重される
- 型情報ルール(`typescript/no-floating-promises` 等)は `oxlint --type-aware` で有効になり、利用側の `tsconfig.json` を使う
- `.gitignore` の無いディレクトリで `oxlint .` を実行すると `node_modules` を全走査するので、スクリプトや CI では明示パスを渡す
- ルールを緩めたい場合は自分の `.oxlintrc.json` の `rules` / `overrides` で上書きする(例: `"lint-gate/no-invariant-returns": "off"`)。ただし上限値の緩和ではなく分割で解消するのが原則

#### プリセットが拒否するもの

| 分類                        | ルール                                                                                                                                                                                                                                |
| --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| サイズ・複雑度              | `complexity` 10 / `lint-gate/cognitive-complexity` 15 / `max-depth` 4 / `max-lines` 400 / `max-lines-per-function` 80 / `max-nested-callbacks` 4 / `max-params` 4 / `max-statements` 30(`test/` と `*.test.ts` では行数系 3 つを off) |
| 型検査のバイパス            | `typescript/ban-ts-comment`(`@ts-ignore` / `@ts-nocheck` / `@ts-expect-error`)                                                                                                                                                        |
| 放置された Promise(型情報)  | `typescript/no-floating-promises` / `no-misused-promises` / `await-thenable`                                                                                                                                                          |
| 例外の握りつぶし・重複分岐  | `no-empty` / `no-dupe-else-if` / `no-duplicate-case` / `no-constant-binary-expression` / `lint-gate/no-identical-functions` / `no-all-duplicated-branches` / `no-element-overwrite` / `no-invariant-returns`                          |
| テストの形骸化              | `vitest/expect-expect` / `no-focused-tests` / `no-disabled-tests`                                                                                                                                                                     |
| レイヤ境界                  | `src/domain/**/*.ts` での `node:*` と adapter / usecase / cli への import(`no-restricted-imports`)                                                                                                                                    |
| 既定の correctness カテゴリ | error に引き上げ(既定の warn では CI が落ちない)。`vitest/require-to-throw-message` だけは雑音なので off                                                                                                                              |

#### 自作ルール(`lint-gate/*`)

`oxlint-plugin.mjs` が提供する 5 ルール。Biome の認知的複雑度と sonarjs の実装から算出仕様を抽出し、635 ファイルで同値性を確認済み。

- `cognitive-complexity`(閾値オプション、既定 15) — 報告単位は関数ごと。入れ子関数の中身は親に加算せず別途報告する
- `no-identical-functions` — 本体 3 行以上で構造が一致する関数の後出を報告
- `no-all-duplicated-branches` — else で終わる if チェーン / default を含む switch / 三項の全分岐が同一
- `no-element-overwrite` — `x[i] = v` / `x.set(k, v)` / `x.add(k)` の同一キーへの連続書込
- `no-invariant-returns` — 全 return が同じ値。code path とスコープ解析は近似なので、誤検知が出たらこのルールだけ off にしてよい

注意: oxlint の JS プラグイン API は公式に alpha(semver 対象外)。使う API を Program visitor / `context.report` / `context.options` に絞り、oxlint 更新で算出値がずれたら固定値テスト(`test/oxlint-plugin.test.ts`)で検知する。

### oxfmt プリセット

oxfmt の設定は `extends` を持たないので、lint script からプリセットを直接参照する:

```json
{
  "scripts": {
    "lint": "oxlint --type-aware . && oxfmt -c node_modules/lint-gate/oxfmtrc.json --check . && lint-gate suppressions && lint-gate test-perspectives"
  }
}
```

除外パターン(`ignorePatterns`)など利用側の設定が要る場合は、`oxfmtrc.json` の 5 キーを自分の `.oxfmtrc.json` にコピーして追記し、`oxfmt --check .` にする(このリポジトリの `.oxfmtrc.json` がその形)。oxfmt は `.gitignore` / `.prettierignore` を尊重する。JS / TS だけでなく JSON / Markdown / YAML も整形し、`package.json` のキーも並べ替える(`sortPackageJson` 既定 true)。oxfmt は 0.x なので、問題が出たら整形だけ別ツールに戻せる。

### チェッカー

- `lint-gate suppressions` — 抑制ディレクティブの検出。例外は allowlist(既定 `suppressions-allowlist.json`)に `[{ "path": "...", "reason": "..." }]` で登録
- `lint-gate test-perspectives` — テスト観点ブロックの強制。`yes` の観点は `[観点名]` タグ付きテストが必要、`n/a` は理由必須

### 設定ファイル(任意)

リポジトリルートの `lint-gate.config.json`:

```json
{
  "skipDirs": ["fixtures"],
  "suppressions": { "allowlist": "scripts/suppressions-allowlist.json" },
  "testPerspectives": {
    "fullPathPatterns": ["(^|/)test/domain/"],
    "filePattern": "\\.spec\\.ts$"
  },
  "hook": {
    "extraChecks": [
      { "pattern": "\\.css$", "command": ["node", "scripts/check-design-tokens.mjs"] }
    ]
  },
  "guard": {
    "protectedBranches": ["main", "master"],
    "branchPattern": "^feature/issue-\\d+-",
    "protectedFiles": ["(^|/)\\.env$"],
    "denyCommands": ["git\\s+push\\b[^&|;]*(--force\\b|\\s-f\\b)", "gh\\s+repo\\s+delete\\b"]
  }
}
```

- `skipDirs` — 既定のスキップ(node_modules 等)への追記
- `suppressions.allowlist` — allowlist のパス(既定 `suppressions-allowlist.json`)
- `testPerspectives.fullPathPatterns` — 全 5 観点必須にするパス(正規表現)。既定: `test/domain/` 配下
- `testPerspectives.filePattern` — 対象テストファイルのパターン(正規表現)。既定: `.test.(ts|tsx|js|jsx|mjs|cjs)`。`.spec.ts` 運用のリポジトリでは必ず設定する(未設定だと対象 0 件で素通りし、警告だけが出る)
- `hook.extraChecks` — hook サブコマンドの追加ディスパッチ(リポジトリ固有チェッカーの接続用)。CSS の `!important` 禁止など oxlint が扱わない検査はここで正規表現検査に繋ぐ
- `guard.*` — 各項目は既定値を丸ごと上書き(マージしない)。`protectedBranches`(既定 main / master)上のリポジトリ内編集、`branchPattern`(任意)に一致しないブランチでの編集、`protectedFiles`(既定 `.env`)の編集、`denyCommands`(既定 force push とリポジトリ削除)に一致する Bash コマンドをブロック

### Claude Code hook

品質(PostToolUse)と行動(PreToolUse)の両方を hooks で強制する。`.claude/settings.json`:

```json
{
  "hooks": {
    "PreToolUse": [
      {
        "matcher": "Write|Edit|NotebookEdit|Bash",
        "hooks": [
          {
            "type": "command",
            "command": "cd \"$CLAUDE_PROJECT_DIR\" && node_modules/.bin/lint-gate guard",
            "timeout": 10
          }
        ]
      }
    ],
    "PostToolUse": [
      {
        "matcher": "Write|Edit",
        "hooks": [
          {
            "type": "command",
            "command": "cd \"$CLAUDE_PROJECT_DIR\" && node_modules/.bin/lint-gate hook",
            "timeout": 30
          }
        ]
      }
    ]
  }
}
```

- **`lint-gate hook`(PostToolUse)** — 編集対象がテストなら観点チェック、ソースなら抑制チェック、`extraChecks` にマッチすればそのコマンドを実行し、違反があれば exit 2 で差し戻す
- **`lint-gate guard`(PreToolUse)** — 操作の実行前に検査し、保護ブランチ上の編集 / `branchPattern` 不一致ブランチでの編集 / 保護ファイルの編集 / 禁止コマンドを exit 2 でブロックする。対象はリポジトリ配下のパスのみ(scratchpad 等リポジトリ外への書込は妨げない)。git リポジトリでない場合や detached HEAD ではブランチ系ガードをスキップする

## 移行(Biome + ESLint 構成から)

0.x のため互換期間は設けない。旧 exports(`lint-gate` の `createConfig` / `lint-gate/biome` / `lint-gate/biome-lint`)は廃止した。

1. 依存を入れ替える: `pnpm remove @biomejs/biome eslint eslint-plugin-sonarjs typescript-eslint && pnpm add -D oxlint oxlint-tsgolint oxfmt`
2. `biome.json` と `eslint.config.js` を削除し、上記の `.oxlintrc.json` を置く。型情報ルール用に `tsconfig.json` があることを確認する
3. lint script を `oxlint --type-aware . && oxfmt -c node_modules/lint-gate/oxfmtrc.json --check . && lint-gate suppressions && lint-gate test-perspectives` に差し替える
4. 初回だけ `oxfmt -c node_modules/lint-gate/oxfmtrc.json .` で整形差分を取り込む。Biome で整形済みの JS / TS は差分ゼロだが、`package.json` のキー順と Markdown / JSON / YAML には差分が出うる
5. `createConfig({ layers })` で有効化していたレイヤ境界はプリセットに含まれる(`src/domain/**/*.ts`)。パスが違うリポジトリは自分の `overrides` で上書きする
6. 落ちるもの: CSS の `!important` 禁止(oxlint は CSS 未対応。必要なら Biome を CSS 専用に残すか `hook.extraChecks` で正規表現検査)、ESLint の `noInlineConfig`(代わりに `lint-gate suppressions` が `oxlint-disable` を拒否する)
