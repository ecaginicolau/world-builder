// Ported from src/lib/ranks.ts. Pure logic, no browser deps. Used to compute
// a new rank at the end of an existing list when the agent doesn't pass an
// explicit one (chapter reading_rank, event chronological_rank, etc.).

const ALPHABET =
  "0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz";
const FIRST = ALPHABET[0];
const MID = ALPHABET[Math.floor(ALPHABET.length / 2)];
const LAST = ALPHABET[ALPHABET.length - 1];

export const START_RANK = `${FIRST}1`;
export const END_RANK = `${LAST}1`;
export const INIT_RANK = "!init";

function indexOf(c: string): number {
  const i = ALPHABET.indexOf(c);
  if (i < 0) throw new Error(`rank: invalid char ${JSON.stringify(c)}`);
  return i;
}

export function nextRankAfter(items: { rank: string }[]): string {
  if (items.length === 0) return START_RANK;
  let max = items[0].rank;
  for (const it of items) if (it.rank > max) max = it.rank;
  return rankBetween(max, null);
}

export function rankBetween(
  lower: string | null,
  upper: string | null,
): string {
  if (lower !== null && upper !== null && lower >= upper) {
    throw new Error(`rank: lower (${lower}) must be < upper (${upper})`);
  }
  const lo = lower ?? "";
  const hi = upper ?? "";
  let i = 0;
  let prefix = "";
  for (;;) {
    const lc = i < lo.length ? lo[i] : FIRST;
    const hc = i < hi.length ? hi[i] : LAST;
    if (lc === hc) {
      prefix += lc;
      i++;
      continue;
    }
    const li = indexOf(lc);
    const hi_ = indexOf(hc);
    if (hi_ - li > 1) {
      const midI = Math.floor((li + hi_) / 2);
      return prefix + ALPHABET[midI];
    }
    prefix += lc;
    i++;
    for (;;) {
      const ln = i < lo.length ? lo[i] : FIRST;
      const li2 = indexOf(ln);
      if (li2 < ALPHABET.length - 1) {
        const next = ALPHABET[li2 + 1];
        if (upper === null || prefix + next < upper) {
          return prefix + next;
        }
      }
      prefix += MID;
      i++;
      if (i > 64) throw new Error("rank: depth exceeded");
    }
  }
}
