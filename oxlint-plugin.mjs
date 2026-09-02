// lint-gate の oxlint JS プラグイン: 認知的複雑度 + sonarjs 相当 4 ルール。
// 使う API は Program visitor / context.report / context.options のみ(alpha API の影響面を最小化)。
// プリセット(.oxlintrc.json)の "jsPlugins": ["./oxlint-plugin.mjs"] から読み込まれる。
import { cognitiveComplexity } from "./src/oxlint-rules/cognitive-complexity.js";
import { noAllDuplicatedBranches } from "./src/oxlint-rules/no-all-duplicated-branches.js";
import { noElementOverwrite } from "./src/oxlint-rules/no-element-overwrite.js";
import { noIdenticalFunctions } from "./src/oxlint-rules/no-identical-functions.js";
import { noInvariantReturns } from "./src/oxlint-rules/no-invariant-returns.js";

export default {
  meta: { name: "lint-gate" },
  rules: {
    "cognitive-complexity": cognitiveComplexity,
    "no-identical-functions": noIdenticalFunctions,
    "no-all-duplicated-branches": noAllDuplicatedBranches,
    "no-element-overwrite": noElementOverwrite,
    "no-invariant-returns": noInvariantReturns,
  },
};
