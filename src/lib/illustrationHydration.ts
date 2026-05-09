/**
 * Helpers to extract illustration IDs from chapter HTML and hydrate <img>
 * tags with their public URLs at render time.
 *
 * Storage shape in chapter HTML (see illustrationExtension.tsx renderHTML):
 *   <figure data-illustration-id="..." data-entity-id="..."><img></figure>
 *
 * The hydrated shape, used in PDF export and public reader:
 *   <figure data-illustration-id="..." class="wb-illustration">
 *     <img src="https://.../bucket/path.png" alt="..." />
 *     <figcaption>Caption from the entity</figcaption>
 *   </figure>
 */

export interface HydrationRecord {
  src: string;
  alt: string;
  caption: string | null;
  width: number | null;
  height: number | null;
}

const ILLUSTRATION_ID_RE = /data-illustration-id="([^"]+)"/g;

/** Unique illustration IDs referenced in the HTML. Used for batch fetching
 * before render — order doesn't matter, duplicates are not useful. */
export function extractIllustrationIds(html: string): string[] {
  if (!html) return [];
  const ids = new Set<string>();
  for (const match of html.matchAll(ILLUSTRATION_ID_RE)) {
    if (match[1]) ids.add(match[1]);
  }
  return Array.from(ids);
}

/** Order-and-duplicate-preserving sequence of illustration IDs. Used for
 * dirty-check on chapter saves: insert/remove/reorder all produce a different
 * sequence, so this distinguishes a real edit from a no-op Tiptap re-render. */
export function illustrationSequence(html: string): string {
  if (!html) return '';
  const ids: string[] = [];
  for (const match of html.matchAll(ILLUSTRATION_ID_RE)) {
    if (match[1]) ids.push(match[1]);
  }
  return ids.join(',');
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/**
 * Replace empty <figure data-illustration-id="ID"><img></figure> blocks with
 * a fully-resolved figure containing src + caption. Unknown IDs are left as-is
 * so the renderer can show a placeholder.
 *
 * Defensive parsing: this is a string-level transform (not a DOM transform) so
 * it works in both browser and Deno (edge function) contexts.
 */
export function hydrateIllustrationsHtml(
  html: string,
  resolved: Map<string, HydrationRecord>,
): string {
  if (!html) return html;
  // Match a <figure ...data-illustration-id="ID"...>... </figure> block.
  // The inner <img> may have other attributes already (renderHTML keeps things
  // minimal but Tiptap's mergeAttributes might inject extras).
  return html.replace(
    /<figure\b([^>]*?)data-illustration-id="([^"]+)"([^>]*)>[\s\S]*?<\/figure>/g,
    (_match, beforeId: string, id: string, afterId: string) => {
      const rec = resolved.get(id);
      if (!rec) {
        // Unknown id (deleted). Render a deterministic placeholder so the
        // public reader / PDF can show something rather than a broken image.
        return `<figure class="wb-illustration wb-illustration-missing" data-illustration-id="${escapeHtml(
          id,
        )}"><figcaption>[illustration unavailable]</figcaption></figure>`;
      }
      const attrs = `${beforeId}data-illustration-id="${escapeHtml(id)}"${afterId}`.trim();
      const captionHtml = rec.caption
        ? `<figcaption>${escapeHtml(rec.caption)}</figcaption>`
        : '';
      return `<figure class="wb-illustration" ${attrs}><img src="${escapeHtml(
        rec.src,
      )}" alt="${escapeHtml(rec.alt)}" loading="lazy" />${captionHtml}</figure>`;
    },
  );
}
