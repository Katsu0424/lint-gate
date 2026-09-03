# lint-gate

リポジトリ横断で使う品質・行動の門番。利用側は **devDependencies 1 つ(lint-gate)と lint script 1 語(`lint-gate check`)** で次を手に入れる:

1. **`lint-gate check`** — 同梱した oxlint(型情報ルール込み)→ oxfmt → 抑制コメント検出 → テスト観点チェックを順に実行し、最初の失敗で止まる
2. **oxlint プリセット + 自作ルール** — サイズ・複雑度・構造の上限(`complexity: 10` / 認知的複雑度 15 / `max-lines: 400` / 関数 80 行など)、`@ts-ignore` 系の禁止、放置 Promise の検出、focused / skipped テストの禁止、循環 import の禁止、union の網羅漏れと `any` の直書きの禁止、古い(deprecated)API の利用・型を誤解した死に分岐・`==` の検知、ソースでの `!`(非 null 断定)禁止、sonarjs 相当 4 ルール(同一関数・全分岐同一・要素上書き・不変 return)、レイヤ境界(`src/domain/` の I/O 禁止)
3. **oxfmt プリセット** — 整形(printWidth 100 / セミコロンあり / ダブルクォート / スペース 2)。`lint-gate fmt` で書き込む
4. **抑制コメント検出** — `oxlint-disable` / `eslint-disable` / `biome-ignore` / `@ts-ignore` 系ディレクティブの直書きを拒否(例外は allowlist に理由付きで登録)
5. **テスト観点チェック** — 各テストファイル先頭の `test-perspectives` ブロック(正常系 / エッジ / 異常系 / 否定 / リグレッション)を強制
6. **行動ガード(guard)** — 自律実行させる AI エージェント向けの「やってはいけない操作」の機械的ブロック(保護ブランチ上の編集・規約外ブランチでの編集・保護ファイルの編集・force push 等の禁止コマンド)

思想: 例外はインラインの抑制コメントではなく、設定ファイル・allowlist でのみ管理する(許可リスト管理)。上限に当たったら分割で解消し、緩和しない。lint エンジンは oxlint 1 本(型情報ルールは oxlint-tsgolint、整形は oxfmt)に絞り、2 エンジン並存でルールが重複して片方だけ緩められる事態を防ぐ。

読む順: この README(導入手順)→ [docs/lint-architecture.md](docs/lint-architecture.md)(何がどの順で動き、どのファイルがどこに効くか)→ wiki [lint でできること・できないこと](https://github.com/Katsu0424/lint-gate/wiki/lint-でできること・できないこと)(機械的に拒否できるものと、できない・別の手段が要るもの)。

## インストール

```bash
pnpm add -D github:Katsu0424/lint-gate
```

Node >= 20。oxlint / oxlint-tsgolint / oxfmt は lint-gate に同梱(dependencies、exact pin)されるので、利用側で入れる必要はない。

## 使い方

### 1. lint script

```json
{
  "scripts": {
    "lint": "lint-gate check"
  }
}
```

- 段: oxlint `--type-aware` → oxfmt `--check` → suppressions → test-perspectives。失敗した段の名前と exit code を出して止まる
- 対象パスは引数で絞れる(既定 `.`): `lint-gate check src test`
- 型情報ルール(放置 Promise の検出)には利用側の `tsconfig.json` が要る
- 同梱ツールは lint-gate 自身の位置から解決するので、PATH や `node_modules/.bin`、pnpm / npm の違いに依存しない
- 整形の書き込みは `lint-gate fmt`(同じ設定解決で oxfmt を実行)

### 2. `.oxlintrc.json`(推奨)

リポジトリルートに置く。無くても `lint-gate check` はプリセットを直接使うが、エディタ統合(oxc 拡張)と除外のために置くことを推奨する:

```json
{
  "extends": ["./node_modules/lint-gate/.oxlintrc.json"],
  "ignorePatterns": ["**/node_modules/**", "**/dist/**"]
}
```

- `extends` はパッケージ名(bare specifier)を解決しないので相対パスで書く。プリセット内の `jsPlugins`(自作ルール)は extends 先から伝播する
- `ignorePatterns` は extends 先から伝播しないので利用側に書く。git リポジトリ内なら `.gitignore` は尊重される
- ルールを緩めたい場合は `rules` / `overrides` で上書きする(例: `"lint-gate/no-invariant-returns": "off"`)。ただし上限値の緩和ではなく分割で解消するのが原則
- 自分で `oxlint .` を叩く場合、`.gitignore` の無いディレクトリでは `node_modules` を全走査するので明示パスを渡す(`lint-gate check` は常に除外する)

### 3. 整形(oxfmt)

`.oxfmtrc.json` が無ければ lint-gate のプリセットで検査・整形する。除外が要る場合は次のどちらか:

- プリセットの 5 キー(`printWidth: 100` / `semi: true` / `singleQuote: false` / `tabWidth: 2` / `useTabs: false`)を自分の `.oxfmtrc.json` にコピーして `ignorePatterns` を足す(oxfmt の設定は `extends` を持たない)
- `.prettierignore` に除外パターンを書く(oxfmt は `.gitignore` と `.prettierignore` を尊重する)

oxfmt は JS / TS だけでなく JSON / Markdown / YAML も整形し、`package.json` のキーも並べ替える(`sortPackageJson` 既定 true)。初回は `lint-gate fmt` で差分を取り込む。

### 4. 設定ファイル `lint-gate.config.json`(任意)

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
- `suppressions.allowlist` — allowlist のパス(既定 `suppressions-allowlist.json`)。`[{ "path": "...", "reason": "..." }]` の配列
- `testPerspectives.fullPathPatterns` — 全 5 観点必須にするパス(正規表現)。既定: `test/domain/` 配下
- `testPerspectives.filePattern` — 対象テストファイルのパターン(正規表現)。既定: `.test.(ts|tsx|js|jsx|mjs|cjs)`。`.spec.ts` 運用のリポジトリでは必ず設定する(未設定だと対象 0 件で素通りし、警告だけが出る)
- `hook.extraChecks` — hook サブコマンドの追加ディスパッチ(リポジトリ固有チェッカーの接続用)。CSS の `!important` 禁止など oxlint が扱わない検査はここで正規表現検査に繋ぐ
- `guard.*` — 各項目は既定値を丸ごと上書き(マージしない)。`protectedBranches`(既定 main / master)上のリポジトリ内編集、`branchPattern`(任意)に一致しないブランチでの編集、`protectedFiles`(既定 `.env`)の編集、`denyCommands`(既定 force push とリポジトリ削除)に一致する Bash コマンドをブロック

### 5. Claude Code hook

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

## 個別に呼ぶ(従来構成)

`lint-gate check` を使わず、oxlint / oxfmt を自分の devDependencies に入れて直接呼ぶ構成も引き続き使える。プリセットは `lint-gate/oxlint`(`.oxlintrc.json`)と `lint-gate/oxfmt`(`.oxfmtrc.json`)として exports されている:

```json
{
  "scripts": {
    "lint": "oxlint --type-aware . && oxfmt -c node_modules/lint-gate/.oxfmtrc.json --check . && lint-gate suppressions && lint-gate test-perspectives"
  }
}
```

## 移行(Biome + ESLint 構成から)

0.x のため互換期間は設けない。旧 exports(`lint-gate` の `createConfig` / `lint-gate/biome` / `lint-gate/biome-lint`)は廃止した。

1. 依存を lint-gate だけにする: `pnpm remove @biomejs/biome eslint eslint-plugin-sonarjs typescript-eslint`(oxlint 系は同梱されるので追加不要)
2. `biome.json` と `eslint.config.js` を削除し、上記の `.oxlintrc.json` を置く。型情報ルール用に `tsconfig.json` があることを確認する
3. lint script を `lint-gate check` に差し替える(リポジトリ固有のチェッカーは `&&` で後ろに繋ぐ)
4. 初回だけ `lint-gate fmt` で整形差分を取り込む。Biome で整形済みの JS / TS は差分ゼロだが、`package.json` のキー順と Markdown / JSON / YAML には差分が出うる
5. `createConfig({ layers })` で有効化していたレイヤ境界はプリセットに含まれる(`src/domain/**/*.ts`)。パスが違うリポジトリは自分の `overrides` で上書きする
6. 落ちるもの: CSS の `!important` 禁止(oxlint は CSS 未対応。必要なら Biome を CSS 専用に残すか `hook.extraChecks` で正規表現検査)、ESLint の `noInlineConfig`(代わりに `lint-gate suppressions` が `oxlint-disable` を拒否する)
