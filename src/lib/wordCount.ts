/** Count whitespace-separated tokens in plain text or HTML. */
export function countWords(input: string | null | undefined): number {
  if (!input) return 0;
  // Replace tags with spaces so block boundaries don't fuse adjacent words
  // (DOM textContent would lose them).
  const text = input.replace(/<[^>]+>/g, ' ').replace(/&nbsp;/gi, ' ').trim();
  if (!text) return 0;
  return text.split(/\s+/).length;
}

export function formatWordCount(n: number): string {
  return n === 1 ? '1 word' : `${n.toLocaleString('en-US')} words`;
}
