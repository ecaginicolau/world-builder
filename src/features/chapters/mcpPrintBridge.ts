import { buildBookPdfBlob, type BookExportData } from './bookPdfExport';
import type { BookEdition } from './types';
import type { IllustrationResolution } from '@/lib/htmlToPdfContent';

export interface PrintImage extends IllustrationResolution {
  id: string;
}

export async function decodeImage(src: string) {
  const img = new Image();
  img.src = src;
  await img.decode();
  if (!img.naturalWidth || !img.naturalHeight || img.naturalWidth * img.naturalHeight > 80_000_000)
    throw new Error('Image dimensions invalid or exceed 80 megapixels');
  return img;
}

export async function inspectImage(src: string) {
  const img = await decodeImage(src);
  return { width: img.naturalWidth, height: img.naturalHeight };
}

export async function renderPrint(
  book: BookExportData,
  edition: BookEdition,
  images: PrintImage[],
) {
  const resolved = new Map<string, IllustrationResolution>();
  for (const image of images) {
    const img = await decodeImage(image.src);
    const canvas = document.createElement('canvas');
    canvas.width = img.naturalWidth;
    canvas.height = img.naturalHeight;
    const ctx = canvas.getContext('2d');
    if (!ctx) throw new Error('Canvas unavailable');
    // KDP interior: flatten transparency against paper white, preserving the faded edges.
    ctx.fillStyle = '#fff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.filter = `brightness(${edition.image_brightness / 100}) contrast(${edition.image_contrast / 100}) grayscale(${edition.image_grayscale ? 1 : 0})`;
    ctx.drawImage(img, 0, 0);
    resolved.set(image.id, {
      ...image,
      width: img.naturalWidth,
      height: img.naturalHeight,
      src: canvas.toDataURL('image/png'),
    });
  }
  const blob = await buildBookPdfBlob(book, edition, resolved);
  return await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = () => resolve((reader.result as string).split(',')[1]);
    reader.readAsDataURL(blob);
  });
}

export async function renderPdfPage(base64: string, pageNumber: number, scale = 1.3) {
  const pdfjs = await import('pdfjs-dist');
  const { default: workerUrl } = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerUrl;
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const task = pdfjs.getDocument({ data: bytes });
  const doc = await task.promise;
  try {
    const page = await doc.getPage(pageNumber);
    const viewport = page.getViewport({ scale });
    const canvas = document.createElement('canvas');
    canvas.width = Math.ceil(viewport.width);
    canvas.height = Math.ceil(viewport.height);
    const context = canvas.getContext('2d');
    if (!context) throw new Error('Canvas unavailable');
    await page.render({ canvas, canvasContext: context, viewport }).promise;
    const content = await page.getTextContent();
    return {
      page_count: doc.numPages,
      png: canvas.toDataURL('image/png').split(',')[1],
      text: content.items.map((i) => ('str' in i ? i.str : '')).join(' '),
    };
  } finally {
    await task.destroy();
  }
}
