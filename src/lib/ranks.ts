/**
 * Fractional indexing using a base-62 alphabet (digits + uppercase + lowercase, ASCII-ordered).
 * `rankBetween(a, b)` returns a string strictly greater than `a` and strictly less than `b`.
 * Pass `null` for either bound to mean "open end" (start or end of the list).
 *
 * Sort the resulting strings lexicographically to get the desired order.
 */

const ALPHABET =
  '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz';
const FIRST = ALPHABET[0];
const MID = ALPHABET[Math.floor(ALPHABET.length / 2)];
const LAST = ALPHABET[ALPHABET.length - 1];

export const START_RANK = `${FIRST}1`;
export const END_RANK = `${LAST}1`;

function indexOf(c: string): number {
  const i = ALPHABET.indexOf(c);
  if (i < 0) throw new Error(`rank: invalid char ${JSON.stringify(c)}`);
  return i;
}

export function rankBetween(lower: string | null, upper: string | null): string {
  if (lower !== null && upper !== null && lower >= upper) {
    throw new Error(`rank: lower (${lower}) must be < upper (${upper})`);
  }

  const lo = lower ?? '';
  const hi = upper ?? '';
  let i = 0;
  let prefix = '';
  while (true) {
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
    while (true) {
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
      if (i > 64) throw new Error('rank: depth exceeded — keys are pathological');
    }
  }
}
