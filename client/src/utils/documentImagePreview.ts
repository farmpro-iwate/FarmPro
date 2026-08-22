function loadImage(file: File) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const image = new Image();
    image.onload = () => {
      URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('画像を確認できませんでした。'));
    };
    image.src = url;
  });
}

function drawImageToCanvas(image: HTMLImageElement, maxLongEdge = 1600) {
  const longEdge = Math.max(image.naturalWidth, image.naturalHeight);
  const scale = Math.min(1, maxLongEdge / longEdge);
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
  const context = canvas.getContext('2d');
  if (!context) throw new Error('画像を確認できませんでした。');
  context.drawImage(image, 0, 0, canvas.width, canvas.height);
  return canvas;
}

function autoCropDocument(source: HTMLCanvasElement) {
  const analysisMaxEdge = 900;
  const scale = Math.min(1, analysisMaxEdge / Math.max(source.width, source.height));
  const width = Math.max(1, Math.round(source.width * scale));
  const height = Math.max(1, Math.round(source.height * scale));
  const analysis = document.createElement('canvas');
  analysis.width = width;
  analysis.height = height;
  const context = analysis.getContext('2d', { willReadFrequently: true });
  if (!context) return { canvas: source, cropped: false };
  context.drawImage(source, 0, 0, width, height);
  const pixels = context.getImageData(0, 0, width, height).data;

  const rowHits = new Uint32Array(height);
  const colHits = new Uint32Array(width);
  let brightPixels = 0;

  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      const index = (y * width + x) * 4;
      const r = pixels[index];
      const g = pixels[index + 1];
      const b = pixels[index + 2];
      const max = Math.max(r, g, b);
      const min = Math.min(r, g, b);
      const brightness = (r + g + b) / 3;
      const saturation = max - min;
      const looksLikePaper = brightness >= 168 && saturation <= 72;
      if (!looksLikePaper) continue;
      rowHits[y] += 1;
      colHits[x] += 1;
      brightPixels += 1;
    }
  }

  if (brightPixels < width * height * 0.12) return { canvas: source, cropped: false };

  const rowThreshold = Math.max(6, Math.floor(width * 0.24));
  const colThreshold = Math.max(6, Math.floor(height * 0.24));
  let top = 0;
  while (top < height && rowHits[top] < rowThreshold) top += 1;
  let bottom = height - 1;
  while (bottom > top && rowHits[bottom] < rowThreshold) bottom -= 1;
  let left = 0;
  while (left < width && colHits[left] < colThreshold) left += 1;
  let right = width - 1;
  while (right > left && colHits[right] < colThreshold) right -= 1;

  if (right <= left || bottom <= top) return { canvas: source, cropped: false };

  const detectedWidth = right - left + 1;
  const detectedHeight = bottom - top + 1;
  const detectedAreaRatio = (detectedWidth * detectedHeight) / (width * height);
  if (detectedAreaRatio < 0.22) return { canvas: source, cropped: false };

  const paddingX = Math.round(detectedWidth * 0.035);
  const paddingY = Math.round(detectedHeight * 0.035);
  left = Math.max(0, left - paddingX);
  right = Math.min(width - 1, right + paddingX);
  top = Math.max(0, top - paddingY);
  bottom = Math.min(height - 1, bottom + paddingY);

  const sourceLeft = Math.floor(left / scale);
  const sourceTop = Math.floor(top / scale);
  const sourceRight = Math.ceil((right + 1) / scale);
  const sourceBottom = Math.ceil((bottom + 1) / scale);
  const cropWidth = Math.min(source.width - sourceLeft, Math.max(1, sourceRight - sourceLeft));
  const cropHeight = Math.min(source.height - sourceTop, Math.max(1, sourceBottom - sourceTop));

  const originalArea = source.width * source.height;
  const cropArea = cropWidth * cropHeight;
  if (cropArea / originalArea > 0.95) return { canvas: source, cropped: false };

  const cropped = document.createElement('canvas');
  cropped.width = cropWidth;
  cropped.height = cropHeight;
  const croppedContext = cropped.getContext('2d');
  if (!croppedContext) return { canvas: source, cropped: false };
  croppedContext.drawImage(source, sourceLeft, sourceTop, cropWidth, cropHeight, 0, 0, cropWidth, cropHeight);
  return { canvas: cropped, cropped: true };
}

export async function createAiDocumentPreview(file: File) {
  const image = await loadImage(file);
  const source = drawImageToCanvas(image);
  const result = autoCropDocument(source);
  return {
    dataUrl: result.canvas.toDataURL('image/jpeg', 0.9),
    cropped: result.cropped,
  };
}
