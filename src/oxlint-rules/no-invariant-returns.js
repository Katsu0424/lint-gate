// 常に同じ値を返す関数(sonarjs/no-invariant-returns 相当)。
// 関数末尾に到達可能・値なし return・return 1 個以下・throw ありは対象外。
// 全 return が同じリテラル(単項演算と単一書込 const の init も辿る)か、
// 同じ単一書込変数の読取なら報告する。副作用分岐の除外規則は sonarjs と同じ。
// code path とスコープ解析は近似なので、誤検知が出たらこのルールだけ落としてよい。
import { children, FN, LOOP, walk } from "./ast.js";

// ---- 末尾到達可能性 ----
function hasBreak(body) {
  let found = false;
  walk(body, null, (n) => {
    if (n.type === "BreakStatement") found = true;
    return !found && !FN.has(n.type);
  });
  return found;
}

function switchTerminates(s) {
  const last = s.cases.length - 1;
  const hasDefault = s.cases.some((c) => !c.test);
  return (
    hasDefault &&
    s.cases.every((c, i) =>
      c.consequent.length === 0 ? i < last : terminates(c.consequent.at(-1)),
    )
  );
}

function tryTerminates(s) {
  if (s.finalizer && terminates(s.finalizer)) return true;
  return terminates(s.block) && (!s.handler || terminates(s.handler.body));
}

const TERMINATORS = new Map([
  ["ReturnStatement", () => true],
  ["ThrowStatement", () => true],
  ["BlockStatement", (s) => s.body.length > 0 && terminates(s.body.at(-1))],
  [
    "IfStatement",
    (s) => Boolean(s.alternate) && terminates(s.consequent) && terminates(s.alternate),
  ],
  ["SwitchStatement", switchTerminates],
  ["TryStatement", tryTerminates],
  [
    "WhileStatement",
    (s) => s.test.type === "Literal" && s.test.value === true && !hasBreak(s.body),
  ],
  ["ForStatement", (s) => !s.test && !hasBreak(s.body)],
  ["LabeledStatement", (s) => terminates(s.body)],
]);

// 文 s の後に制御が落ちてこない(必ず return / throw する)か
function terminates(s) {
  const check = TERMINATORS.get(s.type);
  return check ? check(s) : false;
}

// ---- 関数スコープ直下の変数(本体トップレベルの宣言 + 入れ子関数外の var)の書込/読取 ----
function isAssignedName(n, name) {
  if (n.type === "AssignmentExpression")
    return n.left.type === "Identifier" && n.left.name === name;
  if (n.type === "UpdateExpression") {
    return n.argument.type === "Identifier" && n.argument.name === name;
  }
  return false;
}

function countWrites(node, name) {
  let writes = 0;
  walk(node, null, (n) => {
    if (isAssignedName(n, name)) writes++;
  });
  return writes;
}

function usesName(node, name) {
  let used = false;
  walk(node, null, (n) => {
    if (n.type === "Identifier" && n.name === name) used = true;
    return !used && !FN.has(n.type);
  });
  return used;
}

// 要素書込(x[i] = v)や呼出し文で name に触れていれば書込とみなす(sonarjs の近似に合わせる)
function isSideEffectWrite(stmt, name) {
  const e = stmt.expression;
  const elementWrite =
    e.type === "AssignmentExpression" &&
    e.left.type === "MemberExpression" &&
    e.left.object.type === "Identifier" &&
    e.left.object.name === name;
  return (elementWrite || e.type === "CallExpression") && usesName(stmt, name);
}

// 宣言名・非計算プロパティ名・非計算オブジェクトキーの位置にある識別子は読取ではない
function isNameSlot(n, parent) {
  if (parent?.type === "VariableDeclarator") return parent.id === n;
  if (parent?.type === "MemberExpression") return parent.property === n && !parent.computed;
  return parent?.type === "Property" && parent.key === n && !parent.computed;
}

function isRead(n, parent, name) {
  return n.type === "Identifier" && n.name === name && !isNameSlot(n, parent);
}

function recordDeclaration(decl, name, info) {
  for (const d of decl.declarations) {
    if (d.id.type !== "Identifier" || d.id.name !== name) continue;
    info.declared = true;
    info.defs++;
    if (d.init) {
      info.init = d.init;
      info.hasInitWrite = true;
    }
  }
}

function recordParams(fn, name, info) {
  for (const p of fn.params) {
    const id = p.type === "AssignmentPattern" ? p.left : p;
    if (id.type === "Identifier" && id.name === name) {
      info.declared = true;
      info.defs++;
    }
  }
}

function variableInfo(fn, name) {
  const info = { declared: false, init: null, hasInitWrite: false, defs: 0, writes: 0, reads: [] };
  recordParams(fn, name, info);
  const top = fn.body.type === "BlockStatement" ? fn.body.body : [];
  walk(fn.body, fn, (n, parent) => {
    if (FN.has(n.type)) {
      info.writes += countWrites(n, name);
      return false;
    }
    if (n.type === "VariableDeclaration" && (n.kind === "var" || top.includes(n))) {
      recordDeclaration(n, name, info);
    }
    if (isAssignedName(n, name)) info.writes++;
    if (n.type === "ExpressionStatement" && isSideEffectWrite(n, name)) info.writes++;
    if (isRead(n, parent, name)) info.reads.push(n);
    return true;
  });
  return info;
}

// ---- リテラル値の畳み込み ----
const UNARY = new Map([
  ["-", (v) => -Number(v)],
  ["+", (v) => Number(v)],
  ["~", (v) => ~Number(v)],
  ["!", (v) => !v],
  ["typeof", (v) => typeof v],
]);

function literalValue(n, fn) {
  if (n.type === "Literal") return n.value;
  if (n.type === "UnaryExpression") return unaryValue(n, fn);
  return n.type === "Identifier" ? constInitValue(n.name, fn) : undefined;
}

function unaryValue(n, fn) {
  const v = literalValue(n.argument, fn);
  const apply = UNARY.get(n.operator);
  return v === undefined || !apply ? undefined : apply(v);
}

function constInitValue(name, fn) {
  const info = variableInfo(fn, name);
  const singleWrite = info.declared && info.writes === 0 && info.defs === 1 && info.init;
  return singleWrite ? literalValue(info.init, fn) : undefined;
}

// ---- return の収集と副作用分岐の判定 ----
function isBranchBody(n, p) {
  if (!p) return false;
  if (p.type === "IfStatement") return n === p.consequent || n === p.alternate;
  return LOOP.has(p.type) && n === p.body;
}

function isFrame(n, p) {
  return n.type === "SwitchCase" || (n.type === "BlockStatement" && isBranchBody(n, p));
}

function isSideEffectStatement(n) {
  if (n.type !== "ExpressionStatement") return false;
  return n.expression.type === "CallExpression" || n.expression.type === "AssignmentExpression";
}

function markFrame(ctx, flag) {
  const frame = ctx.frames.at(-1);
  if (frame) frame[flag] = true;
}

function noteStatement(ctx, n, p) {
  if (n.type === "ReturnStatement") {
    ctx.returns.push(n);
    if (!n.argument) ctx.noValue = true;
    markFrame(ctx, "ret");
  }
  if (n.type === "ThrowStatement") ctx.hasThrow = true;
  if (isSideEffectStatement(n)) {
    markFrame(ctx, "se");
    if (isBranchBody(n, p)) ctx.seOnly = true;
  }
}

function closeFrame(ctx) {
  const f = ctx.frames.pop();
  if (f.se && !f.ret) ctx.seOnly = true;
  if (f.se && f.ret) ctx.seWithRet = true;
  if (f.ret && !f.se) ctx.retNoSe = true;
}

function collectReturns(fn) {
  const ctx = {
    returns: [],
    hasThrow: false,
    noValue: false,
    seOnly: false,
    seWithRet: false,
    retNoSe: false,
    frames: [],
  };
  const visit = (n, p) => {
    if (FN.has(n.type)) return;
    const frame = isFrame(n, p);
    if (frame) ctx.frames.push({ se: false, ret: false });
    noteStatement(ctx, n, p);
    for (const c of children(n)) visit(c, n);
    if (frame) closeFrame(ctx);
  };
  for (const c of children(fn)) visit(c, fn);
  return ctx;
}

function sameVariable(values, fn) {
  const first = values[0];
  if (first.type !== "Identifier") return false;
  const info = variableInfo(fn, first.name);
  if (!info.declared || info.writes !== 0) return false;
  const reads = new Set(info.hasInitWrite ? info.reads : info.reads.slice(1));
  return values.every((v) => reads.has(v));
}

function hasComparableReturns(ctx, fn) {
  return !ctx.hasThrow && !ctx.noValue && ctx.returns.length > 1 && terminates(fn.body);
}

// 副作用のある分岐の扱いは sonarjs に合わせる:
// 変数を返す場合は「副作用だけの分岐」があれば除外。リテラルを返す場合は
// 「副作用と return を両方持つ分岐」があり、かつ「return だけの分岐」が無ければ除外する
function maskedBySideEffects(ctx, isLiteral) {
  return isLiteral ? ctx.seWithRet && !ctx.retNoSe : ctx.seOnly;
}

function checkFunction(fn, context) {
  if (fn.body.type !== "BlockStatement") return;
  const ctx = collectReturns(fn);
  if (!hasComparableReturns(ctx, fn)) return;
  const values = ctx.returns.map((r) => r.argument);
  const first = literalValue(values[0], fn);
  const isLiteral = first !== undefined;
  const same = isLiteral
    ? values.slice(1).every((v) => literalValue(v, fn) === first)
    : sameVariable(values, fn);
  if (same && !maskedBySideEffects(ctx, isLiteral)) {
    context.report({ node: fn, message: "function always returns the same value" });
  }
}

export const noInvariantReturns = {
  meta: { type: "problem", schema: [] },
  create(context) {
    return {
      Program(program) {
        walk(program, null, (n) => {
          if (FN.has(n.type)) checkFunction(n, context);
        });
      },
    };
  },
};
