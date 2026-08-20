# lint-gate

リポジトリ横断で使う lint 品質ゲート。次の 4 つを 1 パッケージで提供する:

1. **Biome プリセット** — フォーマット + 一般 lint(認知的複雑度 15 上限、`!important` 禁止、focused/skipped テスト禁止)
2. **ESLint 設定ファクトリ** — サイズ・複雑度・構造の上限専用(`complexity: 10` / `max-lines: 400` / 関数 80 行など)、インライン抑制の無効化、`@ts-ignore` 系の禁止、Promise 放置検出、任意でレイヤ境界(domain 層の I/O 禁止)
3. **抑制コメント検出** — `eslint-disable` / `biome-ignore` / `@ts-ignore` 系ディレクティブの直書きを拒否(例外は allowlist に理由付きで登録)
4. **テスト観点チェック** — 各テストファイル先頭の `test-perspectives` ブロック(正常系 / エッジ / 異常系 / 否定 / リグレッション)を強制

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
    "fullPathPatterns": ["(^|/)test/domain/"]
  },
  "hook": {
    // hook サブコマンドの追加ディスパッチ(リポジトリ固有チェッカーの接続用)
    "extraChecks": [{ "pattern": "\\.css$", "command": ["node", "scripts/check-design-tokens.mjs"] }]
  }
}
```

### Claude Code hook

編集のたびに違反を即差し戻す PostToolUse hook:

```jsonc
// .claude/settings.json
{
  "hooks": {
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

編集対象がテストなら観点チェック、ソースなら抑制チェック、`extraChecks` にマッチすればそのコマンドを実行し、違反があれば exit 2 で差し戻す。
