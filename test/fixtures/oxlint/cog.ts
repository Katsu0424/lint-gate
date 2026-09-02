export function cog(a: number, b: number, c: number): number {
  let r = 0;
  if (a > 0) { if (b > 0) { if (c > 0) { for (let i = 0; i < a; i++) { if (i % 2 === 0) { while (r < 10) { r += a && b ? 1 : 2; if (r === 5) { r++; } } } else if (i % 3 === 0) { r += 2; } else { r += 3; } } } } }
  if (a > 0) { if (b > 0) { if (c > 0) { for (let i = 0; i < a; i++) { if (i % 2 === 0) { while (r < 10) { r += a && b ? 1 : 2; if (r === 5) { r++; } } } else if (i % 3 === 0) { r += 2; } else { r += 3; } } } } }
  return r;
}
export function branches(x: number): number { if (x > 0) { return 1; } else { return 1; } }
export function invariant(x: number): number { if (x > 0) { return 5; } return 5; }
