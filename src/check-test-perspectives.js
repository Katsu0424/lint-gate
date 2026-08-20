// テスト観点の強制チェッカー。
// すべてのテストファイルの先頭に test-perspectives ブロックを必須にする:
//
//   /* test-perspectives:
//   正常系: yes
//   エッジ: yes
//   異常系: n/a 理由...
//   否定: yes
//   リグレッション: n/a 既知バグなし(発生時に追加)
//   */
//
// 各観点は `yes` か `n/a <理由>`。yes の観点はタイトル(describe / it)に
// [観点名] を含むテストが同ファイルに 1 件以上必要。
// 濃淡: fullPathPatterns(既定: test/domain/ 配下)にマッチするパスは全 5 観点の
// 宣言必須、それ以外は 正常系・異常系 のみ必須。
import { readFileSync } from "node:fs";
import { relative, sep } from "node:path";
import { walk } from "./walk.js";

export const PERSPECTIVES = ["正常系", "エッジ", "異常系", "否定", "リグレッション"];
const BASE_REQUIRED = ["正常系", "異常系"];

export function checkTestPerspectives(root, config) {
  const errors = [];
  let count = 0;
  for (const file of walk(root, config.skipDirs, config.testFileRe)) {
    count++;
    errors.push(...checkFile(root, file, config));
  }
  return { errors, count };
}

function checkFile(root, file, config) {
  const rel = relative(root, file);
  const content = readFileSync(file, "utf8");
  const required = requiredFor(rel, config.fullPathPatterns);

  const block = content.match(/\/\*\s*test-perspectives:\s*\n([\s\S]*?)\*\//);
  if (!block) {
    return [`${rel}: test-perspectives ブロックがありません(必須観点: ${required.join("・")})`];
  }
  const declared = parseDeclarations(block[1]);
  const errors = PERSPECTIVES.map((p) =>
    checkPerspective(rel, content, p, declared.get(p), required.includes(p)),
  ).filter((e) => e !== null);
  for (const key of declared.keys()) {
    if (!PERSPECTIVES.includes(key)) {
      errors.push(`${rel}: 未知の観点「${key}」(現行の観点: ${PERSPECTIVES.join("・")})`);
    }
  }
  return errors;
}

function requiredFor(rel, fullPathPatterns) {
  const normalized = rel.split(sep).join("/");
  const isFull = fullPathPatterns.some((re) => re.test(normalized));
  return isFull ? PERSPECTIVES : BASE_REQUIRED;
}

function parseDeclarations(blockBody) {
  const declared = new Map();
  for (const line of blockBody.split("\n")) {
    const m = line.match(/^\s*(\S[^:]*):\s*(.+?)\s*$/);
    if (m) declared.set(m[1].trim(), m[2]);
  }
  return declared;
}

function checkPerspective(rel, content, perspective, value, required) {
  if (value === undefined) {
    if (!required) return null;
    return `${rel}: 観点「${perspective}」の宣言が必須です(yes か n/a <理由>)`;
  }
  if (value === "yes") {
    if (content.includes(`[${perspective}]`)) return null;
    return `${rel}: 観点「${perspective}」が yes なのに [${perspective}] タグ付きのテストがありません`;
  }
  if (/^n\/a\s+\S/.test(value)) return null;
  return `${rel}: 観点「${perspective}」は "yes" か "n/a <理由>" で宣言してください(現在: "${value}")`;
}
