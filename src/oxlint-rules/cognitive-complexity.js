// 認知的複雑度(sonarjs の算出仕様を再現。同値性は 635 ファイルで検証済み)。
// 報告単位は関数ごと。入れ子関数の中身は親に加算せず別途報告する。
// 構造的増分(if / 三項 / switch / ループ / catch)は「その関数内の制御構造の入れ子深さ + 1」、
// else-if と else は +1 固定、ラベル付き break/continue は +1、
// 論理演算子は `&&` の連続 1 つにつき +1(`||` と `??` は数えない)。再帰は数えない。
import { children, FN, walk } from "./ast.js";

const DEFAULT_MAX = 15;

function flatten(n) {
  return n.type === "LogicalExpression" ? [...flatten(n.left), n, ...flatten(n.right)] : [];
}

function logicalIncrement(top) {
  let n = 0;
  let prev;
  for (const cur of flatten(top)) {
    if (cur.operator === "&&" && prev?.operator !== cur.operator) n++;
    prev = cur;
  }
  return n;
}

function visitIf(node, nesting, parent, acc) {
  const elseIf = parent?.type === "IfStatement" && parent.alternate === node;
  acc.total += elseIf ? 1 : 1 + nesting;
  const elseBlock = Boolean(node.alternate) && node.alternate.type !== "IfStatement";
  if (elseBlock) acc.total += 1;
  cc(node.test, nesting, node, acc);
  cc(node.consequent, nesting + 1, node, acc);
  if (node.alternate) cc(node.alternate, elseBlock ? nesting + 1 : nesting, node, acc);
}

function visitConditional(node, nesting, parent, acc) {
  acc.total += 1 + nesting;
  cc(node.test, nesting, node, acc);
  cc(node.consequent, nesting + 1, node, acc);
  cc(node.alternate, nesting + 1, node, acc);
}

function visitSwitch(node, nesting, parent, acc) {
  acc.total += 1 + nesting;
  cc(node.discriminant, nesting, node, acc);
  for (const c of node.cases) cc(c, nesting + 1, node, acc);
}

// ループと catch: body だけ入れ子深さを 1 つ深くする
function visitBodyNesting(node, nesting, parent, acc) {
  acc.total += 1 + nesting;
  for (const c of children(node)) cc(c, c === node.body ? nesting + 1 : nesting, node, acc);
}

const STRUCTURAL = new Map([
  ["IfStatement", visitIf],
  ["ConditionalExpression", visitConditional],
  ["SwitchStatement", visitSwitch],
  ["CatchClause", visitBodyNesting],
  ["ForStatement", visitBodyNesting],
  ["ForInStatement", visitBodyNesting],
  ["ForOfStatement", visitBodyNesting],
  ["WhileStatement", visitBodyNesting],
  ["DoWhileStatement", visitBodyNesting],
]);

function cc(node, nesting, parent, acc) {
  const t = node.type;
  if (FN.has(t)) return;
  const structural = STRUCTURAL.get(t);
  if (structural) {
    structural(node, nesting, parent, acc);
    return;
  }
  if (t === "LogicalExpression" && parent?.type !== "LogicalExpression") {
    acc.total += logicalIncrement(node);
  }
  if ((t === "BreakStatement" || t === "ContinueStatement") && node.label) acc.total += 1;
  for (const c of children(node)) cc(c, nesting, node, acc);
}

function complexityOf(fn) {
  const acc = { total: 0 };
  for (const c of children(fn)) cc(c, 0, fn, acc);
  return acc.total;
}

export const cognitiveComplexity = {
  // オプション(閾値)の妥当性は oxlint が schema で検証する
  meta: { type: "suggestion", schema: [{ type: "integer", minimum: 0 }] },
  create(context) {
    const max = context.options[0] ?? DEFAULT_MAX;
    return {
      Program(program) {
        walk(program, null, (node) => {
          if (!FN.has(node.type)) return;
          const total = complexityOf(node);
          if (total > max) {
            context.report({ node, message: `cognitive complexity ${total} > ${max}` });
          }
        });
      },
    };
  },
};
