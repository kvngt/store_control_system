// react-signature-canvas ships `getTrimmedCanvas()`, but it delegates to the
// `trim-canvas` CJS package, whose default export doesn't survive the bundler's
// interop ("import_build.default is not a function" at runtime). Trimming is a
// few lines of pixel scanning, so we do it here instead of shipping a broken
// call path.

/** Padding kept around the ink so the signature doesn't touch the edges. */
const PAD = 8;

/**
 * Crops the transparent margin off a signature canvas and returns a PNG data
 * URL. Falls back to the untrimmed canvas when it can't read the pixels (a
 * tainted canvas) or when nothing was drawn.
 */
export function trimmedSignatureDataUrl(canvas: HTMLCanvasElement): string {
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas.toDataURL('image/png');

  const { width, height } = canvas;
  let pixels: Uint8ClampedArray;
  try {
    pixels = ctx.getImageData(0, 0, width, height).data;
  } catch {
    return canvas.toDataURL('image/png');
  }

  let top = height;
  let left = width;
  let right = -1;
  let bottom = -1;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      // Alpha channel: signature_pad draws on a transparent canvas.
      if (pixels[(y * width + x) * 4 + 3] === 0) continue;
      if (y < top) top = y;
      if (y > bottom) bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }

  if (right < left || bottom < top) return canvas.toDataURL('image/png');

  const x0 = Math.max(0, left - PAD);
  const y0 = Math.max(0, top - PAD);
  const cropW = Math.min(width, right + PAD) - x0;
  const cropH = Math.min(height, bottom + PAD) - y0;

  const out = document.createElement('canvas');
  out.width = cropW;
  out.height = cropH;
  const outCtx = out.getContext('2d');
  if (!outCtx) return canvas.toDataURL('image/png');
  outCtx.drawImage(canvas, x0, y0, cropW, cropH, 0, 0, cropW, cropH);
  return out.toDataURL('image/png');
}
