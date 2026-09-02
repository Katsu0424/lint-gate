export function dupA(x) {
  const y = x * 2;
  const z = y + 1;
  return z * z;
}
export const dupB = (x) => {
  const y = x * 2;
  const z = y + 1;
  return z * z;
};
export function branches(x) { if (x > 0) { doIt(1); } else if (x < 0) { doIt(1); } else { doIt(1); } }
export function sw(x) { switch (x) { case 1: doIt(); break; case 2: doIt(); break; default: doIt(); } }
export const tern = (x) => (x ? 1 : 1);
export function overwrite() { const arr = [0, 0]; arr[0] = 1; arr[0] = 2; const m = new Map(); m.set("k", 1); m.set("k", 2); arr[1] = 1; arr[1] = arr[1] + 1; return [arr, m]; }
export function invariant(x) { if (x > 0) { return 5; } return 5; }
export function invariantConst(x) { const v = "a"; if (x) { return v; } return v; }
export function notInvariant(x) { if (x > 0) { return 5; } return 6; }
export function implicitEnd(x) { if (x > 0) { return 5; } if (x < 0) { return 5; } }
export function sideEffect(x) { if (x) { doIt(); return true; } return true; }
