// oxlint JS プラグイン共通の AST ユーティリティ(ESTree 互換ノードを前提)。
// 位置情報と親参照を除いた「構造キー」で部分木の同値判定を行う。
export const FN = new Set(["FunctionDeclaration", "FunctionExpression", "ArrowFunctionExpression"]);
export const LOOP = new Set([
  "ForStatement",
  "ForInStatement",
  "ForOfStatement",
  "WhileStatement",
  "DoWhileStatement",
]);
const SKIP_KEYS = new Set(["parent", "loc", "range", "start", "end"]);

export const isNode = (v) => v !== null && typeof v === "object" && typeof v.type === "string";

export function* children(node) {
  for (const [k, v] of Object.entries(node)) {
    if (SKIP_KEYS.has(k)) continue;
    if (Array.isArray(v)) {
      for (const c of v) if (isNode(c)) yield c;
    } else if (isNode(v)) {
      yield v;
    }
  }
}

const KEY_MEMO = new WeakMap();

// 位置情報を除いた構造キー(同値判定用)。ノードは WeakMap でメモ化する
export function key(node) {
  if (!isNode(node)) return keyRaw(node);
  const hit = KEY_MEMO.get(node);
  if (hit !== undefined) return hit;
  const k = keyRaw(node);
  KEY_MEMO.set(node, k);
  return k;
}

function keyRaw(node) {
  if (Array.isArray(node)) return `[${node.map(key).join(",")}]`;
  if (!isNode(node)) return typeof node === "object" ? JSON.stringify(node) : String(node);
  const parts = [node.type];
  for (const [k, v] of Object.entries(node)) {
    if (SKIP_KEYS.has(k) || v === null || v === undefined) continue;
    parts.push(`${k}:${key(v)}`);
  }
  return `(${parts.join(",")})`;
}

// 深さ優先で全ノードを訪問する。fn が false を返した部分木には降りない
export function walk(node, parent, fn) {
  if (fn(node, parent) === false) return;
  for (const c of children(node)) walk(c, node, fn);
}
