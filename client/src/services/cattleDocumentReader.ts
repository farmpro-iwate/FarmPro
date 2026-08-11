export type OffspringCandidate = {
  parity: string;
  name: string;
  birthday: string;
  sire: string;
};

export type CattleImportCandidate = {
  identificationNumber: string;
  sourceReferenceNumber?: string;
  registrationNumber: string;
  name: string;
  birthday: string;
  sire: string;
  dam: string;
  maternalSire: string;
  maternalGrandSire: string;
  offspring: OffspringCandidate[];
};

export type CattleDocumentReadResult = {
  candidate: CattleImportCandidate;
  notes: string[];
  model?: string;
};

export const emptyCattleImportCandidate: CattleImportCandidate = {
  identificationNumber: '',
  sourceReferenceNumber: '',
  registrationNumber: '',
  name: '',
  birthday: '',
  sire: '',
  dam: '',
  maternalSire: '',
  maternalGrandSire: '',
  offspring: [],
};

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error('帳票ファイルをAI送信用に変換できませんでした。'));
    reader.onload = () => {
      const dataUrl = String(reader.result || '');
      const separator = dataUrl.indexOf(',');
      if (separator < 0) {
        reject(new Error('帳票ファイルをAI送信用に変換できませんでした。'));
        return;
      }
      resolve(dataUrl.slice(separator + 1));
    };
    reader.readAsDataURL(file);
  });
}

export async function readCattleDocumentWithAi(file: File): Promise<CattleDocumentReadResult> {
  const lowerName = file.name.toLowerCase();
  const isPdf = file.type === 'application/pdf' || lowerName.endsWith('.pdf');
  const base64 = await fileToBase64(file);
  const response = await fetch('/api/cattle-document-ai', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      fileName: file.name,
      mimeType: file.type || (isPdf ? 'application/pdf' : 'image/jpeg'),
      base64,
    }),
  });

  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(typeof payload?.message === 'string' ? payload.message : 'AI画像解析に失敗しました。');
  }
  if (!payload?.candidate) throw new Error('AIからFarmPro取り込み候補が返りませんでした。');

  return {
    candidate: {
      ...emptyCattleImportCandidate,
      ...payload.candidate,
      offspring: Array.isArray(payload.candidate.offspring) ? payload.candidate.offspring : [],
    },
    notes: Array.isArray(payload.notes) ? payload.notes.map((value: unknown) => String(value)) : [],
    model: typeof payload.model === 'string' ? payload.model : undefined,
  };
}
