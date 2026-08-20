# lint-gate

リポジトリ横断で使う品質・行動の門番。次の 5 つを 1 パッケージで提供する:

1. **Biome プリセット** — フォーマット + 一般 lint(認知的複雑度 15 上限、`!important` 禁止、focused/skipped テスト禁止)
2. **ESLint 設定ファクトリ** — サイズ・複雑度・構造の上限専用(`complexity: 10` / `max-lines: 400` / 関数 80 行など)、インライン抑制の無効化、`@ts-ignore` 系の禁止、Promise 放置検出、任意でレイヤ境界(domain 層の I/O 禁止)
3. **抑制コメント検出** — `eslint-disable` / `biome-ignore` / `@ts-ignore` 系ディレクティブの直書きを拒否(例外は allowlist に理由付きで登録)
4. **テスト観点チェック** — 各テストファイル先頭の `test-perspectives` ブロック(正常系 / エッジ / 異常系 / 否定 / リグレッション)を強制
5. **行動ガード(guard)** — 自律実行させる AI エージェント向けの「やってはいけない操作」の機械的ブロック(保護ブランチ上の編集・規約外ブランチでの編集・保護ファイルの編集・force push 等の禁止コマンド)

思想: 例外はインラインの抑制コメントではなく、設定ファイル・allowlist でのみ管理する(許可リスト管理)。上限に当たったら分割で解消し、緩和しない。

## インストール

```bash
pnpm add -D github:Katsu0424/lint-gate @biomejs/biome eslint eslint-plugin-sonarjs typescript-eslint
```

Node >= 20。使う機能に応じた peer だけ入れればよい(すべて optional)。

## 使い方

### Biome プリセット

```jsonc
// biome.json
{
  "extends": ["lint-gate/biome"]
}
```

**既存リポジトリへの後付け導入**では `lint-gate/biome` の formatter 設定が全面再フォーマットを要求することがある。その場合は linter のみの `lint-gate/biome-lint` を使い、formatter は自前設定(または無効)で維持する:

```jsonc
// biome.json — 後付け導入(formatter は持ち込まない)
{
  "extends": ["lint-gate/biome-lint"],
  "formatter": { "enabled": false } // または既存リポジトリの整形設定をここに書く
}
```

### ESLint 設定ファクトリ

```js
// eslint.config.js
import { createConfig } from "lint-gate";

export default createConfig({
  tsconfigRootDir: import.meta.dirname,
  layers: {}, // domain 層の I/O 禁止を既定値(src/domain/)で有効化。省略で無効
});
```

オプション: `extraIgnores`(ignores への追記)/ `layers.files` / `layers.forbidden` / `testFiles`。

### チェッカー

```jsonc
// package.json
{
  "scripts": {
    "lint": "biome check . && eslint . && lint-gate suppressions && lint-gate test-perspectives"
  }
}
```

- `lint-gate suppressions` — 抑制ディレクティブの検出。例外は allowlist(既定 `suppressions-allowlist.json`)に `[{ "path": "...", "reason": "..." }]` で登録
- `lint-gate test-perspectives` — テスト観点ブロックの強制。`yes` の観点は `[観点名]` タグ付きテストが必要、`n/a` は理由必須

### 設定ファイル(任意)

リポジトリルートの `lint-gate.config.json`:

```jsonc
{
  "skipDirs": ["fixtures"], // 既定のスキップ(node_modules 等)への追記
  "suppressions": { "allowlist": "scripts/suppressions-allowlist.json" },
  "testPerspectives": {
    // 全 5 観点必須にするパス(正規表現)。既定: test/domain/ 配下
    "fullPathPatterns": ["(^|/)test/domain/"],
    // 対象テストファイルのパターン(正規表現)。既定: .test.(ts|tsx|js|jsx|mjs|cjs)
    // .spec.ts 運用のリポジトリでは必ず設定する(未設定だと対象 0 件で素通りし、警告だけが出る)
    "filePattern": "\\.spec\\.ts$"
  },
  "hook": {
    // hook サブコマンドの追加ディスパッチ(リポジトリ固有チェッカーの接続用)
    "extraChecks": [{ "pattern": "\\.css$", "command": ["node", "scripts/check-design-tokens.mjs"] }]
  },
  "guard": {
    // 各項目は既定値を丸ごと上書き(マージしない)
    "protectedBranches": ["main", "master"],       // このブランチ上のリポジトリ内編集をブロック(既定)
    "branchPattern": "^feature/issue-\\d+-",       // 任意。作業ブランチ名の必須パターン(不一致で編集ブロック)
    "protectedFiles": ["(^|/)\\.env$"],            // 編集をブロックするパスパターン(既定)
    "denyCommands": [                              // Bash コマンドの拒否パターン(既定: force push / gh repo delete)
      "git\\s+push\\b[^&|;]*(--force\\b|\\s-f\\b)",
      "gh\\s+repo\\s+delete\\b"
    ]
  }
}
```

### Claude Code hook

品質(PostToolUse)と行動(PreToolUse)の両方を hooks で強制する:

```jsonc
// .claude/settings.json
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
