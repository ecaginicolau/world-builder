import { z } from 'zod';

const font = z.enum([
  'EB Garamond',
  'Cormorant Garamond',
  'JetBrains Mono',
  'Times Roman',
  'Helvetica',
  'Courier',
]);
const align = z.enum(['left', 'center', 'right']);
const margin = z.number().min(0).max(100);
export const editionSettings = z.object({
  name: z.string().trim().min(1).max(100).default('6×9 — Trade paperback'),
  trim_width_mm: z.number().min(50).max(300).default(152.4),
  trim_height_mm: z.number().min(50).max(400).default(228.6),
  margin_inside_mm: margin.default(19),
  margin_outside_mm: margin.default(13),
  margin_top_mm: margin.default(19),
  margin_bottom_mm: margin.default(19),
  body_font: font.default('EB Garamond'),
  body_font_size_pt: z.number().min(6).max(24).default(11),
  body_line_height: z.number().min(1).max(2.5).default(1.4),
  body_justify: z.boolean().default(true),
  paragraph_indent_mm: z.number().min(0).max(30).default(4),
  chapter_title_font: font.default('EB Garamond'),
  chapter_title_size_pt: z.number().min(8).max(60).default(18),
  chapter_title_bold: z.boolean().default(true),
  chapter_title_italic: z.boolean().default(false),
  chapter_title_align: align.default('center'),
  drop_cap: z.boolean().default(false),
  header_mode: z
    .enum(['none', 'book_title', 'chapter_title', 'author', 'alternating'])
    .default('alternating'),
  header_show_on_chapter_first_page: z.boolean().default(false),
  header_font: font.default('EB Garamond'),
  header_size_pt: z.number().min(6).max(16).default(9),
  header_italic: z.boolean().default(true),
  footer_page_numbers: z.boolean().default(true),
  footer_position: z.enum(['outside', 'center', 'inside']).default('outside'),
  footer_show_on_chapter_first_page: z.boolean().default(true),
  footer_font: font.default('EB Garamond'),
  footer_size_pt: z.number().min(6).max(16).default(9),
  chapter_header_font: font.default('EB Garamond'),
  chapter_header_size_pt: z.number().min(6).max(24).default(10),
  chapter_header_italic: z.boolean().default(true),
  chapter_header_align: align.default('center'),
  chapter_footer_font: font.default('EB Garamond'),
  chapter_footer_size_pt: z.number().min(6).max(24).default(10),
  chapter_footer_italic: z.boolean().default(true),
  chapter_footer_align: align.default('center'),
  chapter_starts_on_recto: z.boolean().default(false),
  include_illustrations: z.boolean().default(true),
  image_brightness: z.number().min(50).max(200).default(100),
  image_contrast: z.number().min(50).max(200).default(100),
  image_grayscale: z.boolean().default(false),
});
// optional() around default() would fill omitted patch fields in Zod 4.
export const editionPatch = z
  .object(
    Object.fromEntries(
      Object.entries(editionSettings.shape).map(([key, value]) => [
        key,
        value.removeDefault().optional(),
      ]),
    ) as {
      [K in keyof typeof editionSettings.shape]: z.ZodOptional<
        ReturnType<(typeof editionSettings.shape)[K]['removeDefault']>
      >;
    },
  )
  .strict();
export type Edition = z.infer<typeof editionSettings> & {
  id: string;
  book_id: string;
  world_id: string;
  owner_id: string;
  updated_at: string;
};

export function validateEdition(input: unknown) {
  const e = editionSettings.parse(input);
  if (
    e.trim_width_mm - e.margin_inside_mm - e.margin_outside_mm < 30 ||
    e.trim_height_mm - e.margin_top_mm - e.margin_bottom_mm < 40
  ) {
    throw new Error('Margins leave too little printable area (minimum 30 × 40 mm).');
  }
  return e;
}
