import * as pdfjs from 'pdfjs-dist';

function lineKey(y: number) {
  return Math.round(y / 3) * 3;
}

export async function extractPdfText(file: File) {
  const data = new Uint8Array(await file.arrayBuffer());
  const pdf = await pdfjs.getDocument({ data }).promise;
  const pages: string[] = [];

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const content = await page.getTextContent();
    const lines = new Map<number, { x: number; text: string }[]>();

    for (const rawItem of content.items) {
      if (!('str' in rawItem) || !rawItem.str.trim()) continue;
      const transform = 'transform' in rawItem ? rawItem.transform : undefined;
      const x = Array.isArray(transform) ? Number(transform[4] || 0) : 0;
      const y = Array.isArray(transform) ? Number(transform[5] || 0) : 0;
      const key = lineKey(y);
      const row = lines.get(key) || [];
      row.push({ x, text: rawItem.str.trim() });
      lines.set(key, row);
    }

    const pageText = Array.from(lines.entries())
      .sort((a, b) => b[0] - a[0])
      .map(([, row]) => row.sort((a, b) => a.x - b.x).map((item) => item.text).join(' '))
      .filter(Boolean)
      .join('\n');

    if (pageText.trim()) pages.push(pageText.trim());
  }

  return pages.join('\n\n');
}

export function isUsefulPdfText(text: string) {
  const compact = text.replace(/\s/g, '');
  if (compact.length < 80) return false;
  const japaneseCount = (compact.match(/[ぁ-んァ-ヶ一-龠々]/g) || []).length;
  const digitCount = (compact.match(/\d/g) || []).length;
  return japaneseCount >= 15 || digitCount >= 20;
}
