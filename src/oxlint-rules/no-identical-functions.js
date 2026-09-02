// 同一関数の検出(sonarjs/no-identical-functions 相当)。
// FunctionDeclaration と VariableDeclarator / MethodDefinition 直下の関数式・arrow が対象。
// 本体 3 行以上で、位置情報を除いた本体の AST 構造が一致したら後出を報告する。
import { FN, key, walk } from "./ast.js";

const DEFAULT_MIN_LINES = 3;

function bodyLines(fn) {
  const b = fn.body;
  if (b.type !== "BlockStatement") return b.loc.end.line - b.loc.start.line + 1;
  if (b.body.length === 0) return 0;
  return b.body.at(-1).loc.end.line - b.body[0].loc.start.line + 1;
}

function isEligible(node, parent) {
  if (node.type === "FunctionDeclaration") return true;
  return parent?.type === "VariableDeclarator" || parent?.type === "MethodDefinition";
}

function collectFunctions(program, minLines) {
  const found = [];
  walk(program, null, (node, parent) => {
    if (FN.has(node.type) && isEligible(node, parent) && bodyLines(node) >= minLines) {
      found.push({ node, structure: key(node.body) });
    }
  });
  return found;
}

export const noIdenticalFunctions = {
  meta: { type: "problem", schema: [{ type: "integer" }] },
  create(context) {
    const minLines = context.options[0] ?? DEFAULT_MIN_LINES;
    return {
      Program(program) {
        const firstByStructure = new Map();
        for (const { node, structure } of collectFunctions(program, minLines)) {
          const first = firstByStructure.get(structure);
          if (first) {
            context.report({
              node,
              message: `identical to the function on line ${first.loc.start.line}`,
            });
          } else {
            firstByStructure.set(structure, node);
          }
        }
      },
    };
  },
};
