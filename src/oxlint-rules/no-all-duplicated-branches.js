// 全分岐が同一の条件分岐(sonarjs/no-all-duplicated-branches 相当)。
// else で終わる if チェーンの全分岐、default を含む switch の全 case(末尾 break 除去)、
// 三項の両分岐が構造的に同値なら報告する。
import { key, walk } from "./ast.js";

const allSame = (branches) =>
  branches.length > 1 && branches.every((b) => key(b) === key(branches[0]));

function withoutTrailingBreak(statements) {
  return statements.at(-1)?.type === "BreakStatement" ? statements.slice(0, -1) : statements;
}

// else で終わらないチェーンは null
function ifChainBranches(node) {
  const branches = [node.consequent];
  let rest = node.alternate;
  while (rest?.type === "IfStatement") {
    branches.push(rest.consequent);
    rest = rest.alternate;
  }
  if (!rest) return null;
  branches.push(rest);
  return branches;
}

// default を持たない switch は null。空の case は最後以外フォールスルーとして除く
function switchBranches(node) {
  if (!node.cases.some((c) => !c.test)) return null;
  const last = node.cases.length - 1;
  return node.cases
    .filter((c, i) => i === last || c.consequent.length > 0)
    .map((c) => withoutTrailingBreak(c.consequent));
}

function duplicatedBranches(node, parent) {
  if (node.type === "IfStatement" && parent?.type !== "IfStatement") {
    return { branches: ifChainBranches(node), message: "all branches are identical" };
  }
  if (node.type === "SwitchStatement") {
    return { branches: switchBranches(node), message: "all cases are identical" };
  }
  if (node.type === "ConditionalExpression") {
    return { branches: [node.consequent, node.alternate], message: "both branches are identical" };
  }
  return null;
}

export const noAllDuplicatedBranches = {
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      Program(program) {
        walk(program, null, (node, parent) => {
          const found = duplicatedBranches(node, parent);
          if (found?.branches && allSame(found.branches)) {
            context.report({ node, message: found.message });
          }
        });
      },
    };
  },
};
