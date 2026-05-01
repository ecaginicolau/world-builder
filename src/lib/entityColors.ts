/**
 * Color helpers for entity types.
 *
 * Stored on `entity_types.color` as a hex string (e.g. "#7c5cff") or null.
 * If null, we derive a stable color from the type name via hashing — so chips
 * get a consistent color even before the user picks one.
 */

export const COLOR_PALETTE = [
  '#7c5cff', // accent (purple)
  '#4cc2ff', // sky
  '#ff7eb6', // pink
  '#42be65', // green
  '#ffa600', // amber
  '#ff5e5e', // red
  '#33b1ff', // blue
  '#a56eff', // violet
  '#08bdba', // teal
  '#d2a106', // dark amber
] as const;

export const DEFAULT_COLOR = '#a1a1aa'; // neutral muted

export function colorForName(name: string): string {
  let h = 0;
  for (let i = 0; i < name.length; i++) {
    h = (h * 31 + name.charCodeAt(i)) | 0;
  }
  const idx = Math.abs(h) % COLOR_PALETTE.length;
  return COLOR_PALETTE[idx];
}

export function resolveColor(stored: string | null | undefined, name: string): string {
  if (stored && /^#[0-9a-fA-F]{6}$/.test(stored)) return stored;
  return colorForName(name);
}

/** Adjusts a hex color so a chip with `bg = color + 33` is readable on dark bg. */
export function chipBgFromHex(hex: string): string {
  // 22 = ~13% alpha — subtle background tint
  return hex + '22';
}

export function chipBorderFromHex(hex: string): string {
  return hex + '66'; // ~40% alpha
}
