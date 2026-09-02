// 連続する同一キーへの上書き(sonarjs/no-element-overwrite 相当)。
// Program / Block / SwitchCase の連続文で `x[idx] = rhs`(idx はリテラルか識別子、rhs に x を含まない)と
// `x.set(k, v)` / `x.add(k)` が同じコレクションの同じキーに連続して書き込んでいたら後の書込を報告する。
import { key, walk } from "./ast.js";

const METHOD_ARITY = new Map([
  ["add", 1],
  ["set", 2],
]);

function indexKey(n) {
  if (n.type === "Literal") {
    return typeof n.value === "number" || typeof n.value === "string" ? String(n.value) : undefined;
  }
  return n.type === "Identifier" ? n.name : undefined;
}

function containsSubtree(haystack, needleKey) {
  let found = false;
  walk(haystack, null, (n) => {
    if (key(n) === needleKey) found = true;
    return !found;
  });
  return found;
}

function assignmentWrite(e) {
  const target = e.left;
  if (e.operator !== "=" || target.type !== "MemberExpression" || !target.computed)
    return undefined;
  const idx = indexKey(target.property);
  if (idx === undefined || containsSubtree(e.right, key(target.object))) return undefined;
  return { collection: target.object, idx, node: e };
}

function callWrite(e) {
  const callee = e.callee;
  if (callee.type !== "MemberExpression" || callee.property.type !== "Identifier") return undefined;
  if (METHOD_ARITY.get(callee.property.name) !== e.arguments.length) return undefined;
  const idx = indexKey(e.arguments[0]);
  return idx ? { collection: callee.object, idx, node: e } : undefined;
}

function keyWrite(stmt) {
  if (stmt.type !== "ExpressionStatement") return undefined;
  const e = stmt.expression;
  if (e.type === "AssignmentExpression") return assignmentWrite(e);
  return e.type === "CallExpression" ? callWrite(e) : undefined;
}

function checkStatements(statements, context) {
  const used = new Map();
  let collectionKey;
  for (const stmt of statements) {
    const write = keyWrite(stmt);
    if (!write) {
      used.clear();
      continue;
    }
    const ck = key(write.collection);
    if (collectionKey !== undefined && ck !== collectionKey) used.clear();
    const prev = used.get(write.idx);
    if (prev) {
      context.report({
        node: write.node,
        message: `"${write.idx}" was already set on line ${prev.node.loc.start.line}`,
      });
    }
    used.set(write.idx, write);
    collectionKey = ck;
  }
}

export const noElementOverwrite = {
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      Program(program) {
        walk(program, null, (node) => {
          if (node.type === "Program" || node.type === "BlockStatement") {
            checkStatements(node.body, context);
          } else if (node.type === "SwitchCase") {
            checkStatements(node.consequent, context);
          }
        });
      },
    };
  },
};
