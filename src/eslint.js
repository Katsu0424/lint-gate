// サイズ・複雑度・構造の上限だけを機械に拒否させる専用 ESLint 設定のファクトリ。
// フォーマットと一般 lint は Biome が担う(ルールの重複なし)。
// 例外はインラインの抑制コメントではなく、利用側の設定ファイルの files スコープ
// (または suppressions allowlist)でのみ管理する。
import sonarjs from "eslint-plugin-sonarjs";
import tseslint from "typescript-eslint";

const DEFAULT_IGNORES = [
  "**/node_modules/**",
  "**/dist/**",
  "**/storybook-static/**",
  "**/.claude/worktrees/**",
  "**/*.js",
];
const DEFAULT_TEST_FILES = ["**/test/**/*.ts", "**/*.test.ts", "**/*.stories.tsx"];
const DEFAULT_LAYER_FILES = ["**/src/domain/**/*.ts"];
const DEFAULT_LAYER_FORBIDDEN = ["**/adapter/**", "**/usecase/**", "**/cli/**", "**/adapters/**"];

export function createConfig(options = {}) {
  const { tsconfigRootDir, extraIgnores = [], layers, testFiles = DEFAULT_TEST_FILES } = options;
  if (!tsconfigRootDir) {
    throw new Error("createConfig: tsconfigRootDir は必須です(import.meta.dirname を渡す)");
  }
  const config = [{ ignores: [...DEFAULT_IGNORES, ...extraIgnores] }, mainBlock(tsconfigRootDir)];
  if (layers) config.push(layersBlock(layers));
  config.push(testRelaxBlock(testFiles));
  return config;
}

function mainBlock(tsconfigRootDir) {
  return {
    files: ["**/*.ts", "**/*.tsx"],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        // 型情報を使うルール(no-floating-promises 等)のために各 tsconfig を自動解決する
        projectService: true,
        tsconfigRootDir,
      },
    },
    plugins: {
      "@typescript-eslint": tseslint.plugin,
      sonarjs,
    },
    linterOptions: {
      // インラインの抑制コメントを無効化する。例外は必ず設定側で宣言する(許可リスト管理)。
      noInlineConfig: true,
    },
    rules: rules(),
  };
}

function rules() {
  return {
    // --- サイズ・複雑度(超えたら分割する。上限は緩和しない) ---
    complexity: ["error", 10],
    "max-depth": ["error", 4],
    "max-lines": ["error", { max: 400, skipBlankLines: true, skipComments: true }],
    "max-lines-per-function": ["error", { max: 80, skipBlankLines: true, skipComments: true }],
    "max-nested-callbacks": ["error", 4],
    "max-params": ["error", 4],
    "max-statements": ["error", 30],
    // --- 型検査の無断バイパス禁止 ---
    "@typescript-eslint/ban-ts-comment": [
      "error",
      {
        "ts-ignore": true,
        "ts-nocheck": true,
        "ts-expect-error": true,
        "ts-check": false,
      },
    ],
    // --- 例外の握りつぶし検出(テストは通るが問題のあるコード) ---
    "sonarjs/no-ignored-exceptions": "error",
    "no-empty": ["error", { allowEmptyCatch: false }],
    "sonarjs/no-identical-conditions": "error",
    "sonarjs/no-all-duplicated-branches": "error",
    "sonarjs/no-element-overwrite": "error",
    "sonarjs/no-invariant-returns": "error",
    "sonarjs/no-gratuitous-expressions": "error",
    "sonarjs/no-identical-functions": "error",
    // --- 放置された Promise(await 忘れは静かに壊れる) ---
    "@typescript-eslint/no-floating-promises": "error",
    "@typescript-eslint/no-misused-promises": "error",
    "@typescript-eslint/await-thenable": "error",
    // --- テストの形骸化防止 ---
    "sonarjs/assertions-in-tests": "error",
  };
}

function layersBlock(layers) {
  const files = layers.files ?? DEFAULT_LAYER_FILES;
  const forbidden = layers.forbidden ?? DEFAULT_LAYER_FORBIDDEN;
  return {
    // domain 層は純関数のみ: I/O(node 組み込み)と外側の層への依存を機械的に拒否する
    files,
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: ["node:*"],
              message: "domain 層は I/O 禁止(純関数のみ)。I/O は adapter / usecase に置く。",
            },
            {
              group: forbidden,
              message: "domain は外側の層に依存しない(依存は内向きのみ)。",
            },
          ],
        },
      ],
    },
  };
}

function testRelaxBlock(testFiles) {
  return {
    // テストは describe/it のコールバックが構造上長くなるため行数系のみ緩める
    files: testFiles,
    rules: {
      "max-lines": "off",
      "max-lines-per-function": "off",
      "max-statements": "off",
    },
  };
}
